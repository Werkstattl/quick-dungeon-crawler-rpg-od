const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const equipmentSource = fs.readFileSync(path.join(root, 'assets/js/equipment.js'), 'utf8');
const styleSource = fs.readFileSync(path.join(root, 'assets/css/style.css'), 'utf8');
const dungeonSource = fs.readFileSync(path.join(root, 'assets/js/dungeon.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(root, 'assets/js/main.js'), 'utf8');

const createContext = () => {
    const context = vm.createContext({
        console,
        saveCalls: 0,
        MAX_EQUIPMENT_LEVEL: 100,
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

test('inventory scroll state restores both nested scroll containers', () => {
    const context = createContext();
    const playerInventoryList = { scrollTop: 137 };
    const inventoryContent = { scrollTop: 42 };
    context.document = {
        getElementById: (id) => id === 'playerInventory' ? playerInventoryList : null,
        querySelector: (selector) => selector === '#inventory .content' ? inventoryContent : null,
    };

    context.scrollState = evaluate(context, 'captureInventoryScrollState()');
    playerInventoryList.scrollTop = 0;
    inventoryContent.scrollTop = 0;
    evaluate(context, 'restoreInventoryScrollState(scrollState)');

    assert.equal(playerInventoryList.scrollTop, 137);
    assert.equal(inventoryContent.scrollTop, 42);
});

test('opening companion charm details does not focus or filter the inventory scroll tree', () => {
    const showItemInfoSource = equipmentSource.slice(
        equipmentSource.indexOf('const showItemInfo ='),
        equipmentSource.indexOf('// Sort inventory'),
    );

    assert.doesNotMatch(showItemInfoSource, /dimContainer\.style\.filter/);
    assert.match(styleSource, /#companionCharmSlot \.items button\s*{[^}]*pointer-events:\s*none;/s);
    assert.match(styleSource, /#equipmentInfo,[^{]*{[^}]*background-color:/s);
});

test('fixed-slot item comparison has no unreachable multi-item navigation', () => {
    const showItemInfoSource = equipmentSource.slice(
        equipmentSource.indexOf('const showItemInfo ='),
        equipmentSource.indexOf('// Sort inventory'),
    );

    assert.doesNotMatch(showItemInfoSource, /\bcomparisonIndex\b|previous-equipped-item|next-equipped-item|equipment-compare-nav/);
    assert.doesNotMatch(equipmentSource, /headerActions|equipment-card-header/);
    assert.doesNotMatch(styleSource, /equipment-compare-nav|equipment-compare-slot--with-nav|equipment-card-header/);
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

test('slot migration grants a Level 100 Heirloom Accessory at the highest unlocked Curse tier', () => {
    const context = createContext();
    context.player = {
        equipped: [],
        inventory: { consumables: [], equipment: [], refineStones: 0 },
        companionCharm: null,
        equipmentSlotVersion: 0,
        maxUnlockedCurseLevel: 9,
    };
    context.dungeon = {
        progress: { floor: 12 },
        settings: { enemyLvlGap: 5, enemyBaseLvl: 1, enemyScaling: 1.3 },
    };
    context.randomizeNum = (min) => Math.round(min);
    context.randomizeDecimal = (min) => min;
    context.clampEquipmentLevel = (level) => level;
    context.clampEquipmentTier = (tier) => tier;
    context.getEquipmentTierFromEnemyScaling = () => 3;
    context.getEnemyScalingFromEquipmentTier = () => 1.3;
    evaluate(context, 'Math.random = () => 0');

    const firstGrant = evaluate(context, 'grantEquipmentSlotMigrationAccessory(true)');
    const secondGrant = evaluate(context, 'grantEquipmentSlotMigrationAccessory(true)');

    assert.equal(firstGrant.slot, 'accessory');
    assert.equal(firstGrant.type, 'Accessory');
    assert.equal(firstGrant.attribute, 'Utility');
    assert.equal(firstGrant.rarity, 'Heirloom');
    assert.equal(firstGrant.lvl, 100);
    assert.equal(firstGrant.tier, 9);
    assert.ok(firstGrant.stats.some((stat) => Object.hasOwn(stat, 'dodge')));
    assert.equal(context.player.equipped.length, 1);
    assert.equal(context.player.inventory.equipment.length, 0);
    assert.equal(context.player.equipmentSlotVersion, 1);
    assert.equal(Object.hasOwn(context.player, 'equipmentSlotNoticeVersion'), false);
    assert.equal(Object.hasOwn(context.player, 'freeAccessoryGrantVersion'), false);
    assert.equal(secondGrant, null);
    assert.equal(context.saveCalls, 1);
});

test('accessory rerolls weight Dodge twice in the stat pool', () => {
    const context = createContext();
    const dodgeEntries = evaluate(
        context,
        "EQUIPMENT_REROLL_STAT_POOLS.utility.filter((stat) => stat === 'dodge').length",
    );

    assert.equal(dodgeEntries, 2);
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
    assert.equal(Object.hasOwn(context.player, 'equipmentSlotVersion'), false);
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

    const normalizedState = JSON.stringify(context.player);
    const secondResult = evaluate(context, 'normalizePlayerEquipmentSlots()');
    assert.deepEqual(plain(secondResult), { movedToInventory: 0, changed: false, migrated: true });
    assert.equal(JSON.stringify(context.player), normalizedState);
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

test('custom Equip Best uses normalized weighted stats instead of only the first priority', () => {
    const context = createContext();
    const highHp = item({ category: 'Sword', type: 'Weapon', attribute: 'Damage', value: 100, slot: 'weapon' });
    highHp.stats = [{ hp: 100 }, { vamp: 0 }];
    const balanced = item({ category: 'Axe', type: 'Weapon', attribute: 'Damage', value: 90, slot: 'weapon' });
    balanced.stats = [{ hp: 60 }, { vamp: 10 }];
    const baseline = item({ category: 'Dagger', type: 'Weapon', attribute: 'Damage', value: 80, slot: 'weapon' });
    baseline.stats = [{ hp: 0 }, { vamp: 0 }];

    context.player = {
        equipped: [],
        inventory: {
            consumables: [],
            equipment: [highHp, balanced, baseline].map((entry) => JSON.stringify(entry)),
            refineStones: 0,
        },
        companionCharm: null,
        preferences: {
            equipBestUseCustom: true,
            equipBestPriorities: ['hp', 'vamp'],
            equipBestMinRarity: 'Common',
            equipBestMinTier: 1,
        },
    };

    evaluate(context, 'equipBest()');
    assert.equal(context.player.equipped[0].category, 'Axe');
});

test('Equip Best applies rarity and tier thresholds before scoring candidates', () => {
    const context = createContext();
    const equipped = item({ category: 'Sword', type: 'Weapon', attribute: 'Damage', value: 10, slot: 'weapon' });
    const belowRarity = item({ category: 'Axe', type: 'Weapon', attribute: 'Damage', value: 1000, slot: 'weapon' });
    belowRarity.rarity = 'Rare';
    belowRarity.tier = 10;
    const belowTier = item({ category: 'Dagger', type: 'Weapon', attribute: 'Damage', value: 900, slot: 'weapon' });
    belowTier.rarity = 'Heirloom';
    belowTier.tier = 4;
    const eligible = item({ category: 'Mace', type: 'Weapon', attribute: 'Damage', value: 20, slot: 'weapon' });
    eligible.rarity = 'Epic';
    eligible.tier = 5;

    context.player = {
        equipped: [equipped],
        inventory: {
            consumables: [],
            equipment: [belowRarity, belowTier, eligible].map((entry) => JSON.stringify(entry)),
            refineStones: 0,
        },
        companionCharm: null,
        preferences: {
            equipBestUseCustom: false,
            equipBestPriorities: [],
            equipBestMinRarity: 'Epic',
            equipBestMinTier: 5,
        },
    };

    evaluate(context, 'equipBest()');
    assert.equal(context.player.equipped[0].category, 'Mace');
});

test('Equip Best keeps currently equipped gear when every candidate is below the thresholds', () => {
    const context = createContext();
    const equipped = item({ category: 'Sword', type: 'Weapon', attribute: 'Damage', value: 10, slot: 'weapon' });
    const inventoryItem = item({ category: 'Axe', type: 'Weapon', attribute: 'Damage', value: 1000, slot: 'weapon' });

    context.player = {
        equipped: [equipped],
        inventory: {
            consumables: [],
            equipment: [JSON.stringify(inventoryItem)],
            refineStones: 0,
        },
        companionCharm: null,
        preferences: {
            equipBestUseCustom: true,
            equipBestPriorities: ['hp', 'vamp'],
            equipBestMinRarity: 'Legendary',
            equipBestMinTier: 10,
        },
    };

    evaluate(context, 'equipBest()');
    assert.equal(context.player.equipped[0].category, 'Sword');
    assert.equal(context.player.inventory.equipment.length, 1);
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

test('slot migration gift runs after dungeon load and completes the slot version', () => {
    const dungeonLoadIndex = mainSource.indexOf('initialDungeonLoad();');
    const grantIndex = mainSource.indexOf('grantEquipmentSlotMigrationAccessory(equipmentSlotMigrationNoticePending);');
    const playerStatsIndex = mainSource.indexOf('playerLoadStats();', dungeonLoadIndex);

    assert.ok(dungeonLoadIndex >= 0, 'main.js is missing the initial dungeon load');
    assert.ok(grantIndex > dungeonLoadIndex, 'free Accessory must use the loaded floor and Curse');
    assert.ok(playerStatsIndex > grantIndex, 'player stats must load after equipping the free Accessory');
    assert.doesNotMatch(equipmentSource, /FREE_ACCESSORY_GRANT_VERSION|freeAccessoryGrantVersion/);
    assert.doesNotMatch(mainSource, /FREE_ACCESSORY_GRANT_VERSION|freeAccessoryGrantVersion/);
});

test('migrated players see the inventory notice once while new players skip it', () => {
    assert.match(mainSource, /migration && migration\.migrated/);
    assert.match(mainSource, /openInventory\(\);/);
    assert.match(mainSource, /showEquipmentSlotMigrationNotice\(\);/);
    assert.match(equipmentSource, /player\.equipmentSlotVersion = EQUIPMENT_SLOT_VERSION/);
    assert.doesNotMatch(mainSource, /equipmentSlotNoticeVersion|EQUIPMENT_SLOT_NOTICE_VERSION/);
    assert.doesNotMatch(equipmentSource, /equipmentSlotNoticeVersion|EQUIPMENT_SLOT_NOTICE_VERSION/);
});

test('stat allocation modal closes before entering the dungeon so it cannot erase the migration notice', () => {
    const allocationStart = mainSource.indexOf('const allocationPopup = () => {');
    const confirmStart = mainSource.indexOf('confirm.onclick = function () {', allocationStart);
    const confirmEnd = mainSource.indexOf('reset.onclick = function () {', confirmStart);
    const confirmSource = mainSource.slice(confirmStart, confirmEnd);
    const clearModalIndex = confirmSource.indexOf('defaultModalElement.innerHTML = "";');
    const enterDungeonIndex = confirmSource.indexOf('enterDungeon();');

    assert.ok(confirmStart >= 0 && confirmEnd > confirmStart, 'allocation confirm handler is missing');
    assert.ok(clearModalIndex >= 0, 'allocation modal is not cleared');
    assert.ok(enterDungeonIndex > clearModalIndex, 'allocation modal must be cleared before the migration notice is shown');
    assert.equal(
        confirmSource.indexOf('defaultModalElement.innerHTML = "";', enterDungeonIndex),
        -1,
        'allocation handler must not erase the migration notice after entering the dungeon',
    );
});

test('equipment slot notice is pending only when the slot version requires migration', () => {
    const migrationStateSource = mainSource.split('// Use DOMContentLoaded')[0];
    const context = vm.createContext({
        EQUIPMENT_SLOT_VERSION: 1,
        player: { equipmentSlotVersion: 1 },
        normalizePlayerEquipmentSlots: () => ({ movedToInventory: 0, changed: false, migrated: false }),
    });
    vm.runInContext(migrationStateSource, context);

    evaluate(context, 'migratePlayerEquipmentSlots()');
    assert.equal(evaluate(context, 'equipmentSlotMigrationNoticePending'), false);

    context.player = { equipmentSlotVersion: 0 };
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
        assert.ok(locale['equipment-slots-update-gift'], `${file} is missing equipment-slots-update-gift`);
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
