const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const localesDirectory = path.join(root, 'assets/locales');
const requiredKeys = [
    'curse-levels-unlocked',
    'curse-next-unlock-floor',
    'curse-next-unlock-monarch',
    'curse-all-unlocked',
];

const localeFiles = fs.readdirSync(localesDirectory)
    .filter((file) => file.endsWith('.json'))
    .sort();
const languageSource = fs.readFileSync(path.join(root, 'assets/js/language.js'), 'utf8');
const supportedDeclaration = languageSource.match(/const SUPPORTED = \[([^\]]+)\];/);
const supportedLocaleFiles = Array.from(
    supportedDeclaration[1].matchAll(/'([^']+)'/g),
    (match) => `${match[1]}.json`,
).sort();

test('all locale files are valid JSON and contain the endgame Curse UI text', () => {
    assert.deepEqual(localeFiles, supportedLocaleFiles);

    for (const file of localeFiles) {
        const locale = JSON.parse(fs.readFileSync(path.join(localesDirectory, file), 'utf8'));
        for (const key of requiredKeys) {
            assert.equal(typeof locale[key], 'string', `${file} is missing ${key}`);
            assert.ok(locale[key].trim().length > 0, `${file} has an empty ${key}`);
        }
        assert.match(locale['curse-levels-unlocked'], /\{current\}/, `${file} must retain {current}`);
        assert.match(locale['curse-levels-unlocked'], /\{max\}/, `${file} must retain {max}`);
        for (const key of ['curse-next-unlock-floor', 'curse-next-unlock-monarch']) {
            assert.match(locale[key], /\{current\}/, `${file} ${key} must retain {current}`);
            assert.match(locale[key], /\{next\}/, `${file} ${key} must retain {next}`);
        }
        assert.match(locale['curse-next-unlock-floor'], /\{floor\}/, `${file} must retain {floor}`);
        for (const key of ['curse-level-locked', 'curse-standard-unlock-hint', 'curse-monarch-unlock-hint']) {
            assert.equal(locale[key], undefined, `${file} still contains unused ${key}`);
        }
    }
});

test('English unlock guidance describes the implemented progression rules', () => {
    const english = JSON.parse(fs.readFileSync(path.join(localesDirectory, 'en.json'), 'utf8'));

    assert.equal(english['curse-levels-unlocked'], 'Curse Levels unlocked: {current}/{max}');
    assert.equal(english['curse-next-unlock-floor'], 'Reach Floor {floor} on Curse Level {current} to unlock Curse Level {next}.');
    assert.equal(english['curse-next-unlock-monarch'], 'Defeat the Dungeon Monarch on Curse Level {current} to unlock Curse Level {next}.');
    assert.equal(english['curse-all-unlocked'], 'All Curse Levels unlocked.');
});

test('allocation UI renders progress, the next unlock step, and only unlocked curse options', () => {
    const mainSource = fs.readFileSync(path.join(root, 'assets/js/main.js'), 'utf8');

    assert.match(mainSource, /class="curse-progression-info"/);
    assert.match(mainSource, /data-i18n="curse-levels-unlocked"/);
    assert.match(mainSource, /data-i18n-params='\{"current":\$\{maxUnlockedCurse\},"max":\$\{MAX_CURSE_LEVEL\}\}'/);
    assert.match(mainSource, /const curseUnlockHint = getCurseUnlockHint\(maxUnlockedCurse\)/);
    assert.match(mainSource, /data-i18n="\$\{curseUnlockHint\.key\}" data-i18n-params='\$\{JSON\.stringify\(curseUnlockHint\.params\)\}'/);
    assert.match(mainSource, /getCurseLevelRange\(\)\.filter\(\(level\) => level <= maxUnlockedCurse\)/);
    assert.doesNotMatch(mainSource, /'curse-level-locked'/);
    assert.match(mainSource, /<select id="select-curse" \$\{maxUnlockedCurse <= MIN_CURSE_LEVEL \? 'hidden' : ''\}>/);
});

test('Curse progression guidance has dedicated compact styling', () => {
    const styleSource = fs.readFileSync(path.join(root, 'assets/css/style.css'), 'utf8');

    assert.match(styleSource, /\.curse-progression-info \{/);
    assert.match(styleSource, /\.curse-progression-info \.curse-progress \{/);
});
