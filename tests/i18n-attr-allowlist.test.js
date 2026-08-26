const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const languageSource = fs.readFileSync(path.join(root, 'assets/js/language.js'), 'utf8');

// Expose applyTranslations and a dict-setter for testing
const harness = `
  globalThis._applyTranslations = applyTranslations;
  globalThis._loadLanguage = loadLanguage;
  globalThis._setLanguage = setLanguage;
  globalThis._setDict = (lang, dict) => { dictionaries[lang] = dict; currentLanguage = lang; };
`;

function makeContext() {
    const ctx = vm.createContext({
        window: {},
        localStorage: { getItem: () => null, setItem: () => {} },
        navigator: { languages: ['en'], language: 'en' },
        fetch: () => Promise.resolve({ json: () => Promise.resolve({}) }),
        document: {
            addEventListener() {},
            documentElement: { lang: '' },
            querySelectorAll: () => [],
        },
        performance: { now: () => 0 },
        setTimeout: () => 0,
        clearTimeout() {},
    });
    vm.runInContext(languageSource + harness, ctx);
    ctx._setDict('en', { 'test-key': 'Search' });
    return ctx;
}

function makeRoot(attrSpec) {
    const attrs = {};
    const el = {
        getAttribute(name) {
            if (name === 'data-i18n-attr') return attrSpec;
            return null;
        },
        setAttribute(name, value) { attrs[name] = value; },
        attrs,
    };
    return {
        querySelectorAll(selector) {
            if (selector === '[data-i18n]') return [];
            if (selector === '[data-i18n-attr]') return [el];
            return [];
        },
        el,
    };
}

test('allowlisted attribute aria-label is translated', () => {
    const ctx = makeContext();
    const mockRoot = makeRoot('aria-label:test-key');
    ctx._applyTranslations(mockRoot);

    assert.equal(mockRoot.el.attrs['aria-label'], 'Search');
});

test('non-allowlisted attribute onclick is silently ignored', () => {
    const ctx = makeContext();
    const mockRoot = makeRoot('onclick:test-key');
    ctx._applyTranslations(mockRoot);

    assert.equal(mockRoot.el.attrs['onclick'], undefined);
});

test('Norwegian macrolanguage code loads the Bokmål locale', async () => {
    const ctx = makeContext();

    assert.equal(await ctx._loadLanguage('no'), 'nb');
});

test('Filipino is available and legacy Tagalog tags load the Filipino locale', async () => {
    const ctx = makeContext();

    for (const tag of ['fil', 'fil-PH', 'tl', 'tl-PH']) {
        assert.equal(await ctx._loadLanguage(tag), 'fil');
    }
    assert.ok(Array.from(ctx.window.supportedLanguages).includes('fil'));
    assert.ok(Array.from(ctx.window.languageOptions).some((option) => (
        option.code === 'fil' && option.label === 'Filipino'
    )));
});

test('Traditional Chinese language tags load the zh-Hant locale', async () => {
    const ctx = makeContext();

    for (const tag of ['zh-Hant', 'zh-TW', 'zh-HK', 'zh-MO', 'zh_Hant_TW']) {
        assert.equal(await ctx._loadLanguage(tag), 'zh-Hant');
    }
    assert.ok(Array.from(ctx.window.supportedLanguages).includes('zh-Hant'));
    assert.ok(Array.from(ctx.window.languageOptions).some((option) => (
        option.code === 'zh-Hant' && option.label === '繁體中文'
    )));
});

test('Simplified Chinese language tags continue to load the zh locale', async () => {
    const ctx = makeContext();

    for (const tag of ['zh', 'zh-CN', 'zh-SG', 'zh-Hans']) {
        assert.equal(await ctx._loadLanguage(tag), 'zh');
    }
});

test('Persian is available and applies right-to-left document metadata', async () => {
    const ctx = makeContext();

    assert.ok(Array.from(ctx.window.supportedLanguages).includes('fa'));
    assert.ok(Array.from(ctx.window.languageOptions).some((option) => (
        option.code === 'fa' && option.label === 'فارسی'
    )));
    assert.equal(await ctx._loadLanguage('fa-IR'), 'fa');

    await ctx._setLanguage('fa-IR');
    assert.equal(ctx.document.documentElement.lang, 'fa');
    assert.equal(ctx.document.documentElement.dir, 'rtl');
});

test('Traditional Chinese locale mirrors the Simplified Chinese key structure', () => {
    const localeDir = path.join(root, 'assets/locales');
    const simplified = JSON.parse(fs.readFileSync(path.join(localeDir, 'zh.json'), 'utf8'));
    const traditional = JSON.parse(fs.readFileSync(path.join(localeDir, 'zh-Hant.json'), 'utf8'));

    const valueShape = (value) => {
        if (Array.isArray(value)) return value.map(valueShape);
        if (value && typeof value === 'object') {
            return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, valueShape(nested)]));
        }
        return typeof value;
    };

    assert.deepEqual(valueShape(traditional), valueShape(simplified));
});
