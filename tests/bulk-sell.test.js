const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const equipment = fs.readFileSync('assets/js/equipment.js', 'utf8');
const playerSource = fs.readFileSync('assets/js/player.js', 'utf8');
const utilitySource = fs.readFileSync('assets/js/utility.js', 'utf8');
const nFormatterSource = utilitySource.slice(utilitySource.indexOf('const nFormatter ='), utilitySource.indexOf('}', utilitySource.indexOf('return item ?')) + 1);
const saleSource = equipment.slice(equipment.indexOf('const matchesBulkSale ='), equipment.indexOf('const EQUIPMENT_STAT_ABBREVIATION_KEYS'));
const modalSource = playerSource.slice(playerSource.indexOf('const openBulkSaleModal ='), playerSource.indexOf('// Opens inventory'));
function setup(items) {
    const elements = {};
    const element = id => elements[id] || (elements[id] = { style: {}, value: '1' });
    const context = vm.createContext({
        player: { gold: 10, equipped: [{ value: 999 }], inventory: { equipment: items.map(JSON.stringify) } },
        MAX_EQUIPMENT_TIER: 15, MAX_EQUIPMENT_LEVEL: 100,
        getEquipmentEffectiveValue: item => item.value * 2,
        earned: 0, refreshes: 0, sales: 0, denied: 0,
        document: { querySelector: element },
        defaultModalElement: element('#defaultModal'), sellRarityElement: element('#sell-rarity'),
        t: (key, vars) => vars ? JSON.stringify(vars) : key,
        sfxOpen: { play() {} }, sfxDecline: { play() {} },
    });
    vm.runInContext(`
        const recordRunGoldEarned = gold => earned += gold;
        const playerLoadStats = () => refreshes++;
        const sfxSell = { play: () => sales++ };
        const sfxDeny = { play: () => denied++ };
        ${nFormatterSource}\n${saleSource}\n${modalSource}`, context);
    return { context, element, run: expression => vm.runInContext(expression, context) };
}
const items = [
    { tier: 1, lvl: 10, rarity: 'Common', value: 5 },
    { tier: 2, lvl: 20, rarity: 'Heirloom', value: 10 },
    { tier: 3, lvl: 21, rarity: 'Rare', value: 15 },
    { tier: 1, lvl: 1, rarity: 'Common', value: 20, locked: true },
];
for (const [type, value] of [['tier', 3], ['level', 21]]) {
    test(`${type} sale respects its threshold and includes all rarities, preserving locked and equipped items`, () => {
        const { context, run } = setup(items);
        const filter = JSON.stringify({ type, value });
        assert.equal(run(`JSON.stringify(previewBulkSale(${filter}))`), '{"count":2,"gold":30}');
        run(`sellInventoryItems(${filter})`);
        assert.equal(context.player.gold, 40);
        assert.equal(context.earned, 30);
        assert.equal(context.player.inventory.equipment.length, 2);
        assert.equal(context.player.equipped.length, 1);
        assert.equal(context.refreshes, 1);
        assert.equal(context.sales, 1);
    });
}
test('legacy tier defaults to 1 and level uses lvl, not tier', () => {
    const { run } = setup([{ lvl: 100, value: 1 }]);
    assert.equal(run("previewBulkSale({ type: 'tier', value: 1 }).count"), 0);
    assert.equal(run("previewBulkSale({ type: 'tier', value: 2 }).count"), 1);
    assert.equal(run("previewBulkSale({ type: 'level', value: 99 }).count"), 0);
    assert.equal(run("previewBulkSale({ type: 'level', value: 100 }).count"), 0);
});
test('invalid filters cannot sell items', () => {
    const { run, context } = setup(items);
    for (const filter of [{ type: 'tier', value: 16 }, { type: 'level', value: 0 }, { type: 'level', value: 'bad' }, { type: 'oops', value: 2 }]) {
        run(`sellInventoryItems(${JSON.stringify(filter)})`);
    }
    assert.equal(context.player.gold, 10);
    assert.equal(context.player.inventory.equipment.length, 4);
});
test('existing rarity and All sales still protect locked items', () => {
    const { run, context } = setup(items);
    run("sellAll('Common')");
    assert.equal(context.player.gold, 20);
    run("sellAll('All')");
    assert.equal(context.player.gold, 70);
    assert.equal(context.player.inventory.equipment.length, 1);
});
test('modal previews changes, cancels without sale, and resets after confirming', () => {
    const { run, context, element } = setup(items);
    run("openBulkSaleModal('level')");
    assert.notEqual(element('#sell-confirm').disabled, true);
    element('#bulk-sell-threshold').value = '21';
    element('#bulk-sell-threshold').onchange();
    assert.notEqual(element('#sell-confirm').disabled, true);
    assert.equal(element('#bulk-sell-preview').textContent, '{"count":2,"gold":"30"}');
    element('#sell-cancel').onclick();
    assert.equal(context.player.gold, 10);
    run("openBulkSaleModal('level')");
    element('#sell-confirm').onclick();
    assert.equal(context.player.gold, 40);
    assert.equal(element('#defaultModal').style.display, 'none');
    assert.equal(element('#sell-rarity').value, 'none');
    assert.equal(element('#inventory').style.filter, 'brightness(100%)');
});

test('level 100 sells level 99 while preserving level 100', () => {
    const { run, context } = setup([
        { lvl: 99, value: 5 },
        { lvl: 100, value: 10 },
    ]);
    run("sellInventoryItems({ type: 'level', value: 100 })");
    assert.equal(context.player.gold, 20);
    assert.equal(context.player.inventory.equipment.length, 1);
    assert.equal(JSON.parse(context.player.inventory.equipment[0]).lvl, 100);
});

test('tier 10 sells tier 9 while preserving tier 10 and higher', () => {
    const { run, context } = setup([
        { tier: 9, value: 5 },
        { tier: 10, value: 10 },
        { tier: 15, value: 15 },
    ]);
    run("sellInventoryItems({ type: 'tier', value: 10 })");
    assert.equal(context.player.gold, 20);
    assert.deepEqual(context.player.inventory.equipment.map(item => JSON.parse(item).tier), [10, 15]);
});

test('bulk sell preview abbreviates large gold totals like the rest of the UI', () => {
    const { run, element } = setup([{ tier: 1, lvl: 1, value: 82922 }]);
    run("openBulkSaleModal('tier')");
    element('#bulk-sell-threshold').value = '2';
    element('#bulk-sell-threshold').onchange();
    assert.equal(element('#bulk-sell-preview').textContent, '{"count":1,"gold":"165.84k"}');
});

for (const [type, threshold] of [['tier', '2'], ['level', '10']]) {
    test(`${type} Sell with no matching items plays the error sound`, () => {
        const { run, context, element } = setup([
            { tier: 2, lvl: 10, value: 5 },
            { tier: 1, lvl: 1, value: 10, locked: true },
        ]);
        run(`openBulkSaleModal('${type}')`);
        element('#bulk-sell-threshold').value = threshold;
        element('#bulk-sell-threshold').onchange();
        assert.equal(element('#bulk-sell-preview').textContent, '{"count":0,"gold":"0"}');
        assert.notEqual(element('#sell-confirm').disabled, true);
        element('#sell-confirm').onclick();
        assert.equal(context.denied, 1);
        assert.equal(context.sales, 0);
        assert.equal(context.player.gold, 10);
        assert.equal(context.player.inventory.equipment.length, 2);
    });
}
