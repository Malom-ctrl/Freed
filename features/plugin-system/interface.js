import { Registry } from "./registry.js";
import { State } from "../../core/state.js";
import { Utils } from "../../core/utils.js";
import { DB } from "../../core/db.js";
import { Modals } from "../../components/modals.js";
import { Events } from "../../core/events.js";

import { ReaderView } from "../reader/reader-view.js";

export class Interface {
  constructor(pluginId) {
    this.pluginId = pluginId;
    this.registry = Registry;
  }

  get app() {
    return {
      refresh: () => {
        Events.emit(Events.REFRESH_UI);
      },
      switchFeed: (id) => {
        Events.emit(Events.FEED_SELECTED, { id });
      },
      getState: () => ({ ...State }),
      isMobile: () => window.innerWidth <= 768,
    };
  }

  get events() {
    return {
      on: (event, callback) => {
        const handler = (e) => callback(e.detail);
        window.addEventListener(event, handler);
        return handler;
      },
      off: (event, handler) => {
        window.removeEventListener(event, handler);
      },
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
        addFeedItem: (item) =>
          self.registry.registerSlot("sidebar:feeds", {
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
        createCAD: (type, dataOrGenerator) => {
          return ReaderView.createCADFromSelection(type, dataOrGenerator);
        },
        addCADRenderer: (type, renderFn, options = {}) => {
          self.registry.registerSlot("cad:renderer", {
            type: type,
            render: renderFn,
            pluginId: self.pluginId,
            ...options,
          });
        },
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
        addTab: (id, label, renderFn) => {
          self.registry.registerSlot("settings:tab", {
            id,
            label,
            render: renderFn,
            pluginId: self.pluginId,
          });
        },
      },
      addView: (id, title, renderFn) => {
        self.registry.registerSlot("view:custom", {
          id,
          title,
          render: renderFn,
          pluginId: self.pluginId,
        });
      },
      stats: {
        addSection: (renderFn) => {
          self.registry.registerSlot("stats:feed", {
            render: renderFn,
            pluginId: self.pluginId,
          });
        },
      },
      toast: (msg, action) => Utils.showToast(msg, action),
      tooltip: {
        show: (el, text) => {
          if (Modals.showTooltip) Modals.showTooltip(el, text);
        },
        hide: () => {
          if (Modals.hideTooltip) Modals.hideTooltip();
        },
      },
      popover: {
        show: (rect, content) => Modals.showPopover(rect, content),
        hide: () => Modals.hidePopover(),
      },
      dialog: {
        alert: (msg) => alert(msg),
        confirm: (msg) => confirm(msg),
      },
    };
  }

  get reader() {
    return {
      getCurrentGuid: () => State.currentArticleGuid,
      saveContent: async () => {
        // Save current DOM state of reader to DB
        const guid = State.currentArticleGuid;
        const el = document.getElementById("reader-content");
        if (guid && el) {
          await DB.saveArticles([{ guid: guid, fullContent: el.innerHTML }]);
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
    return {
      getArticle: (id) => DB.getArticle(id),
      getFeed: (id) => DB.getFeed(id),
      getTag: (name) => DB.getTag(name),
      saveArticle: (article) => DB.saveArticles([article]),
      getAllFeeds: () => DB.getAllFeeds(),
      stats: {
        update: (feedId, key, count) => DB.updateFeedStat(feedId, key, count),
      },
    };
  }

  get storage() {
    const prefix = `plugin:${this.pluginId}:`;
    return {
      get: async (key) => DB.pluginStorageGet(prefix + key),
      set: async (key, value) => DB.pluginStoragePut(prefix + key, value),
      delete: async (key) => DB.pluginStoragePut(prefix + key, undefined),
    };
  }
}
