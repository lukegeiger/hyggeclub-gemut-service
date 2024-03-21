/**
 * Represents a category for content classification.
 */
export interface Category {
  name: string; // The name of the category.
  category_id: string; // Unique identifier for the category.
  icon_name: string; // The icon associated with the category.
  subscribed?: boolean; // Optional flag indicating subscription status.
}

/**
 * Defines the media type of content items.
 */
export type MediaType = 'article' | 'video' | 'audio' | 'post' | 'business' | 'event' | 'update' | 'weather';

/**
 * The base model for all content items within the system.
 */
export interface ContentItem {
  id: string; // Unique identifier for the content item.
  title: string; // Title of the content item.
  description: string; // Description or summary of the content item.
  timestamp: Date; // Publication or creation timestamp of the content item.
  tags?: string[]; // Optional array of tags associated with the content item.
  media_type: MediaType; // The type of media the content item represents.
  additional_data?: Record<string, any>; // Flexible field for additional metadata.
  jigsaw_layout: JigsawLayout | null;
}

export type JigsawLayout =  'prominent' | 'average' | 'minor' | null; // Optional layout designation.

/**
 * Detailed model for articles, extending the base ContentItem.
 */
export interface ArticleContentItem extends ContentItem {
  url: string; // URL to the full article.
  ingested_date: string; // URL to the full article.
  image_url: string | null; // Optional URL to the main image of the article.
  thumbnail_image_url: string | null; // Optional URL to the thumbnail image.
  authors: string[] | null; // Optional list of authors.
  date_published: string | null; // Optional publication date as a string.
  word_count: number | null; // Optional word count of the article.
  domain: string | null; // Optional domain from which the article was sourced.
  excerpt: string | null; // Optional short excerpt or summary of the article.
  news_source: NewsSource; // Source information of the news article.
  hygge_description: string | null; // Optional description for hygge scoring.
  hygge_score: number | null; // Optional hygge score.
  reason_for_score: string | null; // Optional reason for the hygge score.
  eta_to_read: number | null; // Optional estimated time to read the article.
  personal_score: number | null; // Optional personal score.
  final_score: number | null; // Optional final score after processing.
}

/**
 * Represents the source of a news article.
 */
export interface NewsSource {
  link: string; // URL to the news source.
  category_id: string; // Identifier for the category of the news source.
  source_id: string; // Unique identifier for the news source itself.
  name: string; // Name of the news source.
  logo_url: string; // URL to the logo of the news source.
  color_hex: string; // Hexadecimal color code associated with the news source.
}

/**
 * Model for event content items, extending the base ContentItem.
 */
export interface EventContentItem extends ContentItem {
  location: string; // Location where the event is happening.
  startDate: Date; // Start date and time of the event.
  endDate: Date; // End date and time of the event.
}

/**
 * Represents a message in a conversation, could be from a user or the system.
 */
export interface ConversationMessage {
  role: 'user' | 'system' | 'assistant'; // Role of the message sender.
  content: string; // Content of the message.
}

/**
 * Defines the types of interactions users can have with content items.
 */
export type InteractionType = 'view' | 'like' | 'share' | 'comment' | 'follow' | 'purchase' | 'save';

/**
 * Tracks interactions users have with content items.
 */
export interface Interaction {
  interaction_id: string; // Unique identifier for the interaction.
  user_id: string; // Identifier of the user who interacted with the content.
  interaction_type: InteractionType; // The type of interaction.
  content_id: string; // Identifier of the content that was interacted with.
  content_details: ContentItem; // Details of the content interacted with.
  timestamp: Date; // Timestamp of when the interaction occurred.
  duration_in_seconds?: number; // Optional duration of interaction in seconds.
  interaction_data?: Record<string, any>; // Optional additional data about the interaction.
}

/**
 * Defines the weighting of different types of interactions to quantify their impact.
 */
export const weights: Record<InteractionType, number> = {
  view: 1, // Assigned the least weight, indicating a view interaction.
  like: 2, // Indicates that the content was liked by a user.
  share: 3, // Indicates content shared by a user, given more importance than a like.
  comment: 4, // Indicates a comment was made, suggesting higher engagement.
  save: 5, // Content saved by a user for later, indicating significant interest.
  follow: 6, // User follows the content creator, showing long-term engagement.
  purchase: 7, // The highest weight, indicating a purchase was made based on the content.
};

/**
 * Represents a content item stored in Redis cache.
 */
export interface RedisContentItem {
  id: string; // Unique identifier for the content item.
  metadata: ContentItem; // Supports all content types, allowing flexible storage.
}

/**
 * Models a section of the user feed, grouping content items by theme or category.
 */
export interface FeedSection {
  id: string
  title: string | null; // Title of the section, can be null for sections without titles.
  contentItems: ContentItem[]; // Array of various content types within the section.
}

/**
 * Represents the structure of a user's feed, including paginated sections of content.
 */
export interface UserFeed {
  sections: FeedSection[]; // Sections of content items within the user's feed.
  next_cursor: string | null; // Cursor for pagination, null if there's no more content.
  has_more: boolean; // Indicates if more content is available beyond the current page.
}

/**
 * A map of weights!
 */
export type WeightMap = {
  [key in InteractionType]: number;
};

/**
 * A watered down version of a ArticleContentItem instance, meant to be send to be processed by ML
 */
export interface PreproccesedArticleData {
  id: string;
  title: string;
  description: string;
  word_count: number | null;
  authors: string[] | null;
}

/**
 * The model that ML gives back to us, hyrdated with goodies.
 */
export interface PostProccessedArticleData extends PreproccesedArticleData {
  tags: string[];
  reason: string;
  improved_description: string;
  hygge_score: number;
  original_description: string;
  eta_to_read: number;
}

/**
 * Tracks interactions users have with content items.
 */
export interface ArticleCluster {
  cluster_title: string; // Unique identifier for the interaction.
  cluster_uuid: string; // Identifier of the user who interacted with the content.
  cluster_id: InteractionType; // The type of interaction.
  article_uuids: string[]; // Identifier of the content that was interacted with.
  articles_data: ArticleContentItem[]; // Details of the content interacted with.
  average_hygge_score: number; // Timestamp of when the interaction occurred.
  news_categories: string[]; // Optional duration of interaction in seconds.
  score_for_user: number | null;
}