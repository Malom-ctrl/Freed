import { Tags } from "../tags/tags.js";
import { DB } from "../../core/db.js";
import { Utils } from "../../core/utils.js";
import { Service } from "./rss-service.js";
import { Config } from "../../core/config.js";
import { State } from "../../core/state.js";
import { Events } from "../../core/events.js";

// Runtime cache for computed icon colors (not saved to DB)
const iconColorCache = new Map();
const processingColorIds = new Set();

export const FeedService = {
  // Factory method for creating a consistent Feed object
  createFeedObject: function (data) {
    return {
      id: data.url, // ID is always the URL
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

  // Prepare Feeds with Effective Display Color
  getFeedsForDisplay: async function () {
    const feeds = await DB.getAllFeeds();

    return feeds.map((f) => {
      let displayColor = f.color;

      // Priority 1: Manual Color Override (Persistent)
      if (displayColor) {
        return { ...f, displayColor };
      }

      // Priority 2: Icon Color (Runtime Calculated - Non-Persistent)
      if (f.iconData) {
        if (iconColorCache.has(f.id)) {
          return { ...f, displayColor: iconColorCache.get(f.id) };
        }

        // If not in cache and not processing, trigger calculation
        if (!processingColorIds.has(f.id)) {
          processingColorIds.add(f.id);
          // Compute in background
          Utils.getDominantColor(f.iconData).then((color) => {
            if (color) {
              iconColorCache.set(f.id, color);
              // Trigger UI update once color is ready
              Events.emit(Events.FEEDS_UPDATED);
            }
            processingColorIds.delete(f.id);
          });
        }
        // While loading, fall through to default
      }

      // Priority 3: Global Default Color (Fixed)
      return { ...f, displayColor: "#64748b" };
    });
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
        Events.emit(Events.ARTICLES_UPDATED);
      });
    }
  },

  // Core Logic extracted for re-use
  _createFeed: async function (url, title, color, tags, autofetch, iconData) {
    // Check for duplicates
    const existingFeed = await DB.getFeed(url);
    if (existingFeed) {
      throw new Error("Feed with this URL already exists");
    }

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
    Events.emit(Events.FEED_ADDED, { feed: newFeed });

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

      const tagsWithColors = [];
      for (const tName of feedData.tags) {
        const existingTag = await DB.getTag(tName);
        tagsWithColors.push({
          name: tName,
          color: existingTag ? existingTag.color : Utils.getRandomFromPalette(),
        });
      }

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

  updateFeed: async function (values) {
    if (!values.id) return;

    try {
      // Check for tag color changes
      let tagsColorChanged = false;
      for (const t of values.tags) {
        const existingTag = await DB.getTag(t.name);
        if (existingTag && existingTag.color !== t.color) {
          tagsColorChanged = true;
          break;
        }
      }

      const feed = await DB.getFeed(values.id);

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
        // values.iconData should be passed in if it changed
        if (
          values.iconData !== undefined &&
          feed.iconData !== values.iconData
        ) {
          feed.iconData = values.iconData;
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
        }
      }
    } catch (e) {
      console.error("Auto-save failed", e);
    }
  },

  addFeed: async function (values, onSuccessCallback) {
    if (!values.url) return;

    try {
      const newFeed = await this._createFeed(
        values.url,
        values.name,
        values.color,
        values.tags,
        values.autofetch,
        values.iconData,
      );

      Utils.showToast(`Added ${newFeed.title}`);

      if (onSuccessCallback) onSuccessCallback(newFeed.id, true);

      await DB.cleanupOrphanedTags();

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
      throw e; // Re-throw to let UI know it failed
    }
  },

  deleteFeed: async function (id, onDeleteCallback) {
    await DB.deleteFeed(id);
    await DB.cleanupOrphanedTags();
    Utils.showToast("Feed deleted");
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
              Events.emit(Events.ARTICLES_UPDATED);
            }
          },
        );
      }
    }

    if (onRefreshUI) onRefreshUI();

    if (failCount > 0) {
      if (successCount === 0)
        Utils.showToast("Feed sync failed. Check connection.");
      else Utils.showToast(`Feeds updated. ${failCount} failed.`);
    } else {
      Utils.showToast("Feeds updated");
    }
  },
};
