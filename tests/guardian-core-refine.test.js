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
    assert.ok(Math.abs(multiplier(11) - 1.82) < 1e-9);
    assert.ok(Math.abs(multiplier(20) - 2.0) < 1e-9);
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

const createRefinePanelContext = ({ source = 'inventory', level = 100, refineLevel = 10, ...resources } = {}) => {
    const context = createContext({ cores: 100, ...resources });
    const elements = {};
    for (const id of ['refine-preview', 'refine-cost', 'refine-current-item', 'refine-preview-item',
        'refine-cost-amount', 'refine-stone-cost-amount', 'refine-core-cost', 'refine-core-cost-amount',
        'refine-slot', 'forge-confirm']) {
        elements[`#${id}`] = { style: {}, innerHTML: '', textContent: '', setAttribute() {} };
    }
    context.document = { querySelector: selector => elements[selector] || null, querySelectorAll: () => [] };
    context.sfxDeny = context.sfxEquip = { play() {} };
    context.playerLoadStats = () => {};
    context.nFormatter = String;
    const equipment = { ...JSON.parse(item(level, refineLevel)), category: 'Sword', rarity: 'Common', tier: 1 };
    if (source === 'companionCharm') {
        Object.assign(equipment, { category: 'Charm', attribute: 'Companion', slot: 'companionCharm' });
        context.player.companionCharm = equipment;
    }
    const equipmentStr = JSON.stringify(equipment);
    if (source === 'inventory') context.player.inventory.equipment = [equipmentStr];
    if (source === 'equipped') context.player.equipped = [equipment];
    context.refineTestEquipment = equipment;
    evaluate(context, `forgeMode = 'refine'; selectRefineEquipment(${JSON.stringify(equipmentStr)}, ${JSON.stringify(source)}, ${source === 'companionCharm' ? -1 : 0}, refineTestEquipment);`);
    return { context, elements };
};

for (const source of ['inventory', 'equipped', 'companionCharm']) {
    test(`successive refinements keep ${source} selected and refresh the preview and costs`, () => {
        const { context, elements } = createRefinePanelContext({ source, refineLevel: 9 });
        for (const nextLevel of [10, 11, 12]) {
            const before = {
                gold: context.player.gold,
                stones: context.player.inventory.refineStones,
                cores: context.player.inventory.guardianCores,
            };
            const costs = evaluate(context, '[refineCost, refineStoneCost, refineCoreCost]');
            elements['#forge-confirm'].onclick();
            const selected = evaluate(context, 'selectedRefineItem');
            assert.equal(selected.equipment.refineLevel, nextLevel);
            assert.equal(selected.equipmentStr, JSON.stringify(selected.equipment));
            assert.equal(selected.source, source);
            assert.equal(source === 'inventory'
                ? JSON.parse(context.player.inventory.equipment[0]).refineLevel
                : context.refineTestEquipment.refineLevel, nextLevel);
            assert.equal(context.player.gold, before.gold - costs[0]);
            assert.equal(context.player.inventory.refineStones, before.stones - costs[1]);
            assert.equal(context.player.inventory.guardianCores, before.cores - costs[2]);
            assert.equal(elements['#refine-preview'].style.display, 'grid');
            assert.equal(elements['#refine-cost'].style.display, 'block');
            assert.match(elements['#refine-current-item'].innerHTML, new RegExp(`\\+${nextLevel} `));
            assert.match(elements['#refine-preview-item'].innerHTML, new RegExp(`\\+${nextLevel + 1} `));
            assert.equal(elements['#refine-cost-amount'].textContent,
                String(evaluate(context, 'getRefineCost(selectedRefineItem.equipment)')));
            assert.equal(elements['#refine-core-cost-amount'].textContent,
                String(evaluate(context, 'getRefineGuardianCoreCost(selectedRefineItem.equipment)')));
            assert.equal(elements['#forge-confirm'].disabled, false);
        }
    });
}

for (const [resources, reason] of [
    [{ cores: 1 }, 'not-enough-guardian-cores'],
    [{ stones: 9 }, 'not-enough-refine-stones'],
    [{ gold: 61875 }, 'not-enough-gold'],
]) {
    test(`refinement stays visible but blocks the next upgrade with ${reason}`, () => {
        const { context, elements } = createRefinePanelContext(resources);
        elements['#forge-confirm'].onclick();
        assert.equal(evaluate(context, 'selectedRefineItem.equipment.refineLevel'), 11);
        assert.equal(elements['#refine-preview'].style.display, 'grid');
        assert.equal(elements['#forge-confirm'].disabled, true);
        assert.equal(elements['#forge-confirm'].textContent, reason);
        const inventory = JSON.stringify(context.player.inventory);
        const gold = context.player.gold;
        elements['#forge-confirm'].onclick();
        assert.equal(JSON.stringify(context.player.inventory), inventory);
        assert.equal(context.player.gold, gold);
    });
}

test('reaching the refinement cap clears the selection and hides the next-upgrade preview', () => {
    const { context, elements } = createRefinePanelContext({ level: 99, refineLevel: 9 });
    elements['#forge-confirm'].onclick();
    assert.equal(JSON.parse(context.player.inventory.equipment[0]).refineLevel, 10);
    assert.equal(evaluate(context, 'selectedRefineItem'), null);
    assert.equal(elements['#refine-preview'].style.display, 'none');
    assert.equal(elements['#refine-cost'].style.display, 'none');
    assert.equal(elements['#forge-confirm'].disabled, true);
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

test('guardian cores keep their legendary gold inside the forge UI', () => {
    const cssSource = read('assets/css/style.css');
    // header badge and refine cost carry a dedicated core modifier ...
    assert.match(forgeSource, /class="forge-material-count guardian-core-count"[^>]*><i class="ra ra-crystal-cluster"/);
    assert.match(indexSource, /class="refine-material-cost guardian-core-cost" id="refine-core-cost"/);
    // ... painted with the same gold as the .Legendary drop line ...
    assert.match(cssSource, /\.forge-material-count\.guardian-core-count,\s*\.refine-material-cost\.guardian-core-cost\s*{[^}]*color:\s*#ffd700/);
    // ... while refine stones stay on the shared material blue
    assert.doesNotMatch(indexSource, /refine-material-cost guardian-core-cost"[^"]*refine-stone-cost-amount/);
});

test('a Guardian Core drop is counted in the run statistics and survives a save reload', () => {
    const context = createContext();
    vm.runInContext('document = { querySelector: () => ({ addEventListener() {} }) };', context);
    vm.runInContext(read('assets/js/dungeon.js'), context);

    assert.equal(evaluate(context, 'dungeon.statistics.guardianCoresCollected'), 0);

    vm.runInContext('Math.random = () => 0.49;', context);
    assert.equal(evaluate(context, 'grantGuardianCoreDrop(45, 15, 0)'), 1);
    assert.equal(evaluate(context, 'grantGuardianCoreDrop(45, 15, 0)'), 1);
    assert.equal(context.player.inventory.guardianCores, 2);
    assert.equal(evaluate(context, 'dungeon.statistics.guardianCoresCollected'), 2);

    // an older save without the field is normalized instead of summing into NaN
    evaluate(context, 'delete dungeon.statistics.guardianCoresCollected');
    evaluate(context, 'recordRunGuardianCoresCollected(3)');
    assert.equal(evaluate(context, 'dungeon.statistics.guardianCoresCollected'), 3);

    evaluate(context, 'resetRunStatistics()');
    assert.equal(evaluate(context, 'dungeon.statistics.guardianCoresCollected'), 0);
});

test('the run summary lists collected Guardian Cores next to Refine Stones', () => {
    const context = createContext();
    const mainSource = read('assets/js/main.js');
    vm.runInContext(mainSource.slice(mainSource.indexOf('const showEndgameScreen ='),
        mainSource.indexOf('const startNewRunAfterEndgame =')), context);

    vm.runInContext(`
        statsEl = { innerHTML: '' };
        modalEl = { dataset: {}, style: {}, querySelector: sel => (sel === '#endgame-stats' ? statsEl : null) };
        document = { querySelector: sel => (sel === '#endgameModal' ? modalEl : null) };
        t = (key) => key;
        nFormatter = (v) => String(v);
        formatRunDuration = () => '0:00';
        getPlayerTitleDefinition = () => null;
        applyTranslations = () => {};
    `, context);
    evaluate(context, 'showEndgameScreen({ guardianCoresCollected: 4, refineStonesCollected: 9000, result: "defeat" })');

    const html = evaluate(context, 'statsEl.innerHTML');
    const row = (key, value) => '<span class="label" data-i18n="' + key + '">' + key + '</span><span class="value">' + value + '</span>';
    assert.ok(html.includes(row('refine-stones', '9000')), html);
    assert.ok(html.includes(row('guardian-cores', '4')), html);
    assert.ok(html.indexOf('data-i18n="refine-stones"') < html.indexOf('data-i18n="guardian-cores"'));
    assert.ok(html.indexOf('data-i18n="guardian-cores"') < html.indexOf('data-i18n="loot-drops"'));

    evaluate(context, 'showEndgameScreen({ result: "defeat" })');
    const emptyHtml = evaluate(context, 'statsEl.innerHTML');
    assert.ok(emptyHtml.includes(row('guardian-cores', '0')), emptyHtml);
});
