const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const progressionSource = fs.readFileSync(path.join(root, 'assets/js/progression.js'), 'utf8');

const evaluateProgression = (expression) => {
    const context = vm.createContext({});
    vm.runInContext(progressionSource, context);
    return vm.runInContext(expression, context);
};

test('equipment tiers span 1 through 15 while item levels remain capped at 100', () => {
    const limits = evaluateProgression(`({
        minTier: MIN_EQUIPMENT_TIER,
        maxTier: MAX_EQUIPMENT_TIER,
        maxLevel: MAX_EQUIPMENT_LEVEL,
    })`);

    assert.deepEqual(
        JSON.parse(JSON.stringify(limits)),
        { minTier: 1, maxTier: 15, maxLevel: 100 },
    );
});

test('equipment tier values are normalized between 1 and 15', () => {
    const cases = [
        [undefined, 1],
        ['invalid', 1],
        [-5, 1],
        [1, 1],
        [10, 10],
        [11, 11],
        [15, 15],
        [99, 15],
    ];

    for (const [value, expected] of cases) {
        const serialized = value === undefined ? 'undefined' : JSON.stringify(value);
        assert.equal(evaluateProgression(`clampEquipmentTier(${serialized})`), expected);
    }
});

test('Curse enemy scaling maps to matching equipment tiers through Tier 15', () => {
    const cases = [
        [1.1, 1],
        [2, 10],
        [2.1, 11],
        [2.2, 12],
        [2.5, 15],
        [3, 15],
    ];

    for (const [scaling, expectedTier] of cases) {
        assert.equal(evaluateProgression(`getEquipmentTierFromEnemyScaling(${scaling})`), expectedTier);
    }
});

test('equipment tiers use their matching enemy scaling during stat rolls', () => {
    const cases = [
        [1, 1.1],
        [10, 2],
        [11, 2.1],
        [12, 2.2],
        [15, 2.5],
        [99, 2.5],
    ];

    for (const [tier, expectedScaling] of cases) {
        assert.equal(evaluateProgression(`getEnemyScalingFromEquipmentTier(${tier})`), expectedScaling);
    }
});

test('every supported equipment tier round-trips through enemy scaling', () => {
    for (let tier = 1; tier <= 15; tier++) {
        assert.equal(
            evaluateProgression(`getEquipmentTierFromEnemyScaling(getEnemyScalingFromEquipmentTier(${tier}))`),
            tier,
        );
    }
});

test('equipment generation, rerolls, and forging consume the shared tier limits', () => {
    const equipmentSource = fs.readFileSync(path.join(root, 'assets/js/equipment.js'), 'utf8');
    const forgeSource = fs.readFileSync(path.join(root, 'assets/js/forge.js'), 'utf8');

    assert.match(equipmentSource, /equipment\.tier = getEquipmentTierFromEnemyScaling\(dungeon\.settings\.enemyScaling\)/);
    assert.match(equipmentSource, /equipment\.tier = clampEquipmentTier\(equipment\.tier\)/);
    assert.match(equipmentSource, /getEnemyScalingFromEquipmentTier\(equipment\.tier\)/);
    assert.doesNotMatch(equipmentSource, /enemyScaling > 2/);
    assert.match(forgeSource, /forgedEquipment\.tier = item1\.tier/);
    assert.match(forgeSource, /const maxLvl = clampEquipmentLevel\(avgLvl \+ 2\)/);
});
