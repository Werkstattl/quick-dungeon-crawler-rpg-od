const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const progressionSource = read('assets/js/progression.js');
const equipmentSource = read('assets/js/equipment.js');
const forgeSource = read('assets/js/forge.js');
const combatSource = read('assets/js/combat.js');
const indexSource = read('index.html');

const createContext = ({ stones = 100, cores = 0, gold = 1e12 } = {}) => {
    const context = vm.createContext({ console, combatLogs: [] });
    vm.runInContext(progressionSource, context);
    vm.runInContext(equipmentSource, context);
    vm.runInContext(forgeSource, context);
    context.player = {
        gold,
        inventory: { consumables: [], equipment: [], refineStones: stones, guardianCores: cores, forgeTokens: 0 },
        equipped: [],
    };
    context.saveData = () => {};
    context.addCombatLog = (message) => context.combatLogs.push(message);
    context.getDisplayEnemyName = (id, name) => name;
    context.t = (key, params = {}) => [key, ...Object.values(params)].join('|');
    vm.runInContext('forgeUnlocked = true;', context);
    return context;
};

const evaluate = (context, expression) => vm.runInContext(expression, context);
const item = (lvl, refineLevel) => JSON.stringify({ lvl, refineLevel, value: 1000, stats: [{ atk: 100 }] });

test('only level 100 items can be refined past +10', () => {
    const context = createContext();
    assert.equal(evaluate(context, `getEquipmentRefineLevel(${item(99, 25)})`), 10);
    assert.equal(evaluate(context, `canRefineEquipment(${item(99, 10)})`), false);
    assert.equal(evaluate(context, `getEquipmentRefineLevel(${item(100, 25)})`), 25);
    assert.equal(evaluate(context, `canRefineEquipment(${item(100, 10)})`), true);
    assert.equal(evaluate(context, `canRefineEquipment(${item(100, 500)})`), true);
});

test('refine levels past +10 add a smaller stat bonus each', () => {
    const context = createContext();
    const multiplier = (refineLevel) => evaluate(context, `getEquipmentRefineStatMultiplier(${item(100, refineLevel)})`);
    assert.ok(Math.abs(multiplier(10) - 1.8) < 1e-9);
    assert.ok(Math.abs(multiplier(11) - 1.83) < 1e-9);
    assert.ok(Math.abs(multiplier(20) - 2.1) < 1e-9);
});

test('Guardian Cores are only needed past +10 and their cost grows exponentially', () => {
    const context = createContext();
    const coreCost = (refineLevel) => evaluate(context, `getRefineGuardianCoreCost(${item(100, refineLevel)})`);
    const goldCost = (refineLevel) => evaluate(context, `getRefineCost(${item(100, refineLevel)})`);

    assert.equal(coreCost(0), 0);
    assert.equal(coreCost(9), 0);
    assert.equal(coreCost(10), 1);
    assert.ok(coreCost(19) > coreCost(14));
    assert.ok(coreCost(39) > coreCost(29) * 5);
    assert.equal(goldCost(9), Math.round(1000 * 10 * 3.75));
    assert.ok(goldCost(10) > Math.round(1000 * 11 * 3.75));
    assert.ok(goldCost(30) / goldCost(29) > 1.3);
});

test('Guardian Core drop chance scales with curse, floor and slightly with luck', () => {
    const context = createContext();
    const chance = (floor, curse, luck = 0) => evaluate(context, `getGuardianCoreDropChance(${floor}, ${curse}, ${luck})`);
    const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} !== ${expected}`);

    assert.equal(chance(19, 15), 0);
    assert.ok(chance(45, 9) <= 0.05);
    assert.ok(chance(20, 1) < chance(45, 1));
    assert.ok(chance(45, 9) < chance(45, 10));
    assert.ok(chance(45, 14) < chance(45, 15));
    near(chance(45, 15), 0.5);
    near(chance(100, 15), 0.5);
    near(chance(45, 15, 140), 0.55);
    near(chance(45, 15, 9999), 0.55);
});

test('Guardian Cores drop only from floor bosses on Floor 20 or deeper', () => {
    const context = createContext();
    assert.equal(evaluate(context, 'grantGuardianCoreDrop(5, 15, 140)'), 0);
    assert.equal(context.player.inventory.guardianCores, 0);

    vm.runInContext('Math.random = () => 0.49;', context);
    assert.equal(evaluate(context, 'grantGuardianCoreDrop(45, 15, 0)'), 1);
    assert.equal(context.player.inventory.guardianCores, 1);
    vm.runInContext('Math.random = () => 0.5;', context);
    assert.equal(evaluate(context, 'grantGuardianCoreDrop(45, 15, 0)'), 0);
    assert.equal(context.player.inventory.guardianCores, 1);
    assert.match(context.combatLogs.at(-1), /guardian-core/);

    assert.match(combatSource, /enemy\.condition === 'guardian' && typeof grantGuardianCoreDrop === 'function'\) \{\s*grantGuardianCoreDrop\(dungeon\.progress\.floor\);/);
});

test('refining past +10 spends Guardian Cores and blocks without them', () => {
    const context = createContext({ cores: 0 });
    context.document = { querySelector: () => null, querySelectorAll: () => [] };
    context.sfxDeny = { play() {} };
    context.sfxEquip = { play() {} };
    context.playerLoadStats = () => {};
    context.player.inventory.equipment = [item(100, 10)];
    const equipmentStr = context.player.inventory.equipment[0];
    const select = `forgeMode = 'refine'; selectedRefineItem = { equipment: JSON.parse(${JSON.stringify(equipmentStr)}), equipmentStr: ${JSON.stringify(equipmentStr)}, source: 'inventory', sourceIndex: 0 }; calculateRefinePreview();`;

    evaluate(context, select);
    evaluate(context, 'executeRefine()');
    assert.equal(JSON.parse(context.player.inventory.equipment[0]).refineLevel, 10);

    context.player.inventory.guardianCores = 3;
    evaluate(context, select);
    evaluate(context, 'executeRefine()');
    assert.equal(JSON.parse(context.player.inventory.equipment[0]).refineLevel, 11);
    assert.equal(context.player.inventory.guardianCores, 2);
});

test('the Refine panel shows the Guardian Core cost and every locale translates it', () => {
    assert.match(indexSource, /id="refine-core-cost-amount"/);
    assert.match(indexSource, /data-i18n="guardian-core-refine-hint"/);
    const localesDirectory = path.join(root, 'assets/locales');
    for (const file of fs.readdirSync(localesDirectory).filter((name) => name.endsWith('.json'))) {
        const locale = JSON.parse(fs.readFileSync(path.join(localesDirectory, file), 'utf8'));
        for (const key of ['guardian-core', 'guardian-cores', 'not-enough-guardian-cores', 'guardian-core-refine-hint']) {
            assert.ok(locale[key], `${file} is missing ${key}`);
        }
    }
});
