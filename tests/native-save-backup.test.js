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

test('web builds do not create native backups', async () => {
    const state = setup({ native: false });
    await state.backup.initialize();
    await state.backup.save(fixture(), { force: true });
    assert.equal(state.disk.size, 0);
});

test('a desktop Capacitor bridge without mobile APIs does not block startup', async () => {
    const context = vm.createContext({
        console: quiet,
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
    assert.deepEqual(snapshot.data, fixture());
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
        playerData: fixture(21).player, dungeonData: fixture().dungeon,
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
