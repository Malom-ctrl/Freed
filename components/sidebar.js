import { Registry } from "../features/plugin-system/registry.js";
import { Events } from "../core/events.js";
import DOMPurify from "dompurify";

export const Sidebar = {
  setupListeners: function () {
    // Static Sidebar Items
    document
      .querySelector('[data-id="all"]')
      ?.addEventListener("click", () =>
        Events.emit(Events.FEED_SELECTED, { id: "all" }),
      );
    document
      .querySelector('[data-id="discover"]')
      ?.addEventListener("click", () =>
        Events.emit(Events.FEED_SELECTED, { id: "discover" }),
      );

    const sidebar = document.getElementById("sidebar");
    const backdrop = document.getElementById("sidebar-backdrop");

    const toggleMenu = () => {
      sidebar?.classList.toggle("open");
      backdrop?.classList.toggle("open");
    };

    const closeMenu = () => {
      sidebar?.classList.remove("open");
      backdrop?.classList.remove("open");
    };

    document.getElementById("menu-btn")?.addEventListener("click", toggleMenu);
    backdrop?.addEventListener("click", toggleMenu);

    // Close sidebar on feed selection (mobile)
    Events.on(Events.FEED_SELECTED, () => {
      if (window.innerWidth <= 768) {
        closeMenu();
      }
    });
  },

  renderPrimaryItems: function () {
    const container = document.getElementById("plugin-sidebar-container");
    if (!container) return;
    container.innerHTML = "";

    const items = Registry.getExtensions("sidebar:primary");
    items.forEach((item) => {
      const div = document.createElement("div");
      div.className = "nav-item";
      if (item.id) div.dataset.id = `custom:${item.id}`;

      if (item.icon instanceof HTMLElement || item.icon instanceof SVGElement) {
        div.appendChild(item.icon.cloneNode(true));
        if (item.label) {
          div.appendChild(document.createTextNode(" " + item.label));
        }
      } else {
        const parser = new DOMParser();
        const doc = parser.parseFromString(
          DOMPurify.sanitize(`${item.icon || ""} ${item.label}`),
          "text/html",
        );
        while (doc.body.firstChild) {
          div.appendChild(doc.body.firstChild);
        }
      }

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
      if (item.id) div.dataset.id = `custom:${item.id}`;

      const parser = new DOMParser();
      const doc = parser.parseFromString(
        DOMPurify.sanitize(`${item.icon || ""} ${item.label}`),
        "text/html",
      );
      while (doc.body.firstChild) {
        div.appendChild(doc.body.firstChild);
      }

      div.onclick = () => {
        if (item.onClick) item.onClick();
      };
      container.appendChild(div);
    });
  },

  renderFeedItems: function () {
    const container = document.getElementById("plugin-sidebar-feeds-container");
    if (!container) return;
    container.innerHTML = "";

    const items = Registry.getExtensions("sidebar:feeds");
    items.forEach((item) => {
      const div = document.createElement("div");
      div.className = "nav-item";
      if (item.id) div.dataset.id = `custom:${item.id}`;

      const parser = new DOMParser();
      const doc = parser.parseFromString(
        DOMPurify.sanitize(`${item.icon || ""} ${item.label}`),
        "text/html",
      );
      while (doc.body.firstChild) {
        div.appendChild(doc.body.firstChild);
      }

      div.onclick = () => {
        if (item.onClick) item.onClick();
      };
      container.appendChild(div);
    });
  },

  updateActiveState: function (currentId) {
    // Clear all active states in plugin containers
    const containers = [
      document.getElementById("plugin-sidebar-container"),
      document.getElementById("plugin-sidebar-secondary-container"),
      document.getElementById("plugin-sidebar-feeds-container"),
    ];

    containers.forEach((container) => {
      if (!container) return;
      const items = container.querySelectorAll(".nav-item");
      items.forEach((item) => {
        if (item.dataset.id === currentId) {
          item.classList.add("active");
        } else {
          item.classList.remove("active");
        }
      });
    });
  },
};
