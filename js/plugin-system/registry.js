export const Registry = {
  // UI Slots definition
  slots: {
    "sidebar:primary": [], // Main navigation items
    "sidebar:secondary": [], // Bottom navigation items
    "reader:tool": [], // Text selection toolbar
    "reader:header": [], // Above article title
    "reader:footer": [], // Below article content
    "reader:action": [], // Top-right header icons
    "card:action": [], // Buttons on article cards
    "card:indicator": [], // Status icons on article cards (small icons next to date)
    "settings:section": [], // Settings content
    "navbar:action": [], // Mobile/Desktop header icons
    "filter:option": [], // Additional filter dropdown options
    "stats:feed": [], // Render function for feed stats modal. Input: feed object. Output: HTML string
    "cad:renderer": [], // Content Attached Data renderers. { type: string, render: (content, data) => string }
  },

  // Logic Hooks (Pipelines and Events)
  hooks: {
    "app:init": [], // App startup
    "feed:fetch:before": [], // (url) => modifiedUrl
    "articles:process": [], // (articles) => modifiedArticles
    "article:view": [], // (article) => void
    "article:read": [], // (article) => void
    "article:save": [], // (article) => void
    "feed:added": [], // (feed) => void
    "theme:register": [], // () => [{id, name, cssVars}]
  },

  registerSlot: function (type, item) {
    if (this.slots[type]) {
      this.slots[type].push(item);
    } else {
      console.warn(`[Plugin Registry] Unknown slot type: ${type}`);
    }
  },

  registerHook: function (event, callback) {
    if (this.hooks[event]) {
      this.hooks[event].push(callback);
    } else {
      console.warn(`[Plugin Registry] Unknown hook event: ${event}`);
    }
  },

  getExtensions: function (type) {
    return this.slots[type] || [];
  },

  // Execute sequential pipeline (Data IN -> Data OUT)
  executePipeline: async function (event, initialData) {
    if (!this.hooks[event]) return initialData;

    let data = initialData;
    for (const callback of this.hooks[event]) {
      try {
        const result = await callback(data);
        // Pipeline hooks must return data, otherwise we discard the change to be safe
        if (result !== undefined) {
          data = result;
        }
      } catch (e) {
        console.error(`[Plugin Registry] Error in pipeline ${event}:`, e);
      }
    }
    return data;
  },

  // Execute all listeners in parallel (Fire and Forget)
  broadcast: function (event, data) {
    if (!this.hooks[event]) return;
    this.hooks[event].forEach((callback) => {
      try {
        callback(data);
      } catch (e) {
        console.error(`[Plugin Registry] Error in event ${event}:`, e);
      }
    });
  },
};
