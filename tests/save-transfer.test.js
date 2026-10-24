const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, 'assets/js', file), 'utf8');
const main = read('main.js');
const run = (context, source) => vm.runInContext(source, context);
const plain = value => JSON.parse(JSON.stringify(value));
const item = (id, slot = 'weapon') => ({
    id, slot, category: 'Sword', type: 'Weapon', rarity: 'Heirloom',
    lvl: 100, tier: 10, value: 1234, stats: [{ atk: 100 }],
    refineLevel: 7, locked: true, statRolls: { atk: 2 },
});
const createPlayer = (count = 150) => ({
    name: 'Hero', lvl: 100, hardcore: true, allocated: true, inCombat: true,
    stats: { hp: 0, hpMax: 500 }, baseStats: {}, equippedStats: {}, bonusStats: {},
    inventory: {
        equipment: Array.from({ length: count }, (_, index) => JSON.stringify(item(index))),
        consumables: [{ id: 'potion', amount: 3 }], refineStones: 83, forgeTokens: 4,
    },
    equipped: [item('sword'), item('shield', 'offHand'), item('helmet', 'head'),
        item('armor', 'body'), item('boots', 'feet'), item('ring', 'accessory')],
    companionCharm: item('charm', 'companionCharm'), equipmentSlotVersion: 1,
    gold: 98765, playtime: 123456, selectedCurseLevel: 2, maxUnlockedCurseLevel: 3,
});

const createContext = (storage = new Map()) => {
    const elements = new Map();
    const element = selector => {
        if (!elements.has(selector)) elements.set(selector, {
            style: {}, innerHTML: '', textContent: '', value: '',
            select() {}, setSelectionRange(start, end) { this.selection = [start, end]; },
        });
        return elements.get(selector);
    };
    const context = vm.createContext({
        console: { error() {}, warn() {}, log() {} },
        btoa, atob, player: createPlayer(0), enemy: {},
        dungeon: { initialized: true, progress: {}, statistics: {}, settings: {}, backlog: [] },
        combatBacklog: [], playerCompanions: [], activeCompanion: null,
        dungeonTimer: 1, playTimer: 2, clearInterval() {}, navigator: {},
        localStorage: {
            getItem: key => storage.has(key) ? storage.get(key) : null,
            setItem(key, value) {
                if (context.failWrites) throw new Error('Quota exceeded');
                storage.set(key, String(value));
            },
        },
        document: { querySelector: element, execCommand: () => false },
        defaultModalElement: element('#default'), confirmationModalElement: element('#confirmation'),
        menuModalElement: element('#menu'),
        sfxOpen: { play() {} }, sfxConfirm: { play() {} },
        sfxDecline: { play() {} }, sfxDeny: { play() {} }, bgmDungeon: { stop() {} },
        t: key => key, runLoad() {}, saveCompanions() {},
        normalizePlayerCurseProgress() {}, clampCurseLevel: value => value,
        getEnemyScalingFromCurseLevel: value => value,
    });
    run(context, read('utility.js').split('const nFormatter')[0]);
    run(context, read('equipment.js'));
    run(context, main.split('// Use DOMContentLoaded')[0]);
    run(context, main.slice(main.indexOf('let isSaving = false;'), main.indexOf('const maybeUnlockNextCurseLevel')));
    run(context, main.slice(main.indexOf('const progressReset ='), main.indexOf('const hideEndgameScreen')));
    run(context, main.slice(main.indexOf('// Export and Import Save Data'), main.indexOf('// Player Stat Allocation')));
    return { context, storage, element };
};

const encode = player => btoa(JSON.stringify(player));
const importAndConfirm = (state, data) => {
    state.context.transfer = data;
    run(state.context, 'importData(transfer)');
    const confirm = state.element('#import-btn').onclick;
    assert.equal(typeof confirm, 'function', 'valid save should open confirmation');
    confirm();
};

test('device transfer preserves 150 items, equipped gear, charm and currencies after reload', () => {
    const source = createContext();
    source.context.player = createPlayer();
    const exported = run(source.context, 'exportData()');
    const target = createContext();
    importAndConfirm(target, exported);
    const reloaded = plain(run(createContext(target.storage).context, "safeLoad(STORAGE_KEYS.player, STORAGE_KEYS.playerBackup)"));
    for (const key of ['inventory', 'equipped', 'companionCharm', 'gold', 'playtime']) {
        assert.deepEqual(reloaded[key], source.context.player[key], key);
    }
    assert.equal(reloaded.lvl, 1, 'only the current run resets');
    assert.equal(reloaded.inCombat, false);
    assert.equal(reloaded.stats.hp, reloaded.stats.hpMax);
});

test('old Latin-1 exports import on a fresh device with no existing player', () => {
    const state = createContext();
    state.context.player = null;
    const legacy = createPlayer(100);
    legacy.name = 'Jörg';
    importAndConfirm(state, '  \n' + encode(legacy) + '\n  ');
    const saved = JSON.parse(state.storage.get('playerData'));
    assert.equal(saved.name, legacy.name);
    assert.deepEqual(saved.inventory, legacy.inventory);
    assert.deepEqual(saved.equipped, legacy.equipped);
});

test('cancelling import leaves both current player and saved items untouched', () => {
    const state = createContext();
    const before = state.context.player;
    state.storage.set('playerData', JSON.stringify(before));
    state.context.transfer = encode(createPlayer());
    run(state.context, 'importData(transfer)');
    state.element('#cancel-btn').onclick();
    assert.equal(state.context.player, before);
    assert.deepEqual(JSON.parse(state.storage.get('playerData')), before);
});

test('Unicode names export in a format that old importers can still read', () => {
    const state = createContext();
    state.context.player.name = '勇者 ⚔️ Łukasz';
    state.context.player.inventory.equipment.push(JSON.stringify({ ...item('unicode'), name: '剣 🗡️' }));
    const exported = run(state.context, 'exportData()');
    assert.deepEqual(JSON.parse(atob(exported)), state.context.player);
    importAndConfirm(createContext(), exported);
});

test('legacy saves and duplicate equipped slots keep every item during migration', () => {
    const state = createContext();
    const legacy = createPlayer(2);
    delete legacy.equipmentSlotVersion;
    legacy.equipped.push({ ...item('duplicate'), slot: undefined });
    importAndConfirm(state, encode(legacy));
    const saved = JSON.parse(state.storage.get('playerData'));
    const ids = saved.equipped.concat(saved.inventory.equipment.map(JSON.parse)).map(entry => entry.id).sort();
    assert.deepEqual(ids, [0, 1, 'sword', 'shield', 'helmet', 'armor', 'boots', 'ring', 'duplicate'].sort());
});

test('failed import storage leaves the current player and save untouched and shows an error', () => {
    const state = createContext();
    const before = state.context.player;
    state.storage.set('playerData', JSON.stringify(before));
    state.context.failWrites = true;
    importAndConfirm(state, encode(createPlayer()));
    assert.equal(state.context.player, before);
    assert.deepEqual(JSON.parse(state.storage.get('playerData')), before);
    assert.equal(state.element('#import-status').textContent, 'save-import-storage-error');
    state.context.failWrites = false;
    state.element('#import-btn').onclick();
    assert.equal(JSON.parse(state.storage.get('playerData')).inventory.equipment.length, 150);
});

test('invalid or truncated imports show an error without opening confirmation', () => {
    for (const data of ['broken', encode({ inventory: null }), encode({ inventory: { equipment: 'broken' } }), encode(createPlayer()).slice(0, -100)]) {
        const state = createContext();
        state.context.transfer = data;
        run(state.context, 'importData(transfer)');
        assert.equal(state.element('#import-btn').onclick, undefined);
        assert.equal(state.element('#save-transfer-status').textContent, 'save-import-invalid');
    }
});

test('copy falls back when Android clipboard access is missing or rejects and copies the full save', async () => {
    for (const navigator of [{}, { clipboard: { writeText: async () => { throw new Error('Denied'); } } }]) {
        const state = createContext();
        state.context.navigator = navigator;
        const input = state.element('#export-input');
        input.value = 'x'.repeat(200000);
        state.context.document.execCommand = command => command === 'copy';
        assert.equal(await run(state.context, 'copySaveExport()'), true);
        assert.deepEqual(input.selection, [0, input.value.length]);
        assert.equal(state.element('#copy-export').textContent, 'copied');
    }
});

test('copy reports success only after the full clipboard write succeeds', async () => {
    const state = createContext();
    const data = 'x'.repeat(200000);
    state.element('#export-input').value = data;
    let complete;
    state.context.navigator.clipboard = { writeText: value => {
        assert.equal(value, data);
        return new Promise(resolve => { complete = resolve; });
    } };
    const pending = run(state.context, 'copySaveExport()');
    assert.notEqual(state.element('#copy-export').textContent, 'copied');
    complete();
    assert.equal(await pending, true);
    assert.equal(state.element('#copy-export').textContent, 'copied');
});

test('failed copy shows a manual-copy hint instead of reporting success', async () => {
    const state = createContext();
    assert.equal(await run(state.context, 'copySaveExport()'), false);
    assert.notEqual(state.element('#copy-export').textContent, 'copied');
    assert.equal(state.element('#save-transfer-status').textContent, 'save-copy-error');
});
