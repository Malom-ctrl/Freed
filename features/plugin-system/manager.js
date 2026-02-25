import { DB } from "../../core/db.js";
import { Config } from "../../core/config.js";
import { Utils } from "../../core/utils.js";
import { Interface } from "./interface.js";

export const Manager = {
  activePlugins: new Map(),
  incompatiblePlugins: new Map(), // Stores plugins that failed compat check

  init: async function () {
    // 1. Load existing plugins from DB
    const plugins = await DB.getPlugins();

    for (const p of plugins) {
      // Compatibility Check
      const compatRule = p.compatibleAppVersion || "*";
      const isCompatible = Utils.SemVer.satisfies(
        Config.APP_VERSION,
        compatRule,
      );

      if (!isCompatible) {
        console.warn(
          `Plugin ${p.name} is incompatible with app version ${Config.APP_VERSION}. Required: ${compatRule}`,
        );
        // Disable locally in memory and mark as incompatible
        this.incompatiblePlugins.set(p.id, true);
        if (p.enabled) {
          // Auto-disable in DB so we don't try next time, but user can see it
          p.enabled = false;
          await DB.savePlugin(p);
        }
        continue;
      } else {
        this.incompatiblePlugins.set(p.id, false);
      }

      if (p.enabled && !this.activePlugins.has(p.id)) {
        await this.loadAndActivate(p);
      }
    }
  },

  install: async function (manifest, fetchedFiles, installUrl) {
    // Pre-install Compatibility Check
    const compatRule = manifest.compatibleAppVersion || "*";
    if (!Utils.SemVer.satisfies(Config.APP_VERSION, compatRule)) {
      throw new Error(
        `Plugin requires app version ${compatRule}. Current: ${Config.APP_VERSION}`,
      );
    }

    const pluginData = {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      compatibleAppVersion: manifest.compatibleAppVersion,
      files: fetchedFiles,
      url: installUrl, // Save source URL for updates
      enabled: true,
      installedAt: Date.now(),
    };
    await DB.savePlugin(pluginData);

    // If updating, refresh activation
    if (this.activePlugins.has(manifest.id)) {
      // Just save to DB is enough, reload required usually to clear mem
    } else {
      await this.loadAndActivate(pluginData);
    }

    console.log(`Plugin ${manifest.name} installed.`);
  },

  _fetchPluginFiles: async function (manifest, baseUrl) {
    const filesToFetch = manifest.files || [];
    // Fallback for older manifests
    if (filesToFetch.length === 0 && manifest.main) {
      filesToFetch.push(manifest.main);
      if (manifest.style) filesToFetch.push(manifest.style);
    }

    if (filesToFetch.length === 0) {
      throw new Error("Invalid manifest: No files specified.");
    }

    const fetchedFiles = [];
    for (const file of filesToFetch) {
      if (!file.endsWith(".js") && !file.endsWith(".css")) {
        throw new Error(
          `Invalid file type: ${file}. Only .js and .css are allowed.`,
        );
      }

      const fileUrl = new URL(file, baseUrl).href;
      const fileRes = await fetch(fileUrl);
      if (!fileRes.ok) throw new Error(`Failed to fetch file: ${file}`);

      const content = await fileRes.text();
      const trimmed = content.trim();

      if (trimmed.length === 0) {
        throw new Error(`File is empty: ${file}`);
      }

      // Basic validation to prevent HTML error pages from being loaded as code
      const lowerTrimmed = trimmed.toLowerCase();
      if (
        lowerTrimmed.startsWith("<!doctype html>") ||
        lowerTrimmed.startsWith("<html")
      ) {
        throw new Error(
          `File appears to be an HTML page, expected code: ${file}`,
        );
      }

      fetchedFiles.push({
        name: file,
        content: content,
        type: file.endsWith(".css") ? "css" : "js",
      });
    }

    return fetchedFiles;
  },

  installFromUrl: async function (url) {
    try {
      // 1. Fetch Manifest
      const manifestRes = await fetch(url);
      if (!manifestRes.ok) throw new Error("Failed to fetch manifest");
      const manifest = await manifestRes.json();

      if (!manifest.id || !manifest.name) {
        throw new Error("Invalid manifest: Missing id or name.");
      }

      const fetchedFiles = await this._fetchPluginFiles(manifest, url);

      // 4. Install
      await this.install(manifest, fetchedFiles, url);
      return true;
    } catch (e) {
      console.error("Install from URL failed:", e);
      throw e;
    }
  },

  loadAndActivate: async function (pluginData) {
    try {
      const api = new Interface(pluginData.id);

      const files = pluginData.files || [];

      let moduleUrl = null;
      let module = null;

      for (const file of files) {
        if (file.type === "css") {
          const styleId = `plugin-style-${pluginData.id}-${file.name.replace(/[^a-zA-Z0-9]/g, "-")}`;
          let styleEl = document.getElementById(styleId);
          if (!styleEl) {
            styleEl = document.createElement("style");
            styleEl.id = styleId;
            document.head.appendChild(styleEl);
          }
          styleEl.textContent = file.content;
        } else if (file.type === "js") {
          const blob = new Blob([file.content], { type: "text/javascript" });
          const url = URL.createObjectURL(blob);
          const loadedModule = await import(url);

          if (typeof loadedModule.activate === "function") {
            module = loadedModule;
            moduleUrl = url;
          }
        }
      }

      if (module && typeof module.activate === "function") {
        await module.activate(api);
        this.activePlugins.set(pluginData.id, { module, url: moduleUrl });
      } else {
        // If no activate function was found, just mark it active
        this.activePlugins.set(pluginData.id, { url: moduleUrl });
      }
    } catch (e) {
      console.error(`Failed to activate plugin ${pluginData.id}`, e);
    }
  },

  togglePlugin: async function (id, enabled) {
    // Prevent enabling if incompatible
    if (enabled && this.incompatiblePlugins.get(id)) {
      throw new Error("Cannot enable incompatible plugin.");
    }

    const plugin = await DB.getPlugin(id);
    if (plugin) {
      plugin.enabled = enabled;
      await DB.savePlugin(plugin);
      // We recommend reloading to apply changes cleanly
      return true;
    }
    return false;
  },

  wipeData: async function (id) {
    await DB.deletePluginData(id);
  },

  uninstall: async function (id) {
    await DB.deletePlugin(id);
    await this.wipeData(id); // Also clear data

    if (this.activePlugins.has(id)) {
      this.activePlugins.delete(id);
    }
  },

  autoUpdatePlugins: async function () {
    const plugins = await DB.getPlugins();

    const updatePromises = plugins.map(async (plugin) => {
      if (!plugin.url) return false;

      try {
        const res = await fetch(plugin.url);
        if (!res.ok) return false;
        const remoteManifest = await res.json();

        // Check Version
        if (Utils.SemVer.compare(remoteManifest.version, plugin.version) <= 0)
          return false;

        // Check Compatibility
        const compatRule = remoteManifest.compatibleAppVersion || "*";
        if (!Utils.SemVer.satisfies(Config.APP_VERSION, compatRule))
          return false;

        // Fetch Files
        const fetchedFiles = await this._fetchPluginFiles(
          remoteManifest,
          plugin.url,
        );

        // Update DB
        const newPluginData = {
          ...plugin,
          name: remoteManifest.name,
          version: remoteManifest.version,
          description: remoteManifest.description,
          compatibleAppVersion: remoteManifest.compatibleAppVersion,
          files: fetchedFiles,
        };
        delete newPluginData.code;
        delete newPluginData.style;

        await DB.savePlugin(newPluginData);
        return true;
      } catch (e) {
        console.warn("Auto-update failed for", plugin.name, e);
      }
      return false;
    });

    const results = await Promise.all(updatePromises);
    return results.filter(Boolean).length;
  },
};
