window.Freed = window.Freed || {};

window.Freed.Theme = {
    apply: function(theme) {
        if (theme === 'system') {
            delete document.body.dataset.theme;
        } else {
            document.body.dataset.theme = theme;
        }
        
        // Update Meta Theme Color for mobile browsers
        setTimeout(() => {
            const computedStyle = getComputedStyle(document.body);
            const bgColor = computedStyle.getPropertyValue('--bg-body').trim();
            const metaTheme = document.querySelector('meta[name="theme-color"]');
            if (metaTheme && bgColor) {
                metaTheme.setAttribute('content', bgColor);
            }
        }, 50);
    },
    
    init: function() {
        const savedTheme = localStorage.getItem('freed_theme') || 'system';
        this.apply(savedTheme);
    }
};