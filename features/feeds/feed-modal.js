import { Modals } from "../../components/modals.js";
import { FeedService } from "./feed-service.js";
import { State } from "../../core/state.js";
import { Tags } from "../tags/tags.js";
import { Utils } from "../../core/utils.js";
import { DB } from "../../core/db.js";
import { Events } from "../../core/events.js";

export const FeedModal = {
  isEditing: false,
  tempIconData: null,
  _inputDebounce: null,

  setupListeners: function () {
    window.closeFeedModal = () => {
      const wasEditing = this.isEditing;
      Modals.toggleModal("feed-modal", false);
      this.isEditing = false;

      if (wasEditing) {
        // Auto-save on close if editing
        const values = this._getModalValues();
        // Only update if we have an ID (editing existing feed)
        if (values.id) {
          values.iconData = values.useIcon ? this.tempIconData : null;
          FeedService.updateFeed(values);
        }
      }
    };

    document
      .getElementById("btn-new-feed")
      ?.addEventListener("click", () => this.openAddFeedModal());

    document.getElementById("btn-save-feed")?.addEventListener("click", () => {
      const values = this._getModalValues();
      values.iconData = values.useIcon ? this.tempIconData : null;

      const btn = document.getElementById("btn-save-feed");
      btn.disabled = true;
      const originalText = btn.textContent;
      btn.textContent = "Saving...";

      FeedService.addFeed(values, (id, isNew) => {
        if (isNew) {
          Events.emit(Events.FEED_SELECTED, { id });
        }
        window.closeFeedModal();
      })
        .catch(() => {
          // Error handling is done in Service (Toast), but we need to reset button
        })
        .finally(() => {
          btn.disabled = false;
          btn.textContent = originalText;
        });
    });

    const deleteBtn = document.getElementById("btn-delete-feed");
    if (deleteBtn) {
    }
  },

  openAddFeedModal: function () {
    this.isEditing = false;
    this._resetTempIconState();

    const modal = document.getElementById("feed-modal");
    document.getElementById("feed-modal-title").textContent = "Add New Feed";

    document.getElementById("feed-id-input").value = "";
    const urlInput = document.getElementById("feed-url-input");
    urlInput.value = "";
    urlInput.disabled = false;

    document.getElementById("feed-name-input").value = "";
    document.getElementById("feed-autofetch-input").checked = false;
    document.getElementById("btn-delete-feed").setAttribute("hidden", "");

    const iconToggle = document.getElementById("feed-use-icon-input");
    iconToggle.checked = false;
    iconToggle.disabled = true; // Disabled until URL processed
    this._updateIconPreview(false);

    const actionBtns = document.getElementById("feed-modal-action-buttons");
    if (actionBtns) actionBtns.removeAttribute("hidden");

    Tags.currentTags = [];
    Tags.renderTagEditor();
    Tags.renderColorPicker("color-picker-container", null);

    this._setupUrlListener();
    Modals.toggleModal("feed-modal", true);
  },

  openEditFeedModal: async function (feed) {
    this.isEditing = true;
    this._resetTempIconState();

    this.tempIconData = feed.iconData || null;

    const modal = document.getElementById("feed-modal");
    document.getElementById("feed-modal-title").textContent = "Edit Feed";

    document.getElementById("feed-id-input").value = feed.id;
    document.getElementById("feed-url-input").value = feed.url;
    document.getElementById("feed-url-input").disabled = true;
    document.getElementById("feed-name-input").value = feed.title;
    document.getElementById("feed-autofetch-input").checked = !!feed.autofetch;

    const iconToggle = document.getElementById("feed-use-icon-input");
    iconToggle.checked = !!feed.iconData;
    iconToggle.disabled = false;

    if (feed.iconData) {
      const preview = document.getElementById("feed-icon-preview");
      preview.src = feed.iconData;
      preview.removeAttribute("hidden");
    } else {
      // If editing and no icon stored, try to init preview based on URL
      this._processUrlForIcon(feed.url);
    }

    const deleteBtn = document.getElementById("btn-delete-feed");
    deleteBtn.removeAttribute("hidden");

    // Handle Delete UI interaction
    deleteBtn.onclick = () => {
      if (confirm("Are you sure you want to delete this feed?")) {
        this.isEditing = false; // Prevent auto-save
        FeedService.deleteFeed(feed.id, (deletedId) => {
          window.closeFeedModal();

          // If we were on this feed, switch to all
          if (State.currentFeedId === feed.id) {
            State.currentFeedId = "all";
            Events.emit(Events.FEED_SELECTED, { id: "all" });
          }
        });
      }
    };

    const actionBtns = document.getElementById("feed-modal-action-buttons");
    if (actionBtns) actionBtns.setAttribute("hidden", "");

    Tags.currentTags = [];
    for (const tagName of feed.tags || []) {
      const existingTag = await DB.getTag(tagName);
      Tags.currentTags.push(
        existingTag || {
          name: tagName,
          color: Utils.getRandomFromPalette(),
        },
      );
    }

    Tags.renderTagEditor();
    Tags.renderColorPicker("color-picker-container", feed.color);

    this._setupUrlListener();
    Modals.toggleModal("feed-modal", true);
  },

  _resetTempIconState: function () {
    this.tempIconData = null;
    const preview = document.getElementById("feed-icon-preview");
    const checkbox = document.getElementById("feed-use-icon-input");
    if (preview) {
      preview.src = "";
      preview.setAttribute("hidden", "");
    }
    if (checkbox) {
      checkbox.disabled = true;
    }
  },

  _setupUrlListener: function () {
    const urlInput = document.getElementById("feed-url-input");
    const iconToggle = document.getElementById("feed-use-icon-input");

    // Debounce URL input
    urlInput.oninput = (e) => {
      if (this._inputDebounce) clearTimeout(this._inputDebounce);
      this._inputDebounce = setTimeout(() => {
        this._processUrlForIcon(e.target.value);
      }, 500);
    };

    // Handle Toggle Change
    iconToggle.onchange = (e) => {
      this._updateIconPreview(true);
    };
  },

  _updateIconPreview: function (forceShow) {
    const preview = document.getElementById("feed-icon-preview");
    if (this.tempIconData) {
      preview.src = this.tempIconData;
      preview.removeAttribute("hidden");
    } else {
      preview.setAttribute("hidden", "");
    }
  },

  _processUrlForIcon: async function (url) {
    if (!url) return;
    const checkbox = document.getElementById("feed-use-icon-input");

    const normalized = Utils.ensureUrlProtocol(url);
    const result = await Utils.fetchFaviconAndColor(normalized);

    if (result) {
      this.tempIconData = result.iconData;
      checkbox.disabled = false;
      this._updateIconPreview(true);
    } else {
      this.tempIconData = null;
      checkbox.disabled = true;
      checkbox.checked = false;
      this._updateIconPreview(false);
    }
  },

  _getModalValues: function () {
    const useIcon = document.getElementById("feed-use-icon-input").checked;
    const rawUrl = document.getElementById("feed-url-input").value;

    return {
      id: document.getElementById("feed-id-input").value,
      url: Utils.ensureUrlProtocol(rawUrl),
      name: document.getElementById("feed-name-input").value.trim(),
      autofetch: document.getElementById("feed-autofetch-input").checked,
      color: Tags.selectedColor,
      tags: Tags.currentTags,
      useIcon: useIcon,
    };
  },
};
