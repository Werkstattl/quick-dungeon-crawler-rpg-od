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
    setLanguage(saved || 'en');
})();

