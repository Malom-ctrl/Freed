

window.Freed = window.Freed || {};

window.Freed.Feeds = {
    isEditing: false,

    openAddFeedModal: function() {
        const { Tags, Utils } = window.Freed;
        this.isEditing = false;
        const modal = document.getElementById('feed-modal');
        document.getElementById('feed-modal-title').textContent = 'Add New Feed';
        
        document.getElementById('feed-id-input').value = '';
        document.getElementById('feed-url-input').value = '';
        document.getElementById('feed-url-input').disabled = false;
        document.getElementById('feed-name-input').value = '';
        document.getElementById('feed-autofetch-input').checked = false; // Default false
        document.getElementById('btn-delete-feed').style.display = 'none';
        
        const actionBtns = document.getElementById('feed-modal-action-buttons');
        if(actionBtns) actionBtns.style.display = 'flex';
        
        Tags.currentTags = [];
        Tags.renderTagEditor();
        Tags.renderColorPicker('color-picker-container', null);
        modal.classList.add('open');
    },

    openEditFeedModal: async function(feed) {
        const { Tags, DB, Utils } = window.Freed;
        this.isEditing = true;
        const modal = document.getElementById('feed-modal');
        document.getElementById('feed-modal-title').textContent = 'Edit Feed';
        
        document.getElementById('feed-id-input').value = feed.id;
        document.getElementById('feed-url-input').value = feed.url;
        document.getElementById('feed-url-input').disabled = true;
        document.getElementById('feed-name-input').value = feed.title;
        document.getElementById('feed-autofetch-input').checked = !!feed.autofetch;
        
        const deleteBtn = document.getElementById('btn-delete-feed');
        deleteBtn.style.display = 'block';
        deleteBtn.onclick = () => this.handleDeleteFeed(feed.id);

        const actionBtns = document.getElementById('feed-modal-action-buttons');
        if(actionBtns) actionBtns.style.display = 'none';

        const allTags = await DB.getAllTags();
        const tagMap = new Map(allTags.map(t => [t.name, t]));
        
        Tags.currentTags = (feed.tags || []).map(tagName => {
            return tagMap.get(tagName) || { name: tagName, color: Utils.getRandomFromPalette() };
        });

        Tags.renderTagEditor();
        Tags.renderColorPicker('color-picker-container', feed.color);
        modal.classList.add('open');
    },

    // --- Helpers ---

    _getModalValues: function() {
        const { Tags } = window.Freed;
        return {
            id: document.getElementById('feed-id-input').value,
            url: document.getElementById('feed-url-input').value.trim(),
            name: document.getElementById('feed-name-input').value.trim(),
            autofetch: document.getElementById('feed-autofetch-input').checked,
            color: Tags.selectedColor,
            tags: Tags.currentTags
        };
    },

    _saveTags: async function(tags) {
        const { DB } = window.Freed;
        for (const tag of tags) {
            await DB.saveTag(tag);
        }
    },

    _triggerAutofetch: async function(feed) {
        const { DB, Service, Config, Utils } = window.Freed;
        const contentRetentionDays = parseInt(localStorage.getItem('cleanup_content_days') || Config.DEFAULTS.CLEANUP_CONTENT_DAYS);
        const articles = await DB.getArticlesByFeed(feed.id);
        
        if (articles.length > 0) {
            Utils.showToast(`Background fetch started`);
            Service.processAutofetch(feed, articles, contentRetentionDays, () => {
                if (window.Freed.App && window.Freed.App.refreshUI) {
                    window.Freed.App.refreshUI();
                }
            });
        }
    },

    // --- Actions ---

    saveCurrentEdit: async function() {
        const { DB, Utils } = window.Freed;
        const values = this._getModalValues();
        
        if (!values.id) return;

        try {
            // Check for tag color changes
            const allTags = await DB.getAllTags();
            const dbTagMap = new Map(allTags.map(t => [t.name, t.color]));
            let tagsColorChanged = false;
            for (const t of values.tags) {
                 if (dbTagMap.get(t.name) !== t.color) {
                     tagsColorChanged = true;
                     break;
                 }
            }

            const feeds = await DB.getAllFeeds();
            const feed = feeds.find(f => f.id === values.id);
            
            if (feed) {
                const tagNames = values.tags.map(t => t.name);
                let feedChanged = false;
                let autofetchTriggered = false;

                if(feed.title !== values.name && values.name) { feed.title = values.name; feedChanged = true; }
                if(feed.color !== values.color) { feed.color = values.color; feedChanged = true; }
                if(JSON.stringify(feed.tags) !== JSON.stringify(tagNames)) { feed.tags = tagNames; feedChanged = true; }
                
                if(feed.autofetch !== values.autofetch) { 
                    feed.autofetch = values.autofetch; 
                    feedChanged = true; 
                    if (values.autofetch) autofetchTriggered = true;
                }

                if (feedChanged || tagsColorChanged) {
                    await this._saveTags(values.tags);
                    if (feedChanged) await DB.saveFeed(feed);
                    await DB.cleanupOrphanedTags();
                    
                    if (autofetchTriggered) {
                        this._triggerAutofetch(feed);
                    } else {
                        Utils.showToast(`Saved changes`);
                    }

                    if (window.Freed.App && window.Freed.App.refreshUI) {
                        window.Freed.App.refreshUI();
                    }
                }
            }
        } catch(e) {
            console.error("Auto-save failed", e);
        }
    },

    handleSaveFeed: async function(onSuccessCallback) {
        const { DB, Service, Utils } = window.Freed;
        const values = this._getModalValues();

        if (!values.url) return;

        const btn = document.getElementById('btn-save-feed');
        btn.disabled = true;
        const originalText = btn.textContent;
        btn.textContent = 'Saving...';

        try {
            await this._saveTags(values.tags);
            const tagNames = values.tags.map(t => t.name);

            // Create New Feed
            const tempId = 'temp-' + Date.now();
            const result = await Service.fetchAndParseFeed({ id: tempId, url: values.url, title: 'Temp' });
            
            if (!result.articles || result.articles.length === 0) throw new Error('No articles found');
            
            const finalTitle = values.name || result.articles[0].feedTitle || 'New Feed';
            
            const newFeed = { 
                id: Date.now().toString(), 
                url: values.url, 
                title: finalTitle,
                color: values.color,
                type: result.type || 'rss',
                parsingRule: result.parsingRule,
                tags: tagNames,
                autofetch: values.autofetch
            };
            
            await DB.saveFeed(newFeed);
            await DB.saveArticles(result.articles.map(a => ({...a, feedId: newFeed.id, feedTitle: finalTitle})));
            
            Utils.showToast(`Added ${finalTitle}`);
            
            if (onSuccessCallback) onSuccessCallback(newFeed.id, true);
            
            await DB.cleanupOrphanedTags();
            window.closeFeedModal();

            if (newFeed.autofetch) {
                 this._triggerAutofetch(newFeed);
            }
            
        } catch (e) {
            console.error(e);
            Utils.showToast('Error saving feed. Check URL.');
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    },

    handleDeleteFeed: async function(id, onDeleteCallback) {
        if (!confirm('Are you sure you want to delete this feed?')) return;
        this.isEditing = false; // Prevent auto-save on close
        await window.Freed.DB.deleteFeed(id);
        await window.Freed.DB.cleanupOrphanedTags();
        window.Freed.Utils.showToast('Feed deleted');
        window.closeFeedModal();
        if (onDeleteCallback) onDeleteCallback(id);
    }
};
