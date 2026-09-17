const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../assets/js/enemy.js'), 'utf8');
const createContext = (affixMultiplier = 1) => {
    const context = vm.createContext({
        player: { stats: { luck: 0 } },
        dungeon: { progress: { floor: 100 }, settings: { enemyScaling: 2.5 } },
        randomizeNum: (min, max) => max,
        randomizeDecimal: (min, max) => max,
        getCurseLevelFromEnemyScaling: () => 15,
        applyAffixStats: (stats) => { stats.critDmg *= affixMultiplier; },
    });
    vm.runInContext(source, context);
    return context;
};

test('all enemy conditions cap high-level crit damage at 800 percent', () => {
    const context = createContext();
    for (const condition of ['base', 'guardian', 'sboss']) {
        vm.runInContext(`enemy.lvl = 500; setEnemyStats('Lethal', '${condition}')`, context);
        assert.equal(vm.runInContext('enemy.stats.critDmg', context), 800);
    }
});

test('crit damage below the cap stays unchanged', () => {
    const context = createContext();
    vm.runInContext("enemy.lvl = 97; setEnemyStats('Lethal', 'guardian')", context);
    assert.equal(vm.runInContext('enemy.stats.critDmg', context), 504.6875);
});

test('the cap applies after dungeon and affix multipliers', () => {
    const context = createContext(2);
    vm.runInContext("enemy.lvl = 1; setEnemyStats('Lethal', 'base')", context);
    context.dungeon.enemyMultipliers.critDmg = 10;
    vm.runInContext("setEnemyStats('Lethal', 'base')", context);
    assert.equal(vm.runInContext('enemy.stats.critDmg', context), 800);
});

test('restoring an encounter caps saved crit damage without increasing lower values', () => {
    const context = createContext();
    for (const value of [1200, 800, 50, 0]) {
        vm.runInContext(`enemy.stats.critDmg = ${value}; ensureEnemyAffixState()`, context);
        assert.equal(vm.runInContext('enemy.stats.critDmg', context), Math.min(value, 800));
    }
});
