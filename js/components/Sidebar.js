import { Registry } from "../plugin-system/registry.js";
import DOMPurify from "dompurify";

export const Sidebar = {
  renderPrimaryItems: function () {
    const container = document.getElementById("plugin-sidebar-container");
    if (!container) return;
    container.innerHTML = "";

    const items = Registry.getExtensions("sidebar:primary");
    items.forEach((item) => {
      const div = document.createElement("div");
      div.className = "nav-item";
      div.innerHTML = DOMPurify.sanitize(`${item.icon || ""} ${item.label}`);
      div.onclick = () => {
        if (item.onClick) item.onClick();
      };
      container.appendChild(div);
    });
  },

  renderSecondaryItems: function () {
    const container = document.getElementById(
      "plugin-sidebar-secondary-container",
    );
    if (!container) return;
    container.innerHTML = "";

    const items = Registry.getExtensions("sidebar:secondary");
    items.forEach((item) => {
      const div = document.createElement("div");
      div.className = "nav-item";
      div.innerHTML = DOMPurify.sanitize(`${item.icon || ""} ${item.label}`);
      div.onclick = () => {
        if (item.onClick) item.onClick();
      };
      container.appendChild(div);
    });
  },
};
