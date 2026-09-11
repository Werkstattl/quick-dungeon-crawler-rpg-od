const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const playerSource = fs.readFileSync(path.join(root, 'assets/js/player.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(root, 'assets/js/main.js'), 'utf8');
const statsStart = mainSource.indexOf('const calculateStats =');
const statsSource = mainSource.slice(statsStart, mainSource.indexOf('// Resets the progress back to start.', statsStart));

for (const scenario of [
    { name: 'without companion', companion: 0, bonus: 0 },
    { name: 'Shadow Cat bonus larger than upgrade', companion: 10, bonus: 0 },
    { name: 'equipment and floor buffs', companion: 10, bonus: 20, equipment: 40, floor: 10 },
    { name: 'crossing normal cap', companion: 10, bonus: 346 },
    { name: 'already at normal cap', companion: 10, bonus: 400 },
    { name: 'crossing Limit Breaker cap', companion: 10, bonus: 430, passive: 'Limit Breaker' },
]) {
    test(`APS level-up preview matches actual upgrade: ${scenario.name}`, () => {
        const element = () => ({
            dataset: {}, children: [], innerHTML: '',
            appendChild(child) { this.children.push(child); },
            addEventListener() {},
        });
        const panel = element();
        const context = vm.createContext({
            STORAGE_KEYS: {}, safeLoad: () => null,
            localStorage: { getItem: () => null },
            document: { querySelector: selector => selector === '#lvlupSelect' ? panel : null, createElement: element },
            getActiveCompanionBonuses: () => ({ atkSpd: scenario.companion }),
            t: (key) => key,
            scenario,
        });
        vm.runInContext(playerSource + '\n' + statsSource, context);
        const actualGain = vm.runInContext(`
            player = {
                skills: [], selectedPassive: scenario.passive, exp: { lvlGained: 1 },
                baseStats: { hp: 100, atk: 10, def: 10, atkSpd: 0.6, vamp: 0, critRate: 0, critDmg: 0, dodge: 0 },
                bonusStats: { hp: 0, atk: 0, def: 0, atkSpd: scenario.bonus, vamp: 0, critRate: 0, critDmg: 0, dodge: 0 },
                equippedStats: { hp: 0, atk: 0, def: 0, atkSpd: scenario.equipment || 0, vamp: 0, critRate: 0, critDmg: 0, dodge: 0 },
                stats: {},
            };
            dungeon = { floorBuffs: { atk: 0, def: 0, atkSpd: scenario.floor || 0 } };
            calculateStats();
            const before = player.stats.atkSpd;
            const rolls = [0, 0.13, 0.4];
            Math.random = () => rolls.shift();
            generateLvlStats(2, { hp: 11, atk: 9, atkSpd: 3.5 });
            player.bonusStats.atkSpd += 3.5;
            calculateStats();
            (player.stats.atkSpd - before) / before;
        `, context);
        const button = panel.children.find(child => child.dataset.levelUpStat === 'atkSpd');
        assert.ok(button, 'APS option rendered');
        assert.ok(actualGain >= 0);
        assert.equal(button.children[1].innerHTML,
            `level-up-option.atkSpd.desc (+${Math.round(1000 * actualGain) / 10}%)`);
    });
}
