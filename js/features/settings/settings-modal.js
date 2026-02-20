import { Modals } from "../../components/modals.js";
import { Theme } from "./theme.js";
import { State } from "../../core/state.js";
import { Config } from "../../core/config.js";
import { Utils } from "../../core/utils.js";
import { Data } from "../../core/data-service.js";
import { DB } from "../../core/db.js";
import { Manager as PluginManager } from "../../plugin-system/manager.js";
import { Events } from "../../core/events.js";

export const SettingsModal = {
  setupListeners: function () {
    window.closeSettingsModal = () =>
      Modals.toggleModal("settings-modal", false);

    document.getElementById("btn-settings")?.addEventListener("click", () => {
      Modals.toggleModal("settings-modal", true);
      Modals.renderPluginSettings(); // Ensure plugin settings are rendered
      const keyInput = document.getElementById("settings-api-key");
      if (keyInput)
        keyInput.value = localStorage.getItem("freed_api_key") || "";

      const themeInput = document.getElementById("settings-theme");
      if (themeInput)
        themeInput.value = localStorage.getItem("freed_theme") || "system";

      const fontInput = document.getElementById("settings-font");
      if (fontInput)
        fontInput.value = localStorage.getItem("freed_font") || "system";

      const imagesInput = document.getElementById("settings-show-images");
      if (imagesInput) imagesInput.checked = State.showArticleImages;

      document.getElementById("settings-cleanup-unread").value =
        localStorage.getItem("cleanup_unread_days") ||
        Config.DEFAULTS.CLEANUP_UNREAD_DAYS;
      document.getElementById("settings-cleanup-content").value =
        localStorage.getItem("cleanup_content_days") ||
        Config.DEFAULTS.CLEANUP_CONTENT_DAYS;
      document.getElementById("settings-cleanup-read").value =
        localStorage.getItem("cleanup_read_days") ||
        Config.DEFAULTS.CLEANUP_READ_DAYS;
    });

    // Settings Tabs Switcher
    const tabButtons = document.querySelectorAll(".settings-tab-btn");
    const tabPanes = document.querySelectorAll(".settings-tab-pane");

    tabButtons.forEach((btn) => {
      btn.addEventListener("click", async () => {
        const target = btn.getAttribute("data-target");

        tabButtons.forEach((b) => b.classList.remove("active"));
        tabPanes.forEach((p) => p.classList.remove("active"));

        btn.classList.add("active");
        document.getElementById(target).classList.add("active");

        // Load Plugins List if plugin tab
        if (target === "tab-plugins") {
          const installed = await DB.getPlugins();

          // Fetch Official Plugins
          const official = [];
          if (Config.OFFICIAL_PLUGINS) {
            for (const url of Config.OFFICIAL_PLUGINS) {
              try {
                const res = await fetch(url);
                if (res.ok) {
                  const manifest = await res.json();
                  official.push({ ...manifest, url });
                }
              } catch (e) {
                console.warn(
                  "Failed to fetch official plugin manifest:",
                  url,
                  e,
                );
              }
            }
          }

          Modals.renderPluginsList(
            installed,
            official,
            {
              onToggle: async (id, enabled) => {
                await PluginManager.togglePlugin(id, enabled);
                if (
                  confirm(
                    "App reload required to change plugin state. Reload now?",
                  )
                ) {
                  window.location.reload();
                }
              },
              onWipe: async (id) => {
                await PluginManager.wipeData(id);
                Utils.showToast("Plugin data cleared");
              },
              onUninstall: async (id) => {
                if (
                  confirm(
                    "Are you sure you want to uninstall this plugin? The app will reload to apply changes.",
                  )
                ) {
                  await PluginManager.uninstall(id);
                  window.location.reload();
                }
              },
              onInstall: async (url) => {
                try {
                  await PluginManager.installFromUrl(url);
                  Utils.showToast("Plugin installed successfully");
                  // Refresh the view
                  btn.click();
                  if (
                    confirm(
                      "App reload required to activate new plugin. Reload now?",
                    )
                  ) {
                    window.location.reload();
                  }
                } catch (e) {
                  Utils.showToast("Installation failed: " + e.message);
                }
              },
            },
            PluginManager.incompatiblePlugins,
          );
        }
      });
    });

    document
      .getElementById("btn-save-settings")
      ?.addEventListener("click", () => {
        localStorage.setItem(
          "freed_api_key",
          document.getElementById("settings-api-key").value.trim(),
        );

        const theme = document.getElementById("settings-theme").value;
        localStorage.setItem("freed_theme", theme);
        Theme.apply(theme);

        const font = document.getElementById("settings-font").value;
        localStorage.setItem("freed_font", font);
        Theme.applyFont(font);

        const showImages = document.getElementById(
          "settings-show-images",
        ).checked;
        localStorage.setItem("freed_show_images", showImages);
        State.showArticleImages = showImages;

        localStorage.setItem(
          "cleanup_unread_days",
          document.getElementById("settings-cleanup-unread").value,
        );
        localStorage.setItem(
          "cleanup_content_days",
          document.getElementById("settings-cleanup-content").value,
        );
        localStorage.setItem(
          "cleanup_read_days",
          document.getElementById("settings-cleanup-read").value,
        );

        Utils.showToast("Settings saved");
        window.closeSettingsModal();
        Events.emit(Events.SETTINGS_UPDATED);
      });

    // --- Plugin Install ---
    document
      .getElementById("btn-install-plugin")
      ?.addEventListener("click", async () => {
        const input = document.getElementById("plugin-install-url");
        const url = input.value.trim();
        if (!url) return;

        const btn = document.getElementById("btn-install-plugin");
        const originalText = btn.textContent;
        btn.textContent = "Installing...";
        btn.disabled = true;

        try {
          await PluginManager.installFromUrl(url);
          Utils.showToast("Plugin installed successfully");
          input.value = "";

          if (
            confirm("App reload required to activate new plugin. Reload now?")
          ) {
            window.location.reload();
          } else {
            // Refresh list just in case
            const tabBtn = document.querySelector(
              '.settings-tab-btn[data-target="tab-plugins"]',
            );
            if (tabBtn) tabBtn.click();
          }
        } catch (e) {
          Utils.showToast("Installation failed: " + e.message);
        } finally {
          btn.textContent = originalText;
          btn.disabled = false;
        }
      });

    // --- Export / Import Listeners ---
    document
      .getElementById("btn-export-opml")
      ?.addEventListener("click", async () => {
        const options = {
          includeFeeds: document.getElementById("export-feeds").checked,
          includeSettings: document.getElementById("export-settings").checked,
          includeFavorites: document.getElementById("export-favorites").checked,
        };

        const xml = await Data.generateOPML(options);
        const blob = new Blob([xml], { type: "text/xml" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `freed_export_${new Date().toISOString().slice(0, 10)}.opml`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        Utils.showToast("Export generated");
      });

    document
      .getElementById("btn-import-opml")
      ?.addEventListener("click", () => {
        document.getElementById("file-input-import").click();
      });

    document
      .getElementById("file-input-import")
      ?.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const options = {
          includeFeeds: document.getElementById("import-feeds").checked,
          includeSettings: document.getElementById("import-settings").checked,
          includeFavorites: document.getElementById("import-favorites").checked,
          overwrite: document.getElementById("import-overwrite").checked,
        };

        const reader = new FileReader();
        reader.onload = async (e) => {
          const xml = e.target.result;
          try {
            const stats = await Data.processImport(xml, options);
            let msg = `Imported: ${stats.feeds} feeds`;
            if (stats.favorites > 0) msg += `, ${stats.favorites} items`;
            if (stats.settings) msg += `, settings`;
            Utils.showToast(msg);

            // Reset input
            document.getElementById("file-input-import").value = "";

            // Reload App
            setTimeout(() => window.location.reload(), 1500);
          } catch (err) {
            console.error(err);
            Utils.showToast("Import failed: " + err.message);
          }
        };
        reader.readAsText(file);
      });
  },
};
