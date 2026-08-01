const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const forgeSource = fs.readFileSync(path.join(root, 'assets/js/forge.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const createForgeContext = () => {
    const context = vm.createContext({
        createEquipment: () => ({
            category: 'Sword',
            attribute: 'Damage',
            type: 'Weapon',
            rarity: 'Common',
            lvl: 1,
            tier: 1,
            value: 1,
            stats: [],
            slot: null,
        }),
        clampEquipmentLevel: (level) => Math.min(100, level),
        randomizeNum: (min) => min,
        rerollEquipmentStats: (equipment) => {
            equipment.stats = [{ pool: `${equipment.attribute}:${equipment.type}` }];
            equipment.icon = `icon:${equipment.category}`;
        },
    });
    vm.runInContext(forgeSource, context);
    return context;
};

test('forging creates the exact gear piece selected by the player', () => {
    const context = createForgeContext();
    const result = vm.runInContext(`
        createForgedEquipment(
            { tier: 4, lvl: 20, rarity: 'Rare' },
            { tier: 4, lvl: 22, rarity: 'Rare' },
            { tier: 4, lvl: 24, rarity: 'Rare' },
            'Great Helm'
        )
    `, context);

    assert.equal(result.category, 'Great Helm');
    assert.equal(result.attribute, 'Defense');
    assert.equal(result.type, 'Helmet');
    assert.equal(result.tier, 4);
    assert.equal(result.rarity, 'Epic');
    assert.deepEqual(JSON.parse(JSON.stringify(result.stats)), [{ pool: 'Defense:Helmet' }]);
    assert.equal(result.icon, 'icon:Great Helm');
    assert.equal(result.forged, true);
});

test('every forge target maps to a valid non-charm equipment category', () => {
    const context = createForgeContext();
    const configs = vm.runInContext('FORGE_CATEGORY_CONFIG', context);

    assert.equal(configs.length, 19);
    assert.equal(new Set(configs.map(({ category }) => category)).size, configs.length);
    assert.equal(configs.some(({ category }) => category === 'Charm'), false);
    for (const config of configs) {
        assert.ok(config.category);
        assert.ok(['Damage', 'Defense', 'Utility'].includes(config.attribute));
        assert.ok(config.type);
    }
    assert.deepEqual(
        JSON.parse(JSON.stringify(configs.filter(({ type }) => type === 'Accessory').map(({ category }) => category))),
        ['Ring', 'Amulet', 'Talisman'],
    );
});

test('forging rejects an unknown target category', () => {
    const context = createForgeContext();
    const result = vm.runInContext(`
        createForgedEquipment(
            { tier: 1, lvl: 1, rarity: 'Common' },
            { tier: 1, lvl: 1, rarity: 'Common' },
            { tier: 1, lvl: 1, rarity: 'Common' },
            'Charm'
        )
    `, context);

    assert.equal(result, null);
});

test('the forge UI requires a target gear-piece selection', () => {
    assert.match(indexSource, /id="forge-target-category"/);
    assert.match(indexSource, /data-i18n="crafted-gear-piece"/);
    assert.match(forgeSource, /targetCategorySelect\.onchange/);
    assert.match(forgeSource, /hasTargetCategoryConfirm/);
});

test('every locale includes the forge target selector text', () => {
    const localesDirectory = path.join(root, 'assets/locales');
    const localeFiles = fs.readdirSync(localesDirectory).filter((file) => file.endsWith('.json'));

    for (const file of localeFiles) {
        const locale = JSON.parse(fs.readFileSync(path.join(localesDirectory, file), 'utf8'));
        assert.ok(locale['crafted-gear-piece'], `${file} is missing crafted-gear-piece`);
        assert.ok(locale['choose-gear-piece'], `${file} is missing choose-gear-piece`);
    }
});
