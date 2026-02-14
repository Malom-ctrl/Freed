window.Freed = window.Freed || {};

window.Freed.Utils = {
    divToText: function(html) {
        const tmp = document.createElement('DIV');
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || '';
    },

    showToast: function(msg) {
        const toast = document.getElementById('toast');
        if (!toast) return;
        toast.textContent = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    },

    getRandomFromPalette: function() {
        if (!window.Freed.Config || !window.Freed.Config.COLOR_PALETTE) return '#64748b';
        const palette = window.Freed.Config.COLOR_PALETTE;
        return palette[Math.floor(Math.random() * palette.length)];
    }
};