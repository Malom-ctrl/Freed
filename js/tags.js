window.Freed = window.Freed || {};

window.Freed.Tags = {
    currentTags: [], // Tags for the currently editing feed (Array of Objects {name, color})
    editingTag: null, // The specific tag being color-edited
    selectedColor: null, // For feed color picker

    setupTagInputs: function(onFilterUpdateCallback) {
        const { DB, Utils, State } = window.Freed;
        
        // Global Autocomplete closer
        document.addEventListener('click', (e) => {
            const container = document.getElementById('global-autocomplete');
            if (container && !container.contains(e.target) && !e.target.classList.contains('autocomplete-input-target')) {
                container.classList.remove('show');
            }
        });

        const triggerSearch = async (input, type) => {
            const val = input.value.trim().toLowerCase();
            const allTags = await DB.getAllTags();
            let matches = [];

            if (type === 'feed') {
                matches = allTags.filter(t => 
                    t.name.toLowerCase().includes(val) && 
                    !this.currentTags.find(ct => ct.name === t.name)
                );
            } else if (type === 'filter') {
                matches = allTags.filter(t => 
                    t.name.toLowerCase().includes(val) && 
                    !State.filters.tags.includes(t.name)
                );
            }

            this.showAutocomplete(input, matches, (item) => {
                if (type === 'feed') {
                    this.currentTags.push(item);
                    this.renderTagEditor();
                    input.value = '';
                    document.getElementById('global-autocomplete').classList.remove('show');
                } else if (type === 'filter') {
                    State.filters.tags.push(item.name);
                    State.saveFilters();
                    if(onFilterUpdateCallback) onFilterUpdateCallback();
                    
                    input.value = '';
                    input.focus();
                    triggerSearch(input, type); 
                }
            });
        };

        // 1. Feed Modal Input
        const feedInput = document.getElementById('feed-tags-input');
        if (feedInput) {
            feedInput.addEventListener('input', () => triggerSearch(feedInput, 'feed'));
            feedInput.addEventListener('focus', () => triggerSearch(feedInput, 'feed'));
            
            feedInput.addEventListener('keydown', async (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const val = feedInput.value.trim();
                    if (!val) return;
                    
                    document.getElementById('global-autocomplete').classList.remove('show');

                    if (this.currentTags.find(t => t.name.toLowerCase() === val.toLowerCase())) {
                        feedInput.value = '';
                        return; 
                    }

                    const allTags = await DB.getAllTags();
                    const existing = allTags.find(t => t.name.toLowerCase() === val.toLowerCase());
                    
                    const newTag = {
                        name: existing ? existing.name : val, 
                        color: existing ? existing.color : Utils.getRandomFromPalette()
                    };
                    
                    this.currentTags.push(newTag);
                    this.renderTagEditor();
                    feedInput.value = '';
                }
            });

            feedInput.addEventListener('blur', () => {
                setTimeout(() => {
                    const active = document.activeElement;
                    if (active !== feedInput) {
                        document.getElementById('global-autocomplete').classList.remove('show');
                    }
                }, 150);
            });
        }

        // 2. Filter Bar Input
        const filterInput = document.getElementById('filter-tag-input');
        if (filterInput) {
            filterInput.addEventListener('input', () => triggerSearch(filterInput, 'filter'));
            filterInput.addEventListener('focus', () => triggerSearch(filterInput, 'filter'));

            filterInput.addEventListener('keydown', async (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const val = filterInput.value.trim();
                    if (!val) return;

                    document.getElementById('global-autocomplete').classList.remove('show');

                    const allTags = await DB.getAllTags();
                    const existing = allTags.find(t => t.name.toLowerCase() === val.toLowerCase());
                    
                    if (existing && !State.filters.tags.includes(existing.name)) {
                        State.filters.tags.push(existing.name);
                        State.saveFilters();
                        if(onFilterUpdateCallback) onFilterUpdateCallback();
                        filterInput.value = '';
                        triggerSearch(filterInput, 'filter');
                    } else if (!existing) {
                        Utils.showToast(`Tag "${val}" not found`);
                        filterInput.value = '';
                    }
                }
            });

            filterInput.addEventListener('blur', () => {
                setTimeout(() => {
                    const active = document.activeElement;
                    if (active !== filterInput) {
                        document.getElementById('global-autocomplete').classList.remove('show');
                    }
                }, 150);
            });
        }
    },

    showAutocomplete: function(input, items, onSelect) {
        const container = document.getElementById('global-autocomplete');
        container.innerHTML = '';
        
        input.classList.add('autocomplete-input-target');

        if (items.length === 0) {
            container.classList.remove('show');
            return;
        }

        items.forEach(item => {
            const div = document.createElement('div');
            div.className = 'autocomplete-item';
            div.innerHTML = `<span class="tag-dot" style="background-color: ${item.color || '#ccc'}"></span> ${item.name}`;
            div.addEventListener('mousedown', (e) => {
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
        container.classList.add('show');
    },

    setupTagColorPopup: function() {
        const popup = document.getElementById('tag-color-popup');
        const swatches = document.getElementById('tag-color-popup-swatches');
        const { Config } = window.Freed;
        
        Config.COLOR_PALETTE.forEach(color => {
            const swatch = document.createElement('div');
            swatch.className = 'color-swatch';
            swatch.style.backgroundColor = color;
            swatch.onclick = (e) => {
                e.stopPropagation();
                if (this.editingTag) {
                    this.editingTag.color = color;
                    if (this.editingTag.index !== undefined) {
                         this.currentTags[this.editingTag.index] = { ...this.currentTags[this.editingTag.index], color: color };
                    }
                    this.renderTagEditor();
                }
                popup.style.display = 'none';
            };
            swatches.appendChild(swatch);
        });

        document.addEventListener('click', (e) => {
            if (popup.style.display === 'block' && !popup.contains(e.target)) {
                popup.style.display = 'none';
            }
        });
    },

    renderTagEditor: function() {
        const container = document.getElementById('feed-tags-list');
        if (!container) return;
        container.innerHTML = '';
        
        this.currentTags.forEach((tag, index) => {
            const pill = document.createElement('span');
            pill.className = 'tag-pill';
            pill.style.backgroundColor = tag.color;
            pill.style.color = '#fff';
            pill.textContent = tag.name;
            pill.title = "Click to change color";
            pill.style.cursor = 'pointer';
            
            pill.onclick = (e) => {
                e.stopPropagation();
                this.editingTag = { ...tag, index };
                
                const popup = document.getElementById('tag-color-popup');
                const rect = pill.getBoundingClientRect();
                
                popup.style.display = 'block';
                popup.style.left = `${Math.max(10, rect.left)}px`;
                popup.style.top = `${rect.top - popup.offsetHeight - 5}px`;
            };

            const removeBtn = document.createElement('span');
            removeBtn.className = 'remove-tag';
            removeBtn.innerHTML = '&times;';
            removeBtn.onclick = (e) => {
                e.stopPropagation();
                this.currentTags.splice(index, 1);
                this.renderTagEditor();
                document.getElementById('tag-color-popup').style.display = 'none';
            };
            
            pill.appendChild(removeBtn);
            container.appendChild(pill);
        });
    },

    renderColorPicker: function(containerId, initialColor) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';
        this.selectedColor = initialColor || null;
        const { Config } = window.Freed;

        const noneOpt = document.createElement('div');
        noneOpt.className = `color-swatch color-none ${!initialColor ? 'selected' : ''}`;
        noneOpt.title = 'No Color';
        noneOpt.onclick = () => {
            this.selectedColor = null;
            container.querySelectorAll('.color-swatch').forEach(el => el.classList.remove('selected'));
            noneOpt.classList.add('selected');
        }
        container.appendChild(noneOpt);

        Config.COLOR_PALETTE.forEach(color => {
            const swatch = document.createElement('div');
            swatch.className = `color-swatch ${color === initialColor ? 'selected' : ''}`;
            swatch.style.backgroundColor = color;
            swatch.title = color;
            swatch.onclick = () => {
                this.selectedColor = color;
                container.querySelectorAll('.color-swatch').forEach(el => el.classList.remove('selected'));
                swatch.classList.add('selected');
            };
            container.appendChild(swatch);
        });
    }
};