const SUPPORTED = ['en','de','ja','es','pt','ro','ru','uk','zh','zh-Hant','fr','it','ko','pl','tr','ar','fa','hi','bn','id','fil','th','vi','nl','sv','fi','ms','da','nb','cs'];
const LANGUAGE_LABELS = {
  en: 'English',
  de: 'Deutsch',
  ja: '日本語',
  es: 'Español',
  pt: 'Português (Brasil)',
  ro: 'Română',
  ru: 'Русский',
  uk: 'Українська',
  zh: '简体中文',
  'zh-Hant': '繁體中文',
  fr: 'Français',
  it: 'Italiano',
  ko: '한국어',
  pl: 'Polski',
  tr: 'Türkçe',
  ar: 'العربية',
  fa: 'فارسی',
  hi: 'हिन्दी',
  bn: 'বাংলা',
  id: 'Bahasa Indonesia',
  fil: 'Filipino',
  th: 'ไทย',
  vi: 'Tiếng Việt',
  nl: 'Nederlands',
  sv: 'Svenska',
  fi: 'Suomi',
  ms: 'Bahasa Melayu',
  da: 'Dansk',
  nb: 'Norsk bokmål',
  cs: 'Čeština'
};
const LANGUAGE_OPTIONS = SUPPORTED.map(code => ({
  code,
  label: LANGUAGE_LABELS[code] || code
}));

window.supportedLanguages = SUPPORTED.slice();
window.languageOptions = LANGUAGE_OPTIONS.slice();
const DEFAULT_LANG = 'en';
const LANGUAGE_ALIASES = { no: 'nb', tl: 'fil' };
const RTL_LANGUAGES = new Set(['ar', 'fa']);

function normalizeLanguageTag(lang) {
  const tag = String(lang || '').trim().replace(/_/g, '-');
  const parts = tag.toLowerCase().split('-');
  const base = parts[0];

  if (base === 'zh') {
    const traditionalRegions = ['tw', 'hk', 'mo'];
    if (parts.includes('hant') || traditionalRegions.includes(parts[1])) {
      return 'zh-Hant';
    }
    return 'zh';
  }

  return LANGUAGE_ALIASES[base] || base;
}

const dictionaries = Object.create(null); // in-memory cache
let currentLanguage = DEFAULT_LANG;

function pathGet(obj, path) {
  return path.split('.').reduce((o, p) => (o && o[p] != null ? o[p] : null), obj);
}

function formatParams(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

function getTranslationValue(key) {
  const dict = dictionaries[currentLanguage] || {};
  let value = pathGet(dict, key);
  if (value == null) {
    const fallback = dictionaries[DEFAULT_LANG] || {};
    value = pathGet(fallback, key);
  }
  return value;
}

function t(key, vars) {
  const value = getTranslationValue(key);
  return typeof value === 'string' ? formatParams(value, vars) : key;
}

function tRandom(key) {
  const value = getTranslationValue(key);
  const choices = Array.isArray(value)
    ? value
    : (value && typeof value === 'object' ? Object.values(value) : []);
  const messages = choices.filter(choice => typeof choice === 'string');
  if (!messages.length) {
    return typeof value === 'string' ? value : key;
  }
  const randomIndex = Math.floor(Math.random() * messages.length);
  return messages[randomIndex];
}

function applyTranslations(root = document) {
  // Text content
  root.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const params = el.getAttribute('data-i18n-params');
    let parsed = null;
    if (params) {
      try { parsed = JSON.parse(params); } catch (e) {}
    }
    const text = t(key, parsed);
    if (text !== key) {
      el.textContent = text;
    }
  });

  // Attributes (placeholder, title, aria-label, etc.)
  const SAFE_ATTRS = new Set(['placeholder', 'title', 'aria-label', 'aria-placeholder', 'aria-description', 'alt', 'label']);
  root.querySelectorAll('[data-i18n-attr]').forEach(el => {
    // data-i18n-attr="placeholder:ui.search,title:ui.tooltip"
    const pairs = el.getAttribute('data-i18n-attr').split(',').map(s => s.trim());
    for (const pair of pairs) {
      const [attr, key] = pair.split(':').map(s => s.trim());
      if (attr && key && SAFE_ATTRS.has(attr)) el.setAttribute(attr, t(key));
    }
  });
}

async function loadLanguage(lang) {
  lang = normalizeLanguageTag(lang);
  if (!SUPPORTED.includes(lang)) lang = DEFAULT_LANG;
  if (dictionaries[lang]) return lang;
  try {
    const res = await fetch(`./assets/locales/${lang}.json`);
    const data = await res.json();
    dictionaries[lang] = data;
  } catch (e) {
    // Fallback to default on error
    if (!dictionaries[DEFAULT_LANG]) {
      const res = await fetch(`./assets/locales/${DEFAULT_LANG}.json`);
      dictionaries[DEFAULT_LANG] = await res.json();
    }
    lang = DEFAULT_LANG;
  }
  return lang;
}

async function setLanguage(lang) {
  const loaded = await loadLanguage(lang);
  currentLanguage = loaded;
  document.documentElement.lang = loaded;
  document.documentElement.dir = RTL_LANGUAGES.has(loaded) ? 'rtl' : 'ltr';
  localStorage.setItem('lang', loaded);
  applyTranslations(document);
  if (typeof refreshPurchaseUI === 'function') refreshPurchaseUI(document);
}

(function initLanguage() {
  const saved = (localStorage.getItem('lang') || '').trim();
  const browser = (() => {
    let d = null;
    try {
      d = (navigator.languages && navigator.languages[0]) || navigator.language || navigator.userLanguage || null;
      if (d) d = String(d).trim();
    } catch (e) {}
    return d;
  })();

  const initial = saved || normalizeLanguageTag(browser);

  // Preload default for fallback; then load chosen language; then apply.
  loadLanguage(DEFAULT_LANG)
    .then(() => setLanguage(initial));
})();
