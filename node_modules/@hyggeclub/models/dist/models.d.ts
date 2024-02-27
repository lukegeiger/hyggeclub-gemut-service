export interface Category {
    name: string;
    category_id: string;
    icon_name: string;
    subscribed?: boolean;
}
export interface ExtendedCategory extends Category {
    subscribed?: boolean;
}
export type Article = {
    title: string;
    url: string;
    description: string;
    author: string;
    date: string;
    unix_date: number;
    source_id: string;
    tags: [string];
    category_id: string;
    original_url: string;
    id: string;
    image_url: string | null;
    thumbnail_image_url?: string | null;
};
export type ScoredArticle = {
    title: string;
    url: string;
    description: string;
    author: string;
    date: string;
    unix_date: number;
    source_id: string;
    category_id: string;
    personal_score: number;
    original_url: string;
    id: string;
    image_url: string | null;
    thumbnail_image_url?: string | null;
};
export type MediaType = 'article' | 'video' | 'audio' | 'post' | 'business';
export type ContentDetails = {
    title?: string;
    description?: string;
    tags?: string[];
    media_type: MediaType;
    media_url?: string;
    additional_data?: Record<string, any>;
};
export type Interaction = {
    interaction_id: string;
    user_id: string;
    interaction_type: InteractionType;
    content_id: string;
    content_details: ContentDetails;
    timestamp: Date;
    duration_in_seconds?: number;
    interaction_data?: Record<string, any>;
};
export type InteractionType = 'view' | 'like' | 'share' | 'comment' | 'follow' | 'purchase' | 'save';
export type WeightMap = {
    [key in InteractionType]: number;
};
export declare const weights: WeightMap;
