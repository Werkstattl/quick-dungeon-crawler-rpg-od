const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../assets/js/equipment.js'), 'utf8');

function drop({ autoMode = true, autoEquipBest = true, locked = false, autoSellRarity = 'none', condition = 'combat' } = {}) {
    const weapon = value => ({
        category: 'Sword', type: 'Weapon', attribute: 'Damage', slot: 'weapon',
        rarity: 'Rare', lvl: 10, tier: 1, stats: [], value, icon: '', locked: false,
    });
    const old = { ...weapon(10), locked };
    const context = vm.createContext({
        player: { inventory: { equipment: [] }, equipped: [old], gold: 0 },
        autoMode, autoEquipBest, autoSellRarity, autoSellBelowLevel: 0,
        MAX_EQUIPMENT_LEVEL: 100,
        enemy: { id: 'test', name: 'Test' },
        getDisplayEnemyName: () => 'Test',
        saveData() {}, playerLoadStats() {}, checkInventoryLimit() {},
        addCombatLog() {}, addDungeonLog() {}, nFormatter: String,
        dropped: weapon(100),
    });
    vm.runInContext(source.replace('const createEquipment =', 'let createEquipment ='), context);
    vm.runInContext('createEquipment = () => dropped;', context);
    context.result = vm.runInContext('createEquipmentPrint(' + JSON.stringify(condition) + ')', context);
    return context;
}

for (const condition of ['combat', 'dungeon']) {
    test('auto-equip upgrades a ' + condition + ' drop and updates its sale location', () => {
        const { player, result } = drop({ condition });
        assert.equal(player.equipped[0].value, 100);
        assert.equal(JSON.parse(player.inventory.equipment[0]).value, 10);
        assert.equal(result.placement, 'equipped');
        assert.equal(result.index, 0);
        assert.equal(result.item, player.equipped[0]);
        assert.equal(result.serialized, JSON.stringify(result.item));
    });
}

for (const options of [{ autoMode: false }, { autoEquipBest: false }, { locked: true }]) {
    test('auto-equip respects ' + JSON.stringify(options), () => {
        const { player, result } = drop(options);
        assert.equal(player.equipped[0].value, 10);
        assert.equal(result.placement, 'inventory');
        assert.equal(JSON.parse(player.inventory.equipment[result.index]).value, 100);
    });
}

test('auto-sell processes excluded equipment before auto-equip', () => {
    const { player, result } = drop({ autoSellRarity: 'Epic' });
    assert.equal(result.autoSold, true);
    assert.equal(player.equipped[0].value, 10);
    assert.equal(player.inventory.equipment.length, 0);
    assert.ok(player.gold > 0);
});
