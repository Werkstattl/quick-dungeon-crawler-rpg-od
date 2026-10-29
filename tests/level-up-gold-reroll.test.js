const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const playerSource = fs.readFileSync(path.join(root, 'assets/js/player.js'), 'utf8')
    .replace('const playerLoadStats =', 'let playerLoadStats =');

const createContext = (gold, lvl) => {
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
                return null;
            },
            createElement: element,
        },
        t: (key, vars = {}) => `${key}:${vars.cost ?? `${vars.remaining}/${vars.total}`}`,
        nFormatter: (num) => String(num),
        sfxSell: { play: () => sounds.push('sell') },
        sfxDeny: { play: () => sounds.push('deny') },
        getCurrentCompanionBonuses: () => ({}),
    });
    vm.runInContext(playerSource, context);
    vm.runInContext(`
        playerLoadStats = () => {};
        player = {
            lvl: ${lvl}, gold: ${gold}, exp: { lvlGained: 1 },
            baseStats: {}, bonusStats: {}, equippedStats: {}, stats: {},
        };
        dungeon = { floorBuffs: {} };
    `, context);
    return { context, panel, rerollButton, sounds };
};

test('level-up reroll gold cost scales with player level', () => {
    const { context } = createContext(0, 1);
    const costs = [1, 10, 50, 100].map(lvl => vm.runInContext(`getLevelUpRerollGoldCost(${lvl})`, context));
    assert.deepEqual(costs, [55, 1000, 15000, 55000]);
});

test('level-up reroll charges gold once free rerolls are exhausted', () => {
    const { context, panel, rerollButton, sounds } = createContext(2000, 10);
    vm.runInContext('generateLvlStats(0, { hp: 11, atk: 9, def: 9 })', context);
    assert.match(panel.innerHTML, /reroll-gold-button:.*1000/);

    rerollButton.listeners.at(-1)();
    assert.equal(vm.runInContext('player.gold', context), 1000);
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
