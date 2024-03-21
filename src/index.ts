import express from 'express';
import http from 'http';
import dotenv from 'dotenv';
import * as admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid';
import { Category } from '@hyggeclub/models';
import { createClient, RedisClientType } from 'redis';

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

redisClient.on('error', (err) => console.error('Redis Client Error', err));
redisClient.connect()
  .then(() => console.log('Connected to Redis successfully'))
  .catch((err) => console.error('Failed to connect to Redis', err));

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
    const categories: Category[] = [];  // Use the ExtendedCategory interface

    for (const doc of categoriesSnapshot.docs) {
      // Construct the base category object with the ExtendedCategory interface
      const category: Category = {
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
    await updateUsersPersonalizedFeed(redisClient, user_id, category_id);

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
    await removeCategoryFromUsersPersonalizedFeed(redisClient, user_id, category_id);

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

async function updateUsersPersonalizedFeed(
  redisClient: RedisClientType, 
  userId: string, 
  categoryId: string): Promise<void> {
  const personalizedFeedKey = `userPersonalizedFeed:sorted:${userId}`;
  const categoryClusterKey = `clusteredNewsSectionCategoryClusterForCategory:${categoryId}`;

  try {
    // Fetch cluster IDs and their scores for the given category
    const clustersAndScores = await redisClient.zRangeWithScores(categoryClusterKey, 0, -1);

    // Update the user's personalized feed with these clusters
    for (const {score, value: clusterId} of clustersAndScores) {
      // Fetch cluster details to get the score for the user, adjust logic as necessary
      const clusterJson = await redisClient.hGet(`userComprehensiveFeed:hash:${userId}`, clusterId);
      if (!clusterJson) continue; // Skip if no cluster details found

      const cluster = JSON.parse(clusterJson);
      const userScore = cluster.score_for_user ?? score; // Fallback to the category score if user-specific score not found

      // Add/update the cluster in the user's personalized feed sorted set
      await redisClient.zAdd(personalizedFeedKey, {
        score: -Math.abs(userScore), // Store as negative to sort in descending order
        value: clusterId
      });
    }
  } catch (error) {
    console.error(`[Update Personalized Feed Error] User ID: ${userId}, Category ID: ${categoryId}, Error: ${error}`);
  }
}

async function removeCategoryFromUsersPersonalizedFeed(
  redisClient: RedisClientType, 
  userUuid: string, 
  categoryId: string
): Promise<void> {
  const personalizedFeedKey = `userPersonalizedFeed:sorted:${userUuid}`;
  const categoryClusterKey = `clusteredNewsSectionCategoryClusterForCategory:${categoryId}`;

  try {
    // Fetch all cluster IDs for the category
    const categoryClusterIds = await redisClient.zRange(categoryClusterKey, 0, -1);

    // Ensure there are clusters to remove
    if (categoryClusterIds.length > 0) {
      // Correctly passing a single array of cluster IDs to zRem
      await redisClient.zRem(personalizedFeedKey, categoryClusterIds);
    }
  } catch (error) {
    console.error(`[Remove Personalized Feed Error] User UUID: ${userUuid}, Category ID: ${categoryId}, Error: ${error}`);
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