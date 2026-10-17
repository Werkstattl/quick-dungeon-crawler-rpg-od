const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets/js/equipment.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(root, 'assets/js/main.js'), 'utf8');

function drop({ autoMode = true, locked = false, autoSellRarity = 'none', rarity = 'Heirloom', condition = 'combat' } = {}) {
    const gear = (value) => ({
        category: 'Sword', type: 'Weapon', attribute: 'Damage', slot: 'weapon',
        rarity, lvl: 10, tier: 1, stats: [], value, icon: '', locked,
    });
    const equipped = { ...gear(10), rarity: 'Heirloom' };
    const context = vm.createContext({
        player: { inventory: { equipment: [] }, equipped: [equipped], gold: 0 },
        autoMode, autoEquipBest: false, autoSellRarity, autoSellBelowLevel: 0,
        MAX_EQUIPMENT_LEVEL: 100,
        enemy: { id: 'test', name: 'Test' },
        getDisplayEnemyName: () => 'Test',
        saveData() {}, playerLoadStats() {}, checkInventoryLimit() {},
        addCombatLog() {}, addDungeonLog() {}, nFormatter: String,
        dropped: gear(100),
    });
    vm.runInContext(source.replace('const createEquipment =', 'let createEquipment ='), context);
    vm.runInContext('createEquipment = () => dropped;', context);
    context.result = vm.runInContext('createEquipmentPrint(' + JSON.stringify(condition) + ')', context);
    return context;
}

test('"All" auto-sells Heirloom drops while Auto Mode is on', () => {
    const { player, result } = drop({ autoSellRarity: 'all' });
    assert.equal(result.autoSold, true);
    assert.equal(player.inventory.equipment.length, 0);
    assert.ok(player.gold > 0);
});

test('"All" auto-sells every lower rarity as well', () => {
    for (const rarity of ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Heirloom']) {
        const { result } = drop({ autoSellRarity: 'all', rarity });
        assert.equal(result.autoSold, true, `expected ${rarity} to auto-sell`);
    }
});

// Note: locked items are already covered by the existing locked guard in
// shouldAutoSellEquipment and by tests/auto-equip-best.test.js; an end-to-end
// locked-drop test is deliberately not added because the dungeon loot-panel
// "Sell" button ignores the lock (pre-existing behaviour, unchanged here).

test('"All" does nothing when Auto Mode is off', () => {
    const { player, result } = drop({ autoSellRarity: 'all', autoMode: false });
    assert.notEqual(result.autoSold, true);
    assert.equal(player.inventory.equipment.length, 1);
});

function evaluator({ autoMode = true, autoSellRarity = 'all', autoSellBelowLevel = 0 }) {
    const context = vm.createContext({ autoMode, autoSellRarity, autoSellBelowLevel });
    vm.runInContext(source.replace('const createEquipment =', 'let createEquipment ='), context);
    return (item) => {
        context.__item = item;
        return vm.runInContext('shouldAutoSellEquipment(__item)', context);
    };
}

test('"All" never auto-sells Companion Charms', () => {
    const shouldAutoSell = evaluator({ autoSellRarity: 'all' });
    assert.equal(shouldAutoSell({
        category: 'Charm', attribute: 'Companion', slot: 'companionCharm',
        rarity: 'Heirloom', lvl: 1, tier: 1, stats: [], value: 100,
    }), false);
    assert.equal(shouldAutoSell({
        category: 'Sword', type: 'Weapon', slot: 'weapon',
        rarity: 'Heirloom', lvl: 1, tier: 1, stats: [], value: 100,
    }), true);
});

test('rarity thresholds below Heirloom keep selling strictly lower rarities', () => {
    const shouldAutoSell = evaluator({ autoSellRarity: 'Legendary' });
    assert.equal(shouldAutoSell({ rarity: 'Epic', lvl: 1 }), true);
    assert.equal(shouldAutoSell({ rarity: 'Legendary', lvl: 1 }), false);
    assert.equal(shouldAutoSell({ rarity: 'Heirloom', lvl: 1 }), false);
});

test('auto-sell rarity select offers the All option', () => {
    assert.match(
        mainSource,
        /<option value="all" \$\{autoSellRarity === 'all' \? 'selected' : ''\} data-i18n="all">All<\/option>/,
    );
});

test('"all" locale label exists in every supported locale', () => {
    const localesDirectory = path.join(root, 'assets/locales');
    const languageSource = fs.readFileSync(path.join(root, 'assets/js/language.js'), 'utf8');
    const supportedDeclaration = languageSource.match(/const SUPPORTED = \[([^\]]+)\];/);
    const supported = Array.from(supportedDeclaration[1].matchAll(/'([^']+)'/g), (m) => `${m[1]}.json`);
    for (const file of supported) {
        const locale = JSON.parse(fs.readFileSync(path.join(localesDirectory, file), 'utf8'));
        assert.equal(typeof locale.all, 'string', `${file} is missing the "all" label`);
        assert.ok(locale.all.trim().length > 0, `${file} has an empty "all" label`);
    }
});
