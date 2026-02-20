export const Theme = {
  fonts: {
    system:
      "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    inter: "'Inter', sans-serif",
    serif: "'Merriweather', serif",
    mono: "'JetBrains Mono', monospace",
    helvetica: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    georgia: "Georgia, serif",
  },

  apply: function (theme) {
    if (theme === "system") {
      delete document.body.dataset.theme;
    } else {
      document.body.dataset.theme = theme;
    }

    // Update Meta Theme Color for mobile browsers
    setTimeout(() => {
      const computedStyle = getComputedStyle(document.body);
      const bgColor = computedStyle.getPropertyValue("--bg-body").trim();
      const metaTheme = document.querySelector('meta[name="theme-color"]');
      if (metaTheme && bgColor) {
        metaTheme.setAttribute("content", bgColor);
      }
    }, 50);
  },

  applyFont: function (fontKey) {
    const fontStack = this.fonts[fontKey] || this.fonts["system"];
    document.documentElement.style.setProperty("--font-interface", fontStack);
  },

  init: function () {
    const savedTheme = localStorage.getItem("freed_theme") || "system";
    this.apply(savedTheme);

    const savedFont = localStorage.getItem("freed_font") || "system";
    this.applyFont(savedFont);
  },
};
