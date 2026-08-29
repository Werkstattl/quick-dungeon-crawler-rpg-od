const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const forgeSource = fs.readFileSync(path.join(root, 'assets/js/forge.js'), 'utf8');
const equipmentSource = fs.readFileSync(path.join(root, 'assets/js/equipment.js'), 'utf8');

const evaluate = (context, expression) => vm.runInContext(expression, context);

const createForgeContext = (globals = {}) => {
    const context = vm.createContext({ console, ...globals });
    vm.runInContext(forgeSource, context);
    return context;
};

test('stat lock costs require Gold and Refine Stones and rise with rarity, tier, and locks', () => {
    const context = createForgeContext();
    const commonTierOne = evaluate(context, 'getStatLockRerollCosts({ value: 1000, rarity: "Common", tier: 1 }, 1)');
    const rareTierOne = evaluate(context, 'getStatLockRerollCosts({ value: 1000, rarity: "Rare", tier: 1 }, 1)');
    const rareTierFive = evaluate(context, 'getStatLockRerollCosts({ value: 1000, rarity: "Rare", tier: 5 }, 1)');
    const rareTierFiveTwoLocks = evaluate(context, 'getStatLockRerollCosts({ value: 1000, rarity: "Rare", tier: 5 }, 2)');
    const normalReroll = evaluate(context, 'getStatLockRerollCosts({ value: 1000, rarity: "Heirloom", tier: 15 }, 0)');

    assert.ok(commonTierOne.gold > 10000);
    assert.ok(commonTierOne.stones >= 1);
    assert.ok(rareTierOne.gold > commonTierOne.gold);
    assert.ok(rareTierOne.stones > commonTierOne.stones);
    assert.ok(rareTierFive.gold > rareTierOne.gold);
    assert.ok(rareTierFive.stones > rareTierOne.stones);
    assert.ok(rareTierFiveTwoLocks.gold > rareTierFive.gold);
    assert.ok(rareTierFiveTwoLocks.stones > rareTierFive.stones);
    assert.equal(normalReroll.gold, 10000);
    assert.equal(normalReroll.stones, 0);
});

test('each additional stat lock costs more than the previous one', () => {
    const context = createForgeContext();
    const item = '{ value: 1000, rarity: "Legendary", tier: 10 }';
    const [one, two, three] = [1, 2, 3].map((locks) => evaluate(context, `getStatLockRerollCosts(${item}, ${locks})`));

    assert.ok(two.gold - one.gold > one.gold - evaluate(context, `getStatLockRerollCosts(${item}, 0)`).gold);
    assert.ok(three.gold - two.gold > two.gold - one.gold);
    assert.ok(three.stones - two.stones > two.stones - one.stones);
});

test('high-tier stat lock rerolls use the reduced Refine Stone cost without reducing Gold', () => {
    const context = createForgeContext();
    const costs = evaluate(
        context,
        'getStatLockRerollCosts({ value: 74725, lvl: 98, rarity: "Heirloom", tier: 12 }, 3)',
    );

    assert.deepEqual({ ...costs }, { gold: 18450070, stones: 149 });
});

const createEquipmentContext = (randomValues = [0]) => {
    const deterministicMath = Object.create(Math);
    let randomIndex = 0;
    deterministicMath.random = () => randomValues[Math.min(randomIndex++, randomValues.length - 1)];
    const context = vm.createContext({
        console,
        Math: deterministicMath,
        player: { inventory: { equipment: [], consumables: [], refineStones: 0 }, equipped: [] },
        clampEquipmentTier: (tier) => Math.max(1, Math.min(15, Number(tier) || 1)),
        getEnemyScalingFromEquipmentTier: (tier) => 1 + (tier / 10),
        randomizeNum: (min) => Math.round(min),
        randomizeDecimal: (min) => min,
    });
    vm.runInContext(equipmentSource, context);
    return context;
};

test('selective reroll preserves locked values and their inferred legacy roll budget', () => {
    const context = createEquipmentContext();
    const result = evaluate(context, `
        (() => {
            const equipment = {
                category: 'Sword',
                attribute: 'Damage',
                type: 'Weapon',
                rarity: 'Rare',
                tier: 5,
                lvl: 40,
                value: 5000,
                stats: [{ atk: 123 }, { critRate: 7.5 }, { vamp: 3.25 }],
            };
            rerollEquipmentStats(equipment, null, { lockedStatKeys: ['atk'] });
            return equipment;
        })()
    `);

    assert.deepEqual(JSON.parse(JSON.stringify(result.stats.find((stat) => stat.atk !== undefined))), { atk: 123 });
    assert.equal(result.stats.some((stat) => stat.critRate === 7.5), false);
    assert.equal(result.stats.some((stat) => stat.vamp === 3.25), false);
    assert.equal(result.stats.find((stat) => stat.atkSpd !== undefined).atkSpd, 31.5);
    assert.equal(result.stats.length, 2);
    assert.deepEqual(JSON.parse(JSON.stringify(result.statRolls)), { atk: 2, atkSpd: 2 });
    assert.ok(result.value > 0);
});

test('repeated selective rerolls preserve total roll count while allowing stacked results', () => {
    const context = createEquipmentContext([0]);
    const result = evaluate(context, `
        (() => {
            const equipment = {
                category: 'Sword', attribute: 'Damage', type: 'Weapon', rarity: 'Rare',
                tier: 5, lvl: 40, value: 5000,
                stats: [{ atk: 123 }, { critRate: 7.5 }, { critDmg: 12 }, { vamp: 3.25 }],
            };
            const rollCounts = [];
            for (let reroll = 0; reroll < 10; reroll += 1) {
                rerollEquipmentStats(equipment, null, { lockedStatKeys: ['atk'] });
                rollCounts.push(Object.values(equipment.statRolls).reduce((total, count) => total + count, 0));
            }
            return { equipment, rollCounts };
        })()
    `);

    assert.deepEqual(Array.from(result.rollCounts), Array(10).fill(4));
    assert.deepEqual(JSON.parse(JSON.stringify(result.equipment.stats.find((stat) => stat.atk !== undefined))), { atk: 123 });
    assert.deepEqual(JSON.parse(JSON.stringify(result.equipment.statRolls)), { atk: 1, atkSpd: 3 });
});

test('a three-roll locked stat leaves exactly one roll on a Rare item', () => {
    const context = createEquipmentContext([0]);
    const result = evaluate(context, `
        (() => {
            const equipment = {
                category: 'Hammer', attribute: 'Damage', type: 'Weapon', rarity: 'Rare',
                tier: 5, lvl: 40, value: 5000,
                stats: [{ atk: 270 }, { hp: 80 }],
                statRolls: { atk: 3, hp: 1 },
            };
            rerollEquipmentStats(equipment, null, { lockedStatKeys: ['atk'] });
            return equipment;
        })()
    `);

    assert.deepEqual(JSON.parse(JSON.stringify(result.stats.find((stat) => stat.atk !== undefined))), { atk: 270 });
    assert.deepEqual(JSON.parse(JSON.stringify(result.statRolls)), { atk: 3, hp: 1 });
    assert.equal(Object.values(result.statRolls).reduce((total, count) => total + count, 0), 4);
});

test('two remaining rolls can stack onto the same stat after a lock', () => {
    const context = createEquipmentContext([0]);
    const result = evaluate(context, `
        (() => {
            const equipment = {
                category: 'Hammer', attribute: 'Damage', type: 'Weapon', rarity: 'Rare',
                tier: 5, lvl: 40, value: 5000,
                stats: [{ atk: 180 }, { hp: 160 }],
                statRolls: { atk: 2, hp: 2 },
            };
            rerollEquipmentStats(equipment, null, { lockedStatKeys: ['atk'] });
            return equipment;
        })()
    `);

    assert.deepEqual(JSON.parse(JSON.stringify(result.stats.find((stat) => stat.atk !== undefined))), { atk: 180 });
    assert.deepEqual(JSON.parse(JSON.stringify(result.statRolls)), { atk: 2, hp: 2 });
    assert.equal(result.stats.length, 2);
});

test('legacy roll migration assigns obvious stacked values without increasing rarity budget', () => {
    const context = createEquipmentContext();
    const rolls = evaluate(context, `getEquipmentStatRollCounts({
        category: 'Hammer', attribute: 'Damage', type: 'Weapon', rarity: 'Rare',
        tier: 5, lvl: 40, stats: [{ atk: 270 }, { hp: 80 }],
    })`);

    assert.deepEqual(JSON.parse(JSON.stringify(rolls)), { atk: 3, hp: 1 });
});

test('invalid stored roll metadata falls back to the bounded legacy migration', () => {
    const context = createEquipmentContext();
    const rolls = evaluate(context, `getEquipmentStatRollCounts({
        category: 'Hammer', attribute: 'Damage', type: 'Weapon', rarity: 'Rare',
        tier: 5, lvl: 40, stats: [{ atk: 270 }, { hp: 80 }],
        statRolls: { atk: 999999, hp: 1 },
    })`);

    assert.deepEqual(JSON.parse(JSON.stringify(rolls)), { atk: 3, hp: 1 });
});

test('a normal reroll records every generated roll', () => {
    const context = createEquipmentContext([0]);
    const result = evaluate(context, `
        (() => {
            const equipment = {
                category: 'Sword', attribute: 'Damage', type: 'Weapon', rarity: 'Rare',
                tier: 5, lvl: 40, value: 0, stats: [],
            };
            rerollEquipmentStats(equipment);
            return equipment;
        })()
    `);

    assert.deepEqual(JSON.parse(JSON.stringify(result.statRolls)), { atk: 4 });
    assert.equal(result.stats.length, 1);
});

test('selective reroll preserves every accepted lock on an extra-roll item', () => {
    const context = createEquipmentContext([0, 0.4]);
    const result = evaluate(context, `
        (() => {
            const equipment = {
                category: 'Sword', attribute: 'Damage', type: 'Weapon', rarity: 'Common',
                tier: 15, lvl: 100, value: 500,
                stats: [{ atk: 40 }, { critRate: 3 }, { vamp: 1.5 }],
            };
            rerollEquipmentStats(equipment, null, { lockedStatKeys: ['atk', 'critRate'] });
            return equipment;
        })()
    `);

    assert.deepEqual(JSON.parse(JSON.stringify(result.stats.find((stat) => stat.atk !== undefined))), { atk: 40 });
    assert.deepEqual(JSON.parse(JSON.stringify(result.stats.find((stat) => stat.critRate !== undefined))), { critRate: 3 });
    assert.equal(result.stats.some((stat) => stat.vamp === 1.5), false);
    assert.equal(result.stats.length, 3);
});

test('selective reroll never preserves malformed stat values', () => {
    const context = createEquipmentContext();
    const result = evaluate(context, `
        (() => {
            const equipment = {
                category: 'Sword', attribute: 'Damage', type: 'Weapon', rarity: 'Rare',
                tier: 5, lvl: 40, value: 500,
                stats: [{ atk: null }, { critRate: 5 }, { vamp: 2 }],
            };
            rerollEquipmentStats(equipment, null, { lockedStatKeys: ['atk'] });
            return equipment;
        })()
    `);

    assert.equal(result.stats.some((stat) => stat.atk === null), false);
    assert.equal(Number.isFinite(result.value), true);
});

test('selective reroll also preserves locked Companion Charm stats', () => {
    const context = createEquipmentContext();
    const result = evaluate(context, `
        (() => {
            const equipment = {
                category: 'Charm', attribute: 'Companion', type: 'Accessory', slot: 'companionCharm',
                rarity: 'Legendary', tier: 5, lvl: 40, value: 5000,
                stats: [{ atk: 10 }, { luck: 2 }, { fasterRun: 3 }],
            };
            rerollEquipmentStats(equipment, null, { lockedStatKeys: ['fasterRun'] });
            return equipment;
        })()
    `);

    assert.deepEqual(JSON.parse(JSON.stringify(result.stats.find((stat) => stat.fasterRun !== undefined))), { fasterRun: 3 });
    assert.equal(result.stats.some((stat) => stat.luck === 2), false);
    assert.equal(result.stats.find((stat) => stat.atk !== undefined).atk, 36);
    assert.equal(result.stats.length, 2);
    assert.deepEqual(JSON.parse(JSON.stringify(result.statRolls)), { fasterRun: 1, atk: 2 });
});

test('stat lock selection rejects unknown stats and always leaves one stat rerollable', () => {
    const context = createForgeContext();
    const locks = evaluate(context, `getValidRerollStatLockKeys({
        stats: [{ atk: 100 }, { critRate: 5 }, { vamp: 2 }]
    }, ['vamp', 'unknown', 'atk', 'critRate'])`);

    assert.deepEqual(JSON.parse(JSON.stringify(locks)), ['vamp', 'atk']);
    assert.deepEqual(
        JSON.parse(JSON.stringify(evaluate(context, 'getValidRerollStatLockKeys({ stats: [{ atk: 100 }] }, ["atk"])'))),
        [],
    );
    assert.deepEqual(
        JSON.parse(JSON.stringify(evaluate(context, `getValidRerollStatLockKeys({
            stats: [{ atk: 'broken' }, { critRate: 5 }, { vamp: 2 }]
        }, ['atk', 'critRate'])`))),
        ['critRate'],
    );
    assert.deepEqual(
        JSON.parse(JSON.stringify(evaluate(context, `getValidRerollStatLockKeys({
            stats: [{ atk: null }, { critRate: '' }, { vamp: 2 }, { critDmg: 3 }]
        }, ['atk', 'critRate', 'vamp'])`))),
        ['vamp'],
    );
});

test('stat lock selection only offers stats supported by the item reroll pool', () => {
    const context = createForgeContext({
        getEquipmentRerollStatPool: () => ['atk', 'critRate'],
    });
    const locks = evaluate(context, `getValidRerollStatLockKeys({
        stats: [{ atk: 100 }, { vamp: 2 }, { critRate: 5 }]
    }, ['vamp', 'atk'])`);

    assert.deepEqual(JSON.parse(JSON.stringify(locks)), ['atk']);
});

test('the reroll preview excludes stats that are already locked', () => {
    const context = createForgeExecutionContext();
    context.previewEquipment = {
        category: 'Sword', attribute: 'Damage', type: 'Weapon', rarity: 'Rare', tier: 5, lvl: 40,
        value: 1000, stats: [{ atk: 123 }, { critRate: 7.5 }, { vamp: 3.25 }],
    };
    const markup = evaluate(context, "renderPossibleRerollStats(previewEquipment, ['atk'])");

    assert.doesNotMatch(markup, /<span class="stat-name">atk<\/span>/);
    assert.match(markup, /<span class="stat-name">critRate<\/span>/);
    assert.match(markup, /class="reroll-roll-budget"/);
});

test('reroll stat lock options are sorted alphabetically by their displayed labels', () => {
    const context = createForgeExecutionContext();
    context.formatEquipmentStatLabel = (stat) => ({
        vamp: 'Alpha',
        atk: 'Bravo',
        critRate: 'Charlie',
    })[stat];
    evaluate(context, `
        selectedRerollItem = {
            equipment: {
                stats: [{ vamp: 3.25 }, { critRate: 7.5 }, { atk: 123 }],
            },
        };
        renderRerollStatLocks();
    `);

    const markup = context.document.querySelector('#reroll-stat-lock-options').innerHTML;
    assert.ok(markup.indexOf('data-reroll-stat-lock="vamp"') < markup.indexOf('data-reroll-stat-lock="atk"'));
    assert.ok(markup.indexOf('data-reroll-stat-lock="atk"') < markup.indexOf('data-reroll-stat-lock="critRate"'));
});

test('stat lock options show how many rolls each value protects', () => {
    const context = createForgeExecutionContext();
    context.getEquipmentStatRollCounts = () => ({ atk: 3, hp: 1 });
    context.getEquipmentRerollStatPool = () => ['atk', 'hp'];
    evaluate(context, `
        selectedRerollItem = {
            equipment: {
                stats: [{ atk: 270 }, { hp: 80 }],
                statRolls: { atk: 3, hp: 1 },
            },
        };
        renderRerollStatLocks();
    `);

    const markup = context.document.querySelector('#reroll-stat-lock-options').innerHTML;
    assert.match(markup, /data-reroll-stat-lock="atk"[^]*🎲 ×3/);
    assert.match(markup, /data-reroll-stat-lock="hp"[^]*🎲 ×1/);
});

const createForgeExecutionContext = ({ gold = 100000, stones = 50, tokens = 1 } = {}) => {
    const elements = new Map();
    const getElement = (selector) => {
        if (!elements.has(selector)) {
            elements.set(selector, {
                style: {},
                classList: { add() {}, remove() {}, toggle() {} },
                parentElement: { style: {} },
                innerHTML: '',
                textContent: '',
                disabled: false,
                appendChild() {},
                addEventListener() {},
                querySelectorAll() { return []; },
                setAttribute() {},
            });
        }
        return elements.get(selector);
    };
    const context = vm.createContext({
        console,
        document: {
            querySelector: getElement,
            querySelectorAll() { return []; },
            createElement() { return getElement(`created-${elements.size}`); },
        },
        t: (key) => key,
        nFormatter: (value) => String(value),
        sfxDeny: { play() {} },
        sfxEquip: { play() {} },
        saveData() {},
        playerLoadStats() {},
        getRefineStoneCount() { return context.player.inventory.refineStones; },
        ensureRefineInventory() { return context.player.inventory.refineStones; },
        getEquipmentStatTotals() { return {}; },
        getEquipmentRerollStatPool() { return ['atk', 'critRate', 'critDmg', 'vamp']; },
        getOrderedEquipmentStats(totals) { return Object.keys(totals || {}); },
        formatEquipmentStatLabel(stat) { return stat; },
        formatEquipmentValue(stat, value) { return String(value); },
        renderEquipmentCard() { return ''; },
        translateEquipText(key, fallback) { return fallback || key; },
        equipmentLabel(rarity, category) { return `${rarity} ${category}`; },
        equipmentName(category) { return category; },
        equipmentIcon() { return ''; },
        rerollEquipmentStats(equipment, forcedStat, options) {
            context.receivedLockedStatKeys = options.lockedStatKeys;
            const locked = equipment.stats.filter((entry) => options.lockedStatKeys.includes(Object.keys(entry)[0]));
            equipment.stats = [...locked, { critDmg: 11 }];
            equipment.statRolls = { atk: 2, critDmg: 2 };
            equipment.value = 4321;
        },
    });
    vm.runInContext(forgeSource, context);
    context.player = {
        gold,
        inventory: { consumables: [], equipment: [], refineStones: stones, forgeTokens: tokens },
        equipped: [],
    };
    return context;
};

test('a stat-locked reroll atomically spends Gold, Refine Stones, and Forge access', () => {
    const context = createForgeExecutionContext();
    const equipment = {
        category: 'Sword', attribute: 'Damage', type: 'Weapon', rarity: 'Rare', tier: 5, lvl: 40,
        value: 1000, stats: [{ atk: 123 }, { critRate: 7.5 }, { vamp: 3.25 }],
    };
    const equipmentStr = JSON.stringify(equipment);
    context.player.inventory.equipment.push(equipmentStr);
    context.equipmentStr = equipmentStr;

    const costs = evaluate(context, `
        selectedRerollItem = { equipment: JSON.parse(equipmentStr), equipmentStr, source: 'inventory', sourceIndex: 0 };
        selectedRerollStatLocks = ['atk'];
        calculateRerollPreview();
        ({ gold: rerollCost, stones: rerollStoneCost });
    `);
    evaluate(context, 'executeReroll()');

    assert.equal(context.player.gold, 100000 - costs.gold);
    assert.equal(context.player.inventory.refineStones, 50 - costs.stones);
    assert.equal(context.player.inventory.forgeTokens, 0);
    assert.deepEqual(JSON.parse(JSON.stringify(context.receivedLockedStatKeys)), ['atk']);
    assert.deepEqual(JSON.parse(context.player.inventory.equipment[0]).stats, [{ atk: 123 }, { critDmg: 11 }]);
    assert.deepEqual(JSON.parse(context.player.inventory.equipment[0]).statRolls, { atk: 2, critDmg: 2 });
});

test('a stat-locked reroll does not spend Forge Tokens for an unlocked owner', () => {
    const context = createForgeExecutionContext({ tokens: 4 });
    context.player.inventory.equipment = [JSON.stringify({
        category: 'Sword', attribute: 'Damage', type: 'Weapon', rarity: 'Rare', tier: 5, lvl: 40,
        value: 1000, stats: [{ atk: 123 }, { critRate: 7.5 }, { vamp: 3.25 }],
    })];
    evaluate(context, `
        forgeUnlocked = true;
        selectedRerollItem = {
            equipment: JSON.parse(player.inventory.equipment[0]),
            equipmentStr: player.inventory.equipment[0],
            source: 'inventory',
            sourceIndex: 0,
        };
        selectedRerollStatLocks = ['atk'];
        calculateRerollPreview();
        executeReroll();
    `);

    assert.equal(context.player.inventory.forgeTokens, 4);
});

test('a stat-locked reroll changes nothing when Refine Stones are missing', () => {
    const context = createForgeExecutionContext({ stones: 0 });
    const equipment = {
        category: 'Sword', attribute: 'Damage', type: 'Weapon', rarity: 'Rare', tier: 5, lvl: 40,
        value: 1000, stats: [{ atk: 123 }, { critRate: 7.5 }, { vamp: 3.25 }],
    };
    const equipmentStr = JSON.stringify(equipment);
    context.player.inventory.equipment.push(equipmentStr);
    context.equipmentStr = equipmentStr;
    evaluate(context, `
        selectedRerollItem = { equipment: JSON.parse(equipmentStr), equipmentStr, source: 'inventory', sourceIndex: 0 };
        selectedRerollStatLocks = ['atk'];
        const costs = getStatLockRerollCosts(selectedRerollItem.equipment, 1);
        rerollCost = costs.gold;
        rerollStoneCost = costs.stones;
    `);

    evaluate(context, 'executeReroll()');

    assert.equal(context.player.gold, 100000);
    assert.equal(context.player.inventory.refineStones, 0);
    assert.equal(context.player.inventory.forgeTokens, 1);
    assert.equal(context.player.inventory.equipment[0], equipmentStr);
    assert.equal(context.receivedLockedStatKeys, undefined);
});

test('stat lock controls and translations ship in every locale', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    assert.match(html, /id="reroll-stat-locks"/);
    assert.match(html, /id="reroll-stone-cost-amount"/);

    const localeDir = path.join(root, 'assets/locales');
    for (const fileName of fs.readdirSync(localeDir).filter((name) => name.endsWith('.json'))) {
        const locale = JSON.parse(fs.readFileSync(path.join(localeDir, fileName), 'utf8'));
        assert.ok(locale['stat-lock'], `${fileName} is missing stat-lock`);
        assert.ok(locale['stat-lock-help'], `${fileName} is missing stat-lock-help`);
    }
});
