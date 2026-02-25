import { Registry } from "../features/plugin-system/registry.js";
import DOMPurify from "dompurify";

export const Navbar = {
  renderActions: function () {
    const container = document.getElementById("navbar-actions");
    if (!container) return;
    container.innerHTML = "";

    const actions = Registry.getExtensions("navbar:action");
    actions.forEach((action) => {
      const btn = document.createElement("button");
      btn.className = "icon-btn"; // Reuse existing icon-btn style
      btn.style.marginLeft = "8px";
      btn.title = action.label || "";

      const parser = new DOMParser();
      const doc = parser.parseFromString(
        DOMPurify.sanitize(action.icon || ""),
        "text/html",
      );
      while (doc.body.firstChild) {
        btn.appendChild(doc.body.firstChild);
      }

      btn.onclick = () => {
        if (action.onClick) action.onClick();
      };
      container.appendChild(btn);
    });
  },
};
