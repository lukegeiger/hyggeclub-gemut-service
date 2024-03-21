"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllArticlesFromFeed = exports.getContentItemsByType = exports.isArticleContentItem = void 0;
function isArticleContentItem(contentItem) {
    return contentItem.media_type === 'article';
}
exports.isArticleContentItem = isArticleContentItem;
function getContentItemsByType(contentItems, checkType) {
    return contentItems.filter(checkType);
}
exports.getContentItemsByType = getContentItemsByType;
function getAllArticlesFromFeed(feed) {
    return feed.sections
        .flatMap(section => section.contentItems) // Flatten all content items from all sections
        .filter(isArticleContentItem); // Filter out only articles using the type guard
}
exports.getAllArticlesFromFeed = getAllArticlesFromFeed;
//# sourceMappingURL=feed-addons.js.map