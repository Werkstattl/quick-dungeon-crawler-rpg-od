const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('Refine tab visually connects Refine Stones with their use', () => {
    assert.match(
        indexSource,
        /id="forge-mode-refine"[^>]*>[\s\S]*?<i class="ra ra-crystal-ball"[^>]*><\/i>[\s\S]*?<span data-i18n="refine">Refine<\/span>[\s\S]*?<\/button>/,
    );
});
