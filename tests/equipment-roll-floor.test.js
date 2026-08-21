const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const equipmentSource = fs.readFileSync(path.join(root, 'assets/js/equipment.js'), 'utf8');

const createContext = ({ useMaximum = false } = {}) => {
    const deterministicMath = Object.create(Math);
    deterministicMath.random = () => 0;
    const context = vm.createContext({
        console,
        Math: deterministicMath,
        player: { inventory: { equipment: [], consumables: [], refineStones: 0 }, equipped: [] },
        clampEquipmentTier: (tier) => Math.max(1, Math.min(15, Number(tier) || 1)),
        getEnemyScalingFromEquipmentTier: (tier) => 1 + (tier / 10),
        randomizeNum: (min, max) => Math.round(useMaximum ? max : min),
        randomizeDecimal: (min, max) => useMaximum ? max : min,
    });
    vm.runInContext(equipmentSource, context);
    return context;
};

const evaluate = (context, expression) => vm.runInContext(expression, context);

const rollAttack = (context, tier) => evaluate(context, `
    (() => {
        const equipment = {
            category: 'Sword', attribute: 'Damage', type: 'Weapon', rarity: 'Common',
            tier: ${tier}, lvl: 100, value: 0, stats: [],
        };
        rerollEquipmentStats(equipment, 'atk');
        return equipment.stats.find((stat) => stat.atk !== undefined).atk;
    })()
`);

test('equipment roll floors start rising after Tier 10', () => {
    const context = createContext();
    const floors = evaluate(context, '[1, 10, 11, 12, 13, 14, 15].map(getEquipmentRollFloor)');

    assert.deepEqual(Array.from(floors), [0.5, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75]);
});

test('percentage-stat roll caps rise six percent per tier after Tier 10', () => {
    const context = createContext();
    const caps = evaluate(context, `
        [10, 11, 12, 15].map((tier) => ({
            atkSpd: getEquipmentStatRollCap('atkSpd', tier),
            vamp: getEquipmentStatRollCap('vamp', tier),
            critRate: getEquipmentStatRollCap('critRate', tier),
            critDmg: getEquipmentStatRollCap('critDmg', tier),
            dodge: getEquipmentStatRollCap('dodge', tier),
            fasterRun: getEquipmentStatRollCap('fasterRun', tier),
            luck: getEquipmentStatRollCap('luck', tier),
        }))
    `);

    assert.deepEqual(JSON.parse(JSON.stringify(caps)), [
        { atkSpd: 16, vamp: 8, critRate: 10, critDmg: 20, dodge: 4, fasterRun: 18, luck: 8 },
        { atkSpd: 16.96, vamp: 8.48, critRate: 10.6, critDmg: 21.2, dodge: 4.24, fasterRun: 19.08, luck: 8.48 },
        { atkSpd: 17.92, vamp: 8.96, critRate: 11.2, critDmg: 22.4, dodge: 4.48, fasterRun: 20.16, luck: 8.96 },
        { atkSpd: 20.8, vamp: 10.4, critRate: 13, critDmg: 26, dodge: 5.2, fasterRun: 23.4, luck: 10.4 },
    ]);
});

test('endgame tiers substantially raise minimum primary-stat rolls', () => {
    const context = createContext();
    const tier10 = rollAttack(context, 10);
    const tier11 = rollAttack(context, 11);
    const tier12 = rollAttack(context, 12);

    assert.equal(tier10, 808);
    assert.equal(tier11, 1074);
    assert.equal(tier12, 1394);
    assert.ok(tier11 / tier10 > 1.3);
    assert.ok(tier12 / tier11 > 1.29);
});

test('roll-floor improvement does not inflate each tier maximum', () => {
    const context = createContext({ useMaximum: true });

    assert.equal(rollAttack(context, 10), 4848);
    assert.equal(rollAttack(context, 11), 5328);
    assert.equal(rollAttack(context, 12), 5808);
});

test('endgame roll floors also improve capped percentage-stat minimums', () => {
    const context = createContext();
    const rollCappedAttackSpeed = (tier) => evaluate(context, `
        (() => {
            const equipment = {
                category: 'Sword', attribute: 'Damage', type: 'Weapon', rarity: 'Common',
                tier: ${tier}, lvl: 100, value: 0, stats: [{ atk: 1 }, { atkSpd: 1 }],
            };
            rerollEquipmentStats(equipment, 'atkSpd', { lockedStatKeys: ['atk'] });
            return equipment.stats.find((stat) => stat.atkSpd !== undefined).atkSpd;
        })()
    `);

    assert.equal(rollCappedAttackSpeed(10), 8);
    assert.ok(Math.abs(rollCappedAttackSpeed(11) - 9.328) < 1e-9);
    assert.ok(Math.abs(rollCappedAttackSpeed(12) - 10.752) < 1e-9);
});

test('Companion Charm minimum rolls use the same endgame floor progression', () => {
    const context = createContext();
    const rollCharmAttack = (tier) => evaluate(
        context,
        `rollCompanionCharmStatValue('atk', { rarity: 'Common', tier: ${tier}, lvl: 100 }, ${1 + (tier / 10)})`,
    );

    assert.equal(rollCharmAttack(10), 11);
    assert.equal(rollCharmAttack(11), 12);
    assert.equal(rollCharmAttack(12), 13);
});
