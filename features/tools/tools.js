import { Registry } from "../plugin-system/registry.js";
import { State } from "../../core/state.js";
import { DB } from "../../core/db.js";
import { Utils } from "../../core/utils.js";
import { ReaderView } from "../reader/reader-view.js";
import { Events } from "../../core/events.js";
import DOMPurify from "dompurify";

export const Tools = {
  setupSelectionTools: function () {
    const readerContent = document.getElementById("reader-content");
    const toolbar = document.getElementById("selection-toolbar");
    const clearBtn = document.getElementById("btn-tool-clear");
    const pluginContainer = document.getElementById("plugin-tools-container");
    const divider = document.getElementById("toolbar-divider");

    if (!readerContent || !toolbar) return;

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

      // Check overlaps for "Clear" button using CAD highlights
      const highlights = readerContent.querySelectorAll(".cad-highlight");
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
        const tools = Registry.getExtensions("reader:tool");

        const text = selection.toString().trim();
        const visibleTools = tools.filter((tool) => {
          if (typeof tool.shouldShow === "function") {
            return tool.shouldShow(text, range);
          }
          return true;
        });

        if (visibleTools.length > 0) {
          if (divider) divider.style.display = "block";
          visibleTools.forEach((tool) => {
            const btn = document.createElement("button");
            btn.className = "tool-btn"; // Ensure class for styling

            if (
              tool.icon instanceof HTMLElement ||
              tool.icon instanceof SVGElement
            ) {
              btn.appendChild(tool.icon.cloneNode(true));
              if (tool.label) {
                btn.appendChild(document.createTextNode(" " + tool.label));
              }
            } else {
              const parser = new DOMParser();
              const doc = parser.parseFromString(
                DOMPurify.sanitize(`${tool.icon || ""} ${tool.label || ""}`),
                "text/html",
              );
              while (doc.body.firstChild) btn.appendChild(doc.body.firstChild);
            }

            btn.onclick = async (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (tool.onClick) {
                await tool.onClick(text, range);
                // Close toolbar after action
                toolbar.style.display = "none";
                window.getSelection().removeAllRanges();
              }
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
};
