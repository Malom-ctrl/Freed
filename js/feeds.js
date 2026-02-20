import { Tags } from "./tags.js";
import { DB } from "./db.js";
import { Utils } from "./utils.js";
import { Service } from "./rss-service.js";
import { Config } from "./config.js";
import { UI } from "./ui-renderer.js";

export const Feeds = {
  isEditing: false,
  tempIconData: null,
  _inputDebounce: null,

  // Factory method for creating a consistent Feed object
  createFeedObject: function (data) {
    return {
      id: data.id || Date.now().toString() + Math.floor(Math.random() * 1000),
      url: data.url,
      title: data.title || "New Feed",
      description: data.description || "",

      // Core Color Properties
      color: data.color, // Manual user selection only. If null, UI calculates fallback.

      type: data.type || "rss",
      parsingRule: data.parsingRule || null,
      tags: Array.isArray(data.tags) ? data.tags : [],
      autofetch: !!data.autofetch,

      // Icon Properties
      iconData: data.iconData || null,

      // Stats
      stats: data.stats || {
        totalFetched: 0,
        read: 0,
        discarded: 0,
        favorited: 0,
        wordCountRead: 0,
      },
    };
  },

  openAddFeedModal: function () {
    this.isEditing = false;
    this._resetTempIconState();

    const modal = document.getElementById("feed-modal");
    document.getElementById("feed-modal-title").textContent = "Add New Feed";

    document.getElementById("feed-id-input").value = "";
    const urlInput = document.getElementById("feed-url-input");
    urlInput.value = "";
    urlInput.disabled = false;

    document.getElementById("feed-name-input").value = "";
    document.getElementById("feed-autofetch-input").checked = false;
    document.getElementById("btn-delete-feed").style.display = "none";

    const iconToggle = document.getElementById("feed-use-icon-input");
    iconToggle.checked = false;
    iconToggle.disabled = true; // Disabled until URL processed
    this._updateIconPreview(false);

    const actionBtns = document.getElementById("feed-modal-action-buttons");
    if (actionBtns) actionBtns.style.display = "flex";

    Tags.currentTags = [];
    Tags.renderTagEditor();
    Tags.renderColorPicker("color-picker-container", null);

    this._setupUrlListener();
    UI.toggleModal("feed-modal", true);
  },

  openEditFeedModal: async function (feed) {
    this.isEditing = true;
    this._resetTempIconState();

    this.tempIconData = feed.iconData || null;

    const modal = document.getElementById("feed-modal");
    document.getElementById("feed-modal-title").textContent = "Edit Feed";

    document.getElementById("feed-id-input").value = feed.id;
    document.getElementById("feed-url-input").value = feed.url;
    document.getElementById("feed-url-input").disabled = true;
    document.getElementById("feed-name-input").value = feed.title;
    document.getElementById("feed-autofetch-input").checked = !!feed.autofetch;

    const iconToggle = document.getElementById("feed-use-icon-input");
    iconToggle.checked = !!feed.iconData;
    iconToggle.disabled = false;

    if (feed.iconData) {
      const preview = document.getElementById("feed-icon-preview");
      preview.src = feed.iconData;
      preview.style.display = "block";
    } else {
      // If editing and no icon stored, try to init preview based on URL
      this._processUrlForIcon(feed.url);
    }

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

    this._setupUrlListener();
    UI.toggleModal("feed-modal", true);
  },

  _resetTempIconState: function () {
    this.tempIconData = null;
    const preview = document.getElementById("feed-icon-preview");
    const checkbox = document.getElementById("feed-use-icon-input");
    if (preview) {
      preview.src = "";
      preview.style.display = "none";
    }
    if (checkbox) {
      checkbox.disabled = true;
    }
  },

  _setupUrlListener: function () {
    const urlInput = document.getElementById("feed-url-input");
    const iconToggle = document.getElementById("feed-use-icon-input");

    // Debounce URL input
    urlInput.oninput = (e) => {
      if (this._inputDebounce) clearTimeout(this._inputDebounce);
      this._inputDebounce = setTimeout(() => {
        this._processUrlForIcon(e.target.value);
      }, 500);
    };

    // Handle Toggle Change
    iconToggle.onchange = (e) => {
      this._updateIconPreview(true);
    };
  },

  _updateIconPreview: function (forceShow) {
    const preview = document.getElementById("feed-icon-preview");
    if (this.tempIconData) {
      preview.src = this.tempIconData;
      preview.style.display = "block";
    } else {
      preview.style.display = "none";
    }
  },

  _processUrlForIcon: async function (url) {
    if (!url) return;
    const checkbox = document.getElementById("feed-use-icon-input");

    const normalized = Utils.ensureUrlProtocol(url);
    const result = await Utils.fetchFaviconAndColor(normalized);

    if (result) {
      this.tempIconData = result.iconData;
      checkbox.disabled = false;
      this._updateIconPreview(true);
    } else {
      this.tempIconData = null;
      checkbox.disabled = true;
      checkbox.checked = false;
      this._updateIconPreview(false);
    }
  },

  // --- Helpers ---

  _getModalValues: function () {
    const useIcon = document.getElementById("feed-use-icon-input").checked;
    const rawUrl = document.getElementById("feed-url-input").value;

    return {
      id: document.getElementById("feed-id-input").value,
      url: Utils.ensureUrlProtocol(rawUrl),
      name: document.getElementById("feed-name-input").value.trim(),
      autofetch: document.getElementById("feed-autofetch-input").checked,
      color: Tags.selectedColor,
      tags: Tags.currentTags,
      useIcon: useIcon,
    };
  },

  _saveTags: async function (tags) {
    for (const tag of tags) {
      await DB.saveTag(tag);
    }
  },

  _triggerAutofetch: async function (feed) {
    const contentRetentionDays = parseInt(
      localStorage.getItem("cleanup_content_days") ||
        Config.DEFAULTS.CLEANUP_CONTENT_DAYS,
    );
    const articles = await DB.getArticlesByFeed(feed.id);

    if (articles.length > 0) {
      Utils.showToast(`Background fetch started`);
      Service.processAutofetch(feed, articles, contentRetentionDays, () => {
        window.dispatchEvent(new CustomEvent("freed:refresh-ui"));
      });
    }
  },

  // Core Logic extracted for re-use
  _createFeed: async function (url, title, color, tags, autofetch, iconData) {
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

    const newFeed = this.createFeedObject({
      url: url,
      title: finalTitle,
      color: color,
      tags: tagNames,
      autofetch: autofetch,
      type: result.type,
      parsingRule: result.parsingRule,
      iconData: iconData,
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
    try {
      // Fetch Icon Data for Discover feed
      let iconData = null;
      const iconResult = await Utils.fetchFaviconAndColor(feedData.url);
      if (iconResult) {
        iconData = iconResult.iconData;
      }

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

      // Accent color from discover pack is treated as manual color preference
      const manualColor = feedData.accentColor || null;

      const newFeed = await this._createFeed(
        feedData.url,
        feedData.title,
        manualColor,
        tagsWithColors,
        false,
        iconData,
      );

      Utils.showToast(`Added ${newFeed.title}`);
      if (onSuccess) onSuccess(newFeed);

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
    const feedsToAdd = pack.feeds
      .map((fid) => allDiscoverFeeds.find((f) => f.id === fid))
      .filter(Boolean);

    if (feedsToAdd.length === 0) return;

    Utils.showToast(`Adding ${feedsToAdd.length} feeds...`);

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

        // Color Logic
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

        // Icon logic
        const newIconData = values.useIcon
          ? this.tempIconData || feed.iconData
          : null;

        if (feed.iconData !== newIconData) {
          feed.iconData = newIconData;
          feedChanged = true;
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

          window.dispatchEvent(new CustomEvent("freed:refresh-ui"));
        }
      }
    } catch (e) {
      console.error("Auto-save failed", e);
    }
  },

  handleSaveFeed: async function (onSuccessCallback) {
    const values = this._getModalValues();

    if (!values.url) return;

    const btn = document.getElementById("btn-save-feed");
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = "Saving...";

    try {
      // Determine Icon Data
      const finalIconData = values.useIcon ? this.tempIconData : null;

      const newFeed = await this._createFeed(
        values.url,
        values.name,
        values.color,
        values.tags,
        values.autofetch,
        finalIconData,
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
    await DB.deleteFeed(id);
    await DB.cleanupOrphanedTags();
    Utils.showToast("Feed deleted");
    window.closeFeedModal();
    if (onDeleteCallback) onDeleteCallback(id);
  },

  syncFeeds: async function (onRefreshUI) {
    const feeds = await DB.getAllFeeds();
    const contentRetentionDays = parseInt(
      localStorage.getItem("cleanup_content_days") ||
        Config.DEFAULTS.CLEANUP_CONTENT_DAYS,
    );

    let successCount = 0;
    let failCount = 0;

    // Process sequentially to manage network load
    for (const feed of feeds) {
      const result = await Service.fetchAndParseFeed(feed);
      if (result.error) {
        failCount++;
        console.warn(`Sync failed for ${feed.title}:`, result.error);
        continue;
      }

      successCount++;
      if (result.articles && result.articles.length > 0) {
        if (result.parsingRule) {
          feed.parsingRule = result.parsingRule;
          feed.type = "web";
          await DB.saveFeed(feed);
        }
        await DB.saveArticles(result.articles);

        // Trigger Autofetch if enabled for this feed
        Service.processAutofetch(
          feed,
          result.articles,
          contentRetentionDays,
          () => {
            // Only refresh if we are viewing the relevant feed or all
            if (
              State.currentFeedId === feed.id ||
              State.currentFeedId === "all"
            ) {
              if (onRefreshUI) onRefreshUI();
              else window.dispatchEvent(new CustomEvent("freed:refresh-ui"));
            }
          },
        );
      }
    }

    if (onRefreshUI) onRefreshUI();
    else window.dispatchEvent(new CustomEvent("freed:refresh-ui"));

    if (failCount > 0) {
      if (successCount === 0)
        Utils.showToast("Feed sync failed. Check connection.");
      else Utils.showToast(`Feeds updated. ${failCount} failed.`);
    } else {
      Utils.showToast("Feeds updated");
    }
  },
};
