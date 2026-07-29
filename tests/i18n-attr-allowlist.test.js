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
