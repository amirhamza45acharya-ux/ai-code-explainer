/**
 * AI Code Explainer - Global Dark Theme Toggle Script
 * Manages persistent Dark/Light mode using localStorage
 */
(function() {
    // 1. Immediately apply saved theme to prevent white flash
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark-mode');
        if (document.body) document.body.classList.add('dark-mode');
    }

    // 2. Render floating toggle button on DOMContentLoaded
    function initThemeToggle() {
        if (savedTheme === 'dark' && document.body) {
            document.body.classList.add('dark-mode');
        }

        if (document.getElementById('theme-toggle-btn')) {
            return;
        }

        const btn = document.createElement('button');
        btn.id = 'theme-toggle-btn';
        btn.className = 'theme-toggle-btn';
        btn.type = 'button';
        btn.setAttribute('aria-label', 'Toggle Dark Mode');
        
        const isDark = document.body && document.body.classList.contains('dark-mode');
        btn.innerHTML = `<span id="theme-icon">${isDark ? '☀️ Light' : '🌙 Dark'}</span>`;

        btn.addEventListener('click', function() {
            document.body.classList.toggle('dark-mode');
            document.documentElement.classList.toggle('dark-mode');
            const nowDark = document.body.classList.contains('dark-mode');
            localStorage.setItem('theme', nowDark ? 'dark' : 'light');

            const icon = document.getElementById('theme-icon');
            if (icon) {
                icon.innerHTML = nowDark ? '☀️ Light' : '🌙 Dark';
            }
        });

        document.body.appendChild(btn);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initThemeToggle);
    } else {
        initThemeToggle();
    }
})();
