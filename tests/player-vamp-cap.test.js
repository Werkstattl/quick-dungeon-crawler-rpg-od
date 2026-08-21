const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const playerSource = fs.readFileSync(path.join(root, 'assets/js/player.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(root, 'assets/js/main.js'), 'utf8');
const calculateStatsSource = mainSource.slice(
    mainSource.indexOf('const calculateStats ='),
    mainSource.indexOf('// Resets the progress back to start.', mainSource.indexOf('const calculateStats =')),
);

const createContext = () => {
    const context = vm.createContext({
        console,
        STORAGE_KEYS: { player: 'player', playerBackup: 'playerBackup' },
        safeLoad: () => null,
        localStorage: { getItem: () => null },
        document: { querySelector: () => null },
    });
    vm.runInContext(playerSource, context);
    vm.runInContext(calculateStatsSource, context);
    return context;
};

test('player Vampirism is capped at 80 while preserving its uncapped value', () => {
    const context = createContext();
    const result = vm.runInContext(`
        (() => {
            player = {
                skills: [], selectedPassive: null,
                baseStats: { hp: 100, atk: 10, def: 10, atkSpd: 0.6, vamp: 10, critRate: 0, critDmg: 0, dodge: 0, fasterRun: 0 },
                bonusStats: { hp: 0, atk: 0, def: 0, atkSpd: 0, vamp: 50, critRate: 0, critDmg: 0, dodge: 0, luck: 0, fasterRun: 0 },
                equippedStats: { hp: 0, atk: 0, def: 0, atkSpd: 0, vamp: 50, critRate: 0, critDmg: 0, dodge: 0, luck: 0, fasterRun: 0 },
                stats: {},
            };
            dungeon = { floorBuffs: { atk: 0, def: 0, atkSpd: 0 }, progress: { floor: 1 } };
            calculateStats();
            return { vamp: player.stats.vamp, uncapped: player.stats.vampUncapped };
        })()
    `, context);

    assert.deepEqual(JSON.parse(JSON.stringify(result)), { vamp: 80, uncapped: 110 });
});

test('Vampirism values below the cap remain unchanged', () => {
    const context = createContext();
    const result = vm.runInContext(`
        (() => {
            player = {
                skills: [], selectedPassive: null,
                baseStats: { hp: 100, atk: 10, def: 10, atkSpd: 0.6, vamp: 5, critRate: 0, critDmg: 0, dodge: 0, fasterRun: 0 },
                bonusStats: { hp: 0, atk: 0, def: 0, atkSpd: 0, vamp: 10, critRate: 0, critDmg: 0, dodge: 0, luck: 0, fasterRun: 0 },
                equippedStats: { hp: 0, atk: 0, def: 0, atkSpd: 0, vamp: 20, critRate: 0, critDmg: 0, dodge: 0, luck: 0, fasterRun: 0 },
                stats: {},
            };
            dungeon = { floorBuffs: { atk: 0, def: 0, atkSpd: 0 }, progress: { floor: 1 } };
            calculateStats();
            return { vamp: player.stats.vamp, uncapped: player.stats.vampUncapped };
        })()
    `, context);

    assert.deepEqual(JSON.parse(JSON.stringify(result)), { vamp: 35, uncapped: 35 });
});
