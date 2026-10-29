const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const progressionSource = fs.readFileSync(path.join(root, 'assets/js/progression.js'), 'utf8');
const dungeonSource = fs.readFileSync(path.join(root, 'assets/js/dungeon.js'), 'utf8');
const playerSource = fs.readFileSync(path.join(root, 'assets/js/player.js'), 'utf8')
    .replace('const playerLoadStats =', 'let playerLoadStats =');

const createContext = (gold, lvl, selectedCurseLevel = 1) => {
    const element = () => ({
        dataset: {}, children: [], innerHTML: '',
        appendChild(child) { this.children.push(child); },
        addEventListener() {},
    });
    const panel = element();
    const rerollButton = { listeners: [], addEventListener(type, fn) { this.listeners.push(fn); } };
    const sounds = [];
    const context = vm.createContext({
        STORAGE_KEYS: {}, safeLoad: () => null,
        localStorage: { getItem: () => null },
        document: {
            querySelector: selector => {
                if (selector === '#lvlupSelect') return panel;
                if (selector === '#lvlReroll') return rerollButton;
                return element();
            },
            createElement: element,
        },
        t: (key, vars = {}) => `${key}:${vars.cost ?? `${vars.remaining}/${vars.total}`}`,
        nFormatter: (num) => String(num),
        sfxSell: { play: () => sounds.push('sell') },
        sfxDeny: { play: () => sounds.push('deny') },
        getCurrentCompanionBonuses: () => ({}),
    });
    vm.runInContext(progressionSource, context);
    vm.runInContext(playerSource, context);
    vm.runInContext(dungeonSource, context);
    vm.runInContext(`
        playerLoadStats = () => {};
        player = {
            lvl: ${lvl}, gold: ${gold}, selectedCurseLevel: ${JSON.stringify(selectedCurseLevel)},
            exp: { lvlGained: 1 },
            baseStats: {}, bonusStats: {}, equippedStats: {}, stats: {},
        };
        dungeon = { floorBuffs: {} };
    `, context);
    return { context, panel, rerollButton, sounds };
};

test('level-up reroll gold cost scales with player level', () => {
    const { context } = createContext(0, 1);
    const costs = [1, 10, 50, 100].map(lvl => vm.runInContext(`getLevelUpRerollGoldCost(${lvl})`, context));
    assert.deepEqual(costs, [806, 8600, 55000, 140000]);
});

test('level-up reroll gold cost scales with the selected Curse and clamps invalid levels', () => {
    for (const [curseLevel, expectedCost] of [
        [1, 8600],
        [5, 868600],
        [15, 3018600],
        [999, 3018600],
        [0, 8600],
        ['invalid', 8600],
    ]) {
        const { context } = createContext(0, 10, curseLevel);
        assert.equal(vm.runInContext('getLevelUpRerollGoldCost()', context), expectedCost);
    }
});

test('level-up reroll charges gold once free rerolls are exhausted', () => {
    const { context, panel, rerollButton, sounds } = createContext(17200, 10);
    vm.runInContext('generateLvlStats(0, { hp: 11, atk: 9, def: 9 })', context);
    assert.match(panel.innerHTML, /reroll-gold-button:.*8600/);

    rerollButton.listeners.at(-1)();
    assert.equal(vm.runInContext('player.gold', context), 8600);
    rerollButton.listeners.at(-1)();
    assert.equal(vm.runInContext('player.gold', context), 0);
    rerollButton.listeners.at(-1)();
    assert.equal(vm.runInContext('player.gold', context), 0);
    assert.deepEqual(sounds, ['sell', 'sell', 'deny']);
});

test('free rerolls do not cost gold', () => {
    const { context, rerollButton } = createContext(500, 10);
    vm.runInContext('generateLvlStats(2, { hp: 11, atk: 9, def: 9 })', context);
    rerollButton.listeners.at(-1)();
    assert.equal(vm.runInContext('player.gold', context), 500);
});
