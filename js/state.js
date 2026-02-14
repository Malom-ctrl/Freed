window.Freed = window.Freed || {};

window.Freed.State = {
    currentFeedId: 'all',
    currentArticleGuid: null,
    showArticleImages: true,
    filters: {
        status: 'all',
        date: 'all',
        search: '',
        tags: []
    },
    
    load: function() {
        // Load Filters
        const savedFilters = localStorage.getItem('freed_filters');
        if (savedFilters) {
            const parsed = JSON.parse(savedFilters);
            this.filters = { ...this.filters, ...parsed };
        }

        // Load Image Preference
        const savedShowImages = localStorage.getItem('freed_show_images');
        this.showArticleImages = savedShowImages === null ? true : (savedShowImages === 'true');
    },

    saveFilters: function() {
        localStorage.setItem('freed_filters', JSON.stringify(this.filters));
    }
};