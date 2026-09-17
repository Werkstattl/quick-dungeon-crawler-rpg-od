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

const percentages = { hp: 11, atk: 9, def: 9 };

for (const scenario of [
    { name: 'without companion', companion: 0, bonus: 0 },
    { name: 'Phoenix hp bonus larger than upgrade', companionHp: 12, companionDef: 0, bonus: 0 },
    { name: 'companion def bonus larger than upgrade', companionHp: 0, companionDef: 10, bonus: 0 },
    { name: 'equipment and floor buffs', companionHp: 12, companionDef: 10, bonus: 5, equipment: 40, floor: 10 },
]) {
    test(`HP/DEF level-up preview matches actual upgrade: ${scenario.name}`, () => {
        const element = () => ({
            dataset: {}, children: [], innerHTML: '',
            appendChild(child) { this.children.push(child); },
            addEventListener() {},
        });
        const panel = element();
        const companionBonuses = {
            hp: scenario.companionHp || 0,
            atk: 0, def: scenario.companionDef || 0, atkSpd: 0,
            vamp: 0, critRate: 0, critDmg: 0, dodge: 0, luck: 0,
        };
        const context = vm.createContext({
            STORAGE_KEYS: {}, safeLoad: () => null,
            localStorage: { getItem: () => null },
            document: { querySelector: selector => selector === '#lvlupSelect' ? panel : null, createElement: element },
            getActiveCompanionBonuses: () => companionBonuses,
            t: (key) => key,
            scenario,
        });
        vm.runInContext(playerSource + '\n' + statsSource, context);
        const actualGain = vm.runInContext(`
            player = {
                skills: [], selectedPassive: null, exp: { lvlGained: 1 },
                baseStats: { hp: 100, atk: 10, def: 10, atkSpd: 0.6, vamp: 0, critRate: 0, critDmg: 0, dodge: 0 },
                bonusStats: { hp: scenario.bonus || 0, atk: 0, def: scenario.bonus || 0, atkSpd: 0, vamp: 0, critRate: 0, critDmg: 0, dodge: 0 },
                equippedStats: { hp: scenario.equipment || 0, atk: 0, def: scenario.equipment || 0, atkSpd: 0, vamp: 0, critRate: 0, critDmg: 0, dodge: 0 },
                stats: {},
            };
            dungeon = { floorBuffs: { atk: 0, def: scenario.floor || 0, atkSpd: 0 } };
            calculateStats();
            const beforeHp = player.stats.hpMax;
            const beforeDef = player.stats.def;
            const rolls = [0, 0.3, 0.44];
            Math.random = () => rolls.shift();
            generateLvlStats(2, ${JSON.stringify(percentages)});
            player.bonusStats.hp += 11;
            player.bonusStats.def += 9;
            calculateStats();
            ({
                hp: (player.stats.hpMax - beforeHp) / beforeHp,
                def: (player.stats.def - beforeDef) / beforeDef,
            })
        `, context);
        const readPreview = (stat) => {
            const button = panel.children.find(child => child.dataset.levelUpStat === stat);
            return button ? button.children[1].innerHTML : null;
        };
        const preview = { hp: readPreview('hp'), def: readPreview('def') };

        for (const stat of ['hp', 'def']) {
            if (!preview[stat]) continue;
            const gain = actualGain[stat];
            assert.ok(Number.isFinite(gain) && gain >= 0, `${stat} gain must be non-negative, got ${gain}`);
            assert.equal(preview[stat],
                `level-up-option.${stat}.desc (+${Math.round(1000 * gain) / 10}%)`);
        }
        assert.ok(preview.hp, 'hp option rendered by roll');
        assert.ok(preview.def, 'def option rendered by roll');
    });
}
