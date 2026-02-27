export const Modals = {
  popoverJustOpened: false,

  setupListeners: function () {
    window.closeStatsModal = () => this.toggleModal("stats-modal", false);

    let mouseDownTarget = null;
    document.addEventListener("mousedown", (e) => {
      mouseDownTarget = e.target;
    });

    // Close popover when clicking outside
    document.addEventListener("mousedown", (e) => {
      const popover = document.getElementById("global-popover");
      if (
        popover &&
        popover.classList.contains("show") &&
        !this.popoverJustOpened
      ) {
        if (!popover.contains(e.target)) {
          this.hidePopover();
        }
      }
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

  showPopover: function (rect, content) {
    let popover = document.getElementById("global-popover");
    if (!popover) {
      popover = document.createElement("div");
      popover.id = "global-popover";
      popover.className = "global-popover";

      const closeBtn = document.createElement("button");
      closeBtn.className = "close-popover";
      closeBtn.setAttribute("aria-label", "Close");

      const svgNS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(svgNS, "svg");
      svg.setAttribute("width", "14");
      svg.setAttribute("height", "14");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("stroke-width", "2");

      const line1 = document.createElementNS(svgNS, "line");
      line1.setAttribute("x1", "18");
      line1.setAttribute("y1", "6");
      line1.setAttribute("x2", "6");
      line1.setAttribute("y2", "18");
      const line2 = document.createElementNS(svgNS, "line");
      line2.setAttribute("x1", "6");
      line2.setAttribute("y1", "6");
      line2.setAttribute("x2", "18");
      line2.setAttribute("y2", "18");

      svg.appendChild(line1);
      svg.appendChild(line2);
      closeBtn.appendChild(svg);

      const contentDiv = document.createElement("div");
      contentDiv.className = "global-popover-content";

      popover.appendChild(closeBtn);
      popover.appendChild(contentDiv);

      document.body.appendChild(popover);

      popover.querySelector(".close-popover").onclick = () => {
        this.hidePopover();
      };
    }

    const contentEl = popover.querySelector(".global-popover-content");
    contentEl.innerHTML = "";

    if (typeof content === "string") {
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, "text/html");
      while (doc.body.firstChild) {
        contentEl.appendChild(doc.body.firstChild);
      }
    } else if (content instanceof Node) {
      contentEl.appendChild(content);
    }

    popover.classList.add("show");

    this.popoverJustOpened = true;
    setTimeout(() => {
      this.popoverJustOpened = false;
    }, 0);

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
      backdrop.className = "modal-backdrop open modal-prompt-backdrop";

      const modal = document.createElement("div");
      modal.className = "modal modal-prompt";

      const title = document.createElement("h3");
      title.className = "modal-prompt-title";
      title.textContent = message;

      const input = document.createElement("textarea");
      input.className = "modal-prompt-input";
      input.value = defaultValue;

      const actions = document.createElement("div");
      actions.className = "modal-prompt-actions";

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
