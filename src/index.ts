import express from 'express';
import http from 'http';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import { ArticleCluster } from '@hyggeclub/models';
import { createClient, RedisClientType } from 'redis';
import { newsSubscriptionsDbCollection ,newsCategoriesDbCollection } from './mongo-helper';

dotenv.config();

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

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.get('/test', (req, res) => {
  res.json({ message: 'This is a test endpoint.' });
});

app.get('/categories', async (req, res) => {
  const userId = req.query.user_id as string;

  try {
    const categoriesCursor = await newsCategoriesDbCollection.find({});
    const categories = await categoriesCursor.toArray();

    const results = await Promise.all(categories.map(async category => {
      const categoryObj = {
        name: category.name,
        category_id: category._id,
        icon_name: category.icon_name,
        subscribed: false
      };

      if (userId) {
        const subscriptionCount = await newsSubscriptionsDbCollection.count({
          user_id: userId,
          category_id: category._id.toString()
        });

        categoryObj.subscribed = subscriptionCount > 0;
      }

      return categoryObj;
    }));

    res.json(results);
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

  const uuid = uuidv4();

  try {
    await newsSubscriptionsDbCollection.insertOne({
      user_id,
      category_id,
      uuid,
      subscribed_at: new Date() // MongoDB does not have a serverTimestamp equivalent
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
    const deleteResult = await newsSubscriptionsDbCollection.deleteMany({
      user_id,
      category_id
    });

    if (deleteResult.deletedCount === 0) {
      return res.status(404).send('Subscription not found');
    }

    // Logic to remove category articles from user's combined feed
    await removeCategoryFromUsersPersonalizedFeed(redisClient, user_id, category_id);

    res.status(200).send('Unsubscribed successfully');
  } catch (err) {
    console.error('Failed to unsubscribe:', err);
    res.status(500).send('Failed to unsubscribe');
  }
});

app.get('/news-subscriptions', async (req, res) => {
  const userId = req.query.user_id as string;
  const fields = req.query.fields as string;

  if (!userId) {
    return res.status(400).send('Missing user_id');
  }

  try {
    const subscriptionsCursor = await newsSubscriptionsDbCollection.find({ user_id: userId });
    const subscriptions = await subscriptionsCursor.toArray();

    if (subscriptions.length === 0) {
      return res.status(200).send([]);
    }

    let responseData;
    if (fields === 'category_ids') {
      responseData = subscriptions.map(subscription => subscription.category_id);
    } else {
      responseData = subscriptions.map(subscription => ({
        id: subscription._id,
        ...subscription
      }));
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
  categoryId: string
): Promise<void> {
  const personalizedFeedKey = `userPersonalizedFeed:sorted:${userId}`;
  const comprehensiveFeedHashKey = `userComprehensiveFeed:hash:${userId}`;
  const categoryClusterKey = `clusteredNewsSectionCategoryClusterForCategory:${categoryId}`;

  console.log(`[updateUsersPersonalizedFeed] Fetching cluster IDs for category ${categoryId} for user ${userId}`);
  
  // Fetch cluster IDs from the standard set
  const categoryClusterIds: string[] = await redisClient.sMembers(categoryClusterKey);
  console.log(`[updateUsersPersonalizedFeed] Fetched cluster IDs: ${categoryClusterIds.join(', ')}`);

  for (const clusterId of categoryClusterIds) {
    console.log(`[updateUsersPersonalizedFeed] Fetching details for cluster ID: ${clusterId}`);
    
    // Fetch the cluster details to get the score for the user
    const clusterJson = await redisClient.hGet(comprehensiveFeedHashKey, clusterId);
    if (clusterJson) {
      const cluster: ArticleCluster = JSON.parse(clusterJson);
      const score = cluster.score_for_user ?? 0; // Use the personalized score, fallback to 0 if not available

      console.log(`[updateUsersPersonalizedFeed] Adding cluster ${clusterId} with score ${score} to personalized feed for user ${userId}`);
      
      // Add to the sorted set with the personalized score
      await redisClient.zAdd(personalizedFeedKey, [{ score: -Math.abs(score), value: clusterId }]);
    } else {
      console.log(`[updateUsersPersonalizedFeed] No details found for cluster ID: ${clusterId}`);
    }
  }
}

async function removeCategoryFromUsersPersonalizedFeed(
  redisClient: RedisClientType, 
  userUuid: string, 
  categoryId: string
): Promise<void> {
  const personalizedFeedKey = `userPersonalizedFeed:sorted:${userUuid}`;
  const categoryClusterKey = `clusteredNewsSectionCategoryClusterForCategory:${categoryId}`;

  console.log(`[removeCategoryFromUsersPersonalizedFeed] Removing clusters for category ${categoryId} from personalized feed for user ${userUuid}`);
  
  // Fetch cluster IDs from the standard set
  const categoryClusterIds: string[] = await redisClient.sMembers(categoryClusterKey);
  console.log(`[removeCategoryFromUsersPersonalizedFeed] Cluster IDs to remove: ${categoryClusterIds.join(', ')}`);

  // Remove these cluster IDs from the sorted set
  if (categoryClusterIds.length > 0) {
    await redisClient.zRem(personalizedFeedKey, categoryClusterIds);
    console.log(`[removeCategoryFromUsersPersonalizedFeed] Removed clusters from personalized feed for user ${userUuid}`);
  } else {
    console.log(`[removeCategoryFromUsersPersonalizedFeed] No clusters found for category ${categoryId}`);
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