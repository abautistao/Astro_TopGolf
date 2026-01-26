/**
 * CLIENT-SIDE ONLY
 * Checks if dark mode is currently active by reading from localStorage.
 * @returns {boolean} True if dark mode is active, otherwise false.
 */
export const isDarkModeActive = () => {
    if (typeof window !== 'undefined') {
        return window.localStorage.getItem('theme') === 'dark';
    }
    return false;
};

/**
 * CLIENT-SIDE ONLY
 * Listens for theme changes and executes a callback function.
 * Immediately invokes the callback with the current theme state on registration.
 * @param {(theme: 'dark' | 'light') => void} callback The function to execute when the theme changes.
 */
export const onThemeChange = (callback) => {
    if (typeof document !== 'undefined') {
        // Immediately call with current theme
        const currentTheme = window.localStorage.getItem('theme') === 'dark' ? 'dark' : 'light';
        callback(currentTheme);

        // Listen for future changes
        document.addEventListener('theme-changed', (event) => {
            if (event.detail && event.detail.theme) {
                callback(event.detail.theme);
            }
        });
    }
};
