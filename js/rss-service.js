window.Freed = window.Freed || {};

(function () {
  const { divToText } = window.Freed.Utils;
  // AI Service might be loaded later or asynchronously, so we access it via window.Freed.AI in runtime

  async function fetchAndParseFeed(feed) {
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(feed.url)}`;
    let rawText = "";

    try {
      const response = await fetch(proxyUrl);
      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
      rawText = await response.text();
    } catch (e) {
      console.error(`Error fetching ${feed.title}:`, e);
      return { articles: [], error: e.message };
    }

    // 1. Try Standard RSS Parsing
    try {
      const parser = new DOMParser();
      const xml = parser.parseFromString(rawText, "text/xml");
      if (!xml.querySelector("parsererror")) {
        const articles = parseRSS(xml, feed);
        return { articles, type: "rss" };
      }
    } catch (e) {
      // Not XML, proceed to web parsing
    }

    // 2. Web Parsing with AI Rules
    try {
      let parsingRule = feed.parsingRule;
      let articles = [];
      let newParsingRule = null;

      // First attempt with existing rule if available
      if (parsingRule) {
        articles = parseWebWithRule(rawText, parsingRule, feed.url, feed);
      }

      // If no articles found (no rule or rule outdated), generate new rule
      if (articles.length === 0 && window.Freed.AI) {
        console.log("Generating parsing rule for", feed.url);
        parsingRule = await window.Freed.AI.generateParsingRule(
          rawText,
          feed.url,
        );

        if (parsingRule) {
          articles = parseWebWithRule(rawText, parsingRule, feed.url, feed);
          newParsingRule = parsingRule;
        }
      }

      return { articles, type: "web", parsingRule: newParsingRule };
    } catch (e) {
      console.error("Web parsing failed", e);
      return { articles: [], error: e.message };
    }
  }

  function parseRSS(xml, feed) {
    const items = Array.from(xml.querySelectorAll("item, entry"));
    return items.map((item) => {
      const title = item.querySelector("title")?.textContent || "No Title";
      let link = item.querySelector("link")?.textContent || "";
      if (!link) link = item.querySelector("link")?.getAttribute("href") || "";

      // Date Parsing with source tracking
      const dateNode = item.querySelector("pubDate, published, updated");
      let pubDate = new Date().toISOString();
      let isDateFromFeed = false;

      if (dateNode && dateNode.textContent) {
        const parsed = new Date(dateNode.textContent);
        if (!isNaN(parsed.getTime())) {
          pubDate = parsed.toISOString();
          isDateFromFeed = true;
        }
      }

      const contentEncoded = item.getElementsByTagNameNS("*", "encoded")[0]
        ?.textContent;
      const description =
        item.querySelector("description, summary")?.textContent || "";
      const content = contentEncoded || description || "";

      let image = "";
      const mediaContent = item.getElementsByTagNameNS("*", "content");
      if (
        mediaContent.length > 0 &&
        mediaContent[0].getAttribute("medium") === "image"
      ) {
        image = mediaContent[0].getAttribute("url") || "";
      }
      if (!image && description) {
        const div = document.createElement("div");
        div.innerHTML = description;
        const img = div.querySelector("img");
        if (img) image = img.src;
      }

      // User requested URL as unique ID
      let guid = link;
      if (!guid)
        guid = item.querySelector("guid, id")?.textContent || title + pubDate;

      const snippet = divToText(description).substring(0, 150) + "...";

      return {
        guid,
        feedId: feed.id,
        feedTitle: feed.title,
        title,
        link,
        pubDate,
        content,
        snippet,
        image,
        isDateFromFeed,
      };
    });
  }

  function parseWebWithRule(html, rule, baseUrl, feed) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    // Base tag for relative URLs
    const base = doc.createElement("base");
    base.href = baseUrl;
    doc.head.appendChild(base);

    const items = Array.from(doc.querySelectorAll(rule.container));

    return items
      .map((item) => {
        try {
          const titleEl = rule.title ? item.querySelector(rule.title) : null;
          const linkEl = rule.link ? item.querySelector(rule.link) : null;
          const dateEl = rule.date ? item.querySelector(rule.date) : null;
          const snippetEl = rule.snippet
            ? item.querySelector(rule.snippet)
            : null;
          const imgEl = rule.image ? item.querySelector(rule.image) : null;

          const title = titleEl ? titleEl.textContent.trim() : "No Title";
          const link = linkEl
            ? linkEl.href || linkEl.getAttribute("href")
            : baseUrl;

          // Date logic with source tracking
          let pubDate = new Date().toISOString();
          let isDateFromFeed = false;

          if (dateEl) {
            const dateAttr =
              dateEl.getAttribute("datetime") || dateEl.textContent;
            const d = new Date(dateAttr);
            if (!isNaN(d.getTime())) {
              pubDate = d.toISOString();
              isDateFromFeed = true;
            }
          }

          const snippet = snippetEl
            ? snippetEl.textContent.trim().substring(0, 150) + "..."
            : "";
          const image = imgEl ? imgEl.src || imgEl.getAttribute("src") : "";

          if (!title || !link) return null;

          const guid = link; // Use link as GUID for web feeds

          return {
            guid,
            feedId: feed.id,
            feedTitle: feed.title,
            title,
            link,
            pubDate,
            content: "", // Web feeds usually don't have full content in list
            snippet,
            image,
            isDateFromFeed,
          };
        } catch (e) {
          return null;
        }
      })
      .filter((item) => item !== null);
  }

  async function fetchFullArticle(url) {
    if (typeof window.Readability === "undefined") {
      console.warn("Readability.js not loaded");
      return null;
    }

    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;

    try {
      const response = await fetch(proxyUrl);
      if (!response.ok) throw new Error("Network response was not ok");
      const htmlText = await response.text();

      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlText, "text/html");

      const base = doc.createElement("base");
      base.href = url;
      doc.head.appendChild(base);

      const reader = new window.Readability(doc);
      const article = reader.parse();

      return article ? article.content : null;
    } catch (error) {
      console.warn("Failed to fetch full content", error);
      return null;
    }
  }

  async function processAutofetch(feed, articles, daysLimit, onArticleFetched) {
    if (!feed.autofetch) return;

    const now = Date.now();
    const limitMs = daysLimit * 24 * 60 * 60 * 1000;

    // Filter eligible articles:
    // 1. Missing fullContent
    // 2. Not older than limit
    const eligible = articles.filter((a) => {
      if (a.fullContent) return false;
      const articleTime = new Date(a.pubDate).getTime();
      return now - articleTime < limitMs;
    });

    // Fetch sequentially to be kind to network/CORS
    for (const article of eligible) {
      try {
        // Check DB one more time in case it was updated in another process
        const existing = await window.Freed.DB.getArticle(article.guid);
        if (existing && existing.fullContent) continue;

        const fullContent = await fetchFullArticle(article.link);
        if (fullContent) {
          await window.Freed.DB.saveArticles([{ ...article, fullContent }]);
          if (onArticleFetched) onArticleFetched(article);
        }
        // Small delay to prevent rate limiting
        await new Promise((r) => setTimeout(r, 500));
      } catch (e) {
        console.error("Autofetch failed for", article.title);
      }
    }
  }

  window.Freed.Service = {
    fetchAndParseFeed,
    fetchFullArticle,
    processAutofetch,
  };
})();
