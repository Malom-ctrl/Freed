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
      btn.innerHTML = DOMPurify.sanitize(action.icon || "");
      btn.onclick = () => {
        if (action.onClick) action.onClick();
      };
      container.appendChild(btn);
    });
  },
};
