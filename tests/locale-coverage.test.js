const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const english = require('../assets/locales/en.json');
const localeDir = path.join(__dirname, '../assets/locales');

function compare(source, translation, keyPath) {
    if (typeof source === 'string') {
        assert.equal(typeof translation, 'string', keyPath);
        assert.ok(translation.trim(), keyPath);
        const tokens = text => (text.match(/\{\w+\}|<\/?[a-z][^>]*>/gi) || []).sort();
        assert.deepEqual(tokens(translation), tokens(source), keyPath);
        return;
    }

    assert.ok(translation && typeof translation === 'object', keyPath);
    assert.equal(Array.isArray(translation), Array.isArray(source), keyPath);
    assert.deepEqual(Object.keys(translation).sort(), Object.keys(source).sort(), keyPath);
    for (const [key, value] of Object.entries(source)) {
        compare(value, translation[key], `${keyPath}.${key}`);
    }
}

for (const file of fs.readdirSync(localeDir).filter(file => file.endsWith('.json') && file !== 'en.json')) {
    test(`${file} covers every game text, variant, placeholder and formatting tag`, () => {
        const translation = JSON.parse(fs.readFileSync(path.join(localeDir, file), 'utf8'));
        // Some languages also carry grammatical gender metadata for equipment names.
        delete translation['equipment-genders'];
        compare(english, translation, file);
    });
}
