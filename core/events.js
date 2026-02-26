export const Events = {
  // Event Names
  APP_INIT: "freed:app-init",
  REFRESH_UI: "freed:refresh-ui", // Global fallback

  // Feed Events
  FEEDS_UPDATED: "freed:feeds-updated", // Added, removed, edited, synced
  FEED_SELECTED: "freed:feed-selected",
  FEED_ADDED: "freed:feed-added",
  FEED_TAG_ADDED: "freed:feed-tag-added",
  FEED_TAG_REMOVED: "freed:feed-tag-removed",

  // Article Events
  ARTICLES_UPDATED: "freed:articles-updated", // New articles fetched, or list needs refresh
  ARTICLE_CHANGED: "freed:article-changed", // Read status, favorite, etc.
  ARTICLE_READ: "freed:article-read", // Specific event for read completion
  ARTICLE_FAVORITED: "freed:article-favorited",

  // Filter/View Events
  FILTER_CHANGED: "freed:filter-changed",
  VIEW_CHANGED: "freed:view-changed", // Discover vs Reader

  // Settings
  SETTINGS_UPDATED: "freed:settings-updated",

  // Helper to dispatch
  emit: (eventName, detail = {}) => {
    window.dispatchEvent(new CustomEvent(eventName, { detail }));
  },

  // Helper to listen
  on: (eventName, callback) => {
    const handler = (e) => callback(e.detail);
    window.addEventListener(eventName, handler);
    return handler; // Return for removal
  },

  off: (eventName, handler) => {
    window.removeEventListener(eventName, handler);
  },
};
