const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const read = file => fs.readFileSync(path.join(__dirname, '../assets/js', file), 'utf8');
const source = read('native-save-backup.js');
const clone = value => JSON.parse(JSON.stringify(value));
const slot = index => `save-backups/slot-${index}.json`;
const quiet = { log() {}, warn() {}, error() {} };
const fixture = (level = 20) => ({
    player: {
        name: '勇者', lvl: level, allocated: true, inCombat: true,
        stats: { hp: 50, hpMax: 100 }, baseStats: {}, equippedStats: {}, bonusStats: {},
        exp: {}, inventory: { equipment: ['sword'], consumables: [], refineStones: 12 },
        equipped: [], selectedCurseLevel: 2, maxUnlockedCurseLevel: 3,
    },
    dungeon: { progress: { floor: 7, room: 3 }, settings: {}, statistics: {}, backlog: ['log'] },
    enemy: { id: 1, stats: { hp: 10 } },
    companions: [{ id: 1, level: 5, isActive: true }],
});

function setup({ disk = new Map(), local = new Map(), native = true, failure = null, gate = null } = {}) {
    let time = 100000;
    const operations = [];
    const restored = [];
    const files = {
        async read(file) {
            if (failure === 'read') throw new Error('Read failed');
            if (failure === 'verification' && file.endsWith('.tmp')) return '{truncated';
            return disk.get(file) ?? null;
        },
        async write(file, data) {
            operations.push(['write', file]);
            if (gate) await gate();
            if (failure === 'write') throw new Error('Disk full');
            disk.set(file, data);
        },
        async rename(from, to) {
            operations.push(['rename', from, to]);
            if (failure === 'rename') throw new Error('Rename failed');
            disk.set(to, disk.get(from));
            disk.delete(from);
        },
        async remove(file) {
            operations.push(['remove', file]);
            if (failure === 'remove') throw new Error('Deletion failed');
            disk.delete(file);
        },
    };
    const context = vm.createContext({ console: quiet });
    vm.runInContext(source.split('const nativeSaveBackup =')[0], context);
    const create = vm.runInContext('createNativeSaveBackup', context);
    const options = {
        loadFiles: async () => native ? files : null,
        readLocal: (key, validate) => validate(local.get(key)) ? local.get(key) : null,
        hasLocalSave: () => local.size > 0,
        restoreLocal: entries => {
            restored.push(clone(entries));
            for (const [key, value] of Object.entries(entries)) local.set(key, clone(value));
        },
        now: () => time,
    };
    const backup = create(options);
    return { backup, context, files, disk, local, operations, restored, options,
        advance: amount => { time += amount; } };
}

async function seed() {
    const state = setup();
    await state.backup.initialize();
    await state.backup.save(fixture());
    return state;
}

// Run the shipped loading, saving and restoration paths together. Only the
// platform's disk/localStorage APIs are replaced to inject write failures.
function gameSession({ disk = new Map(), storage, failKeys = [], failReads = [], native = true, clock = 100000 } = {}) {
    const data = fixture();
    storage ||= new Map(Object.entries({ playerData: data.player, dungeonData: data.dungeon,
        enemyData: data.enemy, playerCompanions: data.companions }).map(([key, value]) => [key, JSON.stringify(value)]));
    const context = vm.createContext({
        console: quiet, failKeys: new Set(failKeys), failNativeWrites: false,
        Date: class extends Date { static now() { return clock; } },
        window: { Capacitor: { isNativePlatform: () => native, getPlatform: () => 'android' }, addEventListener() {} },
        document: { addEventListener() {} },
        localStorage: {
            get length() { return storage.size; },
            key: index => [...storage.keys()][index] ?? null,
            getItem: key => {
                if (failReads.includes(key)) throw new Error('Storage read denied');
                return storage.get(key) ?? null;
            },
            setItem: (key, value) => {
                if (context.failKeys.has('*') || context.failKeys.has(key)
                    || (context.rejectWrite && context.rejectWrite(key, value))) throw new Error('Quota exceeded');
                storage.set(key, String(value));
            },
        },
        nativeFiles: {
            read: async file => disk.get(file) ?? null,
            write: async (file, raw) => {
                if (context.failNativeWrites) throw new Error('Native write interrupted');
                disk.set(file, raw);
            },
            rename: async (from, to) => { disk.set(to, disk.get(from)); disk.delete(from); },
            remove: async file => { disk.delete(file); },
        },
        player: data.player, dungeon: { ...data.dungeon, initialized: true }, enemy: data.enemy,
        playerCompanions: data.companions, companionsInitialized: true,
    });
    const run = code => vm.runInContext(code, context);
    run(read('utility.js').split('const nFormatter')[0]);
    run(source.replace("return import('./filesystem-plugin.js');", 'return nativeFiles;'));
    const main = read('main.js');
    run(main.slice(main.indexOf('let isSaving = false;'), main.indexOf('const maybeUnlockNextCurseLevel')));
    const companion = read('companion.js');
    run(companion.slice(companion.indexOf('function saveCompanions()'), companion.indexOf('// Find companion after combat')));
    return { context, disk, storage, run,
        initialize: () => run('nativeSaveBackup.initialize()'),
        checkpoint: () => run('saveNativeBackup({ force: true })'),
        load: key => clone(run(`safeLoad('${key}', '${key}_backup')`)),
    };
}

// Exercise the real startup gate and recovery export, not just the backup factory.
async function startRecovery(game) {
    const elements = new Map();
    const element = selector => {
        if (!elements.has(selector)) elements.set(selector, {
            style: {}, hidden: true, setAttribute() {}, focus() {}, select() {}, setSelectionRange() {},
        });
        return elements.get(selector);
    };
    const panels = [];
    Object.assign(game.context, { t: key => key, applyTranslations() {}, navigator: {} });
    game.context.normalizeLoadedPlayer ||= () => {};
    Object.assign(game.context.document, {
        createElement: () => ({ style: {}, setAttribute() {}, querySelector: element }),
        querySelector: () => ({ appendChild: panel => panels.push(panel) }),
    });
    game.run(read('main.js').split('// Use DOMContentLoaded')[0]);
    const allowed = await game.run('initializeNativeSaveRecovery()');
    return { allowed, panels, element };
}

for (const native of [true, false]) {
    test(`legacy equipped objects load and migrate without losing items before any snapshot (${native ? 'native' : 'web'})`, async () => {
        const sword = { id: 'sword', category: 'Sword', type: 'Weapon', value: 500,
            stats: [{ atk: 15 }], refineLevel: 4, statRolls: { atk: 2 } };
        const dagger = { id: 'dagger', category: 'Dagger', type: 'Weapon', value: 20,
            locked: true, stats: [{ atk: 5 }] };
        const boots = { id: 'boots', category: 'Boots', value: 10, stats: [{ dodge: 3 }] };
        const charm = { id: 'charm', category: 'Charm', attribute: 'Companion', stats: [{ atk: 4 }] };
        const unknown = { id: 'unknown', category: 'Legacy relic', stats: [{ luck: 7 }] };
        const stored = { id: 'stored', slot: 'body', category: 'Plate', stats: [{ def: 8 }] };
        const data = fixture();
        data.player.equipped = { 0: sword, 2: dagger, feet: boots, charm, unknown, empty: null };
        data.player.inventory.equipment = [JSON.stringify(stored)];
        const storage = new Map(Object.entries({ playerData: data.player, dungeonData: data.dungeon,
            enemyData: data.enemy, playerCompanions: data.companions })
            .map(([key, value]) => [key, JSON.stringify(value)]));
        const game = gameSession({ storage, native });
        // Load the real player bootstrap too: its validation runs before recovery.
        delete game.context.player;
        game.run(read('progression.js'));
        game.run(read('player.js').split('let inventoryOpen')[0]);
        game.run(read('equipment.js'));
        game.run('dungeon.initialized = false; companionsInitialized = false');
        assert.equal(game.run('player && player.name'), data.player.name);
        assert.equal(game.disk.size, 0, 'first launch has no native snapshot to recover');
        const startup = await startRecovery(game);
        assert.equal(startup.allowed, true);
        assert.equal(startup.panels.length, 0);
        const migration = clone(game.run('migratePlayerEquipmentSlots()'));
        assert.deepEqual(migration, { movedToInventory: 2, changed: true, migrated: true });

        const sortItems = items => items.sort((a, b) => a.id.localeCompare(b.id));
        const expected = sortItems([stored, { ...sword, slot: 'weapon' },
            { ...dagger, slot: 'weapon' }, { ...boots, slot: 'feet' }, charm, unknown]);
        const allItems = player => sortItems([
            ...player.equipped, ...player.inventory.equipment.map(JSON.parse), player.companionCharm,
        ]);
        const saved = game.load('playerData');
        assert.deepEqual(allItems(saved), expected, 'every item and its metadata survives persistence');
        assert.deepEqual(saved.equipped.map(item => item.id), ['dagger', 'boots']);
        assert.deepEqual(game.load('dungeonData'), data.dungeon);
        assert.deepEqual(game.load('playerCompanions'), data.companions);
        const once = clone(game.run('player'));
        game.run('migratePlayerEquipmentSlots()');
        assert.deepEqual(clone(game.run('player')), once, 'migration is idempotent');

        await game.checkpoint();
        if (native) {
            assert.deepEqual(allItems(JSON.parse(game.disk.get(slot(0))).data.player), expected,
                'the first native snapshot contains every migrated item');
        }
        const restarted = gameSession({ storage, disk: game.disk, native });
        assert.equal((await startRecovery(restarted)).allowed, true);
        assert.deepEqual(allItems(restarted.load('playerData')), expected);
    });
}

test('malformed equipped objects still block startup and preserve the original save', async () => {
    for (const equipped of [null, 'broken', { weapon: 'broken' }, { weapon: [] }, { weapon: 1 }]) {
        const game = gameSession();
        game.storage.set('playerData', JSON.stringify({ ...fixture().player, equipped }));
        const before = [...game.storage];
        assert.equal((await startRecovery(game)).allowed, false);
        assert.deepEqual([...game.storage], before);
        assert.equal(game.disk.size, 0);
    }
});

for (const native of [true, false]) {
    test(`unrecoverable player data opens recovery and preserves evidence (${native ? 'native' : 'web'})`, async () => {
        for (const raw of [undefined, '', 'null', '{broken', '{}']) {
            const game = gameSession({ native });
            if (raw === undefined) game.storage.delete('playerData');
            else game.storage.set('playerData', raw);
            const before = [...game.storage];
            const startup = await startRecovery(game);
            assert.equal(startup.allowed, false, `playerData: ${raw}`);
            assert.equal(startup.panels.length, 1);
            await game.checkpoint(); // Background events must not overwrite evidence either.
            await startup.element('[data-recovery-export]').onclick();
            const report = JSON.parse(startup.element('textarea').value);
            assert.deepEqual(report.localStorage, Object.fromEntries(before));
            assert.deepEqual([...game.storage], before);
            assert.equal(game.disk.size, 0);
        }
    });

    test(`unrecoverable active dungeon opens recovery before entry (${native ? 'native' : 'web'})`, async () => {
        for (const raw of [undefined, '', 'null', '{broken', '{}', '{"progress":{"floor":0,"room":1}}']) {
            const game = gameSession({ native });
            if (raw === undefined) game.storage.delete('dungeonData');
            else game.storage.set('dungeonData', raw);
            const before = [...game.storage];
            const startup = await startRecovery(game);
            assert.equal(startup.allowed, false, `dungeonData: ${raw}`);
            assert.equal(startup.panels.length, 1);
            await game.checkpoint();
            assert.deepEqual([...game.storage], before);
            assert.equal(game.disk.size, 0);
        }
    });
}

test('orphaned local save components are not mistaken for a fresh installation', async () => {
    for (const key of ['playerData', 'dungeonData', 'enemyData', 'playerCompanions']) {
        for (const suffix of ['', '_backup', '_temp']) {
            const storage = new Map([[key + suffix, '{broken']]);
            const game = gameSession({ storage });
            const before = [...storage];
            await assert.rejects(game.initialize(), /player could not be recovered/);
            assert.deepEqual([...storage], before);
        }
    }
});

test('unreadable local save keys block character creation when no native snapshot exists', async () => {
    const game = gameSession({ storage: new Map(), failReads: ['playerData', 'playerData_backup'] });
    const startup = await startRecovery(game);
    assert.equal(startup.allowed, false);
    assert.equal(startup.panels.length, 1);
    assert.equal(game.disk.size, 0);
});

test('a fresh installation with preferences can still start character creation', async () => {
    const storage = new Map([['lang', 'de'], ['volumeData', '{}']]);
    const game = gameSession({ storage });
    const startup = await startRecovery(game);
    assert.equal(startup.allowed, true);
    assert.equal(game.context.player, null);
    assert.equal(startup.panels.length, 0);
    assert.equal(game.disk.size, 0);
    assert.equal(storage.size, 2);
});

test('an unallocated character may start without a dungeon or companions', async () => {
    const player = { ...fixture().player, allocated: false };
    const game = gameSession({ storage: new Map([['playerData', JSON.stringify(player)]]) });
    const startup = await startRecovery(game);
    assert.equal(startup.allowed, true);
    assert.equal(game.context.player.name, player.name);
    assert.equal(startup.panels.length, 0);
});

test('readable local backups recover legacy player and dungeon before blocking startup', async () => {
    const game = gameSession();
    for (const key of ['playerData', 'dungeonData']) {
        game.storage.set(`${key}_backup`, game.storage.get(key));
        game.storage.set(key, '{broken');
    }
    const startup = await startRecovery(game);
    assert.equal(startup.allowed, true);
    assert.equal(game.context.player.lvl, 20);
    assert.equal(game.load('dungeonData').progress.floor, 7);
    assert.equal(startup.panels.length, 0);
});

test('a native snapshot still recovers corrupt player and dungeon data before the new startup checks', async () => {
    const seeded = await seed();
    const game = gameSession({ disk: seeded.disk });
    game.storage.set('playerData', '{broken');
    game.storage.set('dungeonData', '{}');
    const startup = await startRecovery(game);
    assert.equal(startup.allowed, true);
    assert.equal(game.context.player.lvl, 20);
    assert.equal(game.load('dungeonData').progress.floor, 7);
    assert.equal(startup.panels.length, 0);
});

for (const failedKey of ['*', 'playerData_temp', 'dungeonData_temp', 'enemyData_temp', 'playerCompanions']) {
    test(`a newer native checkpoint survives restart after failed ${failedKey} writes`, async () => {
        const game = gameSession();
        await game.initialize();
        game.run('saveData()');
        await game.checkpoint();
        game.context.failKeys.add(failedKey);
        game.run('player.lvl = 30; dungeon.progress.floor = 8; playerCompanions[0].level = 9; saveData()');
        await game.checkpoint();
        const restarted = gameSession({ disk: game.disk, storage: game.storage,
            failKeys: [failedKey], clock: 1 }); // Wall-clock rollback cannot change save ordering.
        await restarted.initialize();
        assert.equal(restarted.load('playerData').lvl, 30);
        assert.equal(restarted.load('dungeonData').progress.floor, 8);
        assert.equal(restarted.load('playerCompanions')[0].level, 9);
        restarted.run(`player = safeLoad('playerData', 'playerData_backup');
            dungeon = safeLoad('dungeonData', 'dungeonData_backup');
            playerCompanions = JSON.parse(readSaveStorage('playerCompanions'));`);
        await restarted.checkpoint();
        await restarted.checkpoint();
        assert.deepEqual([0, 1].map(i => JSON.parse(game.disk.get(slot(i))).data.player.lvl), [30, 30]);
    });
}

test('a newer successful local save wins over the throttled native checkpoint', async () => {
    const game = gameSession();
    await game.initialize();
    game.run('saveData()');
    await game.checkpoint();
    game.run('player.lvl = 31; saveData()');
    const restarted = gameSession({ disk: game.disk, storage: game.storage });
    await restarted.initialize();
    assert.equal(restarted.load('playerData').lvl, 31);
});

test('a partially repaired local save recovers again on a second cold start', async () => {
    for (const failedKey of ['playerData', 'dungeonData', 'enemyData', 'playerCompanions', 'commit']) {
        const game = gameSession();
        await game.initialize();
        game.run('saveData()');
        await game.checkpoint();
        game.run('player.lvl = 30; playerCompanions[0].level = 10');
        await game.checkpoint();
        for (let restart = 0; restart < 2; restart++) {
            const restarted = gameSession({ disk: game.disk, storage: game.storage, failKeys: [failedKey] });
            if (failedKey === 'commit') restarted.context.rejectWrite = (key, value) =>
                key === 'playerData' && !JSON.parse(value)._saveIncomplete;
            await restarted.initialize();
            assert.equal(restarted.load('playerData').lvl, 30, `${failedKey}, restart ${restart}`);
            assert.equal(restarted.load('playerCompanions')[0].level, 10);
        }
    }
});

test('interrupted local commits preserve the previous complete local backup', async () => {
    const game = gameSession();
    await game.initialize();
    game.run('saveData()');
    await game.checkpoint();
    game.context.rejectWrite = (key, value) => key === 'playerData' && !JSON.parse(value)._saveIncomplete;
    game.run('player.lvl = 30; saveData()');
    assert.equal(JSON.parse(game.storage.get('playerData'))._saveIncomplete, true);
    const previous = JSON.parse(game.storage.get('playerData_backup'));
    assert.equal(previous.lvl, 20);
    assert.equal(previous._saveIncomplete, undefined);
    const restarted = gameSession({ disk: game.disk, storage: game.storage });
    await restarted.initialize();
    assert.equal(restarted.load('playerData').lvl, 20, 'incomplete local revision cannot override a durable snapshot');
});

for (const failure of ['dungeonData_temp', 'enemyData_temp', 'playerCompanions', 'commit']) {
    test(`an interrupted first local ${failure} write recovers a complete checkpoint when native writes fail`, async () => {
        const game = gameSession(); // A legacy save on its first launch after upgrading.
        await game.initialize();
        game.context.failNativeWrites = true;
        if (failure === 'commit') {
            game.context.rejectWrite = (key, value) => key === 'playerData' && !JSON.parse(value)._saveIncomplete;
        } else {
            game.context.failKeys.add(failure);
        }
        game.run('player.lvl = 30; dungeon.progress.floor = 8; enemy.stats.hp = 2; playerCompanions[0].level = 9; saveData()');
        await game.checkpoint();
        assert.equal(game.disk.size, 0, 'no native snapshot was written');
        assert.equal(JSON.parse(game.storage.get('playerData'))._saveIncomplete, true);

        const restarted = gameSession({ disk: game.disk, storage: game.storage });
        const startup = await startRecovery(restarted);
        assert.equal(startup.allowed, true);
        assert.equal(startup.panels.length, 0);
        assert.deepEqual(restarted.load('playerData'), fixture().player);
        assert.deepEqual(restarted.load('dungeonData'), fixture().dungeon);
        assert.deepEqual(restarted.load('enemyData'), fixture().enemy);
        assert.deepEqual(restarted.load('playerCompanions'), fixture().companions);
        await restarted.checkpoint();
        assert.equal(game.disk.size, 1, 'native backups can start after recovery');
    });
}

test('repeated failed saves retain the original complete checkpoint before the first native backup', async () => {
    const game = gameSession();
    await game.initialize();
    game.context.failNativeWrites = true;
    game.context.rejectWrite = (key, value) => key === 'playerData' && !JSON.parse(value)._saveIncomplete;
    for (const level of [30, 40]) {
        game.context.player.lvl = level;
        game.run('dungeon.progress.floor++; playerCompanions[0].level++; saveData()');
        await game.checkpoint();
    }
    const restarted = gameSession({ storage: game.storage });
    await restarted.initialize();
    assert.deepEqual(restarted.load('playerData'), fixture().player);
    assert.deepEqual(restarted.load('dungeonData'), fixture().dungeon);
    assert.deepEqual(restarted.load('playerCompanions'), fixture().companions);
});

test('local checkpoint recovery survives another cold start after a partial repair', async () => {
    const game = gameSession();
    await game.initialize();
    game.context.failNativeWrites = true;
    game.context.rejectWrite = (key, value) => key === 'playerData' && !JSON.parse(value)._saveIncomplete;
    game.run('player.lvl = 30; dungeon.progress.floor = 8; playerCompanions[0].level = 9; saveData()');
    await game.checkpoint();
    for (let attempt = 0; attempt < 2; attempt++) {
        const restarted = gameSession({ storage: game.storage, failKeys: ['dungeonData'] });
        assert.equal((await startRecovery(restarted)).allowed, true);
        assert.deepEqual(restarted.load('playerData'), fixture().player);
        assert.deepEqual(restarted.load('dungeonData'), fixture().dungeon);
        assert.deepEqual(restarted.load('playerCompanions'), fixture().companions);
        assert.equal(JSON.parse(game.storage.get('playerData'))._saveIncomplete, true);
    }
});

test('incomplete saves without a valid full checkpoint still preserve evidence and block startup', async () => {
    for (const checkpoint of [undefined, {}, { ...fixture(), companions: null },
        { ...fixture(), player: { ...fixture().player, _saveIncomplete: true } }]) {
        const game = gameSession();
        game.storage.set('playerData_backup', JSON.stringify(fixture().player));
        game.storage.set('playerData', JSON.stringify({ ...fixture(30).player,
            _saveIncomplete: true, _saveCheckpoint: checkpoint }));
        const before = [...game.storage];
        assert.equal((await startRecovery(game)).allowed, false);
        assert.deepEqual([...game.storage], before);
    }
});

test('a legacy local save and legacy snapshot remain readable without revision metadata', async () => {
    const data = fixture();
    const json = JSON.stringify(data);
    let hash = 2166136261;
    for (let i = 0; i < json.length; i++) hash = Math.imul(hash ^ json.charCodeAt(i), 16777619);
    const disk = new Map([[slot(0), JSON.stringify({ version: 1, sequence: 5, savedAt: 100,
        data, checksum: (hash >>> 0).toString(16) })]]);
    const game = gameSession({ disk });
    game.storage.set('playerData', JSON.stringify({ ...fixture(40).player }));
    await game.initialize();
    assert.equal(game.load('playerData').lvl, 40, 'legacy complete local save keeps precedence');
    game.storage.clear();
    const restarted = gameSession({ disk, storage: game.storage });
    await restarted.initialize();
    assert.equal(restarted.load('playerData').lvl, 20, 'legacy native snapshot still recovers missing local storage');
});

test('a completed local reset is retained when the forced native write is interrupted', async () => {
    const game = gameSession();
    await game.initialize();
    game.run('saveData()');
    await game.checkpoint();
    game.context.failNativeWrites = true;
    game.run(`player.lvl = 1; player.allocated = false; dungeon.progress.floor = 1;
        playerCompanions[0].level = 1; saveData({ forceDungeon: true });`);
    await game.checkpoint();
    const restarted = gameSession({ disk: game.disk, storage: game.storage });
    await restarted.initialize();
    assert.equal(restarted.load('playerData').lvl, 1);
    assert.equal(restarted.load('playerData').allocated, false);
    assert.equal(restarted.load('dungeonData').progress.floor, 1);
    assert.equal(restarted.load('playerCompanions')[0].level, 1);
});

test('companion-only changes advance the local save beyond the previous native snapshot', async () => {
    const game = gameSession();
    await game.initialize();
    game.run('saveData()');
    await game.checkpoint();
    game.run('playerCompanions[0].level = 10; saveCompanions()');
    const restarted = gameSession({ disk: game.disk, storage: game.storage });
    await restarted.initialize();
    assert.equal(restarted.load('playerCompanions')[0].level, 10);
});

test('title-only changes cannot mark a partially failed local save as newer', async () => {
    const game = gameSession();
    game.run(read('titles.js'));
    await game.initialize();
    game.run('saveData()');
    await game.checkpoint();
    game.context.failKeys.add('playerCompanions');
    game.run('playerCompanions[0].level = 10; player.lvl = 30; saveData()');
    await game.checkpoint();
    game.run('player.titles = { unlocked: 1 }; persistPlayerTitles()');
    const restarted = gameSession({ disk: game.disk, storage: game.storage });
    await restarted.initialize();
    assert.equal(restarted.load('playerData').lvl, 30);
    assert.equal(restarted.load('playerCompanions')[0].level, 10);
});

test('an import gets a local revision instead of trusting a revision from another device', async () => {
    const game = gameSession();
    await game.initialize();
    game.run('saveData()');
    await game.checkpoint();
    game.run(`player.lvl = 1; player.allocated = false; player._saveRevision = 9000000;
        safeSave(STORAGE_KEYS.player, player, STORAGE_KEYS.playerBackup, STORAGE_KEYS.playerTemp);`);
    assert.ok(game.load('playerData')._saveRevision < 9000000);
    const restarted = gameSession({ disk: game.disk, storage: game.storage });
    await restarted.initialize();
    assert.equal(restarted.load('playerData').lvl, 1);
});

for (const raw of [undefined, '{broken', 'null', '{}', '[null]', '[{}]', '[{"id":1,"level":-1}]']) {
    test(`unusable companion data (${raw}) restores the complete native snapshot`, async () => {
        const game = gameSession();
        await game.initialize();
        game.run('saveData()');
        await game.checkpoint();
        game.run('player.lvl = 30; saveData()'); // Local player is newer but the set is incomplete.
        if (raw === undefined) game.storage.delete('playerCompanions');
        else game.storage.set('playerCompanions', raw);
        const restarted = gameSession({ disk: game.disk, storage: game.storage });
        await restarted.initialize();
        assert.equal(restarted.load('playerData').lvl, 20);
        assert.deepEqual(restarted.load('playerCompanions'), fixture().companions);
    });
}

test('unrecoverable companions preserve the original data and block startup before dungeon entry', async () => {
    for (const raw of [undefined, '{broken', '{}', '[null]']) {
        const game = gameSession();
        if (raw === undefined) game.storage.delete('playerCompanions');
        else game.storage.set('playerCompanions', raw);
        const before = [...game.storage];
        await assert.rejects(game.initialize(), /companions could not be recovered/);
        assert.deepEqual([...game.storage], before);
        assert.equal(game.disk.size, 0);
    }
});

test('a fresh unallocated character may still initialize without companion data', async () => {
    const game = gameSession();
    game.storage.set('playerData', JSON.stringify({ ...fixture().player, allocated: false }));
    game.storage.delete('playerCompanions');
    await game.initialize();
    assert.equal(game.load('playerData').name, fixture().player.name);
});

test('saving before character creation leaves local and native storage empty', async () => {
    const game = gameSession({ storage: new Map() });
    await game.initialize();
    game.run('player = null; saveData()');
    await game.checkpoint();
    assert.equal(game.storage.size, 0);
    assert.equal(game.disk.size, 0);
});

test('a valid empty companion roster is distinct from missing companion data', async () => {
    const game = gameSession();
    await game.initialize();
    game.run('saveData()');
    await game.checkpoint();
    game.run('playerCompanions = []; saveCompanions()');
    const restarted = gameSession({ disk: game.disk, storage: game.storage });
    await restarted.initialize();
    assert.deepEqual(restarted.load('playerCompanions'), []);
});

test('web builds do not create native backups', async () => {
    const state = setup({ native: false });
    await state.backup.initialize();
    await state.backup.save(fixture(), { force: true });
    assert.equal(state.disk.size, 0);
});

test('a desktop Capacitor bridge without mobile APIs does not block startup', async () => {
    const context = vm.createContext({
        console: quiet,
        safeLoad: () => null,
        readSaveStorage: () => null,
        window: { Capacitor: { getPlatform: () => 'electron' }, addEventListener() {} },
        document: { addEventListener() {} },
    });
    vm.runInContext(source, context);
    await vm.runInContext('nativeSaveBackup.initialize()', context);
});

test('a fresh installation does not manufacture an empty save', async () => {
    const state = setup();
    await state.backup.initialize();
    await state.backup.save(null);
    assert.equal(state.disk.size, 0);
    assert.equal(state.restored.length, 0);
});

test('the first snapshot contains the player, run, enemy and companions together', async () => {
    const state = await seed();
    const snapshot = JSON.parse(state.disk.get(slot(0)));
    assert.deepEqual(snapshot.data, { ...fixture(), player: { ...fixture().player, _saveRevision: 1 } });
    assert.equal(snapshot.sequence, 1);
    assert.equal(snapshot.savedAt, 100000);
    assert.equal(snapshot.version, 1);
    assert.equal(state.disk.size, 1, 'verified temporary file is promoted');
});

test('periodic snapshots are throttled while explicit checkpoints write immediately', async () => {
    const state = await seed();
    const first = state.disk.get(slot(0));
    await state.backup.save(fixture(21));
    assert.equal(state.disk.size, 1);
    state.advance(30000);
    await state.backup.save(fixture(22));
    assert.equal(state.disk.get(slot(0)), first);
    const second = state.disk.get(slot(1));
    await state.backup.save(fixture(23), { force: true });
    assert.equal(state.disk.get(slot(1)), second, 'previous snapshot survives the next write');
    assert.equal(JSON.parse(state.disk.get(slot(0))).sequence, 3);
});

test('missing local storage recovers the newest complete snapshot', async () => {
    const state = await seed();
    await state.backup.save(fixture(21), { force: true });
    const restarted = setup({ disk: state.disk });
    await restarted.backup.initialize();
    assert.deepEqual(restarted.restored, [{
        playerData: { ...fixture(21).player, _saveRevision: 2 }, dungeonData: fixture().dungeon,
        enemyData: fixture().enemy, playerCompanions: fixture().companions,
    }]);
    assert.equal(restarted.operations.length, 0, 'recovery never rewrites the native files');
});

test('a corrupt newest file falls back to the previous valid snapshot', async () => {
    const state = await seed();
    await state.backup.save(fixture(21), { force: true });
    const corrupted = JSON.parse(state.disk.get(slot(1)));
    corrupted.data.player.lvl = 999; // Still valid JSON, but the checksum no longer matches.
    state.disk.set(slot(1), JSON.stringify(corrupted));
    const restarted = setup({ disk: state.disk });
    await restarted.backup.initialize();
    assert.equal(restarted.local.get('playerData').lvl, 20);
});

test('a valid local save takes precedence, including an intentional new-run reset', async () => {
    const state = await seed();
    const localPlayer = fixture(1).player;
    localPlayer.allocated = false;
    localPlayer._saveRevision = state.backup.nextRevision();
    const local = new Map([['playerData', localPlayer]]);
    const restarted = setup({ disk: state.disk, local });
    await restarted.backup.initialize();
    assert.equal(restarted.restored.length, 0);
    assert.equal(restarted.local.get('playerData').lvl, 1);
});

test('a missing dungeon in an allocated run recovers a consistent snapshot', async () => {
    const state = await seed();
    const restarted = setup({ disk: state.disk,
        local: new Map([['playerData', fixture(30).player]]) });
    await restarted.backup.initialize();
    assert.equal(restarted.local.get('playerData').lvl, 20);
    assert.deepEqual(restarted.local.get('dungeonData'), fixture().dungeon);
});

for (const failure of ['write', 'verification', 'rename']) {
    test(`${failure} failure leaves the previous valid file recoverable`, async () => {
        const state = await seed();
        const first = state.disk.get(slot(0));
        const failed = setup({ disk: state.disk, failure });
        await failed.backup.initialize();
        await failed.backup.save(fixture(30), { force: true });
        assert.equal(state.disk.get(slot(0)), first);
        const restarted = setup({ disk: state.disk });
        await restarted.backup.initialize();
        assert.equal(restarted.local.get('playerData').lvl, 20);
    });
}

test('unreadable backups block a fresh character instead of overwriting existing files', async () => {
    const state = await seed();
    const first = state.disk.get(slot(0));
    const failed = setup({ disk: state.disk, failure: 'read' });
    await assert.rejects(failed.backup.initialize());
    await failed.backup.save(fixture(1), { force: true });
    assert.equal(state.disk.get(slot(0)), first);
    assert.equal(failed.operations.length, 0);
});

test('unreadable native files warn and disable backups while a valid local save remains playable', async () => {
    const seeded = await seed();
    const data = fixture(30);
    data.player._saveRevision = 2;
    for (const unreadable of [[slot(1)], [slot(0), slot(1)]]) {
        const local = new Map(Object.entries({ playerData: data.player, dungeonData: data.dungeon,
            enemyData: data.enemy, playerCompanions: data.companions }));
        const localBefore = clone([...local]);
        const state = setup({ disk: new Map(seeded.disk), local });
        const warnings = [];
        state.context.console = { ...quiet, warn: (...args) => warnings.push(args) };
        const error = new Error('Native storage read denied');
        const readFile = state.files.read;
        state.files.read = async file => {
            if (unreadable.includes(file)) throw error;
            return readFile(file);
        };

        await state.backup.initialize();

        assert.deepEqual(warnings, unreadable.map(file => [
            'Native save backups disabled: could not read file:', file, error,
        ]));
        assert.deepEqual([...state.local], localBefore);
        assert.equal(state.restored.length, 0);
        assert.equal(await state.backup.save(fixture(31), { force: true }), false);
        assert.equal(state.operations.length, 0);
        assert.deepEqual([...state.disk], [...seeded.disk]);
    }
});

test('initialization can be retried after temporary native storage failure', async () => {
    const state = setup();
    state.files.read = async () => { throw new Error('temporarily unavailable'); };
    await assert.rejects(state.backup.initialize());
    state.files.read = async file => state.disk.get(file) ?? null;
    await state.backup.initialize();
    await state.backup.save(fixture());
    assert.ok(state.disk.has(slot(0)));
});

test('diagnostics preserve corrupt and temporary files even after recovery fails', async () => {
    const disk = new Map([[slot(0), '{broken'], [`${slot(1)}.tmp`, '勇者 unfinished']]);
    const state = setup({ disk });
    await assert.rejects(state.backup.initialize());
    const report = await state.backup.exportRaw();
    assert.equal(report.files[slot(0)], '{broken');
    assert.equal(report.files[`${slot(1)}.tmp`], '勇者 unfinished');
    assert.equal(report.files[slot(1)], null);
    assert.deepEqual(Object.keys(report.errors), []);
    assert.equal(state.operations.length, 0);
});

test('diagnostics record individual read errors while exporting other files', async () => {
    const state = await seed();
    const readFile = state.files.read;
    state.files.read = async file => {
        if (file === slot(1)) throw new Error('Read denied');
        return readFile(file);
    };
    const report = await state.backup.exportRaw();
    assert.equal(report.files[slot(0)], state.disk.get(slot(0)));
    assert.equal(report.errors[slot(1)], 'Read denied');
});

test('clear removes both slots and temporary files after failed initialization', async () => {
    const disk = new Map([slot(0), slot(1), `${slot(0)}.tmp`, `${slot(1)}.tmp`].map(path => [path, 'broken']));
    const state = setup({ disk });
    await assert.rejects(state.backup.initialize());
    await state.backup.clear();
    await state.backup.save(fixture(), { force: true });
    assert.equal(disk.size, 0);
    assert.equal(state.operations.length, 4);
});

test('clear waits for an in-flight write and prevents lifecycle checkpoints', async () => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const state = setup({ gate: () => gate });
    await state.backup.initialize();
    const saving = state.backup.save(fixture());
    const clearing = state.backup.clear();
    await state.backup.save(fixture(21), { force: true });
    release();
    await Promise.all([saving, clearing]);
    assert.equal(state.disk.size, 0);
});

test('failed deletion is reported and does not enable later writes', async () => {
    const seeded = await seed();
    const state = setup({ disk: seeded.disk, failure: 'remove' });
    await state.backup.initialize();
    await assert.rejects(state.backup.clear(), /Deletion failed/);
    await state.backup.save(fixture(1), { force: true });
    assert.equal(state.disk.size, 1);
});

test('a newer backup format is preserved rather than overwritten by an older game', async () => {
    const state = await seed();
    const newer = JSON.parse(state.disk.get(slot(0)));
    newer.version = 2;
    state.disk.set(slot(0), JSON.stringify(newer));
    const restarted = setup({ disk: state.disk });
    await assert.rejects(restarted.backup.initialize());
    await restarted.backup.save(fixture(1), { force: true });
    assert.equal(JSON.parse(state.disk.get(slot(0))).version, 2);
    assert.equal(restarted.operations.length, 0);
});

test('a temporary error reading one slot cannot cause that slot to be overwritten', async () => {
    const seeded = await seed();
    const state = setup({ disk: seeded.disk });
    state.files.read = async file => {
        if (file === slot(1)) throw new Error('Temporary read failure');
        return state.disk.get(file) ?? null;
    };
    await state.backup.initialize();
    assert.equal(state.local.get('playerData').lvl, 20);
    await state.backup.save(fixture(21), { force: true });
    assert.equal(state.operations.length, 0);
});

test('serialization captures a stable snapshot and concurrent checkpoints stay ordered', async () => {
    let release;
    const blocked = new Promise(resolve => { release = resolve; });
    const state = setup({ gate: () => blocked });
    await state.backup.initialize();
    const data = fixture();
    const firstWrite = state.backup.save(data);
    data.player.lvl = 999;
    const secondWrite = state.backup.save(fixture(21), { force: true });
    const lastWrite = state.backup.save(fixture(22), { force: true });
    release();
    await Promise.all([firstWrite, secondWrite, lastWrite]);
    assert.equal(JSON.parse(state.disk.get(slot(0))).data.player.lvl, 20);
    assert.equal(JSON.parse(state.disk.get(slot(1))).data.player.lvl, 22);
    assert.equal(state.operations.filter(op => op[0] === 'rename').length, 2);
});

test('startup waits for recovery and loads the player even if localStorage cannot be repaired', async () => {
    const seeded = await seed();
    const state = setup({ disk: seeded.disk });
    const context = state.context;
    const elements = new Map();
    context.document = { querySelector: key => {
        if (!elements.has(key)) elements.set(key, {});
        return elements.get(key);
    } };
    context.localStorage = { getItem: () => null, setItem() { throw new Error('Quota exceeded'); } };
    context.normalizePlayerCurseProgress = () => {};
    vm.runInContext(read('utility.js').split('const nFormatter')[0], context);
    context.options = {
        ...state.options,
        readLocal: (key, validate) => vm.runInContext(`safeLoad('${key}', '${key}_backup')`, context),
        restoreLocal: values => {
            context.recoveryValues = values;
            vm.runInContext('for (const [key, value] of Object.entries(recoveryValues)) recoveredSaveData.set(key, JSON.stringify(value));', context);
        },
    };
    vm.runInContext('const nativeSaveBackup = createNativeSaveBackup(options);', context);
    vm.runInContext(read('player.js').split('let inventoryOpen')[0], context);
    vm.runInContext(read('main.js').split('// Use DOMContentLoaded')[0], context);
    assert.equal(vm.runInContext('player', context), null);
    assert.equal(await vm.runInContext('initializeNativeSaveRecovery()', context), true);
    assert.equal(vm.runInContext('player.name', context), '勇者');
    assert.equal(vm.runInContext('canContinueRun()', context), true);
    assert.deepEqual(clone(vm.runInContext('safeLoad("dungeonData", "dungeonData_backup")', context)), fixture().dungeon);
    assert.deepEqual(JSON.parse(vm.runInContext('readSaveStorage("playerCompanions")', context)), fixture().companions);
});

test('title-screen snapshots use saved run and companions instead of defaults', async () => {
    const data = fixture();
    const captures = [];
    const context = vm.createContext({
        console: quiet, player: data.player, dungeon: { initialized: false }, enemy: {},
        playerCompanions: [], companionsInitialized: false,
        STORAGE_KEYS: { dungeon: 'dungeonData', enemy: 'enemyData' },
        safeLoad: key => key === 'dungeonData' ? data.dungeon : data.enemy,
        readSaveStorage: () => JSON.stringify(data.companions),
        nativeSaveBackup: { save: async snapshot => captures.push(clone(snapshot)) },
    });
    vm.runInContext(source.slice(source.indexOf('const saveNativeBackup ='), source.indexOf('// Best effort')), context);
    await vm.runInContext('saveNativeBackup()', context);
    assert.deepEqual(captures, [data]);
    context.dungeon = { ...fixture().dungeon, initialized: false };
    context.dungeon.progress.floor = 1;
    context.companionsInitialized = true;
    await vm.runInContext('saveNativeBackup({ forceDungeon: true, force: true })', context);
    assert.equal(captures[1].dungeon.progress.floor, 1);
    assert.deepEqual(captures[1].companions, []);
});

test('localStorage save failure still schedules the native checkpoint', () => {
    const main = read('main.js');
    const captures = [];
    const context = vm.createContext({
        console: quiet, player: fixture().player, dungeon: fixture().dungeon, enemy: {},
        STORAGE_KEYS: {}, safeSave: () => false,
        localStorage: { getItem() { throw new Error('Unavailable'); } },
        saveNativeBackup: options => captures.push(clone(options)),
    });
    vm.runInContext(main.slice(main.indexOf('let isSaving = false;'), main.indexOf('const maybeUnlockNextCurseLevel')), context);
    vm.runInContext('saveData({ forceDungeon: true })', context);
    assert.deepEqual(captures, [{ force: true, forceDungeon: true }]);
});

test('the shipped filesystem bundle saves and recovers through the native bridge on Android and iOS', () => {
    const result = spawnSync(process.execPath, ['--experimental-vm-modules', '-e', `
        const assert = require('node:assert/strict');
        const fs = require('node:fs');
        const vm = require('node:vm');
        const source = fs.readFileSync('assets/js/native-save-backup.js', 'utf8');
        const bundle = fs.readFileSync('assets/js/filesystem-plugin.js', 'utf8');
        const utility = fs.readFileSync('assets/js/utility.js', 'utf8').split('const nFormatter')[0];
        (async () => {
            for (const platform of ['android', 'ios']) {
                const disk = new Map();
                const calls = [];
                const create = () => {
                    const context = vm.createContext({
                        console: { warn() {}, error() {}, log() {} },
                        androidBridge: platform === 'android' ? {} : undefined,
                        webkit: platform === 'ios' ? { messageHandlers: { bridge: {} } } : undefined,
                        document: { addEventListener() {} }, addEventListener() {},
                        localStorage: { getItem: () => null, setItem() { throw new Error('Quota exceeded'); } },
                        Capacitor: {
                            getPlatform: () => platform, isNativePlatform: () => true,
                            PluginHeaders: [{ name: 'Filesystem', methods: ['readFile', 'writeFile', 'rename', 'deleteFile'].map(name => ({ name, rtype: 'promise' })) }],
                            nativePromise: async (plugin, method, options) => {
                                assert.equal(plugin, 'Filesystem');
                                assert.equal(options.directory, 'LIBRARY');
                                calls.push(method);
                                if (method === 'readFile') {
                                    assert.equal(options.encoding, 'utf8');
                                    if (!disk.has(options.path)) throw { code: 'OS-PLUG-FILE-0008' };
                                    return { data: disk.get(options.path) };
                                }
                                if (method === 'writeFile') {
                                    assert.equal(options.encoding, 'utf8');
                                    assert.equal(options.recursive, true);
                                    disk.set(options.path, options.data);
                                    return {};
                                }
                                if (method === 'rename') {
                                    assert.equal(options.toDirectory, 'LIBRARY');
                                    disk.set(options.to, disk.get(options.from));
                                    disk.delete(options.from);
                                    return {};
                                }
                                if (method === 'deleteFile') {
                                    if (!disk.has(options.path)) throw { code: 'OS-PLUG-FILE-0008' };
                                    disk.delete(options.path);
                                    return {};
                                }
                                throw new Error('Unexpected filesystem call');
                            },
                        },
                    });
                    context.window = context;
                    vm.runInContext(utility, context);
                    let filesystemModule;
                    new vm.Script(source, { importModuleDynamically: async specifier => {
                        assert.equal(specifier, './filesystem-plugin.js');
                        if (filesystemModule) return filesystemModule;
                        const module = new vm.SourceTextModule(bundle, { context });
                        await module.link(() => { throw new Error('Unbundled dependency'); });
                        await module.evaluate();
                        filesystemModule = module;
                        return module;
                    } }).runInContext(context);
                    return context;
                };
                const original = create();
                original.snapshot = ${JSON.stringify(fixture())};
                await vm.runInContext('nativeSaveBackup.initialize()', original);
                await vm.runInContext('nativeSaveBackup.save(snapshot)', original);
                assert.equal(disk.size, 1);
                const restarted = create();
                await vm.runInContext('nativeSaveBackup.initialize()', restarted);
                assert.equal(vm.runInContext('safeLoad("playerData", "playerData_backup").name', restarted), '勇者');
                assert.equal(vm.runInContext('safeLoad("dungeonData", "dungeonData_backup").progress.floor', restarted), 7);
                assert.equal(JSON.parse(vm.runInContext('readSaveStorage("playerCompanions")', restarted))[0].level, 5);
                assert.equal(calls.filter(method => method === 'writeFile').length, 1);
                const report = await vm.runInContext('nativeSaveBackup.exportRaw()', restarted);
                assert.equal(report.files['save-backups/slot-0.json'], disk.get('save-backups/slot-0.json'));
                await vm.runInContext('nativeSaveBackup.clear()', restarted);
                assert.equal(disk.size, 0);
                assert.equal(calls.filter(method => method === 'deleteFile').length, 4);
            }
        })().catch(error => { console.error(error); process.exitCode = 1; });
    `], { cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 0, result.stderr + result.stdout);
});
