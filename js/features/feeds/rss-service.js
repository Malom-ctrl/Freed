import { Utils } from "../../core/utils.js";
import { DB } from "../../core/db.js";
import { Registry } from "../../plugin-system/registry.js";
import { AI } from "../../core/ai-service.js";
import DOMPurify from "dompurify";
import { Readability } from "@mozilla/readability";

const { divToText, proxifyUrl } = Utils;

// Internal helper to normalize article object and handle date parsing/defaults
function _normalizeArticle(data) {
  let pubDate = new Date().toISOString();
  let isDateFromFeed = false;

  // Validating date string if present
  if (data.dateStr) {
    const parsed = new Date(data.dateStr);
    if (!isNaN(parsed.getTime())) {
      pubDate = parsed.toISOString();
      isDateFromFeed = true;
    }
  }
  const link = data.link || "";
  // If guid is missing, fallback to link or composite key
  let guid = data.guid;
  if (!guid) guid = link || data.title + pubDate;

  return {
    guid,
    feedId: data.feedId,
    feedTitle: data.feedTitle,
    title: data.title || "No Title",
    link,
    pubDate,
    content: data.content || "",
    snippet: data.snippet || "",
    image: data.image || "",
    isDateFromFeed,
    fullContent: data.fullContent,
    read: false,
    favorite: false,
    discarded: false,
  };
}

async function fetchAndParseFeed(feed) {
  // Hook: feed:fetch:before
  // Plugins can modify the URL (e.g., to use a different proxy)
  let targetUrl = feed.url;
  if (Registry) {
    targetUrl = await Registry.executePipeline("feed:fetch:before", targetUrl);
  }

  const proxyUrl = proxifyUrl(targetUrl);
  let rawText = "";

  try {
    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    rawText = await response.text();
  } catch (e) {
    console.error(`Error fetching ${feed.title}:`, e);
    return { articles: [], error: e.message };
  }

  let resultArticles = [];
  let type = "rss";
  let newParsingRule = null;

  // 1. Try Standard RSS
  try {
    const parser = new DOMParser();
    const xml = parser.parseFromString(rawText, "text/xml");
    if (!xml.querySelector("parsererror")) {
      resultArticles = parseRSS(xml, feed);
    } else {
      throw new Error("Not XML");
    }
  } catch (e) {
    // 2. Web Parsing with AI
    type = "web";
    try {
      let parsingRule = feed.parsingRule;
      if (parsingRule) {
        resultArticles = parseWebWithRule(rawText, parsingRule, feed.url, feed);
      }
      if (resultArticles.length === 0 && AI) {
        parsingRule = await AI.generateParsingRule(rawText, feed.url);
        if (parsingRule) {
          resultArticles = parseWebWithRule(
            rawText,
            parsingRule,
            feed.url,
            feed,
          );
          newParsingRule = parsingRule;
        }
      }
    } catch (webErr) {
      console.error("Web parsing failed", webErr);
    }
  }

  // Hook: articles:process
  // Plugins can filter or modify the list of articles (e.g., deduplicate, analysis)
  if (Registry) {
    resultArticles = await Registry.executePipeline(
      "articles:process",
      resultArticles,
    );
  }

  return { articles: resultArticles, type, parsingRule: newParsingRule };
}

function parseRSS(xml, feed) {
  const items = Array.from(xml.querySelectorAll("item, entry"));
  return items.map((item) => {
    const title = item.querySelector("title")?.textContent;
    let link =
      item.querySelector("link")?.textContent ||
      item.querySelector("link")?.getAttribute("href") ||
      "";
    const dateStr = item.querySelector(
      "pubDate, published, updated",
    )?.textContent;
    const description =
      item.querySelector("description, summary")?.textContent || "";
    const content =
      item.getElementsByTagNameNS("*", "encoded")[0]?.textContent ||
      description ||
      "";

    let image = "";
    const mediaContent = item.getElementsByTagNameNS("*", "content");
    if (
      mediaContent.length > 0 &&
      mediaContent[0].getAttribute("medium") === "image"
    ) {
      image = mediaContent[0].getAttribute("url") || "";
    }
    // Simple extraction if description has img
    if (!image && description) {
      const div = document.createElement("div");
      div.innerHTML = DOMPurify.sanitize(description);
      const img = div.querySelector("img");
      if (img) image = img.src;
    }

    const guid = item.querySelector("guid, id")?.textContent || link;
    const snippet = divToText(description).substring(0, 150) + "...";

    return _normalizeArticle({
      feedId: feed.id,
      feedTitle: feed.title,
      title,
      link,
      dateStr,
      guid,
      content,
      snippet,
      image,
    });
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

        const title = titleEl ? titleEl.textContent.trim() : null;
        const link = linkEl
          ? linkEl.href || linkEl.getAttribute("href")
          : baseUrl;

        let dateStr = null;
        if (dateEl) {
          dateStr = dateEl.getAttribute("datetime") || dateEl.textContent;
        }

        const snippet = snippetEl
          ? snippetEl.textContent.trim().substring(0, 150) + "..."
          : "";
        const image = imgEl ? imgEl.src || imgEl.getAttribute("src") : "";

        if (!title || !link) return null;

        // For web parsing, link is usually the best GUID
        return _normalizeArticle({
          feedId: feed.id,
          feedTitle: feed.title,
          title,
          link,
          dateStr,
          guid: link,
          content: "",
          snippet,
          image,
        });
      } catch (e) {
        return null;
      }
    })
    .filter((item) => item !== null);
}

async function fetchFullArticle(url) {
  const proxyUrl = proxifyUrl(url);
  try {
    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error("Network response was not ok");
    const htmlText = await response.text();
    const doc = new DOMParser().parseFromString(htmlText, "text/html");
    const base = doc.createElement("base");
    base.href = url;
    doc.head.appendChild(base);
    const article = new Readability(doc).parse();
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
      const existing = await DB.getArticle(article.guid);
      if (existing && existing.fullContent) continue;

      const fullContent = await fetchFullArticle(article.link);
      if (fullContent) {
        await DB.saveArticles([{ ...article, fullContent }]);
        if (onArticleFetched) onArticleFetched(article);
      }
      // Small delay to prevent rate limiting
      await new Promise((r) => setTimeout(r, 500));
    } catch (e) {
      console.error("Autofetch failed for", article.title);
    }
  }
}

export const Service = {
  fetchAndParseFeed,
  fetchFullArticle,
  processAutofetch,
};
