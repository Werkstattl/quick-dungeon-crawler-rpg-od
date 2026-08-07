const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const forgeSource = fs.readFileSync(path.join(root, 'assets/js/forge.js'), 'utf8');
const autoModeSource = fs.readFileSync(path.join(root, 'assets/js/automode.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(root, 'assets/js/main.js'), 'utf8');
const styleSource = fs.readFileSync(path.join(root, 'assets/css/style.css'), 'utf8');

test('premium unlock controls open the permanent purchase directly', () => {
    const forgeUnlockButton = forgeSource.match(/const setForgeUnlockButton[\s\S]*?^};/m)?.[0] || '';
    const autoModeUnlockButton = mainSource.match(/if \(!autoModeUnlocked\)[\s\S]*?^        }/m)?.[0] || '';

    assert.match(forgeUnlockButton, /buyPermanentForgeUnlock\(\)/);
    assert.match(autoModeUnlockButton, /buyPermanentAutoModeUnlock\(\)/);

    assert.doesNotMatch(forgeSource, /openForgeUnlockModal/);
    assert.doesNotMatch(autoModeSource, /openAutoModeUnlockModal/);
    assert.doesNotMatch(forgeSource, /id="forge-buy-permanent"/);
    assert.doesNotMatch(autoModeSource, /id="auto-mode-buy-permanent"/);
    assert.doesNotMatch(styleSource, /\.forge-unlock-(?:modal|options?|price)/);
});
