const SUPPORTED = ['en','de','ja','es','pt'];
const DEFAULT_LANG = 'en';

const dictionaries = Object.create(null); // in-memory cache
let currentLanguage = DEFAULT_LANG;

function pathGet(obj, path) {
  return path.split('.').reduce((o, p) => (o && o[p] != null ? o[p] : null), obj);
}

function formatParams(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

function t(key, vars) {
  const dict = dictionaries[currentLanguage] || {};
  let str = pathGet(dict, key);
  if (str == null) {
    const fallback = dictionaries[DEFAULT_LANG] || {};
    str = pathGet(fallback, key);
  }
  return str != null ? formatParams(str, vars) : key;
}

function applyTranslations(root = document) {
  // Text content
  root.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const params = el.getAttribute('data-i18n-params');
    let parsed = null;
    if (params) {
      try { parsed = JSON.parse(params); } catch {}
    }
    const text = t(key, parsed);
    if (text !== key) {
      el.textContent = text;
    }
  });

  // Attributes (placeholder, title, aria-label, etc.)
  root.querySelectorAll('[data-i18n-attr]').forEach(el => {
    // data-i18n-attr="placeholder:ui.search,title:ui.tooltip"
    const pairs = el.getAttribute('data-i18n-attr').split(',').map(s => s.trim());
    for (const pair of pairs) {
      const [attr, key] = pair.split(':').map(s => s.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    }
  });
}

async function loadLanguage(lang) {
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
  localStorage.setItem('lang', loaded);
  applyTranslations(document);
  // if (typeof updateCompanionUI === 'function') updateCompanionUI();
  // // Refresh enemy related UI
  // if (typeof getEnemyTranslatedName === 'function' && enemy && enemy.id != null) {
  //   enemy.name = getEnemyTranslatedName(enemy.id);
  //   // Update combat panel if visible
  //   const enemyPanel = document.querySelector('#enemyPanel p');
  //   if (enemyPanel) {
  //     enemyPanel.firstChild && (enemyPanel.firstChild.textContent = `${enemy.name} Lv.${enemy.lvl}`);
  //   }
  // }
}

(function initLanguage() {
  const saved = (localStorage.getItem('lang') || '').trim();
  const browser = (() => {
    let d = null;
    try {
      d = (navigator.languages && navigator.languages[0]) || navigator.language || navigator.userLanguage || null;
      if (d) d = String(d).split('-')[0];
    } catch {}
    return d;
  })();

  const initial = saved || (SUPPORTED.includes(browser) ? browser : DEFAULT_LANG);

  // Preload default for fallback; then load chosen language; then apply.
  loadLanguage(DEFAULT_LANG)
    .then(() => setLanguage(initial));
})();
