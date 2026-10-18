const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const equipmentSource = fs.readFileSync(path.join(root, 'assets/js/equipment.js'), 'utf8');

const createContext = (mode) => {
    const context = vm.createContext({
        console,
        Math,
        player: { inventory: { equipment: [], consumables: [], refineStones: 0 }, equipped: [] },
        clampEquipmentTier: (tier) => Math.max(1, Math.min(15, Number(tier) || 1)),
        getEnemyScalingFromEquipmentTier: (tier) => 1 + (tier / 10),
        randomizeNum: (min, max) => {
            const low = Math.ceil(min);
            const high = Math.floor(max);
            if (mode === 'min') return low;
            if (mode === 'max') return high;
            return Math.floor(Math.random() * (high - low + 1)) + low;
        },
        randomizeDecimal: (min, max) => {
            if (mode === 'min') return min;
            if (mode === 'max') return max;
            return (Math.random() * (max - min)) + min;
        },
    });
    vm.runInContext(equipmentSource, context);
    return context;
};

const ITEMS = [
    { category: 'Sword', attribute: 'Damage', type: 'Weapon', slot: 'weapon' },
    { category: 'Great Helm', attribute: 'Defense', type: 'Helmet', slot: 'head' },
    { category: 'Mask', attribute: 'Defense', type: 'Mask', slot: 'head' },
    { category: 'Boots', attribute: 'Defense', type: 'Boots', slot: 'feet' },
    { category: 'Ring', attribute: 'Utility', type: 'Accessory', slot: 'accessory' },
    { category: 'Charm', attribute: 'Companion', type: 'Companion', slot: 'companionCharm' },
];

const rollQualities = (context, base, tier, lvl, rarity) => JSON.parse(vm.runInContext(`
    (() => {
        const equipment = Object.assign(${JSON.stringify(base)}, { rarity: '${rarity}', tier: ${tier}, lvl: ${lvl}, stats: [], statRolls: {} });
        rerollEquipmentStats(equipment);
        return JSON.stringify(equipment.stats.map((entry) => {
            const stat = Object.keys(entry)[0];
            const info = getEquipmentStatRollQuality(equipment, stat);
            return { stat, info };
        }));
    })()
`, context));

test('random rolls always land inside the computed per-roll range', () => {
    const context = createContext('random');
    for (let i = 0; i < 400; i++) {
        const base = ITEMS[i % ITEMS.length];
        const tier = 1 + (i % 15);
        const lvl = 1 + ((i * 7) % 100);
        const rarity = ['Common', 'Rare', 'Legendary', 'Heirloom'][i % 4];
        rollQualities(context, base, tier, lvl, rarity).forEach(({ stat, info }) => {
            assert.ok(info, `${stat} should have a roll range`);
            const epsilon = Math.max(1e-6, info.max * 1e-9);
            assert.ok(info.average >= info.min - epsilon, `${stat} average ${info.average} below min ${info.min}`);
            assert.ok(info.average <= info.max + epsilon, `${stat} average ${info.average} above max ${info.max}`);
        });
    }
});

test('minimum and maximum rolls map to 0% and 100% quality below the stat caps', () => {
    const minContext = createContext('min');
    const maxContext = createContext('max');
    ITEMS.forEach((base) => {
        rollQualities(minContext, base, 1, 5, 'Common').forEach(({ stat, info }) => {
            assert.ok(info.quality < 0.001, `${base.category} ${stat} min quality ${info.quality}`);
        });
        rollQualities(maxContext, base, 1, 5, 'Common').forEach(({ stat, info }) => {
            assert.ok(info.quality > 0.999, `${base.category} ${stat} max quality ${info.quality}`);
        });
    });
});
