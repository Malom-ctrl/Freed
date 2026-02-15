window.Freed = window.Freed || {};

window.Freed.Tools = {
  setupSelectionTools: function () {
    const readerContent = document.getElementById("reader-content");
    const toolbar = document.getElementById("selection-toolbar");
    const clearBtn = document.getElementById("btn-tool-clear");

    if (!readerContent || !toolbar) return;

    // Re-attach listeners
    const highlightBtn = document.getElementById("btn-tool-highlight");
    if (highlightBtn) highlightBtn.onclick = this.handleHighlight.bind(this);

    const clearHighlightBtn = document.getElementById("btn-tool-clear");
    if (clearHighlightBtn)
      clearHighlightBtn.onclick = this.handleClearHighlight.bind(this);

    const translateBtn = document.getElementById("btn-tool-translate");
    if (translateBtn) translateBtn.onclick = this.handleTranslate.bind(this);

    const updateToolbar = () => {
      const selection = window.getSelection();
      if (
        !selection.rangeCount ||
        selection.isCollapsed ||
        !readerContent.contains(selection.anchorNode)
      ) {
        toolbar.style.display = "none";
        return;
      }
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      const highlights = readerContent.querySelectorAll(".highlight-outline");
      let hasOverlap = false;
      for (const h of highlights) {
        if (range.intersectsNode(h)) {
          hasOverlap = true;
          break;
        }
      }
      if (clearBtn) clearBtn.style.display = hasOverlap ? "flex" : "none";
      toolbar.style.display = "flex";
      toolbar.style.top = `${rect.top}px`;
      toolbar.style.left = `${rect.left + rect.width / 2}px`;
    };

    document.addEventListener("selectionchange", () =>
      requestAnimationFrame(updateToolbar),
    );
    readerContent.addEventListener("mouseup", updateToolbar);
    readerContent.addEventListener("keyup", updateToolbar);
    readerContent.addEventListener("touchend", () =>
      setTimeout(updateToolbar, 10),
    );
  },

  handleHighlight: async function (e) {
    e.preventDefault();
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    const contentEl = document.getElementById("reader-content");

    // Use ExecCommand for robust range highlighting
    contentEl.contentEditable = "true";
    document.execCommand("hiliteColor", false, "#ffff00");
    contentEl.contentEditable = "false";

    const spans = contentEl.querySelectorAll(
      'span[style*="background-color: rgb(255, 255, 0)"], span[style*="background-color: #ffff00"]',
    );
    spans.forEach((s) => {
      s.style.backgroundColor = "";
      s.className = "highlight-outline";
    });

    this.normalizeHighlights(contentEl);
    window.getSelection().removeAllRanges();
    document.getElementById("selection-toolbar").style.display = "none";

    await this.saveCurrentArticleContent();

    // Enforce Favorite Logic
    const guid = window.Freed.State.currentArticleGuid;
    if (guid) {
      try {
        const article = await window.Freed.DB.getArticle(guid);
        if (article && !article.favorite) {
          await window.Freed.DB.setFavorite(guid, true);

          // Update UI state in Reader
          if (
            window.Freed.Reader &&
            window.Freed.Reader.updateFavoriteButtonState
          ) {
            window.Freed.Reader.updateFavoriteButtonState(true);
          }
          // Update List in background if app controller is available
          if (window.Freed.App && window.Freed.App.refreshUI) {
            window.Freed.App.refreshUI();
          }
          window.Freed.Utils.showToast(
            "Article automatically added to favorites",
          );
        }
      } catch (err) {
        console.error("Error updating favorite status on highlight", err);
      }
    }
  },

  handleClearHighlight: function (e) {
    e.preventDefault();
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    const contentEl = document.getElementById("reader-content");
    const highlights = contentEl.querySelectorAll(".highlight-outline");
    let changed = false;
    highlights.forEach((h) => {
      if (range.intersectsNode(h)) {
        const parent = h.parentNode;
        while (h.firstChild) parent.insertBefore(h.firstChild, h);
        parent.removeChild(h);
        changed = true;
      }
    });
    if (changed) {
      window.getSelection().removeAllRanges();
      document.getElementById("selection-toolbar").style.display = "none";
      this.saveCurrentArticleContent();
    }
  },

  handleTranslate: async function (e) {
    e.preventDefault();
    const selection = window.getSelection();
    const text = selection.toString().trim();
    if (!text) return;
    const range = selection.getRangeAt(0);

    // Use MyMemory default flow.
    const targetLang = localStorage.getItem("freed_target_lang") || "en";

    const span = document.createElement("span");
    span.className = "translating";
    span.textContent = text;
    range.deleteContents();
    range.insertNode(span);

    window.getSelection().removeAllRanges();
    document.getElementById("selection-toolbar").style.display = "none";

    try {
      const translatedText = await this.fetchTranslation(text, targetLang);
      if (translatedText) {
        span.className = "translated-text";
        span.setAttribute("data-tooltip", translatedText);
        window.Freed.Utils.showToast("Translation ready");

        // Check if currently hovering and show tooltip immediately
        if (
          span.matches(":hover") &&
          window.Freed.UI &&
          window.Freed.UI.showTooltip
        ) {
          window.Freed.UI.showTooltip(span, translatedText);
        }

        this.saveCurrentArticleContent();

        // Update Stats
        const guid = window.Freed.State.currentArticleGuid;
        if (guid) {
          const article = await window.Freed.DB.getArticle(guid);
          if (article && article.feedId) {
            const wordCount = window.Freed.Utils.countWords(text);
            await window.Freed.DB.updateTranslationStats(
              article.feedId,
              wordCount,
            );

            // Force refresh UI to update stats in background so that when stats modal opens it is fresh
            if (window.Freed.App && window.Freed.App.refreshUI) {
              window.Freed.App.refreshUI();
            }
          }
        }
      } else {
        throw new Error("Empty");
      }
    } catch (error) {
      const parent = span.parentNode;
      parent.replaceChild(document.createTextNode(text), span);
      window.Freed.Utils.showToast("Translation failed.");
    }
  },

  fetchTranslation: async function (text, targetLang) {
    // Enforce MyMemory
    try {
      const lang = targetLang || "en";
      const pair = `Autodetect|${lang}`;
      const res = await fetch(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${pair}`,
      );
      const data = await res.json();
      return data.responseStatus === 200
        ? data.responseData.translatedText
        : null;
    } catch (e) {
      console.error("Translation failed", e);
      return null;
    }
  },

  saveCurrentArticleContent: async function () {
    const guid = window.Freed.State.currentArticleGuid;
    if (!guid) return;
    const contentEl = document.getElementById("reader-content");
    const newHtml = contentEl.innerHTML;
    await window.Freed.DB.saveArticles([{ guid: guid, fullContent: newHtml }]);
  },

  normalizeHighlights: function (container) {
    let nested = container.querySelectorAll(
      ".highlight-outline .highlight-outline",
    );
    while (nested.length > 0) {
      nested.forEach((el) => {
        const parent = el.parentNode;
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        parent.removeChild(el);
      });
      nested = container.querySelectorAll(
        ".highlight-outline .highlight-outline",
      );
    }
    let highlights = Array.from(
      container.querySelectorAll(".highlight-outline"),
    );
    let didMerge = true;
    while (didMerge) {
      didMerge = false;
      highlights = Array.from(container.querySelectorAll(".highlight-outline"));
      for (let i = 0; i < highlights.length; i++) {
        const current = highlights[i];
        const next = current.nextSibling;
        if (
          next &&
          next.nodeType === 1 &&
          next.classList.contains("highlight-outline")
        ) {
          while (next.firstChild) current.appendChild(next.firstChild);
          next.remove();
          didMerge = true;
          break;
        }
      }
    }
  },
};
