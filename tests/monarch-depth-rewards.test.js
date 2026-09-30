const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const progressionSource = fs.readFileSync(path.join(root, 'assets/js/progression.js'), 'utf8');
const combatSource = fs.readFileSync(path.join(root, 'assets/js/combat.js'), 'utf8');
const dungeonSource = fs.readFileSync(path.join(root, 'assets/js/dungeon.js'), 'utf8');
const localesDirectory = path.join(root, 'assets/locales');

const context = vm.createContext({});
vm.runInContext(progressionSource, context);
const rewardsAt = (floor) => ({ ...vm.runInContext(`getMonarchDepthRewards(${JSON.stringify(floor)})`, context) });

test('Monarch fights before Floor 25 grant no depth bonus', () => {
    for (const floor of [1, 20, 24]) {
        assert.deepEqual(rewardsAt(floor), { tier: 0, extraHeirlooms: 0, refineStones: 0, nextTierFloor: 25 });
    }
});

test('every 5 floors past 20 adds one Heirloom and two Refine Stones', () => {
    assert.deepEqual(rewardsAt(25), { tier: 1, extraHeirlooms: 1, refineStones: 2, nextTierFloor: 30 });
    assert.deepEqual(rewardsAt(29), { tier: 1, extraHeirlooms: 1, refineStones: 2, nextTierFloor: 30 });
    assert.deepEqual(rewardsAt(40), { tier: 4, extraHeirlooms: 4, refineStones: 8, nextTierFloor: 45 });
});

test('depth bonus caps at Floor 45 and handles invalid floors', () => {
    assert.deepEqual(rewardsAt(45), { tier: 5, extraHeirlooms: 5, refineStones: 10, nextTierFloor: null });
    assert.deepEqual(rewardsAt(500), rewardsAt(45));
    assert.equal(rewardsAt('abc').tier, 0);
    assert.equal(rewardsAt(null).tier, 0);
});

test('Monarch victory grants depth rewards and the chamber previews them', () => {
    assert.match(combatSource, /enemy\.condition === 'sboss'\) \{\s*grantMonarchDepthRewards\(\);/);
    assert.match(combatSource, /createEquipmentPrint\('combat', \{ minRarity: 'Heirloom' \}\)/);
    assert.match(dungeonSource, /t\('monarch-depth-bonus'/);
    assert.match(dungeonSource, /t\('monarch-depth-next'/);
});

test('all locales translate the depth reward text with its placeholders', () => {
    for (const file of fs.readdirSync(localesDirectory).filter((name) => name.endsWith('.json'))) {
        const locale = JSON.parse(fs.readFileSync(path.join(localesDirectory, file), 'utf8'));
        for (const placeholder of ['{floor}', '{heirlooms}', '{stones}']) {
            assert.ok(locale['monarch-depth-bonus'].includes(placeholder), `${file} monarch-depth-bonus needs ${placeholder}`);
        }
        assert.ok(locale['monarch-depth-next'].includes('{floor}'), `${file} monarch-depth-next needs {floor}`);
    }
});
