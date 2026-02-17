window.Freed = window.Freed || {};

window.Freed.Utils = {
  divToText: function (html) {
    const tmp = document.createElement("DIV");
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || "";
  },

  countWords: function (text) {
    if (!text) return 0;
    // Strip HTML tags if any (though usually passed text is clean or we want divToText first)
    const clean = text.replace(/<[^>]*>/g, " ");
    // Split by whitespace and filter empty strings
    return clean
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0).length;
  },

  toastTimeout: null,

  showToast: function (msg, action) {
    const toast = document.getElementById("toast");
    if (!toast) return;

    // Clear existing timeout to prevent closing a new toast prematurely
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
      this.toastTimeout = null;
    }

    // Reset content
    toast.innerHTML = "";
    const msgSpan = document.createElement("span");
    msgSpan.textContent = msg;
    toast.appendChild(msgSpan);

    // Add Action Button if provided
    if (action && action.label && action.callback) {
      const btn = document.createElement("button");
      btn.className = "toast-action";
      btn.textContent = action.label;
      btn.onclick = (e) => {
        e.stopPropagation();
        action.callback();
        toast.classList.remove("show");
      };
      toast.appendChild(btn);
    }

    toast.classList.add("show");

    // Auto-hide after 3.5 seconds
    this.toastTimeout = setTimeout(() => {
      toast.classList.remove("show");
      this.toastTimeout = null;
    }, 3500);
  },

  getRandomFromPalette: function () {
    if (!window.Freed.Config || !window.Freed.Config.COLOR_PALETTE)
      return "#64748b";
    const palette = window.Freed.Config.COLOR_PALETTE;
    return palette[Math.floor(Math.random() * palette.length)];
  },

  // Deterministically pick a color from the palette based on a string (ID)
  // This allows consistency without storage.
  getColorForId: function (str) {
    if (!str) return "#64748b";
    if (!window.Freed.Config || !window.Freed.Config.COLOR_PALETTE)
      return "#64748b";

    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }

    const palette = window.Freed.Config.COLOR_PALETTE;
    const index = Math.abs(hash) % palette.length;
    return palette[index];
  },

  formatRelativeTime: function (dateStr) {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr || "";

    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);

    if (diffInSeconds < 60) return "just now";

    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) {
      return `${diffInMinutes}mins ago`;
    }

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) {
      return `${diffInHours}h ago`;
    }

    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 30) {
      return `${diffInDays}d ago`;
    }

    // Fallback to date for older items
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  },

  formatFullDate: function (dateStr) {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr || "";
    return date.toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  },

  proxifyUrl: function (url) {
    return `https://corsproxy.io/?${encodeURIComponent(url)}`;
  },

  hexToRgba: function (hex, alpha = 1) {
    if (!hex || typeof hex !== "string") return `rgba(0,0,0,${alpha})`;
    let c = hex.replace("#", "");
    // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
    if (c.length === 3) {
      c = c
        .split("")
        .map((char) => char + char)
        .join("");
    }
    if (c.length !== 6) return hex;

    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  },

  throttle: function (func, limit) {
    let lastFunc;
    let lastRan;
    return function () {
      const context = this;
      const args = arguments;
      if (!lastRan) {
        func.apply(context, args);
        lastRan = Date.now();
      } else {
        clearTimeout(lastFunc);
        lastFunc = setTimeout(
          function () {
            if (Date.now() - lastRan >= limit) {
              func.apply(context, args);
              lastRan = Date.now();
            }
          },
          limit - (Date.now() - lastRan),
        );
      }
    };
  },

  getFaviconUrl: function (domain) {
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
  },

  fetchImageAsBase64: async function (url) {
    const proxy = this.proxifyUrl(url);
    try {
      const res = await fetch(proxy);
      if (!res.ok) throw new Error("Fetch failed");
      const blob = await res.blob();
      if (blob.size === 0) throw new Error("Empty image");

      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (reader.result === "data:") resolve(null);
          else resolve(reader.result);
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      return null;
    }
  },

  getDominantColor: function (base64) {
    return new Promise((resolve) => {
      if (!base64) return resolve(null);
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          // Downscale to 1x1 to get average color roughly
          canvas.width = 1;
          canvas.height = 1;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, 1, 1);
          const p = ctx.getImageData(0, 0, 1, 1).data;

          // Simple RGB to Hex
          const hex =
            "#" +
            ((1 << 24) + (p[0] << 16) + (p[1] << 8) + p[2])
              .toString(16)
              .slice(1);
          resolve(hex);
        } catch (e) {
          console.warn("Color extraction failed", e);
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = base64;
    });
  },

  fetchFaviconAndColor: async function (url) {
    try {
      const domain = new URL(url).hostname;
      const iconUrl = this.getFaviconUrl(domain);
      const base64 = await this.fetchImageAsBase64(iconUrl);

      if (!base64) return null;

      // Attempt to check if it's a valid image by loading it
      const color = await this.getDominantColor(base64);
      // If color extraction works, the image is likely valid
      return { iconData: base64, color: color };
    } catch (e) {
      return null;
    }
  },
};
