import { Registry } from "../plugin-system/registry.js";
import DOMPurify from "dompurify";
import { DB } from "../../core/db.js";
import { State } from "../../core/state.js";
import { ReaderService } from "./reader-service.js";
import { ReaderView } from "../reader/reader-view.js";
import { Utils } from "../../core/utils.js";

export const CADManager = {
  handleSelectionChange: function () {
    const selection = window.getSelection();
    const toolbar = document.getElementById("selection-toolbar");
    if (!toolbar) return;

    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      toolbar.style.display = "none";
      return;
    }

    const range = selection.getRangeAt(0);
    const contentEl = document.getElementById("reader-content");

    // Ensure selection is within reader content
    if (!contentEl || !contentEl.contains(range.commonAncestorContainer)) {
      toolbar.style.display = "none";
      return;
    }

    // Show toolbar
    const rect = range.getBoundingClientRect();
    toolbar.style.display = "flex";
    // Position above selection, centered
    const toolbarWidth = toolbar.offsetWidth || 200; // approximate if hidden
    const left = rect.left + rect.width / 2 - toolbarWidth / 2;
    const top = rect.top - 50; // 50px above

    toolbar.style.left = `${Math.max(10, Math.min(window.innerWidth - toolbarWidth - 10, left))}px`;
    toolbar.style.top = `${Math.max(10, top + window.scrollY)}px`;
    toolbar.style.position = "fixed";
    toolbar.style.top = `${Math.max(10, rect.top - 40)}px`;
  },

  _cleanCADsFromHTML: function (html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const div = doc.body;

    // Find all elements with data-cad-id
    const cadElements = div.querySelectorAll("[data-cad-id]");
    cadElements.forEach((el) => {
      // Unwrap: replace element with its children
      const parent = el.parentNode;
      while (el.firstChild) {
        parent.insertBefore(el.firstChild, el);
      }
      parent.removeChild(el);
    });

    const serializer = new XMLSerializer();
    let serialized = "";
    div.childNodes.forEach((node) => {
      serialized += serializer.serializeToString(node);
    });
    return serialized;
  },

  clearCADsInSelection: async function () {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed)
      return;

    const contentEl = document.getElementById("reader-content");
    if (!contentEl) return;

    // Find CADs that overlap with the selection
    const cadIdsToRemove = new Set();

    // Check if selection contains any highlight elements
    const range = selection.getRangeAt(0);
    const fragment = range.cloneContents();
    const div = document.createElement("div");
    div.appendChild(fragment);

    const selectedHighlights = div.querySelectorAll("[data-cad-id]");
    selectedHighlights.forEach((el) =>
      cadIdsToRemove.add(el.getAttribute("data-cad-id")),
    );

    // Also check if the selection is INSIDE a highlight (collapsed or not fully selecting the highlight element)
    let parent = range.commonAncestorContainer;
    if (parent.nodeType === Node.TEXT_NODE) parent = parent.parentNode;
    if (parent.hasAttribute("data-cad-id")) {
      cadIdsToRemove.add(parent.getAttribute("data-cad-id"));
    }

    // Also check if the selection starts or ends inside a highlight
    let startParent = range.startContainer;
    if (startParent.nodeType === Node.TEXT_NODE)
      startParent = startParent.parentNode;
    if (startParent.hasAttribute("data-cad-id"))
      cadIdsToRemove.add(startParent.getAttribute("data-cad-id"));

    let endParent = range.endContainer;
    if (endParent.nodeType === Node.TEXT_NODE) endParent = endParent.parentNode;
    if (endParent.hasAttribute("data-cad-id"))
      cadIdsToRemove.add(endParent.getAttribute("data-cad-id"));

    if (cadIdsToRemove.size === 0) return;

    const article = await DB.getArticle(State.currentArticleGuid);
    if (!article || !article.cads) return;

    article.cads = article.cads.filter((c) => !cadIdsToRemove.has(c.id));
    await ReaderService.saveArticle(article);

    // Re-render
    const updatedArticle = await DB.getArticle(State.currentArticleGuid);
    ReaderView._reRenderContent(updatedArticle);

    document.getElementById("selection-toolbar").style.display = "none";
    window.getSelection().removeAllRanges();
  },

  createCADFromSelection: async function (
    type,
    dataOrGenerator,
    providedRange,
  ) {
    let range = providedRange;

    if (!range) {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed)
        return;
      range = selection.getRangeAt(0);
    }

    const contentEl = document.getElementById("reader-content");
    if (!contentEl) return;

    // Calculate text offset in the current DOM
    const rangeBefore = document.createRange();
    rangeBefore.setStart(contentEl, 0);
    rangeBefore.setEnd(range.startContainer, range.startOffset);
    const textOffset = rangeBefore.toString().length;
    const selectionText = range.toString();

    // Get clean article HTML and Text
    const article = await DB.getArticle(State.currentArticleGuid);
    if (!article) return;

    let cleanArticleHTML = "";
    if (article.fullContent) {
      cleanArticleHTML = DOMPurify.sanitize(article.fullContent);
    } else {
      const base = article.content || article.description || "";
      cleanArticleHTML = DOMPurify.sanitize(base);
    }

    // Create a temp div to extract pure text from clean HTML (browser behavior)
    const textDiv = document.createElement("div");
    textDiv.innerHTML = cleanArticleHTML;
    const cleanText = textDiv.textContent || "";

    // Find the closest occurrence of selectionText in cleanText
    const indices = [];
    let pos = 0;
    while ((pos = cleanText.indexOf(selectionText, pos)) !== -1) {
      indices.push(pos);
      pos += 1;
    }

    if (indices.length === 0) {
      console.warn("Could not find selected text in original article.");
      Utils.showToast("Selection mismatch - cannot create annotation");
      return;
    }

    // Find closest index to textOffset
    const bestTextIndex = indices.reduce((prev, curr) => {
      return Math.abs(curr - textOffset) < Math.abs(prev - textOffset)
        ? curr
        : prev;
    });

    // Map Text Index back to HTML Index
    const getHtmlIndexFromTextIndex = (html, targetTextIndex) => {
      let textCount = 0;
      let i = 0;
      let inTag = false;

      while (i < html.length && textCount < targetTextIndex) {
        if (html[i] === "<") {
          inTag = true;
        } else if (html[i] === ">") {
          inTag = false;
        } else if (!inTag) {
          if (html[i] === "&") {
            const end = html.indexOf(";", i);
            if (end !== -1 && end - i < 10) {
              textCount++; // Entity is 1 char
              i = end; // Loop will increment
            } else {
              textCount++;
            }
          } else {
            textCount++;
          }
        }
        i++;
      }
      return i;
    };

    const htmlStart = getHtmlIndexFromTextIndex(
      cleanArticleHTML,
      bestTextIndex,
    );

    // Helper to skip tags from a given index to find the start of text
    const skipTags = (html, index) => {
      let i = index;
      let inTag = false;
      // If we start inside a tag (unlikely given getHtmlIndex logic, but possible if index points to '<')
      if (html[i] === "<") inTag = true;

      while (i < html.length) {
        if (html[i] === "<") {
          inTag = true;
        } else if (html[i] === ">") {
          inTag = false;
        } else if (!inTag) {
          return i;
        }
        i++;
      }
      return i;
    };

    // Adjust start to skip any tags (like </p><p>) that might be at the boundary
    const adjustedHtmlStart = skipTags(cleanArticleHTML, htmlStart);

    // For end index, we add the length.
    const htmlEnd = getHtmlIndexFromTextIndex(
      cleanArticleHTML,
      bestTextIndex + selectionText.length,
    );

    // 10. Generate Data
    let data = {};
    if (typeof dataOrGenerator === "function") {
      try {
        // We pass the HTML content of the selection from the clean HTML
        const cleanSelectionHTML = cleanArticleHTML.substring(
          adjustedHtmlStart,
          htmlEnd,
        );
        data = await dataOrGenerator(cleanSelectionHTML);
      } catch (e) {
        console.error("Error generating CAD data", e);
        Utils.showToast("Failed to generate annotation data");
        return;
      }
    } else {
      data = dataOrGenerator || {};
    }

    if (!data) return; // Generator might return null to cancel

    // 11. Create CAD
    const cad = {
      type: type,
      position: adjustedHtmlStart,
      length: htmlEnd - adjustedHtmlStart,
      originalContent: cleanArticleHTML.substring(adjustedHtmlStart, htmlEnd),
      data: data,
      created: Date.now(),
    };

    // 12. Save
    if (!State.currentArticleGuid) return;

    await ReaderService.addCAD(State.currentArticleGuid, cad);

    // Auto-favorite logic for highlights/annotations
    if (type === "highlight" && !article.favorite) {
      await ReaderService.toggleFavorite(State.currentArticleGuid);
      Utils.showToast("Article automatically added to favorites");
    }

    // 13. Re-render
    const updatedArticle = await DB.getArticle(State.currentArticleGuid);
    ReaderView._reRenderContent(updatedArticle);

    document.getElementById("selection-toolbar").style.display = "none";
    window.getSelection().removeAllRanges();
  },

  renderContentWithCADs: function (htmlContent, cads) {
    if (!cads || cads.length === 0) return { html: htmlContent, orphans: null };

    // Sort CADs by position
    const sortedCADs = [...cads].sort((a, b) => a.position - b.position);

    let result = "";
    let lastIndex = 0;
    const orphaned = [];

    // Get renderers map
    const renderers = Registry.getExtensions("cad:renderer");
    const rendererMap = new Map();
    renderers.forEach((r) => {
      if (r.type && typeof r.render === "function") {
        rendererMap.set(r.type, r.render);
      }
    });

    for (const cad of sortedCADs) {
      // Check bounds and overlap
      if (cad.position < lastIndex) {
        orphaned.push({ ...cad, reason: "Overlap or Out of Order" });
        continue;
      }
      if (cad.position + cad.length > htmlContent.length) {
        orphaned.push({ ...cad, reason: "Out of Bounds" });
        continue;
      }

      // Validate content
      const targetContent = htmlContent.substring(
        cad.position,
        cad.position + cad.length,
      );
      if (targetContent !== cad.originalContent) {
        orphaned.push({ ...cad, reason: "Content Mismatch" });
        continue;
      }

      // Render
      const renderer = rendererMap.get(cad.type);
      if (renderer) {
        // Append text before this CAD
        result += htmlContent.substring(lastIndex, cad.position);
        // Append rendered CAD
        result += renderer(targetContent, cad);
        lastIndex = cad.position + cad.length;
      } else {
        orphaned.push({ ...cad, reason: `No renderer for type: ${cad.type}` });
      }
    }

    // Append remaining text
    result += htmlContent.substring(lastIndex);

    // Append Orphans
    let orphansEl = null;
    if (orphaned.length > 0) {
      orphansEl = this._renderOrphanedCADs(orphaned);
    }

    return { html: result, orphans: orphansEl };
  },

  _renderOrphanedCADs: function (orphans) {
    const container = document.createElement("div");
    container.className = "orphaned-cads-section";

    const header = document.createElement("h4");
    header.className = "orphaned-cads-title";
    header.textContent = "Orphaned Annotations";
    container.appendChild(header);

    const p = document.createElement("p");
    p.className = "orphaned-cads-desc";
    p.textContent =
      "The following annotations could not be reattached to the text:";
    container.appendChild(p);

    const ul = document.createElement("ul");
    ul.className = "orphaned-cads-list";

    orphans.forEach((cad) => {
      const li = document.createElement("li");
      li.className = "orphaned-cad-item";

      const strong = document.createElement("strong");
      strong.className = "orphaned-cad-type";
      strong.textContent = cad.type;

      const spanContent = document.createElement("span");
      spanContent.className = "orphaned-cad-content";
      spanContent.textContent = ` "${cad.originalContent}"`;

      const spanReason = document.createElement("span");
      spanReason.className = "orphaned-cad-reason";
      spanReason.textContent = `(${cad.reason || "Unknown"})`;

      li.appendChild(strong);
      li.appendChild(document.createTextNode(":"));
      li.appendChild(spanContent);
      li.appendChild(spanReason);
      ul.appendChild(li);
    });

    container.appendChild(ul);
    return container;
  },
};
