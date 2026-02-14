

window.Freed = window.Freed || {};

window.Freed.Config = {
    APP_VERSION: '1.0.0',
    DB_NAME: 'freed_db',
    DB_VERSION: 2,
    COLOR_PALETTE: [
        '#ef4444', // Red
        '#f97316', // Orange
        '#f59e0b', // Amber
        '#eab308', // Yellow
        '#84cc16', // Lime
        '#10b981', // Emerald
        '#14b8a6', // Teal
        '#06b6d4', // Cyan
        '#0ea5e9', // Sky
        '#3b82f6', // Blue
        '#6366f1', // Indigo
        '#8b5cf6', // Violet
        '#a855f7', // Purple
        '#d946ef', // Fuchsia
        '#ec4899', // Pink
        '#f43f5e', // Rose
        '#64748b'  // Slate
    ],
    DEFAULT_FEEDS: [
        { id: '1', url: 'https://feeds.bbci.co.uk/news/technology/rss.xml', title: 'BBC Tech', color: '#ef4444', tags: ['Tech'] },
        { id: '2', url: 'https://techcrunch.com/feed/', title: 'TechCrunch', color: '#10b981', tags: ['Tech', 'Startup'] },
        { id: '3', url: 'https://www.theverge.com/rss/index.xml', title: 'The Verge', color: '#8b5cf6', tags: ['Tech', 'Culture'] }
    ],
    DEFAULTS: {
        CLEANUP_UNREAD_DAYS: 30,
        CLEANUP_CONTENT_DAYS: 7,
        CLEANUP_READ_DAYS: 365
    }
};