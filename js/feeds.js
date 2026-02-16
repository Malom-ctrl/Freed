window.Freed = window.Freed || {};

window.Freed.Feeds = {
  isEditing: false,

  // Factory method for creating a consistent Feed object
  createFeedObject: function (data) {
    const { Utils } = window.Freed;
    return {
      id: data.id || Date.now().toString() + Math.floor(Math.random() * 1000),
      url: data.url,
      title: data.title || "New Feed",
      description: data.description || "",
      color: data.color || Utils.getRandomFromPalette(),
      type: data.type || "rss",
      parsingRule: data.parsingRule || null,
      tags: Array.isArray(data.tags) ? data.tags : [],
      autofetch: !!data.autofetch,
      // Default stats initialization
      stats: data.stats || {
        totalFetched: 0,
        read: 0,
        discarded: 0,
        favorited: 0,
        wordCountRead: 0,
        wordCountTranslated: 0,
      },
    };
  },

  openAddFeedModal: function () {
    const { Tags } = window.Freed;
    this.isEditing = false;
    const modal = document.getElementById("feed-modal");
    document.getElementById("feed-modal-title").textContent = "Add New Feed";

    document.getElementById("feed-id-input").value = "";
    document.getElementById("feed-url-input").value = "";
    document.getElementById("feed-url-input").disabled = false;
    document.getElementById("feed-name-input").value = "";
    document.getElementById("feed-autofetch-input").checked = false; // Default false
    document.getElementById("btn-delete-feed").style.display = "none";

    const actionBtns = document.getElementById("feed-modal-action-buttons");
    if (actionBtns) actionBtns.style.display = "flex";

    Tags.currentTags = [];
    Tags.renderTagEditor();
    Tags.renderColorPicker("color-picker-container", null);
    window.Freed.UI.toggleModal("feed-modal", true);
  },

  openEditFeedModal: async function (feed) {
    const { Tags, DB, Utils } = window.Freed;
    this.isEditing = true;
    const modal = document.getElementById("feed-modal");
    document.getElementById("feed-modal-title").textContent = "Edit Feed";

    document.getElementById("feed-id-input").value = feed.id;
    document.getElementById("feed-url-input").value = feed.url;
    document.getElementById("feed-url-input").disabled = true;
    document.getElementById("feed-name-input").value = feed.title;
    document.getElementById("feed-autofetch-input").checked = !!feed.autofetch;

    const deleteBtn = document.getElementById("btn-delete-feed");
    deleteBtn.style.display = "block";
    deleteBtn.onclick = () => this.handleDeleteFeed(feed.id);

    const actionBtns = document.getElementById("feed-modal-action-buttons");
    if (actionBtns) actionBtns.style.display = "none";

    const allTags = await DB.getAllTags();
    const tagMap = new Map(allTags.map((t) => [t.name, t]));

    Tags.currentTags = (feed.tags || []).map((tagName) => {
      return (
        tagMap.get(tagName) || {
          name: tagName,
          color: Utils.getRandomFromPalette(),
        }
      );
    });

    Tags.renderTagEditor();
    Tags.renderColorPicker("color-picker-container", feed.color);
    window.Freed.UI.toggleModal("feed-modal", true);
  },

  // --- Helpers ---

  _getModalValues: function () {
    const { Tags } = window.Freed;
    return {
      id: document.getElementById("feed-id-input").value,
      url: document.getElementById("feed-url-input").value.trim(),
      name: document.getElementById("feed-name-input").value.trim(),
      autofetch: document.getElementById("feed-autofetch-input").checked,
      color: Tags.selectedColor,
      tags: Tags.currentTags,
    };
  },

  _saveTags: async function (tags) {
    const { DB } = window.Freed;
    for (const tag of tags) {
      await DB.saveTag(tag);
    }
  },

  _triggerAutofetch: async function (feed) {
    const { DB, Service, Config, Utils } = window.Freed;
    const contentRetentionDays = parseInt(
      localStorage.getItem("cleanup_content_days") ||
        Config.DEFAULTS.CLEANUP_CONTENT_DAYS,
    );
    const articles = await DB.getArticlesByFeed(feed.id);

    if (articles.length > 0) {
      Utils.showToast(`Background fetch started`);
      Service.processAutofetch(feed, articles, contentRetentionDays, () => {
        if (window.Freed.App && window.Freed.App.refreshUI) {
          window.Freed.App.refreshUI();
        }
      });
    }
  },

  // Core Logic extracted for re-use
  _createFeed: async function (url, title, color, tags, autofetch) {
    const { DB, Service } = window.Freed;

    // Ensure tags exist in DB
    await this._saveTags(tags);
    const tagNames = tags.map((t) => t.name);

    const tempId = "temp-" + Date.now();
    const result = await Service.fetchAndParseFeed({
      id: tempId,
      url: url,
      title: "Temp",
    });

    if (result.error) throw new Error(result.error);
    if (!result.articles || result.articles.length === 0)
      throw new Error("No articles found");

    const finalTitle = title || result.articles[0].feedTitle || "New Feed";

    // Use the shared factory method
    const newFeed = this.createFeedObject({
      url: url,
      title: finalTitle,
      color: color,
      tags: tagNames,
      autofetch: autofetch,
      type: result.type,
      parsingRule: result.parsingRule,
    });

    await DB.saveFeed(newFeed);
    await DB.saveArticles(
      result.articles.map((a) => ({
        ...a,
        feedId: newFeed.id,
        feedTitle: finalTitle,
      })),
    );

    return newFeed;
  },

  // --- Actions ---

  addFeedDirectly: async function (feedData, onSuccess) {
    const { Utils, DB } = window.Freed;
    try {
      // Check if tags have colors, if not assign random from palette
      const tagsWithColors = feedData.tags.map((tName) => ({
        name: tName,
        color: Utils.getRandomFromPalette(),
      }));

      // For existing tags in DB, we prefer their existing color
      const existingTags = await DB.getAllTags();
      const tagMap = new Map(existingTags.map((t) => [t.name, t.color]));

      tagsWithColors.forEach((t) => {
        if (tagMap.has(t.name)) t.color = tagMap.get(t.name);
      });

      const newFeed = await this._createFeed(
        feedData.url,
        feedData.title,
        feedData.accentColor,
        tagsWithColors,
        false, // Default autofetch to false for discover items for now
      );

      Utils.showToast(`Added ${newFeed.title}`);
      if (onSuccess) onSuccess(newFeed);

      // Cleanup & Trigger
      await DB.cleanupOrphanedTags();
      if (newFeed.autofetch) this._triggerAutofetch(newFeed);
      return true;
    } catch (e) {
      console.error(e);
      Utils.showToast(`Error adding ${feedData.title}: ${e.message}`);
      return false;
    }
  },

  addDiscoverPack: async function (pack, allDiscoverFeeds, onComplete) {
    const { Utils, DB } = window.Freed;
    const feedsToAdd = pack.feeds
      .map((fid) => allDiscoverFeeds.find((f) => f.id === fid))
      .filter(Boolean);

    if (feedsToAdd.length === 0) return;

    Utils.showToast(`Adding ${feedsToAdd.length} feeds...`);

    // Get existing to avoid duplicates
    const existingFeeds = await DB.getAllFeeds();
    const existingUrls = new Set(existingFeeds.map((f) => f.url));

    let addedCount = 0;
    for (const feedData of feedsToAdd) {
      if (existingUrls.has(feedData.url)) continue;

      await this.addFeedDirectly(feedData);
      addedCount++;
    }

    if (addedCount > 0) {
      Utils.showToast(`Pack added (${addedCount} new feeds)`);
    } else {
      Utils.showToast(`All feeds in pack already exist`);
    }

    if (onComplete) onComplete();
  },

  saveCurrentEdit: async function () {
    const { DB, Utils } = window.Freed;
    const values = this._getModalValues();

    if (!values.id) return;

    try {
      // Check for tag color changes
      const allTags = await DB.getAllTags();
      const dbTagMap = new Map(allTags.map((t) => [t.name, t.color]));
      let tagsColorChanged = false;
      for (const t of values.tags) {
        if (dbTagMap.get(t.name) !== t.color) {
          tagsColorChanged = true;
          break;
        }
      }

      const feeds = await DB.getAllFeeds();
      const feed = feeds.find((f) => f.id === values.id);

      if (feed) {
        const tagNames = values.tags.map((t) => t.name);
        let feedChanged = false;
        let autofetchTriggered = false;

        if (feed.title !== values.name && values.name) {
          feed.title = values.name;
          feedChanged = true;
        }
        if (feed.color !== values.color) {
          feed.color = values.color;
          feedChanged = true;
        }
        if (JSON.stringify(feed.tags) !== JSON.stringify(tagNames)) {
          feed.tags = tagNames;
          feedChanged = true;
        }

        if (feed.autofetch !== values.autofetch) {
          feed.autofetch = values.autofetch;
          feedChanged = true;
          if (values.autofetch) autofetchTriggered = true;
        }

        if (feedChanged || tagsColorChanged) {
          await this._saveTags(values.tags);
          if (feedChanged) await DB.saveFeed(feed);
          await DB.cleanupOrphanedTags();

          if (autofetchTriggered) {
            this._triggerAutofetch(feed);
          } else {
            Utils.showToast(`Saved changes`);
          }

          if (window.Freed.App && window.Freed.App.refreshUI) {
            window.Freed.App.refreshUI();
          }
        }
      }
    } catch (e) {
      console.error("Auto-save failed", e);
    }
  },

  handleSaveFeed: async function (onSuccessCallback) {
    const { DB, Utils } = window.Freed;
    const values = this._getModalValues();

    if (!values.url) return;

    const btn = document.getElementById("btn-save-feed");
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = "Saving...";

    try {
      const newFeed = await this._createFeed(
        values.url,
        values.name,
        values.color,
        values.tags,
        values.autofetch,
      );

      Utils.showToast(`Added ${newFeed.title}`);

      if (onSuccessCallback) onSuccessCallback(newFeed.id, true);

      await DB.cleanupOrphanedTags();
      window.closeFeedModal();

      if (newFeed.autofetch) {
        this._triggerAutofetch(newFeed);
      }
    } catch (e) {
      console.error(e);
      let msg = "Error saving feed.";
      let action = null;

      if (e.message.includes("No articles"))
        msg = "No articles found. Check URL.";
      else if (e.message.includes("HTTP error") || e.message.includes("404"))
        msg = "Feed URL not found (404).";
      else if (
        e.message.includes("Network") ||
        e.message.includes("Failed to fetch")
      )
        msg = "Network error. check your connection.";
      else if (e.message.includes("Gemini API Key")) {
        msg =
          "This feed is not a valid RSS feed, it requires a Gemini API Key to be parsed.";
        action = {
          label: "Settings",
          callback: () => {
            const btn = document.getElementById("btn-settings");
            if (btn) btn.click();
          },
        };
      } else msg = `Error: ${e.message}`;

      Utils.showToast(msg, action);
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  },

  handleDeleteFeed: async function (id, onDeleteCallback) {
    if (!confirm("Are you sure you want to delete this feed?")) return;
    this.isEditing = false; // Prevent auto-save on close
    await window.Freed.DB.deleteFeed(id);
    await window.Freed.DB.cleanupOrphanedTags();
    window.Freed.Utils.showToast("Feed deleted");
    window.closeFeedModal();
    if (onDeleteCallback) onDeleteCallback(id);
  },
};
