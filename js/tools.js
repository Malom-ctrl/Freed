window.Freed = window.Freed || {};

window.Freed.Tools = {
  setupSelectionTools: function () {
    const readerContent = document.getElementById("reader-content");
    const toolbar = document.getElementById("selection-toolbar");
    const clearBtn = document.getElementById("btn-tool-clear");
    const pluginContainer = document.getElementById("plugin-tools-container");
    const divider = document.getElementById("toolbar-divider");

    if (!readerContent || !toolbar) return;

    // Re-attach listeners
    const highlightBtn = document.getElementById("btn-tool-highlight");
    if (highlightBtn) highlightBtn.onclick = this.handleHighlight.bind(this);

    const clearHighlightBtn = document.getElementById("btn-tool-clear");
    if (clearHighlightBtn)
      clearHighlightBtn.onclick = this.handleClearHighlight.bind(this);

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

      // Check overlaps for "Clear" button
      const highlights = readerContent.querySelectorAll(".highlight-outline");
      let hasOverlap = false;
      for (const h of highlights) {
        if (range.intersectsNode(h)) {
          hasOverlap = true;
          break;
        }
      }
      if (clearBtn) clearBtn.style.display = hasOverlap ? "flex" : "none";

      // Render Plugin Tools using reader:tool slot
      if (pluginContainer) {
        pluginContainer.innerHTML = "";
        const tools =
          window.Freed.Plugins.Registry.getExtensions("reader:tool");

        if (tools.length > 0) {
          if (divider) divider.style.display = "block";
          tools.forEach((tool) => {
            const btn = document.createElement("button");
            btn.innerHTML = `${tool.icon || ""} ${tool.label}`;
            btn.onclick = (e) => {
              e.preventDefault();
              e.stopPropagation();
              const text = selection.toString().trim();
              if (tool.onClick) tool.onClick(text, range);
            };
            pluginContainer.appendChild(btn);
          });
        } else {
          if (divider) divider.style.display = "none";
        }
      }

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

    // Auto-favorite logic
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

  saveCurrentArticleContent: async function () {
    const guid = window.Freed.State.currentArticleGuid;
    if (!guid) return;
    const contentEl = document.getElementById("reader-content");
    await window.Freed.DB.saveArticles([
      { guid: guid, fullContent: contentEl.innerHTML },
    ]);
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
