window.Freed = window.Freed || {};

window.Freed.Utils = {
  divToText: function (html) {
    const tmp = document.createElement("DIV");
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || "";
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
};
