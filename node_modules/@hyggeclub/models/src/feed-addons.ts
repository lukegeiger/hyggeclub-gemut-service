import { ContentItem, ArticleContentItem, UserFeed, } from "./models";

export function isArticleContentItem(contentItem: ContentItem): contentItem is ArticleContentItem {
    return contentItem.media_type === 'article';
}
  
export function getContentItemsByType<T extends ContentItem>(
    contentItems: ContentItem[],
    checkType: (contentItem: ContentItem) => contentItem is T
  ): T[] {
    return contentItems.filter(checkType);
  }
  

export function getAllArticlesFromFeed(feed: UserFeed): ArticleContentItem[] {
    return feed.sections
      .flatMap(section => section.contentItems) // Flatten all content items from all sections
      .filter(isArticleContentItem); // Filter out only articles using the type guard
  }
  