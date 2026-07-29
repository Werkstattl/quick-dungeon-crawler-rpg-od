const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const localeDirectory = path.join(root, 'assets/locales');

const stats = [
    ['health', 'health'],
    ['attack', 'attack'],
    ['defense', 'defense'],
    ['attack-speed', 'attack-speed'],
    ['vampirism', 'vampirism'],
    ['crit-rate', 'crit-rate'],
    ['crit-dmg', 'crit-dmg'],
    ['dodge', 'dodge'],
    ['luck', 'luck'],
    ['faster-run', 'faster-run-desc'],
];

test('stats help modal gives every description an explicit translated name', () => {
    for (const [displayKey, descriptionKey] of stats) {
        const rowPattern = new RegExp(
            `<strong data-i18n="stat-display\\.${displayKey}">[^<]+<\\/strong>:\\s*<span data-i18n="stats-modal\\.${descriptionKey}">`,
        );
        assert.match(indexSource, rowPattern, `${displayKey} should have a visible translated label`);
    }
});

test('all locales provide the stats help labels and descriptions', () => {
    const localeFiles = fs.readdirSync(localeDirectory).filter((file) => file.endsWith('.json'));
    assert.ok(localeFiles.length > 0);

    for (const file of localeFiles) {
        const dictionary = JSON.parse(fs.readFileSync(path.join(localeDirectory, file), 'utf8'));
        for (const [displayKey, descriptionKey] of stats) {
            assert.equal(typeof dictionary['stat-display']?.[displayKey], 'string', `${file}: stat-display.${displayKey}`);
            assert.equal(typeof dictionary['stats-modal']?.[descriptionKey], 'string', `${file}: stats-modal.${descriptionKey}`);
        }
    }
});
