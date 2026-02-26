import { DB } from "../../core/db.js";
import { Utils } from "../../core/utils.js";
import { State } from "../../core/state.js";
import { Config } from "../../core/config.js";
import DOMPurify from "dompurify";

export const Tags = {
  currentTags: [], // Tags for the currently editing feed (Array of Objects {name, color})
  editingTag: null, // The specific tag being color-edited
  selectedColor: null, // For feed color picker

  setupGenericTagInput: function (inputElement, options = {}) {
    const { onTagAdded, getExclusions, onlyExisting } = options;

    const triggerSearch = async () => {
      const val = inputElement.value.trim().toLowerCase();
      const allTags = await DB.getAllTags();

      const exclusions = getExclusions ? getExclusions() : [];
      const exclusionSet = new Set(exclusions.map((t) => t.toLowerCase()));

      const matches = allTags.filter(
        (t) =>
          t.name.toLowerCase().includes(val) &&
          !exclusionSet.has(t.name.toLowerCase()),
      );

      this.showAutocomplete(inputElement, matches, (item) => {
        if (onTagAdded) onTagAdded(item);
        inputElement.value = "";
        inputElement.focus();
        triggerSearch();
      });
    };

    inputElement.addEventListener("input", triggerSearch);
    inputElement.addEventListener("focus", triggerSearch);

    inputElement.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const val = inputElement.value.trim();
        if (!val) return;

        document.getElementById("global-autocomplete").classList.remove("show");

        // Check if already selected (if getExclusions provided)
        if (getExclusions) {
          const exclusions = getExclusions();
          if (exclusions.some((t) => t.toLowerCase() === val.toLowerCase())) {
            inputElement.value = "";
            return;
          }
        }

        const existing = await DB.getTag(val);

        if (onlyExisting && !existing) {
          Utils.showToast(`Tag "${val}" not found`);
          inputElement.value = "";
          return;
        }

        const newTag = {
          name: existing ? existing.name : val,
          color: existing ? existing.color : Utils.getRandomFromPalette(),
        };

        if (onTagAdded) onTagAdded(newTag);
        inputElement.value = "";
        triggerSearch();
      }
    });

    inputElement.addEventListener("blur", () => {
      setTimeout(() => {
        const active = document.activeElement;
        if (active !== inputElement) {
          const autocomplete = document.getElementById("global-autocomplete");
          if (autocomplete) autocomplete.classList.remove("show");
        }
      }, 150);
    });
  },

  setupTagInputs: function (onFilterUpdateCallback) {
    // Global Autocomplete closer
    document.addEventListener("click", (e) => {
      const container = document.getElementById("global-autocomplete");
      if (
        container &&
        !container.contains(e.target) &&
        !e.target.classList.contains("autocomplete-input-target")
      ) {
        container.classList.remove("show");
      }
    });

    // 1. Feed Modal Input
    const feedInput = document.getElementById("feed-tags-input");
    if (feedInput) {
      this.setupGenericTagInput(feedInput, {
        getExclusions: () => this.currentTags.map((t) => t.name),
        onTagAdded: (tag) => {
          this.currentTags.push(tag);
          this.renderTagEditor();
        },
      });
    }

    // 2. Filter Bar Input
    const filterInput = document.getElementById("filter-tag-input");
    if (filterInput) {
      this.setupGenericTagInput(filterInput, {
        getExclusions: () => State.filters.tags,
        onlyExisting: true,
        onTagAdded: (tag) => {
          State.filters.tags.push(tag.name);
          State.saveFilters();
          if (onFilterUpdateCallback) onFilterUpdateCallback();
        },
      });
    }
  },

  showAutocomplete: function (input, items, onSelect) {
    const container = document.getElementById("global-autocomplete");
    container.innerHTML = "";

    input.classList.add("autocomplete-input-target");

    if (items.length === 0) {
      container.classList.remove("show");
      return;
    }

    items.forEach((item) => {
      const div = document.createElement("div");
      div.className = "autocomplete-item";

      const span = document.createElement("span");
      span.className = "tag-dot";
      span.style.setProperty("--tag-color", item.color || "#ccc");

      div.appendChild(span);
      div.appendChild(document.createTextNode(" " + item.name));

      div.addEventListener("mousedown", (e) => {
        e.preventDefault();
        onSelect(item);
      });
      container.appendChild(div);
    });

    const wrapper = input.parentElement;
    const rect = wrapper.getBoundingClientRect();

    container.style.top = `${rect.bottom + 4}px`;
    container.style.left = `${rect.left}px`;
    container.style.width = `${rect.width}px`;
    container.classList.add("show");
  },

  setupTagColorPopup: function () {
    const popup = document.getElementById("tag-color-popup");
    const swatches = document.getElementById("tag-color-popup-swatches");

    Config.COLOR_PALETTE.forEach((color) => {
      const swatch = document.createElement("div");
      swatch.className = "color-swatch";
      swatch.style.setProperty("--swatch-color", color);
      swatch.onclick = (e) => {
        e.stopPropagation();
        if (this.editingTag) {
          this.editingTag.color = color;
          if (this.editingTag.index !== undefined) {
            this.currentTags[this.editingTag.index] = {
              ...this.currentTags[this.editingTag.index],
              color: color,
            };
          }
          this.renderTagEditor();
        }
        popup.style.display = "none";
      };
      swatches.appendChild(swatch);
    });

    document.addEventListener("click", (e) => {
      if (popup.style.display === "block" && !popup.contains(e.target)) {
        popup.style.display = "none";
      }
    });
  },

  renderTagEditor: function () {
    const container = document.getElementById("feed-tags-list");
    if (!container) return;
    container.innerHTML = "";

    this.currentTags.forEach((tag, index) => {
      const pill = document.createElement("span");
      pill.className = "tag-pill";
      pill.style.setProperty("--tag-color", tag.color);
      pill.textContent = tag.name;
      pill.title = "Click to change color";

      pill.onclick = (e) => {
        e.stopPropagation();
        this.editingTag = { ...tag, index };

        const popup = document.getElementById("tag-color-popup");
        const rect = pill.getBoundingClientRect();

        popup.style.display = "block";
        popup.style.left = `${Math.max(10, rect.left)}px`;
        popup.style.top = `${rect.top - popup.offsetHeight - 5}px`;
      };

      const removeBtn = document.createElement("span");
      removeBtn.className = "remove-tag";
      removeBtn.textContent = "\u00D7"; // × character
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        this.currentTags.splice(index, 1);
        this.renderTagEditor();
        document.getElementById("tag-color-popup").style.display = "none";
      };

      pill.appendChild(removeBtn);
      container.appendChild(pill);
    });
  },

  renderColorPicker: function (containerId, initialColor) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = "";
    this.selectedColor = initialColor || null;

    const noneOpt = document.createElement("div");
    noneOpt.className = `color-swatch color-none ${!initialColor ? "selected" : ""}`;
    noneOpt.title = "No Color";
    noneOpt.onclick = () => {
      this.selectedColor = null;
      container
        .querySelectorAll(".color-swatch")
        .forEach((el) => el.classList.remove("selected"));
      noneOpt.classList.add("selected");
    };
    container.appendChild(noneOpt);

    Config.COLOR_PALETTE.forEach((color) => {
      const swatch = document.createElement("div");
      swatch.className = `color-swatch ${color === initialColor ? "selected" : ""}`;
      swatch.style.setProperty("--swatch-color", color);
      swatch.title = color;
      swatch.onclick = () => {
        this.selectedColor = color;
        container
          .querySelectorAll(".color-swatch")
          .forEach((el) => el.classList.remove("selected"));
        swatch.classList.add("selected");
      };
      container.appendChild(swatch);
    });
  },
};
