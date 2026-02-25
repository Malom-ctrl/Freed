import { Utils } from "../../core/utils.js";
import { Config } from "../../core/config.js";
import { Registry } from "./registry.js";

export const ManagerView = {
  renderPluginsList: function (
    installed,
    available,
    callbacks,
    incompatiblePlugins = new Map(),
  ) {
    const container = document.getElementById("plugins-list-container");
    if (!container) return;
    while (container.firstChild) container.removeChild(container.firstChild);

    // 1. Installed Plugins
    if (installed.length > 0) {
      installed.forEach(async (plugin) => {
        const isIncompatible = incompatiblePlugins.get(plugin.id);

        const card = document.createElement("div");
        card.className = "plugin-card";
        if (isIncompatible) {
          card.classList.add("incompatible");
        }

        const header = document.createElement("div");
        header.className = "plugin-card-header";

        const info = document.createElement("div");

        const nameRow = document.createElement("div");
        nameRow.className = "plugin-card-name-row";

        const nameSpan = document.createElement("span");
        nameSpan.className = "plugin-name";
        nameSpan.textContent = plugin.name;

        const verSpan = document.createElement("span");
        verSpan.className = "plugin-card-version";
        verSpan.textContent = `v${plugin.version}`;

        nameRow.appendChild(nameSpan);
        nameRow.appendChild(verSpan);

        if (isIncompatible) {
          const badgeSpan = document.createElement("span");
          badgeSpan.className = "plugin-card-incompatible-badge";
          badgeSpan.textContent = "Incompatible";
          nameRow.appendChild(badgeSpan);
        }

        const descDiv = document.createElement("div");
        descDiv.className = "plugin-desc plugin-card-desc";
        descDiv.textContent = plugin.description || "No description";

        info.appendChild(nameRow);
        info.appendChild(descDiv);

        const toggleLabel = document.createElement("label");
        toggleLabel.className = "toggle-switch";

        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = !!plugin.enabled;

        if (isIncompatible) {
          input.disabled = true;
          toggleLabel.classList.add("disabled");
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
        actions.className = "plugin-card-actions";

        const wipeBtn = document.createElement("button");
        wipeBtn.className = "btn btn-outline plugin-btn-small";
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
        uninstallBtn.className =
          "btn btn-outline plugin-btn-small plugin-btn-uninstall";
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
      empty.className = "plugin-empty-state";
      empty.textContent = "No plugins installed.";
      container.appendChild(empty);
    }

    // 2. Available Official Plugins (not installed)
    const notInstalled = available.filter(
      (a) => !installed.some((i) => i.id === a.id),
    );

    if (notInstalled.length > 0) {
      const divider = document.createElement("div");
      divider.className = "plugin-divider";
      container.appendChild(divider);

      const header = document.createElement("h4");
      header.className = "plugin-section-title";
      header.textContent = "Available Official Plugins";
      container.appendChild(header);

      notInstalled.forEach((plugin) => {
        const isCompat = Utils.SemVer.satisfies(
          Config.APP_VERSION,
          plugin.compatibleAppVersion || "0.0.0",
        );

        const card = document.createElement("div");
        card.className = "plugin-card";

        const info = document.createElement("div");

        const nameRow = document.createElement("div");
        nameRow.className = "plugin-card-name-row";

        const nameSpan = document.createElement("span");
        nameSpan.className = "plugin-name";
        nameSpan.textContent = plugin.name;

        const verSpan = document.createElement("span");
        verSpan.className = "plugin-card-version";
        verSpan.textContent = `v${plugin.version}`;

        nameRow.appendChild(nameSpan);
        nameRow.appendChild(verSpan);

        const descDiv = document.createElement("div");
        descDiv.className = "plugin-desc plugin-card-desc";
        descDiv.textContent = plugin.description || "No description";

        info.appendChild(nameRow);
        info.appendChild(descDiv);

        const actions = document.createElement("div");
        actions.className = "plugin-card-actions mt-8";

        const installBtn = document.createElement("button");
        installBtn.className = "btn btn-primary plugin-btn-install";
        installBtn.textContent = "Install";

        if (!isCompat) {
          installBtn.disabled = true;
          installBtn.textContent = "Incompatible";
          installBtn.title = `Requires App v${plugin.compatibleAppVersion}`;
          installBtn.classList.add("disabled");
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

  renderPluginSettings: function () {
    const generalContainer = document.getElementById(
      "plugin-settings-container-general",
    );
    const appearanceContainer = document.getElementById(
      "plugin-settings-container-appearance",
    );
    const dataContainer = document.getElementById(
      "plugin-settings-container-data",
    );

    if (generalContainer) generalContainer.innerHTML = "";
    if (appearanceContainer) appearanceContainer.innerHTML = "";
    if (dataContainer) dataContainer.innerHTML = "";

    const settings = Registry.getExtensions("settings:section");
    settings.forEach((item) => {
      let container = null;
      if (item.tab === "tab-general") container = generalContainer;
      if (item.tab === "tab-appearance") container = appearanceContainer;
      if (item.tab === "tab-data") container = dataContainer;

      if (container && typeof item.render === "function") {
        const wrapper = document.createElement("div");
        wrapper.className = "plugin-settings-wrapper";
        if (item.title) {
          const header = document.createElement("h4");
          header.className = "plugin-settings-header";
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
};
