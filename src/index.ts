import express from 'express';
import http from 'http';
import dotenv from 'dotenv';
import * as admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid';
import { ExtendedCategory } from '@hyggeclub/models';
import { createClient, RedisClientType } from 'redis';
import { ScoredArticle, HyggeArticle } from '@hyggeclub/models';

dotenv.config();

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  : undefined;

if (!serviceAccount) {
  console.error('Firebase service account credentials are not defined in FIREBASE_SERVICE_ACCOUNT');
  process.exit(1);
}

// Redis client initialization
const redisClient: RedisClientType = createClient({
  password: process.env.REDIS_PASSWORD,
  socket: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379'),
  },
});

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.get('/test', (req, res) => {
  res.json({ message: 'This is a test endpoint.' });
});

app.get('/categories', async (req, res) => {
  const userId = req.query.user_id as string;  // Ensure userId is treated as a string
  try {
    const categoriesRef = db.collection('news_categories');
    const categoriesSnapshot = await categoriesRef.get();
    const categories: ExtendedCategory[] = [];  // Use the ExtendedCategory interface

    for (const doc of categoriesSnapshot.docs) {
      // Construct the base category object with the ExtendedCategory interface
      const category: ExtendedCategory = {
        name: doc.data().name,
        category_id: doc.id,
        icon_name: doc.data().icon_name,
      };

      // Conditionally add 'subscribed' property
      if (userId) {
        const subscriptionSnapshot = await db.collection('news_subscriptions')
          .where('user_id', '==', userId)
          .where('category_id', '==', doc.id)
          .get();

        category.subscribed = !subscriptionSnapshot.empty;  // Now valid with ExtendedCategory
      }

      categories.push(category);
    }

    res.json(categories);
  } catch (err) {
    console.error('Failed to fetch categories:', err);
    res.status(500).send('Failed to fetch categories');
  }
});

app.post('/subscribe', async (req, res) => {
  const { user_id, category_id } = req.body;

  if (!user_id || !category_id) {
    return res.status(400).send('Missing user_id or category_id');
  }

  const uuid = uuidv4(); // Generate UUID

  try {
    const subscriptionRef = db.collection('news_subscriptions').doc(uuid);
    await subscriptionRef.set({
      user_id,
      category_id,
      uuid,
      subscribed_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Logic to update user's combined feed
    await updateUsersCombinedFeed(redisClient, user_id, category_id);

    res.status(200).send({ message: 'Subscribed successfully', subscriptionId: uuid });
  } catch (err) {
    console.error('Failed to subscribe:', err);
    res.status(500).send('Failed to subscribe');
  }
});

app.post('/unsubscribe', async (req, res) => {
  const { user_id, category_id } = req.body;

  if (!user_id || !category_id) {
    return res.status(400).send('Missing user_id or category_id');
  }

  try {
    const subscriptionsRef = db.collection('news_subscriptions')
      .where('user_id', '==', user_id)
      .where('category_id', '==', category_id);
    const snapshot = await subscriptionsRef.get();

    if (snapshot.empty) {
      return res.status(404).send('Subscription not found');
    }

    snapshot.forEach(async (doc) => {
      await doc.ref.delete();
    });

    // Logic to remove category articles from user's combined feed
    await removeCategoryFromUsersCombinedFeed(redisClient, user_id, category_id);

    res.status(200).send('Unsubscribed successfully');
  } catch (err) {
    console.error('Failed to unsubscribe:', err);
    res.status(500).send('Failed to unsubscribe');
  }
});


app.get('/news-subscriptions', async (req, res) => {
  const userId = req.query.user_id as string; // Ensure userId is treated as a string
  const fields = req.query.fields as string; // This can be used to adjust the response structure

  if (!userId) {
    return res.status(400).send('Missing user_id');
  }

  try {
    const subscriptionsRef = db.collection('news_subscriptions').where('user_id', '==', userId);
    const snapshot = await subscriptionsRef.get();

    if (snapshot.empty) {
      return res.status(200).send([]);
    }

    let responseData;

    // Check if the fields query parameter is provided and adjust the response accordingly
    if (fields === 'category_ids') {
      const categoryIds = snapshot.docs.map(doc => doc.data().category_id);
      responseData = categoryIds; // Return an array of category_id numbers
    } else {
      // Default behavior: return the whole news_subscription document instances
      const subscriptions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      responseData = subscriptions;
    }

    res.json(responseData);
  } catch (err) {
    console.error('Failed to fetch subscriptions:', err);
    res.status(500).send('Failed to fetch subscriptions');
  }
});

async function fetchLatestArticlesForCategory(
  redisClient: RedisClientType,
  categoryId: string,
  limit: number = 10 // Default to fetching 10 latest articles
): Promise<ScoredArticle[]> {
  const categorySortedSetName = `articlesByCategory:${categoryId}`;
  const categoryHashName = `articlesHash:${categoryId}`;
  const articles: ScoredArticle[] = [];

  try {
    // Fetch the latest article IDs from the sorted set

    const articleIds = await redisClient.zRange(categorySortedSetName, limit, -1);

    // Fetch each article's details from the hash
    for (const articleId of articleIds) {
      const articleJson = await redisClient.hGet(categoryHashName, articleId);
      if (articleJson) {
        const article: ScoredArticle = JSON.parse(articleJson);
        articles.push(article);
      }
    }
  } catch (error) {
    console.error(`Failed to fetch articles for category ${categoryId}:`, error);
    throw error; // Rethrow the error to be handled by the caller
  }

  return articles;
}

async function updateUsersCombinedFeed(
  redisClient: RedisClientType, 
  user_id: string, 
  category_id: string
): Promise<void> {
  const categoryFeedOrderKey = `user:${user_id}:category:${category_id}:newsfeed:order`;
  const userCombinedFeedOrderKey = `user:${user_id}:combinedFeed:order`;

  try {
    // Fetch article IDs and their scores from the category-specific sorted set
    const articlesAndScores = await redisClient.zRangeWithScores(categoryFeedOrderKey, 0, -1);

    // Append each article to the user's combined feed sorted set with its score
    for (const {score, value: articleId} of articlesAndScores) {
      await redisClient.zAdd(userCombinedFeedOrderKey, {
        score, // Keep the original score to maintain the sorting
        value: articleId
      });
    }
  } catch (error) {
    console.error(`[Update Combined Feed Error] User ID: ${user_id}, Category ID: ${category_id}, Error: ${error}`);
  }
}

async function removeCategoryFromUsersCombinedFeed(
  redisClient: RedisClientType, 
  userUuid: string, 
  categoryId: string
): Promise<void> {
  const categoryFeedOrderKey = `user:${userUuid}:category:${categoryId}:newsfeed:order`;
  const userCombinedFeedOrderKey = `user:${userUuid}:combinedFeed:order`;

  try {
    const articleIds = await redisClient.zRange(categoryFeedOrderKey, 0, -1);

    if (articleIds.length > 0) {
      // If batch removal isn't supported or unclear, remove each article ID individually.
      await Promise.all(articleIds.map(articleId =>
        redisClient.zRem(userCombinedFeedOrderKey, articleId)
      ));

      // Clean up category-specific data
      await redisClient.del(categoryFeedOrderKey);
      const categoryFeedKey = `user:${userUuid}:category:${categoryId}:newsfeed:metadata`;
      await redisClient.del(categoryFeedKey);
    }
  } catch (error) {
    console.error(`[Remove Category Feed Error] User UUID: ${userUuid}, Category ID: ${categoryId}, Error: ${error}`);
  }
}

app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error middleware triggered:', err);
  res.status(500).send('An unexpected error occurred');
});

const server = http.createServer(app);
server.listen(port, () => {
  console.log(`Service listening at http://localhost:${port}`);
});