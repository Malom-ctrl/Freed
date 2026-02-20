import { Registry } from "../plugin-system/registry.js";
import DOMPurify from "dompurify";

export const ReaderView = {
  renderPlugins: function (article) {
    // 1. Reader Header
    const headerContainer = document.getElementById("reader-plugin-header");
    if (headerContainer) {
      headerContainer.innerHTML = "";
      const headers = Registry.getExtensions("reader:header");
      headers.forEach((item) => {
        if (typeof item.render === "function") {
          const el = item.render(article);
          if (el) {
            if (typeof el === "string") {
              const div = document.createElement("div");
              div.innerHTML = DOMPurify.sanitize(el);
              headerContainer.appendChild(div);
            } else {
              headerContainer.appendChild(el);
            }
          }
        }
      });
    }

    // 2. Reader Footer
    const footerContainer = document.getElementById("reader-footer");
    if (footerContainer) {
      footerContainer.innerHTML = "";
      const footers = Registry.getExtensions("reader:footer");
      footers.forEach((item) => {
        if (typeof item.render === "function") {
          const el = item.render(article);
          if (el) {
            if (typeof el === "string") {
              const div = document.createElement("div");
              div.innerHTML = DOMPurify.sanitize(el);
              footerContainer.appendChild(div);
            } else {
              footerContainer.appendChild(el);
            }
          }
        }
      });
    }

    // 3. Reader Actions (Header Icons)
    const actionsContainer = document.getElementById(
      "reader-actions-container",
    );
    if (actionsContainer) {
      actionsContainer.innerHTML = "";
      const actions = Registry.getExtensions("reader:action");
      actions.forEach((action) => {
        const btn = document.createElement("button");
        btn.className = "icon-btn";
        btn.title = action.label || "";
        btn.innerHTML = DOMPurify.sanitize(action.icon || "");
        btn.onclick = () => {
          if (action.onClick) action.onClick(article);
        };
        actionsContainer.appendChild(btn);
      });
    }
  },
};
