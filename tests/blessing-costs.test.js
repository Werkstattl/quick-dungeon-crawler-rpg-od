const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const progressionSource = fs.readFileSync(path.join(root, 'assets/js/progression.js'), 'utf8');
const dungeonSource = fs.readFileSync(path.join(root, 'assets/js/dungeon.js'), 'utf8');

const context = vm.createContext({
    console,
    Date,
    localStorage: { getItem() { return null; } },
    document: {
        querySelector() {
            return {
                addEventListener() {},
                appendChild() {},
                insertBefore() {},
                querySelectorAll() { return []; },
            };
        },
        createElement() { return { innerHTML: '' }; },
    },
});
vm.runInContext(progressionSource, context);
vm.runInContext(dungeonSource, context);

const evaluate = (expression) => vm.runInContext(expression, context);

test('Curse 1 retains the existing blessing cost curve', () => {
    assert.equal(evaluate('getBlessingCost(1, 1)'), 1000);
    assert.equal(evaluate('getBlessingCost(2, 1)'), 1750);
});

test('blessing costs increase by five percent for each Curse above 1', () => {
    assert.equal(evaluate('getBlessingCost(1, 5)'), 1200);
    assert.equal(evaluate('getBlessingCost(1, 10)'), 1450);
    assert.equal(evaluate('getBlessingCost(1, 15)'), 1700);
});

test('scaled blessing costs are rounded to whole gold', () => {
    assert.equal(evaluate('getBlessingCost(2, 10)'), 2538);
});

test('the blessing event uses the selected Curse level', () => {
    assert.match(
        dungeonSource,
        /getBlessingCost\(player\.blessing, player\.selectedCurseLevel\)/,
    );
});
