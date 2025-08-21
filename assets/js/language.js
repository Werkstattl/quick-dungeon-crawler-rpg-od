const translations = {
    en: {
        'tap-to-explore': 'Tap to explore the dungeon',
        'language': 'Language'
    }
};

let currentLanguage = 'en';

function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const translation = translations[currentLanguage] && translations[currentLanguage][key];
        if (translation) {
            el.textContent = translation;
        }
    });
}

function setLanguage(lang) {
    if (!translations[lang]) {
        lang = 'en';
    }
    currentLanguage = lang;
    document.documentElement.lang = lang;
    localStorage.setItem('lang', lang);
    applyTranslations();
}

(function initLanguage() {
    const saved = localStorage.getItem('lang');
    const savedClean = saved && saved.trim() ? saved : null;

    if (savedClean) {
        // If there's a saved language, use it (setLanguage will validate)
        setLanguage(savedClean);
        return;
    }

    // No saved language: try the browser/system language and ensure we have a translation
    let detected = null;
    try {
        if (typeof navigator !== 'undefined') {
            detected = (navigator.languages && navigator.languages[0]) || navigator.language || navigator.userLanguage || null;
            if (detected) detected = String(detected).split('-')[0];
        }
    } catch (e) {
        detected = null;
    }

    if (detected && translations[detected]) {
        setLanguage(detected);
    }
})();

