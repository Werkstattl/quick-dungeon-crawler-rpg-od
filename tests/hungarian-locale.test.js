const test = require('node:test');
const assert = require('node:assert/strict');
const english = require('../assets/locales/en.json');
const hungarian = require('../assets/locales/hu.json');

test('Hungarian covers every game text, variant, placeholder and formatting tag', () => {
    function compare(source, translation, path) {
        if (typeof source === 'string') {
            assert.equal(typeof translation, 'string', path);
            assert.ok(translation.trim(), path);
            const tokens = text => (text.match(/\{\w+\}|<\/?[a-z][^>]*>/gi) || []).sort();
            assert.deepEqual(tokens(translation), tokens(source), path);
            return;
        }

        assert.equal(Array.isArray(translation), Array.isArray(source), path);
        assert.deepEqual(Object.keys(translation).sort(), Object.keys(source).sort(), path);
        for (const key of Object.keys(source)) {
            compare(source[key], translation[key], path ? `${path}.${key}` : key);
        }
    }

    compare(english, hungarian, '');
});
