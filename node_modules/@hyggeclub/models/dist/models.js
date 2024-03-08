"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.weights = void 0;
/**
 * Defines the weighting of different types of interactions to quantify their impact.
 */
exports.weights = {
    view: 1, // Assigned the least weight, indicating a view interaction.
    like: 2, // Indicates that the content was liked by a user.
    share: 3, // Indicates content shared by a user, given more importance than a like.
    comment: 4, // Indicates a comment was made, suggesting higher engagement.
    save: 5, // Content saved by a user for later, indicating significant interest.
    follow: 6, // User follows the content creator, showing long-term engagement.
    purchase: 7, // The highest weight, indicating a purchase was made based on the content.
};
//# sourceMappingURL=models.js.map