"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const dotenv_1 = __importDefault(require("dotenv"));
const uuid_1 = require("uuid");
const redis_1 = require("redis");
const mongo_helper_1 = require("./mongo-helper");
dotenv_1.default.config();
// Redis client initialization
const redisClient = (0, redis_1.createClient)({
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
const app = (0, express_1.default)();
const port = process.env.PORT || 3000;
app.use(express_1.default.json());
app.get('/test', (req, res) => {
    res.json({ message: 'This is a test endpoint.' });
});
app.get('/categories', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userId = req.query.user_id;
    try {
        const categoriesCursor = yield mongo_helper_1.newsCategoriesDbCollection.find({});
        const categories = yield categoriesCursor.toArray();
        const results = yield Promise.all(categories.map((category) => __awaiter(void 0, void 0, void 0, function* () {
            const categoryObj = {
                name: category.name,
                category_id: category._id,
                icon_name: category.icon_name,
                subscribed: false
            };
            if (userId) {
                const subscriptionCount = yield mongo_helper_1.newsSubscriptionsDbCollection.count({
                    user_id: userId,
                    category_id: category._id.toString()
                });
                categoryObj.subscribed = subscriptionCount > 0;
            }
            return categoryObj;
        })));
        res.json(results);
    }
    catch (err) {
        console.error('Failed to fetch categories:', err);
        res.status(500).send('Failed to fetch categories');
    }
}));
app.post('/subscribe', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { user_id, category_id } = req.body;
    if (!user_id || !category_id) {
        return res.status(400).send('Missing user_id or category_id');
    }
    const uuid = (0, uuid_1.v4)();
    try {
        yield mongo_helper_1.newsSubscriptionsDbCollection.insertOne({
            user_id,
            category_id,
            uuid,
            subscribed_at: new Date() // MongoDB does not have a serverTimestamp equivalent
        });
        // Logic to update user's combined feed
        yield updateUsersPersonalizedFeed(redisClient, user_id, category_id);
        res.status(200).send({ message: 'Subscribed successfully', subscriptionId: uuid });
    }
    catch (err) {
        console.error('Failed to subscribe:', err);
        res.status(500).send('Failed to subscribe');
    }
}));
app.post('/unsubscribe', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { user_id, category_id } = req.body;
    if (!user_id || !category_id) {
        return res.status(400).send('Missing user_id or category_id');
    }
    try {
        const deleteResult = yield mongo_helper_1.newsSubscriptionsDbCollection.deleteMany({
            user_id,
            category_id
        });
        if (deleteResult.deletedCount === 0) {
            return res.status(404).send('Subscription not found');
        }
        // Logic to remove category articles from user's combined feed
        yield removeCategoryFromUsersPersonalizedFeed(redisClient, user_id, category_id);
        res.status(200).send('Unsubscribed successfully');
    }
    catch (err) {
        console.error('Failed to unsubscribe:', err);
        res.status(500).send('Failed to unsubscribe');
    }
}));
app.get('/news-subscriptions', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userId = req.query.user_id;
    const fields = req.query.fields;
    if (!userId) {
        return res.status(400).send('Missing user_id');
    }
    try {
        const subscriptionsCursor = yield mongo_helper_1.newsSubscriptionsDbCollection.find({ user_id: userId });
        const subscriptions = yield subscriptionsCursor.toArray();
        if (subscriptions.length === 0) {
            return res.status(200).send([]);
        }
        let responseData;
        if (fields === 'category_ids') {
            responseData = subscriptions.map(subscription => subscription.category_id);
        }
        else {
            responseData = subscriptions.map(subscription => (Object.assign({ id: subscription._id }, subscription)));
        }
        res.json(responseData);
    }
    catch (err) {
        console.error('Failed to fetch subscriptions:', err);
        res.status(500).send('Failed to fetch subscriptions');
    }
}));
function updateUsersPersonalizedFeed(redisClient, userId, categoryId) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const personalizedFeedKey = `userPersonalizedFeed:sorted:${userId}`;
        const comprehensiveFeedHashKey = `userComprehensiveFeed:hash:${userId}`;
        const categoryClusterKey = `clusteredNewsSectionCategoryClusterForCategory:${categoryId}`;
        console.log(`[updateUsersPersonalizedFeed] Fetching cluster IDs for category ${categoryId} for user ${userId}`);
        // Fetch cluster IDs from the standard set
        const categoryClusterIds = yield redisClient.sMembers(categoryClusterKey);
        console.log(`[updateUsersPersonalizedFeed] Fetched cluster IDs: ${categoryClusterIds.join(', ')}`);
        for (const clusterId of categoryClusterIds) {
            console.log(`[updateUsersPersonalizedFeed] Fetching details for cluster ID: ${clusterId}`);
            // Fetch the cluster details to get the score for the user
            const clusterJson = yield redisClient.hGet(comprehensiveFeedHashKey, clusterId);
            if (clusterJson) {
                const cluster = JSON.parse(clusterJson);
                const score = (_a = cluster.score_for_user) !== null && _a !== void 0 ? _a : 0; // Use the personalized score, fallback to 0 if not available
                console.log(`[updateUsersPersonalizedFeed] Adding cluster ${clusterId} with score ${score} to personalized feed for user ${userId}`);
                // Add to the sorted set with the personalized score
                yield redisClient.zAdd(personalizedFeedKey, [{ score: -Math.abs(score), value: clusterId }]);
            }
            else {
                console.log(`[updateUsersPersonalizedFeed] No details found for cluster ID: ${clusterId}`);
            }
        }
    });
}
function removeCategoryFromUsersPersonalizedFeed(redisClient, userUuid, categoryId) {
    return __awaiter(this, void 0, void 0, function* () {
        const personalizedFeedKey = `userPersonalizedFeed:sorted:${userUuid}`;
        const categoryClusterKey = `clusteredNewsSectionCategoryClusterForCategory:${categoryId}`;
        console.log(`[removeCategoryFromUsersPersonalizedFeed] Removing clusters for category ${categoryId} from personalized feed for user ${userUuid}`);
        // Fetch cluster IDs from the standard set
        const categoryClusterIds = yield redisClient.sMembers(categoryClusterKey);
        console.log(`[removeCategoryFromUsersPersonalizedFeed] Cluster IDs to remove: ${categoryClusterIds.join(', ')}`);
        // Remove these cluster IDs from the sorted set
        if (categoryClusterIds.length > 0) {
            yield redisClient.zRem(personalizedFeedKey, categoryClusterIds);
            console.log(`[removeCategoryFromUsersPersonalizedFeed] Removed clusters from personalized feed for user ${userUuid}`);
        }
        else {
            console.log(`[removeCategoryFromUsersPersonalizedFeed] No clusters found for category ${categoryId}`);
        }
    });
}
app.use((err, req, res, _next) => {
    console.error('Error middleware triggered:', err);
    res.status(500).send('An unexpected error occurred');
});
const server = http_1.default.createServer(app);
server.listen(port, () => {
    console.log(`Service listening at http://localhost:${port}`);
});
