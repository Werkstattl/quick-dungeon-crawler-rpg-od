const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const progressionSource = fs.readFileSync(path.join(root, 'assets/js/progression.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(root, 'assets/js/main.js'), 'utf8');

const maxEquipmentLevel = vm.runInNewContext(
    `${progressionSource}\nMAX_EQUIPMENT_LEVEL`,
);

const selectionExpressionMatch = mainSource.match(
    /const autoSellBelowLevelSelected = ([\s\S]*?);\n\s*const autoSellLevelOptionsMarkup/,
);

assert.ok(selectionExpressionMatch, 'auto-sell level selection expression should be present');

const selectAutoSellLevel = (autoSellBelowLevel) => vm.runInNewContext(
    `(${selectionExpressionMatch[1]})`,
    { autoSellBelowLevel, MAX_EQUIPMENT_LEVEL: maxEquipmentLevel },
);

test('auto-sell settings preserve Level 100 as the selected threshold', () => {
    assert.equal(maxEquipmentLevel, 100);
    assert.equal(selectAutoSellLevel(100), 100);
});

test('auto-sell settings normalize invalid and out-of-range thresholds', () => {
    assert.equal(selectAutoSellLevel(Number.NaN), 0);
    assert.equal(selectAutoSellLevel(99), 90);
    assert.equal(selectAutoSellLevel(110), 100);
});

test('auto-sell level options include the equipment level cap', () => {
    assert.match(
        mainSource,
        /const autoSellLevelOptions = \[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100\]/,
    );
});
