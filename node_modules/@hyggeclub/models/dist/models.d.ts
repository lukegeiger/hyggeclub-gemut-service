/**
 * Represents a category for content classification.
 */
export interface Category {
    name: string;
    category_id: string;
    icon_name: string;
    subscribed?: boolean;
}
/**
 * Defines the media type of content items.
 */
export type MediaType = 'article' | 'video' | 'audio' | 'post' | 'business' | 'event' | 'update' | 'weather';
/**
 * The base model for all content items within the system.
 */
export interface ContentItem {
    id: string;
    title: string;
    description: string;
    timestamp: Date;
    tags?: string[];
    media_type: MediaType;
    additional_data?: Record<string, any>;
    jigsaw_layout: JigsawLayout | null;
}
export type JigsawLayout = 'prominent' | 'average' | 'minor' | null;
/**
 * Detailed model for articles, extending the base ContentItem.
 */
export interface ArticleContentItem extends ContentItem {
    url: string;
    ingested_date: string;
    image_url: string | null;
    thumbnail_image_url: string | null;
    authors: string[] | null;
    date_published: string | null;
    word_count: number | null;
    domain: string | null;
    excerpt: string | null;
    news_source: NewsSource;
    hygge_description: string | null;
    hygge_score: number | null;
    reason_for_score: string | null;
    eta_to_read: number | null;
    personal_score: number | null;
    final_score: number | null;
}
/**
 * Represents the source of a news article.
 */
export interface NewsSource {
    link: string;
    category_id: string;
    source_id: string;
    name: string;
    logo_url: string;
    color_hex: string;
}
/**
 * Model for event content items, extending the base ContentItem.
 */
export interface EventContentItem extends ContentItem {
    location: string;
    startDate: Date;
    endDate: Date;
}
/**
 * Represents a message in a conversation, could be from a user or the system.
 */
export interface ConversationMessage {
    role: 'user' | 'system' | 'assistant';
    content: string;
}
/**
 * Defines the types of interactions users can have with content items.
 */
export type InteractionType = 'view' | 'like' | 'share' | 'comment' | 'follow' | 'purchase' | 'save';
/**
 * Tracks interactions users have with content items.
 */
export interface Interaction {
    interaction_id: string;
    user_id: string;
    interaction_type: InteractionType;
    content_id: string;
    content_details: ContentItem;
    timestamp: Date;
    duration_in_seconds?: number;
    interaction_data?: Record<string, any>;
}
/**
 * Defines the weighting of different types of interactions to quantify their impact.
 */
export declare const weights: Record<InteractionType, number>;
/**
 * Represents a content item stored in Redis cache.
 */
export interface RedisContentItem {
    id: string;
    metadata: ContentItem;
}
/**
 * Models a section of the user feed, grouping content items by theme or category.
 */
export interface FeedSection {
    id: string;
    title: string | null;
    contentItems: ContentItem[];
}
/**
 * Represents the structure of a user's feed, including paginated sections of content.
 */
export interface UserFeed {
    sections: FeedSection[];
    next_cursor: string | null;
    has_more: boolean;
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
    cluster_title: string;
    cluster_uuid: string;
    cluster_id: InteractionType;
    article_uuids: string[];
    articles_data: ArticleContentItem[];
    average_hygge_score: number;
    news_categories: string[];
    score_for_user: number | null;
}
