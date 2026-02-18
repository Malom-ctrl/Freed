window.Freed = window.Freed || {};
window.Freed.Plugins = window.Freed.Plugins || {};

window.Freed.Plugins.Manager = {
  activePlugins: new Map(),
  incompatiblePlugins: new Map(), // Stores plugins that failed compat check

  init: async function () {
    const { Config, Utils } = window.Freed;
    // 1. Load existing plugins from DB
    const plugins = await window.Freed.DB.getPlugins();

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
          await window.Freed.DB.savePlugin(p);
        }
        continue;
      } else {
        this.incompatiblePlugins.set(p.id, false);
      }

      if (p.enabled) {
        await this.loadAndActivate(p);
      }
    }
  },

  install: async function (manifest, sourceCode, installUrl) {
    const { Config, Utils } = window.Freed;

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
      code: sourceCode,
      url: installUrl, // Save source URL for updates
      enabled: true,
      installedAt: Date.now(),
    };
    await window.Freed.DB.savePlugin(pluginData);

    // If updating, refresh activation
    if (this.activePlugins.has(manifest.id)) {
      // Just save to DB is enough, reload required usually to clear mem
    } else {
      await this.loadAndActivate(pluginData);
    }

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
      await this.install(manifest, code, url);
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
    // Prevent enabling if incompatible
    if (enabled && this.incompatiblePlugins.get(id)) {
      throw new Error("Cannot enable incompatible plugin.");
    }

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

  autoUpdatePlugins: async function () {
    const { Utils, Config, DB } = window.Freed;
    const plugins = await DB.getPlugins();

    const updatePromises = plugins.map(async (plugin) => {
      if (!plugin.url) return false;

      try {
        const res = await fetch(plugin.url);
        if (!res.ok) return false;
        const remoteManifest = await res.json();

        // Check Version
        if (Utils.SemVer.compare(remoteManifest.version, plugin.version) > 0) {
          // Check Compatibility
          const compatRule = remoteManifest.compatibleAppVersion || "*";
          if (Utils.SemVer.satisfies(Config.APP_VERSION, compatRule)) {
            // Fetch Code
            const mainScriptUrl = new URL(remoteManifest.main, plugin.url).href;
            const scriptRes = await fetch(mainScriptUrl);
            if (scriptRes.ok) {
              const code = await scriptRes.text();

              // Update DB
              const newPluginData = {
                ...plugin,
                name: remoteManifest.name,
                version: remoteManifest.version,
                description: remoteManifest.description,
                compatibleAppVersion: remoteManifest.compatibleAppVersion,
                code: code,
              };
              await DB.savePlugin(newPluginData);
              return true;
            }
          }
        }
      } catch (e) {
        console.warn("Auto-update failed for", plugin.name, e);
      }
      return false;
    });

    const results = await Promise.all(updatePromises);
    return results.filter(Boolean).length;
  },
};
