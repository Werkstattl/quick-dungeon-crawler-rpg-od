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

test('Curse 1 through 10 retain their existing linear enemy scaling', () => {
    for (let curseLevel = 1; curseLevel <= 10; curseLevel++) {
        const expectedScaling = 1 + (curseLevel / 10);
        assert.equal(
            evaluateProgression(`getEnemyScalingFromCurseLevel(${curseLevel})`),
            expectedScaling,
        );
    }
});

test('Curse 11 through 15 continue the same curve from 2.1 through 2.5', () => {
    const expected = [2.1, 2.2, 2.3, 2.4, 2.5];
    const actual = [11, 12, 13, 14, 15].map((curseLevel) => (
        evaluateProgression(`getEnemyScalingFromCurseLevel(${curseLevel})`)
    ));

    assert.deepEqual(actual, expected);
});

test('Curse and enemy scaling round-trip for every supported level', () => {
    for (let curseLevel = 1; curseLevel <= 15; curseLevel++) {
        assert.equal(
            evaluateProgression(`getCurseLevelFromEnemyScaling(getEnemyScalingFromCurseLevel(${curseLevel}))`),
            curseLevel,
        );
    }
});

test('enemy and equipment progression use the same scaling at every Curse tier', () => {
    for (let curseLevel = 1; curseLevel <= 15; curseLevel++) {
        assert.equal(
            evaluateProgression(`getEnemyScalingFromCurseLevel(${curseLevel})`),
            evaluateProgression(`getEnemyScalingFromEquipmentTier(${curseLevel})`),
        );
    }

    const enemySource = fs.readFileSync(path.join(root, 'assets/js/enemy.js'), 'utf8');
    const equipmentSource = fs.readFileSync(path.join(root, 'assets/js/equipment.js'), 'utf8');
    assert.match(enemySource, /\(dungeon\.settings\.enemyScaling - 1\) \* enemy\.lvl/);
    assert.match(equipmentSource, /\(enemyScaling - 1\) \* equipment\.lvl/);
});

test('higher Curse tiers increase the linear level coefficient predictably', () => {
    const level = 100;
    const coefficients = [10, 11, 12, 13, 14, 15].map((curseLevel) => (
        evaluateProgression(`Math.round((getEnemyScalingFromCurseLevel(${curseLevel}) - 1) * ${level})`)
    ));

    assert.deepEqual(coefficients, [100, 110, 120, 130, 140, 150]);
});

test('selected Curse scaling is restored after dungeon data loads', () => {
    const mainSource = fs.readFileSync(path.join(root, 'assets/js/main.js'), 'utf8');
    const allocationStart = mainSource.indexOf('const allocationPopup');
    const enterDungeonCall = mainSource.indexOf('enterDungeon();', allocationStart);
    const scalingAssignment = mainSource.indexOf(
        'dungeon.settings.enemyScaling = getEnemyScalingFromCurseLevel(selectedCurseLevel);',
        enterDungeonCall,
    );
    const saveCall = mainSource.indexOf('saveData();', scalingAssignment);

    assert.ok(allocationStart >= 0);
    assert.ok(enterDungeonCall > allocationStart);
    assert.ok(scalingAssignment > enterDungeonCall);
    assert.ok(saveCall > scalingAssignment);
});

test('Dungeon Monarch availability and encounter weight remain unchanged', () => {
    const dungeonSource = fs.readFileSync(path.join(root, 'assets/js/dungeon.js'), 'utf8');

    assert.match(dungeonSource, /if \(dungeon\.story\.phase >= 4\) \{\s*dungeon\.story\.monarchUnlocked = true;/);
    assert.match(dungeonSource, /eventTypes\.push\("monarch", "monarch"\);/);
});
