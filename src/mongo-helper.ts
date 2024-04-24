import { MongoClient, ServerApiVersion } from 'mongodb';
import { ObjectId } from "mongodb";

const uri = process.env.MONGO_URI as string;

export interface NewsSubscription {
    _id?: ObjectId;        // Optional, MongoDB automatically generates this
    user_id: string;       // User's unique identifier
    category_id: string;   // Category's unique identifier
    uuid: string;          // UUID for the subscription, possibly for external reference
    subscribed_at: Date;   // Timestamp when the subscription was created
}

export interface NewsCategory {
    _id?: ObjectId;     // Optional, MongoDB automatically generates this
    name: string;       // Name of the category
    icon_name: string;  // Icon identifier for the category
}

export const client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });
  

client.connect()
  .then(() => console.log("Connected successfully to MongoDB."))
  .catch(err => console.error("Failed to connect to MongoDB", err));


export const newsDbName = 'News';
const newsDb = client.db(newsDbName);
export const newsSubscriptionsDbCollection = newsDb.collection<NewsSubscription>('Subscriptions');
export const newsCategoriesDbCollection = newsDb.collection<NewsCategory>('Categories');

