window.Freed = window.Freed || {};
window.Freed.Plugins = window.Freed.Plugins || {};

window.Freed.Plugins.Manager = {
  activePlugins: new Map(),

  init: async function () {
    // 1. Load existing plugins from DB
    const plugins = await window.Freed.DB.getPlugins();
    for (const p of plugins) {
      if (p.enabled) {
        await this.loadAndActivate(p);
      }
    }
  },

  install: async function (manifest, sourceCode) {
    const pluginData = {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      code: sourceCode,
      enabled: true,
      installedAt: Date.now(),
    };
    await window.Freed.DB.savePlugin(pluginData);
    await this.loadAndActivate(pluginData);
    console.log(`Plugin ${manifest.name} installed.`);
  },

  installFromUrl: async function (url) {
    const { Utils } = window.Freed;
    try {
      // 1. Fetch Manifest
      const manifestRes = await fetch(url);
      if (!manifestRes.ok) throw new Error("Failed to fetch manifest");
      const manifest = await manifestRes.json();

      if (!manifest.id || !manifest.name || !manifest.main) {
        throw new Error("Invalid manifest: Missing id, name, or main.");
      }

      // 2. Resolve Main Script URL
      // If 'main' is relative, resolve it against the manifest URL
      const mainScriptUrl = new URL(manifest.main, url).href;

      // 3. Fetch Script
      const scriptRes = await fetch(mainScriptUrl);
      if (!scriptRes.ok) throw new Error("Failed to fetch main script");
      const code = await scriptRes.text();

      // 4. Install
      await this.install(manifest, code);
      return true;
    } catch (e) {
      console.error("Install from URL failed:", e);
      throw e;
    }
  },

  loadAndActivate: async function (pluginData) {
    try {
      const blob = new Blob([pluginData.code], { type: "text/javascript" });
      const url = URL.createObjectURL(blob);
      const module = await import(url);

      const api = new window.Freed.Plugins.Interface(pluginData.id);

      if (typeof module.activate === "function") {
        await module.activate(api);
        this.activePlugins.set(pluginData.id, { module, url });
      }
    } catch (e) {
      console.error(`Failed to activate plugin ${pluginData.id}`, e);
    }
  },

  togglePlugin: async function (id, enabled) {
    const { DB } = window.Freed;
    const plugins = await DB.getPlugins();
    const plugin = plugins.find((p) => p.id === id);
    if (plugin) {
      plugin.enabled = enabled;
      await DB.savePlugin(plugin);
      // We recommend reloading to apply changes cleanly
      return true;
    }
    return false;
  },

  wipeData: async function (id) {
    await window.Freed.DB.deletePluginData(id);
  },

  uninstall: async function (id) {
    await window.Freed.DB.deletePlugin(id);
    await this.wipeData(id); // Also clear data

    if (this.activePlugins.has(id)) {
      this.activePlugins.delete(id);
      // Reload is usually best after uninstall to clear memory hooks
      window.location.reload();
    }
  },
};
