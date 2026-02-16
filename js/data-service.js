window.Freed = window.Freed || {};

window.Freed.Data = {
  generateOPML: async function (options) {
    const { DB } = window.Freed;
    const feeds = await DB.getAllFeeds();
    const allTags = await DB.getAllTags();

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<opml version="2.0">\n';
    xml += "<head>\n";
    xml += "  <title>Freed Feeds Export</title>\n";
    xml += `  <dateCreated>${new Date().toUTCString()}</dateCreated>\n`;
    xml += "</head>\n";
    xml += "<body>\n";

    if (options.includeFeeds) {
      feeds.forEach((feed) => {
        // Escape special chars
        const esc = (str) =>
          (str || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");

        let line = `  <outline text="${esc(feed.title)}" title="${esc(feed.title)}" type="rss" xmlUrl="${esc(feed.url)}"`;

        // Custom Attributes for Freed Re-import
        if (feed.color) line += ` data-freed-color="${esc(feed.color)}"`;
        if (feed.autofetch) line += ` data-freed-autofetch="true"`;
        if (feed.tags && feed.tags.length)
          line += ` category="${esc(feed.tags.join(","))}"`;

        // If web feed with rule
        if (feed.type === "web" && feed.parsingRule) {
          // Encode rule as base64 to avoid attribute parsing mess
          line += ` data-freed-rule="${btoa(JSON.stringify(feed.parsingRule))}"`;
        }

        line += " />\n";
        xml += line;
      });
    }

    xml += "</body>\n";

    // Extended Data (Settings, Favorites, Tags) - Placed after body for readability
    const backupData = {};

    if (options.includeSettings) {
      backupData.settings = {
        theme: localStorage.getItem("freed_theme"),
        font: localStorage.getItem("freed_font"),
        apiKey: localStorage.getItem("freed_api_key"),
        lang: localStorage.getItem("freed_target_lang"),
        showImages: localStorage.getItem("freed_show_images"),
        cleanup: {
          unread: localStorage.getItem("cleanup_unread_days"),
          content: localStorage.getItem("cleanup_content_days"),
          read: localStorage.getItem("cleanup_read_days"),
        },
      };
      // Save Tag Colors with Settings
      backupData.tags = allTags;
    }

    if (options.includeFavorites) {
      backupData.favorites = await DB.getExportableArticles();
    }

    if (Object.keys(backupData).length > 0) {
      const jsonString = JSON.stringify(backupData);
      // We use a custom tag. Using CDATA to ensure JSON chars don't break XML.
      xml += `<x-freed-data><![CDATA[${jsonString}]]></x-freed-data>\n`;
    }

    xml += "</opml>";

    return xml;
  },

  processImport: async function (xmlString, options) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, "text/xml");
    const { DB, Utils, Theme } = window.Freed;

    let stats = { feeds: 0, favorites: 0, settings: false };

    // Parse Freed Data (Settings, Tags & Favorites)
    // Selector finds tag anywhere in document (head or root)
    const freedDataNode = doc.querySelector("x-freed-data");
    if (freedDataNode) {
      try {
        const content = freedDataNode.textContent;
        // Parse potentially CDATA wrapped content
        const json = JSON.parse(content);

        // Restore Settings
        if (json.settings && options.includeSettings) {
          if (options.overwrite || !localStorage.getItem("freed_api_key")) {
            if (json.settings.apiKey)
              localStorage.setItem("freed_api_key", json.settings.apiKey);
            if (json.settings.lang)
              localStorage.setItem("freed_target_lang", json.settings.lang);
            if (json.settings.theme) {
              localStorage.setItem("freed_theme", json.settings.theme);
              Theme.apply(json.settings.theme);
            }
            if (json.settings.font) {
              localStorage.setItem("freed_font", json.settings.font);
              Theme.applyFont(json.settings.font);
            }
            if (json.settings.showImages) {
              localStorage.setItem(
                "freed_show_images",
                json.settings.showImages,
              );
              window.Freed.State.showArticleImages =
                json.settings.showImages === "true";
            }
            if (json.settings.cleanup) {
              if (json.settings.cleanup.unread)
                localStorage.setItem(
                  "cleanup_unread_days",
                  json.settings.cleanup.unread,
                );
              if (json.settings.cleanup.content)
                localStorage.setItem(
                  "cleanup_content_days",
                  json.settings.cleanup.content,
                );
              if (json.settings.cleanup.read)
                localStorage.setItem(
                  "cleanup_read_days",
                  json.settings.cleanup.read,
                );
            }
            stats.settings = true;
          }
        }

        // Restore Tags (Preserve Colors)
        if (json.tags && Array.isArray(json.tags) && options.includeSettings) {
          for (const tag of json.tags) {
            await DB.saveTag(tag);
          }
        }

        // Restore Favorites
        if (
          json.favorites &&
          Array.isArray(json.favorites) &&
          options.includeFavorites
        ) {
          await DB.saveArticles(json.favorites);
          stats.favorites = json.favorites.length;
        }
      } catch (e) {
        console.warn("Failed to parse Freed embedded data", e);
      }
    }

    // Parse Feeds (Standard OPML)
    if (options.includeFeeds) {
      const outlines = doc.querySelectorAll("body > outline");
      const newFeeds = [];

      outlines.forEach((node) => {
        const url = node.getAttribute("xmlUrl");
        if (!url) return;

        const title =
          node.getAttribute("text") ||
          node.getAttribute("title") ||
          "Imported Feed";
        const color =
          node.getAttribute("data-freed-color") || Utils.getRandomFromPalette();
        const autofetch = node.getAttribute("data-freed-autofetch") === "true";
        const category = node.getAttribute("category");
        const ruleAttr = node.getAttribute("data-freed-rule");

        let tags = [];
        if (category)
          tags = category
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);

        let parsingRule = null;
        let type = "rss";
        if (ruleAttr) {
          try {
            parsingRule = JSON.parse(atob(ruleAttr));
            type = "web";
          } catch (e) {}
        }

        newFeeds.push({
          id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
          url,
          title,
          color,
          autofetch,
          tags,
          type,
          parsingRule,
        });
      });

      // Upsert Logic
      const existingFeeds = await DB.getAllFeeds();
      const existingMap = new Map(existingFeeds.map((f) => [f.url, f]));

      // Load tags to check for existence and avoid overwriting known colors
      const currentTags = await DB.getAllTags();
      const tagMap = new Map(currentTags.map((t) => [t.name, t]));

      for (const feed of newFeeds) {
        // Handle Tags
        for (const tName of feed.tags) {
          if (!tagMap.has(tName)) {
            // Tag doesn't exist (not in DB and wasn't in imported JSON)
            // Create it with a random color
            const newTag = { name: tName, color: Utils.getRandomFromPalette() };
            await DB.saveTag(newTag);
            tagMap.set(tName, newTag);
          }
          // If tagMap has it, we respect the existing color (or the one we just imported from JSON)
        }

        const existing = existingMap.get(feed.url);
        if (existing) {
          if (options.overwrite) {
            // Merge props, keep ID
            const merged = { ...feed, id: existing.id };
            await DB.saveFeed(merged);
            stats.feeds++;
          }
        } else {
          await DB.saveFeed(feed);
          stats.feeds++;
        }
      }
    }

    await DB.cleanupOrphanedTags();
    return stats;
  },
};
