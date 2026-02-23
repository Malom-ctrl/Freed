import { Utils } from "../core/utils.js";
import { Registry } from "../features/plugin-system/registry.js";
import { Config } from "../core/config.js";
import DOMPurify from "dompurify";

export const Modals = {
  setupListeners: function () {
    window.closeStatsModal = () => this.toggleModal("stats-modal", false);

    let mouseDownTarget = null;
    document.addEventListener("mousedown", (e) => {
      mouseDownTarget = e.target;
    });

    const bindBackdropClose = (modalId, closeFn) => {
      const el = document.getElementById(modalId);
      if (!el) return;
      el.addEventListener("click", (e) => {
        // Only close if interaction started AND ended on the backdrop
        if (e.target === el && mouseDownTarget === el) {
          closeFn();
        }
      });
    };

    bindBackdropClose(
      "read-modal",
      () => window.closeModal && window.closeModal(),
    );
    bindBackdropClose(
      "feed-modal",
      () => window.closeFeedModal && window.closeFeedModal(),
    );
    bindBackdropClose(
      "settings-modal",
      () => window.closeSettingsModal && window.closeSettingsModal(),
    );
    bindBackdropClose(
      "stats-modal",
      () => window.closeStatsModal && window.closeStatsModal(),
    );
  },

  toggleModal: function (modalId, show) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    if (show) {
      modal.classList.add("open");
    } else {
      modal.classList.remove("open");
    }
  },

  renderPluginSettings: function () {
    const generalContainer = document.getElementById(
      "plugin-settings-container-general",
    );
    const appearanceContainer = document.getElementById(
      "plugin-settings-container-appearance",
    );

    if (generalContainer) generalContainer.innerHTML = "";
    if (appearanceContainer) appearanceContainer.innerHTML = "";

    const settings = Registry.getExtensions("settings:section");
    settings.forEach((item) => {
      let container = null;
      if (item.tab === "tab-general") container = generalContainer;
      if (item.tab === "tab-appearance") container = appearanceContainer;

      if (container && typeof item.render === "function") {
        const wrapper = document.createElement("div");
        wrapper.style.marginBottom = "20px";
        if (item.title) {
          const header = document.createElement("h4");
          header.style.marginTop = "0";
          header.style.marginBottom = "10px";
          header.textContent = item.title;
          wrapper.appendChild(header);
        }
        item.render(wrapper);
        container.appendChild(wrapper);
      }
    });

    this.renderPluginTabs();
  },

  renderPluginTabs: function () {
    const header = document.querySelector(".settings-tabs-header");
    const content = document.querySelector(".settings-tab-content-container");
    if (!header || !content) return;

    const tabs = Registry.getExtensions("settings:tab");
    tabs.forEach((tab) => {
      const tabId = `tab-${tab.id}`;

      // Check if button exists
      if (!header.querySelector(`[data-target="${tabId}"]`)) {
        const btn = document.createElement("button");
        btn.className = "settings-tab-btn";
        btn.setAttribute("data-target", tabId);
        btn.textContent = tab.label;
        header.appendChild(btn);
      }

      // Check if pane exists
      if (!document.getElementById(tabId)) {
        const pane = document.createElement("div");
        pane.id = tabId;
        pane.className = "settings-tab-pane";
        content.appendChild(pane);

        // Render content
        if (typeof tab.render === "function") {
          tab.render(pane);
        }
      }
    });
  },

  renderPluginsList: function (
    installed,
    available,
    callbacks,
    incompatiblePlugins = new Map(),
  ) {
    const container = document.getElementById("plugins-list-container");
    if (!container) return;
    container.innerHTML = "";

    // 1. Installed Plugins
    if (installed.length > 0) {
      installed.forEach(async (plugin) => {
        const isIncompatible = incompatiblePlugins.get(plugin.id);

        const card = document.createElement("div");
        card.style.border = "1px solid var(--border)";
        card.style.borderRadius = "8px";
        card.style.padding = "12px";
        card.style.marginBottom = "12px";
        card.style.background = "var(--bg-card)";
        if (isIncompatible) {
          card.style.borderColor = "#ef4444";
          card.style.backgroundColor = "rgba(239, 68, 68, 0.05)";
        }

        const header = document.createElement("div");
        header.style.display = "flex";
        header.style.justifyContent = "space-between";
        header.style.alignItems = "start";
        header.style.marginBottom = "8px";

        let badge = "";
        if (isIncompatible) {
          badge = `<span style="background:#ef4444; color:white; font-size:0.7rem; padding:2px 6px; border-radius:4px; margin-left:8px;">Incompatible</span>`;
        }

        const info = document.createElement("div");
        info.innerHTML = DOMPurify.sanitize(`
            <div style="font-weight:600; font-size:1rem; display:flex; align-items:center; gap:8px;">
                <span class="plugin-name"></span>
                <span style="font-weight:400; color:var(--text-muted); font-size:0.8em;">v${plugin.version}</span>
                ${badge}
            </div>
            <div class="plugin-desc" style="font-size:0.85rem; color:var(--text-muted); margin-top:4px;"></div>
        `);

        info.querySelector(".plugin-name").textContent = plugin.name;
        info.querySelector(".plugin-desc").textContent =
          plugin.description || "No description";

        const toggleLabel = document.createElement("label");
        toggleLabel.className = "toggle-switch";

        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = !!plugin.enabled;

        if (isIncompatible) {
          input.disabled = true;
          toggleLabel.style.opacity = "0.5";
          toggleLabel.title = "Incompatible with current app version";
        } else {
          input.onchange = (e) =>
            callbacks.onToggle(plugin.id, e.target.checked);
        }

        const slider = document.createElement("span");
        slider.className = "slider";

        toggleLabel.appendChild(input);
        toggleLabel.appendChild(slider);

        header.appendChild(info);
        header.appendChild(toggleLabel);

        const actions = document.createElement("div");
        actions.style.display = "flex";
        actions.style.gap = "8px";
        actions.style.justifyContent = "flex-end";
        actions.style.flexWrap = "wrap";

        const wipeBtn = document.createElement("button");
        wipeBtn.className = "btn btn-outline";
        wipeBtn.style.fontSize = "0.75rem";
        wipeBtn.style.padding = "4px 8px";
        wipeBtn.textContent = "Wipe Data";
        wipeBtn.onclick = () => {
          if (
            confirm(
              `Are you sure you want to clear stored data for ${plugin.name}? This cannot be undone.`,
            )
          ) {
            callbacks.onWipe(plugin.id);
          }
        };

        const uninstallBtn = document.createElement("button");
        uninstallBtn.className = "btn btn-outline";
        uninstallBtn.style.fontSize = "0.75rem";
        uninstallBtn.style.padding = "4px 8px";
        uninstallBtn.style.color = "#ef4444";
        uninstallBtn.style.borderColor = "#ef4444";
        uninstallBtn.textContent = "Uninstall";
        uninstallBtn.onclick = () => {
          callbacks.onUninstall(plugin.id);
        };

        actions.appendChild(wipeBtn);
        actions.appendChild(uninstallBtn);

        card.appendChild(header);
        card.appendChild(actions);
        container.appendChild(card);
      });
    } else {
      const empty = document.createElement("div");
      empty.style.color = "var(--text-muted)";
      empty.style.textAlign = "center";
      empty.style.padding = "20px";
      empty.style.marginBottom = "20px";
      empty.textContent = "No plugins installed.";
      container.appendChild(empty);
    }

    // 2. Available Official Plugins (not installed)
    const notInstalled = available.filter(
      (a) => !installed.some((i) => i.id === a.id),
    );

    if (notInstalled.length > 0) {
      const divider = document.createElement("div");
      divider.style.height = "1px";
      divider.style.background = "var(--border)";
      divider.style.margin = "20px 0";
      container.appendChild(divider);

      const header = document.createElement("h4");
      header.style.marginBottom = "10px";
      header.textContent = "Available Official Plugins";
      container.appendChild(header);

      notInstalled.forEach((plugin) => {
        const isCompat = Utils.SemVer.satisfies(
          Config.APP_VERSION,
          plugin.compatibleAppVersion || "0.0.0",
        );

        const card = document.createElement("div");
        card.style.border = "1px solid var(--border)";
        card.style.borderRadius = "8px";
        card.style.padding = "12px";
        card.style.marginBottom = "12px";
        card.style.background = "var(--bg-card)";

        const info = document.createElement("div");
        info.innerHTML = DOMPurify.sanitize(`
                    <div style="font-weight:600; font-size:1rem; display:flex; align-items:center; gap:8px;">
                        <span class="plugin-name"></span>
                        <span style="font-weight:400; color:var(--text-muted); font-size:0.8em;">v${plugin.version}</span>
                    </div>
                    <div class="plugin-desc" style="font-size:0.85rem; color:var(--text-muted); margin-top:4px;"></div>
                `);

        info.querySelector(".plugin-name").textContent = plugin.name;
        info.querySelector(".plugin-desc").textContent =
          plugin.description || "No description";

        const actions = document.createElement("div");
        actions.style.display = "flex";
        actions.style.justifyContent = "flex-end";
        actions.style.marginTop = "8px";

        const installBtn = document.createElement("button");
        installBtn.className = "btn btn-primary";
        installBtn.style.fontSize = "0.8rem";
        installBtn.style.padding = "4px 12px";
        installBtn.textContent = "Install";

        if (!isCompat) {
          installBtn.disabled = true;
          installBtn.textContent = "Incompatible";
          installBtn.title = `Requires App v${plugin.compatibleAppVersion}`;
          installBtn.style.opacity = "0.5";
        } else {
          installBtn.onclick = () => callbacks.onInstall(plugin.url);
        }

        actions.appendChild(installBtn);
        card.appendChild(info);
        card.appendChild(actions);
        container.appendChild(card);
      });
    }
  },

  _createStatBar: function (label, value, total, color) {
    const pct = Math.min(100, Math.round((value / total) * 100)) || 0;
    return `
            <div style="margin-bottom: 16px;">
                <div style="display:flex; justify-content:space-between; font-size: 0.9rem; margin-bottom: 6px;">
                    <span>${DOMPurify.sanitize(label)}</span>
                    <span style="font-weight:600;">${value} <span style="font-weight:400;color:var(--text-muted);font-size:0.8em">(${pct}%)</span></span>
                </div>
                <div style="width:100%; height:8px; background:var(--border); border-radius:4px; overflow:hidden;">
                    <div style="width:${pct}%; height:100%; background:${color};"></div>
                </div>
            </div>`;
  },

  renderStatsModal: function (feed) {
    const modal = document.getElementById("stats-modal");
    const content = document.getElementById("stats-modal-content");
    if (!modal || !content) return;

    const stats = feed.stats || {
      totalFetched: 0,
      read: 0,
      discarded: 0,
      favorited: 0,
      wordCountRead: 0,
    };

    const total = Math.max(stats.totalFetched, 1);

    content.innerHTML = DOMPurify.sanitize(`
            <div style="text-align:center; padding-bottom:16px; border-bottom:1px solid var(--border); margin-bottom:20px;">
                <div style="font-size:3rem; font-weight:700; color:var(--text-main);">${stats.totalFetched}</div>
                <div style="color:var(--text-muted); font-size:0.9rem; text-transform:uppercase; letter-spacing:0.05em;">Total Articles Fetched</div>
            </div>

            ${Modals._createStatBar("Read", stats.read, total, "#10b981")}
            ${Modals._createStatBar("Discarded", stats.discarded, total, "#ef4444")}
            ${Modals._createStatBar("Favorited", stats.favorited, total, "#f59e0b")}
        `);

    // Render Custom Plugin Stats
    const customStats = Registry.getExtensions("stats:feed");
    if (customStats.length > 0) {
      customStats.forEach((item) => {
        if (typeof item.render === "function") {
          const html = item.render(feed);
          if (html) {
            const div = document.createElement("div");
            div.innerHTML = DOMPurify.sanitize(html);
            content.appendChild(div);
          }
        }
      });
    }

    document.getElementById("stats-modal-title").textContent =
      `${feed.title} Stats`;
    this.toggleModal("stats-modal", true);
  },

  showTooltip: function (el, text) {
    const tooltip = document.getElementById("global-tooltip");
    if (!tooltip || !text) return;

    tooltip.textContent = text;
    tooltip.classList.add("show");
    const rect = el.getBoundingClientRect();
    // Position tooltip above element
    tooltip.style.top = `${rect.top - tooltip.offsetHeight - 8}px`;
    // Center horizontally
    const left = rect.left + rect.width / 2 - tooltip.offsetWidth / 2;
    // Ensure within viewport
    tooltip.style.left = `${Math.max(10, Math.min(window.innerWidth - tooltip.offsetWidth - 10, left))}px`;
  },

  hideTooltip: function () {
    const tooltip = document.getElementById("global-tooltip");
    if (tooltip) tooltip.classList.remove("show");
  },

  setupGlobalTooltip: function () {
    const tooltip = document.getElementById("global-tooltip");
    if (!tooltip) return;

    const show = (el, text) => this.showTooltip(el, text);
    const hide = () => this.hideTooltip();

    document.addEventListener("mouseover", (e) => {
      const target = e.target.closest("[data-tooltip]");
      if (target) {
        show(target, target.getAttribute("data-tooltip"));
      }
    });

    document.addEventListener("mouseout", (e) => {
      const target = e.target.closest("[data-tooltip]");
      if (target) {
        hide();
      }
    });
  },

  showPopover: function (rect, contentHTML) {
    let popover = document.getElementById("global-popover");
    if (!popover) {
      popover = document.createElement("div");
      popover.id = "global-popover";
      popover.className = "global-popover";
      popover.innerHTML = `
        <button class="close-popover" aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
        <div class="global-popover-content"></div>
      `;
      document.body.appendChild(popover);

      popover.querySelector(".close-popover").onclick = () => {
        this.hidePopover();
      };
    }

    const contentEl = popover.querySelector(".global-popover-content");
    contentEl.innerHTML = contentHTML;

    popover.classList.add("show");

    // Position logic
    const popoverHeight = popover.offsetHeight || 100;
    const popoverWidth = popover.offsetWidth || 300;

    let top = rect.top - popoverHeight - 10;
    let left = rect.left + rect.width / 2 - popoverWidth / 2;

    // Flip if too close to top
    if (top < 10) {
      top = rect.bottom + 10;
    }

    // Keep within horizontal bounds
    left = Math.max(10, Math.min(window.innerWidth - popoverWidth - 10, left));

    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
  },

  hidePopover: function () {
    const popover = document.getElementById("global-popover");
    if (popover) popover.classList.remove("show");
  },

  showPrompt: function (message, defaultValue = "") {
    return new Promise((resolve) => {
      // Create modal elements
      const backdrop = document.createElement("div");
      backdrop.className = "modal-backdrop open";
      backdrop.style.zIndex = "10000"; // Ensure it's on top

      const modal = document.createElement("div");
      modal.className = "modal";
      modal.style.maxWidth = "350px";
      modal.style.padding = "20px";

      const title = document.createElement("h3");
      title.style.margin = "0 0 16px 0";
      title.textContent = message;

      const input = document.createElement("textarea");
      input.value = defaultValue;
      input.style.width = "100%";
      input.style.minHeight = "80px";
      input.style.marginBottom = "16px";
      input.style.padding = "8px";
      input.style.borderRadius = "8px";
      input.style.border = "1px solid var(--border)";
      input.style.background = "var(--bg-body)";
      input.style.color = "var(--text-main)";
      input.style.fontFamily = "inherit";
      input.style.resize = "vertical";

      const actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.justifyContent = "flex-end";
      actions.style.gap = "8px";

      const cancelBtn = document.createElement("button");
      cancelBtn.className = "btn btn-outline";
      cancelBtn.textContent = "Cancel";

      const confirmBtn = document.createElement("button");
      confirmBtn.className = "btn btn-primary";
      confirmBtn.textContent = "Save";

      actions.appendChild(cancelBtn);
      actions.appendChild(confirmBtn);

      modal.appendChild(title);
      modal.appendChild(input);
      modal.appendChild(actions);
      backdrop.appendChild(modal);
      document.body.appendChild(backdrop);

      input.focus();

      // Handlers
      const close = (value) => {
        backdrop.remove();
        resolve(value);
      };

      cancelBtn.onclick = () => close(null);
      confirmBtn.onclick = () => close(input.value);

      backdrop.onclick = (e) => {
        if (e.target === backdrop) close(null);
      };

      input.onkeydown = (e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          close(input.value);
        }
        if (e.key === "Escape") {
          close(null);
        }
      };
    });
  },
};
