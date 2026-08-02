const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const equipmentSource = fs.readFileSync(path.join(root, 'assets/js/equipment.js'), 'utf8');
const dungeonSource = fs.readFileSync(path.join(root, 'assets/js/dungeon.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(root, 'assets/js/main.js'), 'utf8');

const createContext = () => {
    const context = vm.createContext({
        console,
        saveCalls: 0,
        playerLoadStats() {},
        sfxEquip: { play() {} },
        sfxDeny: { play() {} },
    });
    context.saveData = () => { context.saveCalls += 1; };
    vm.runInContext(equipmentSource, context);
    return context;
};

const evaluate = (context, expression) => vm.runInContext(expression, context);
const plain = (value) => JSON.parse(JSON.stringify(value));

const item = ({ category, type, attribute, value = 10, locked = false, slot = null }) => ({
    category,
    type,
    attribute,
    value,
    locked,
    slot,
    rarity: 'Rare',
    lvl: 10,
    tier: 1,
    stats: [{ atk: 5 }],
});

test('legacy item categories map to the six fixed equipment slots', () => {
    const context = createContext();
    const slots = evaluate(context, `([
        getEquipmentSlot({ category: 'Sword', type: 'Weapon', attribute: 'Damage' }),
        getEquipmentSlot({ category: 'Buckler', type: 'Shield', attribute: 'Defense' }),
        getEquipmentSlot({ category: 'Mask', type: 'Mask', attribute: 'Defense' }),
        getEquipmentSlot({ category: 'Plate', type: 'Armor', attribute: 'Defense' }),
        getEquipmentSlot({ category: 'Boots', type: 'Boots', attribute: 'Defense' }),
        getEquipmentSlot({ category: 'Ring', type: 'Accessory', attribute: 'Utility' }),
    ])`);
    assert.deepEqual(plain(slots), ['weapon', 'offHand', 'head', 'body', 'feet', 'accessory']);
    assert.equal(evaluate(context, 'EQUIPMENT_SLOT_DEFINITIONS.length'), 6);
});

test('accessories are obtainable through normal equipment generation', () => {
    const context = createContext();
    context.player = {
        equipped: [],
        inventory: { consumables: [], equipment: [], refineStones: 0 },
        companionCharm: null,
    };
    context.dungeon = {
        progress: { floor: 1 },
        settings: { enemyLvlGap: 1, enemyBaseLvl: 1, enemyScaling: 1.1 },
    };
    context.randomizeNum = (min) => Math.round(min);
    context.randomizeDecimal = (min) => min;
    context.clampEquipmentLevel = (level) => level;
    context.clampEquipmentTier = (tier) => tier;
    context.getEquipmentTierFromEnemyScaling = () => 1;
    context.getEnemyScalingFromEquipmentTier = () => 1.1;

    const generated = evaluate(context, `createEquipment(false, {
        allowCompanionCharm: false,
        forcedSlot: 'accessory',
        minRarity: 'Rare'
    })`);
    assert.equal(generated.slot, 'accessory');
    assert.equal(generated.type, 'Accessory');
    assert.equal(generated.attribute, 'Utility');
    assert.ok(['Ring', 'Amulet', 'Talisman'].includes(generated.category));
    assert.ok(generated.stats.length > 0);
});

test('accessory rerolls never include Faster Run', () => {
    const context = createContext();
    context.player = {
        equipped: [],
        inventory: { consumables: [], equipment: [], refineStones: 0 },
        companionCharm: null,
    };
    context.dungeon = {
        progress: { floor: 1 },
        settings: { enemyLvlGap: 1, enemyBaseLvl: 1, enemyScaling: 1.1 },
    };
    context.randomizeNum = (min) => Math.round(min);
    context.randomizeDecimal = (min) => min;
    context.clampEquipmentLevel = (level) => level;
    context.clampEquipmentTier = (tier) => tier;
    context.getEquipmentTierFromEnemyScaling = () => 1;
    context.getEnemyScalingFromEquipmentTier = () => 1.1;
    evaluate(context, 'Math.random = () => 0.999');

    const generated = evaluate(context, `createEquipment(false, {
        allowCompanionCharm: false,
        forcedSlot: 'accessory',
        minRarity: 'Rare'
    })`);
    const statKeys = generated.stats.map((stat) => Object.keys(stat)[0]);
    assert.equal(statKeys.includes('fasterRun'), false);
});

test('legacy migration is lossless and keeps a locked duplicate equipped', () => {
    const context = createContext();
    const highValueSword = item({ category: 'Sword', type: 'Weapon', attribute: 'Damage', value: 500 });
    const lockedDagger = item({ category: 'Dagger', type: 'Weapon', attribute: 'Damage', value: 20, locked: true });
    const armor = item({ category: 'Plate', type: 'Armor', attribute: 'Defense', value: 90 });
    const boots = item({ category: 'Boots', type: 'Boots', attribute: 'Defense', value: 70 });
    const shield = item({ category: 'Buckler', type: 'Shield', attribute: 'Defense', value: 80 });

    context.player = {
        equipped: [highValueSword, lockedDagger, armor, boots],
        inventory: { consumables: [], equipment: [JSON.stringify(shield)], refineStones: 0 },
        companionCharm: null,
    };

    const result = evaluate(context, 'normalizePlayerEquipmentSlots()');
    assert.deepEqual(plain(result), { movedToInventory: 1, changed: true, migrated: true });
    assert.equal(context.player.equipmentSlotVersion, 1);
    assert.equal(context.player.equipped.length, 3);
    assert.equal(context.player.equipped.find((entry) => entry.slot === 'weapon').category, 'Dagger');
    assert.equal(context.player.equipped.find((entry) => entry.slot === 'body').category, 'Plate');
    assert.equal(context.player.equipped.find((entry) => entry.slot === 'feet').category, 'Boots');

    const inventory = context.player.inventory.equipment.map((entry) => JSON.parse(entry));
    assert.equal(inventory.length, 2);
    assert.ok(inventory.some((entry) => entry.category === 'Sword'));
    assert.ok(inventory.some((entry) => entry.category === 'Buckler' && entry.slot === 'offHand'));
    assert.equal(context.player.equipped.length + inventory.length, 5);
    assert.equal(context.saveCalls, 1);

    const migratedState = JSON.stringify(context.player);
    const secondResult = evaluate(context, 'normalizePlayerEquipmentSlots()');
    assert.deepEqual(plain(secondResult), { movedToInventory: 0, changed: false, migrated: false });
    assert.equal(JSON.stringify(context.player), migratedState);
    assert.equal(context.saveCalls, 1);
});

test('Equip Best chooses one best item per slot and preserves locked equipped items', () => {
    const context = createContext();
    const lockedSword = item({ category: 'Sword', type: 'Weapon', attribute: 'Damage', value: 10, locked: true, slot: 'weapon' });
    const strongerAxe = item({ category: 'Axe', type: 'Weapon', attribute: 'Damage', value: 500, slot: 'weapon' });
    const weakArmor = item({ category: 'Leather', type: 'Armor', attribute: 'Defense', value: 20, slot: 'body' });
    const strongArmor = item({ category: 'Plate', type: 'Armor', attribute: 'Defense', value: 200, slot: 'body' });
    const ring = item({ category: 'Ring', type: 'Accessory', attribute: 'Utility', value: 75, slot: 'accessory' });

    context.player = {
        equipped: [lockedSword, weakArmor],
        inventory: {
            consumables: [],
            equipment: [strongerAxe, strongArmor, ring].map((entry) => JSON.stringify(entry)),
            refineStones: 0,
        },
        companionCharm: null,
        preferences: { equipBestUseCustom: false, equipBestPriorities: [] },
    };

    evaluate(context, 'equipBest()');
    assert.deepEqual(
        plain(context.player.equipped.map((entry) => [entry.slot, entry.category])),
        [['weapon', 'Sword'], ['body', 'Plate'], ['accessory', 'Ring']],
    );
    const inventory = context.player.inventory.equipment.map((entry) => JSON.parse(entry));
    assert.ok(inventory.some((entry) => entry.category === 'Axe'));
    assert.ok(inventory.some((entry) => entry.category === 'Leather'));
    assert.equal(context.player.equipped.length + inventory.length, 5);
});

test('drop and equip paths use slot availability instead of a generic six-item cap', () => {
    assert.match(equipmentSource, /hasEmptyEquipmentSlotFor\(equipment\)/);
    assert.match(equipmentSource, /hasEmptyEquipmentSlotFor\(item\)/);
    assert.doesNotMatch(equipmentSource, /player\.equipped\.length < 6/);
    assert.doesNotMatch(equipmentSource, /const maxEquippedSlots = 6/);
    assert.match(dungeonSource, /hasCompleteEquipmentLoadout\(\)/);
    assert.doesNotMatch(dungeonSource, /player\.equipped\.length === 6/);
});

test('legacy slot migration runs during application initialization when saveData is available', () => {
    const migrationCall = 'migratePlayerEquipmentSlots();';
    const migrationIndex = mainSource.indexOf(migrationCall);
    const initialPlayerRoutingIndex = mainSource.indexOf('if (player === null)');

    assert.ok(migrationIndex >= 0, 'main.js is missing the startup equipment migration');
    assert.ok(migrationIndex < initialPlayerRoutingIndex, 'equipment migration must run before initial player routing');
    assert.doesNotMatch(
        equipmentSource,
        /if \(typeof player !== 'undefined' && player\) \{\s*normalizePlayerEquipmentSlots\(\);/,
    );
});

test('migrated players see the inventory notice once while new players skip it', () => {
    assert.match(mainSource, /migration && migration\.migrated/);
    assert.match(mainSource, /player\.equipmentSlotNoticeVersion !== EQUIPMENT_SLOT_NOTICE_VERSION/);
    assert.match(mainSource, /openInventory\(\);/);
    assert.match(mainSource, /showEquipmentSlotMigrationNotice\(\);/);
    assert.match(mainSource, /player\.equipmentSlotNoticeVersion = EQUIPMENT_SLOT_NOTICE_VERSION/);
    assert.match(mainSource, /equipmentSlotNoticeVersion: EQUIPMENT_SLOT_NOTICE_VERSION/);
});

test('equipment slot notice state covers prior migrations and acknowledged saves', () => {
    const migrationStateSource = mainSource.split('// Use DOMContentLoaded')[0];
    const context = vm.createContext({
        EQUIPMENT_SLOT_VERSION: 1,
        player: { equipmentSlotVersion: 1 },
        normalizePlayerEquipmentSlots: () => ({ movedToInventory: 0, changed: false, migrated: false }),
    });
    vm.runInContext(migrationStateSource, context);

    evaluate(context, 'migratePlayerEquipmentSlots()');
    assert.equal(evaluate(context, 'equipmentSlotMigrationNoticePending'), true);

    context.player.equipmentSlotNoticeVersion = 1;
    evaluate(context, 'migratePlayerEquipmentSlots()');
    assert.equal(evaluate(context, 'equipmentSlotMigrationNoticePending'), false);

    context.player = { equipmentSlotVersion: 0, equipmentSlotNoticeVersion: 1 };
    context.normalizePlayerEquipmentSlots = () => ({ movedToInventory: 0, changed: true, migrated: true });
    evaluate(context, 'migratePlayerEquipmentSlots()');
    assert.equal(evaluate(context, 'equipmentSlotMigrationNoticePending'), true);
});

test('every locale includes slot labels and accessory item names', () => {
    const localeDirectory = path.join(root, 'assets/locales');
    const localeFiles = fs.readdirSync(localeDirectory).filter((file) => file.endsWith('.json'));
    const slotKeys = ['weapon', 'offHand', 'head', 'body', 'feet', 'accessory'];
    const accessoryNames = ['ring', 'amulet', 'talisman'];

    for (const file of localeFiles) {
        const locale = JSON.parse(fs.readFileSync(path.join(localeDirectory, file), 'utf8'));
        assert.ok(locale['equipment-slot'], `${file} is missing equipment-slot`);
        assert.ok(locale['empty-slot'], `${file} is missing empty-slot`);
        assert.ok(locale['equipment-slots-update-title'], `${file} is missing equipment-slots-update-title`);
        assert.ok(locale['equipment-slots-update-message'], `${file} is missing equipment-slots-update-message`);
        for (const slotKey of slotKeys) {
            assert.ok(locale['equipment-slot'][slotKey], `${file} is missing equipment-slot.${slotKey}`);
        }
        for (const itemName of accessoryNames) {
            assert.ok(locale['equipment-names'][itemName], `${file} is missing equipment-names.${itemName}`);
            if (locale['equipment-genders']) {
                assert.ok(locale['equipment-genders'][itemName], `${file} is missing equipment-genders.${itemName}`);
            }
        }
    }
});
