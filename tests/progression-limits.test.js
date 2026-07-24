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

test('active progression limits preserve the current gameplay caps', () => {
    const limits = evaluateProgression(`({
        minCurse: MIN_CURSE_LEVEL,
        maxStandardCurse: MAX_STANDARD_CURSE_LEVEL,
        maxCurse: MAX_CURSE_LEVEL,
        maxEquipment: MAX_EQUIPMENT_LEVEL,
    })`);

    assert.deepEqual(
        JSON.parse(JSON.stringify(limits)),
        { minCurse: 1, maxStandardCurse: 10, maxCurse: 10, maxEquipment: 100 },
    );
});

test('curse values from old or malformed saves are normalized as before', () => {
    const cases = [
        [undefined, 1],
        [null, 1],
        [-5, 1],
        [1, 1],
        [5.6, 6],
        [10, 10],
        [11, 10],
        [999, 10],
        ['invalid', 1],
    ];

    for (const [value, expected] of cases) {
        const serialized = value === undefined ? 'undefined' : JSON.stringify(value);
        assert.equal(evaluateProgression(`clampCurseLevel(${serialized})`), expected);
    }
});

test('equipment levels remain bounded between 1 and 100', () => {
    const cases = [
        [undefined, 1],
        [-5, 1],
        [1, 1],
        [50.6, 51],
        [100, 100],
        [101, 100],
    ];

    for (const [value, expected] of cases) {
        const serialized = value === undefined ? 'undefined' : JSON.stringify(value);
        assert.equal(evaluateProgression(`clampEquipmentLevel(${serialized})`), expected);
    }
});

test('progression limits load before scripts that consume them', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const progressionIndex = html.indexOf('assets/js/progression.js');

    assert.ok(progressionIndex >= 0);
    for (const script of ['player.js', 'equipment.js', 'forge.js', 'companion.js', 'dungeon.js', 'main.js']) {
        assert.ok(progressionIndex < html.indexOf(`assets/js/${script}`), `${script} must load after progression.js`);
    }
});
