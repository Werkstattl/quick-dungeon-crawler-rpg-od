const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const localesDirectory = path.join(root, 'assets/locales');
const requiredKeys = [
    'curse-levels-unlocked',
    'curse-standard-unlock-hint',
    'curse-monarch-unlock-hint',
    'curse-level-locked',
];

const localeFiles = fs.readdirSync(localesDirectory)
    .filter((file) => file.endsWith('.json'))
    .sort();

test('all locale files are valid JSON and contain the endgame Curse UI text', () => {
    assert.equal(localeFiles.length, 23);

    for (const file of localeFiles) {
        const locale = JSON.parse(fs.readFileSync(path.join(localesDirectory, file), 'utf8'));
        for (const key of requiredKeys) {
            assert.equal(typeof locale[key], 'string', `${file} is missing ${key}`);
            assert.ok(locale[key].trim().length > 0, `${file} has an empty ${key}`);
        }
        assert.match(locale['curse-levels-unlocked'], /\{current\}/, `${file} must retain {current}`);
        assert.match(locale['curse-levels-unlocked'], /\{max\}/, `${file} must retain {max}`);
        assert.match(locale['curse-standard-unlock-hint'], /2-10/, `${file} must describe Curse 2-10`);
        assert.match(locale['curse-standard-unlock-hint'], /10/, `${file} must mention Floor 10`);
        assert.match(locale['curse-monarch-unlock-hint'], /11-15/, `${file} must describe Curse 11-15`);
        assert.match(locale['curse-level-locked'], /\{level\}/, `${file} must retain {level}`);
    }
});

test('English unlock guidance describes the implemented progression rules', () => {
    const english = JSON.parse(fs.readFileSync(path.join(localesDirectory, 'en.json'), 'utf8'));

    assert.equal(english['curse-levels-unlocked'], 'Curse Levels unlocked: {current}/{max}');
    assert.equal(english['curse-standard-unlock-hint'], 'Curse Levels 2-10 unlock by reaching Floor 10.');
    assert.equal(english['curse-monarch-unlock-hint'], 'Curse Levels 11-15 unlock by defeating the Dungeon Monarch.');
});

test('allocation UI renders progress, both unlock rules, and translated locked options', () => {
    const mainSource = fs.readFileSync(path.join(root, 'assets/js/main.js'), 'utf8');

    assert.match(mainSource, /class="curse-progression-info"/);
    assert.match(mainSource, /data-i18n="curse-levels-unlocked"/);
    assert.match(mainSource, /data-i18n-params='\{"current":\$\{maxUnlockedCurse\},"max":\$\{MAX_CURSE_LEVEL\}\}'/);
    assert.match(mainSource, /data-i18n="curse-standard-unlock-hint"/);
    assert.match(mainSource, /data-i18n="curse-monarch-unlock-hint"/);
    assert.match(mainSource, /option\.setAttribute\('data-i18n', 'curse-level-locked'\)/);
    assert.match(mainSource, /option\.textContent = t\('curse-level-locked', \{ level: optionValue \}\)/);
});

test('Curse progression guidance has dedicated compact styling', () => {
    const styleSource = fs.readFileSync(path.join(root, 'assets/css/style.css'), 'utf8');

    assert.match(styleSource, /\.curse-progression-info \{/);
    assert.match(styleSource, /\.curse-progression-info \.curse-progress \{/);
});
