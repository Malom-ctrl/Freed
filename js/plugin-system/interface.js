window.Freed = window.Freed || {};
window.Freed.Plugins = window.Freed.Plugins || {};

window.Freed.Plugins.Interface = class {
  constructor(pluginId) {
    this.pluginId = pluginId;
    this.registry = window.Freed.Plugins.Registry;
  }

  get app() {
    return {
      refresh: () => {
        if (window.Freed.App && window.Freed.App.refreshUI)
          window.Freed.App.refreshUI();
      },
      getState: () => ({ ...window.Freed.State }),
      isMobile: () => window.innerWidth <= 768,
    };
  }

  get ui() {
    const self = this;
    return {
      sidebar: {
        addPrimary: (item) =>
          self.registry.registerSlot("sidebar:primary", {
            ...item,
            pluginId: self.pluginId,
          }),
        addSecondary: (item) =>
          self.registry.registerSlot("sidebar:secondary", {
            ...item,
            pluginId: self.pluginId,
          }),
      },
      reader: {
        addTool: (tool) =>
          self.registry.registerSlot("reader:tool", {
            ...tool,
            pluginId: self.pluginId,
          }),
        addAction: (action) =>
          self.registry.registerSlot("reader:action", {
            ...action,
            pluginId: self.pluginId,
          }),
        addFooter: (renderFn) =>
          self.registry.registerSlot("reader:footer", {
            render: renderFn,
            pluginId: self.pluginId,
          }),
        addHeader: (renderFn) =>
          self.registry.registerSlot("reader:header", {
            render: renderFn,
            pluginId: self.pluginId,
          }),
      },
      card: {
        addAction: (action) =>
          self.registry.registerSlot("card:action", {
            ...action,
            pluginId: self.pluginId,
          }),
        addIndicator: (indicator) =>
          self.registry.registerSlot("card:indicator", {
            ...indicator,
            pluginId: self.pluginId,
          }),
      },
      settings: {
        addSection: (targetTab, title, renderFn) => {
          self.registry.registerSlot("settings:section", {
            tab: targetTab,
            title,
            render: renderFn,
            pluginId: self.pluginId,
          });
        },
      },
      stats: {
        addSection: (renderFn) => {
          self.registry.registerSlot("stats:feed", {
            render: renderFn,
            pluginId: self.pluginId,
          });
        },
      },
      toast: (msg, action) => window.Freed.Utils.showToast(msg, action),
      tooltip: {
        show: (el, text) => {
          if (window.Freed.UI.showTooltip)
            window.Freed.UI.showTooltip(el, text);
        },
        hide: () => {
          if (window.Freed.UI.hideTooltip) window.Freed.UI.hideTooltip();
        },
      },
      dialog: {
        alert: (msg) => alert(msg),
        confirm: (msg) => confirm(msg),
      },
    };
  }

  get reader() {
    return {
      getCurrentGuid: () => window.Freed.State.currentArticleGuid,
      saveContent: async () => {
        // Save current DOM state of reader to DB
        const guid = window.Freed.State.currentArticleGuid;
        const el = document.getElementById("reader-content");
        if (guid && el) {
          await window.Freed.DB.saveArticles([
            { guid: guid, fullContent: el.innerHTML },
          ]);
        }
      },
    };
  }

  get hooks() {
    const self = this;
    return {
      on: (event, callback) => self.registry.registerHook(event, callback),
      processArticles: (fn) =>
        self.registry.registerHook("articles:process", fn),
      beforeFetch: (fn) => self.registry.registerHook("feed:fetch:before", fn),
    };
  }

  get data() {
    const { DB } = window.Freed;
    return {
      getArticle: (id) => DB.getArticle(id),
      saveArticle: (article) => DB.saveArticles([article]),
      getAllFeeds: () => DB.getAllFeeds(),
      stats: {
        update: (feedId, key, count) => DB.updateFeedStat(feedId, key, count),
      },
    };
  }

  get storage() {
    const { DB } = window.Freed;
    const prefix = `plugin:${this.pluginId}:`;
    return {
      get: async (key) => DB.pluginStorageGet(prefix + key),
      set: async (key, value) => DB.pluginStoragePut(prefix + key, value),
      delete: async (key) => DB.pluginStoragePut(prefix + key, undefined),
    };
  }
};
