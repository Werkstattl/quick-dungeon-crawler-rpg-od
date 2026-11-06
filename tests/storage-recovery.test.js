const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const utilitySource = fs.readFileSync(path.join(__dirname, '../assets/js/utility.js'), 'utf8');
const storageSource = utilitySource.split('const nFormatter')[0];
const savedState = { name: 'Hero', lvl: 50, inventory: { equipment: ['sword'] } };
const backupRaw = JSON.stringify(savedState);

function createStorage(entries, { failedReads = [], failWrites = false } = {}) {
    const storage = new Map(entries);
    const reads = [];
    const writes = [];
    const context = vm.createContext({
        console: { log() {}, warn() {}, error() {} },
        localStorage: {
            getItem(key) {
                reads.push(key);
                if (failedReads.includes(key)) throw new Error('Storage read failed');
                return storage.has(key) ? storage.get(key) : null;
            },
            setItem(key, value) {
                if (failWrites) throw new Error('Quota exceeded');
                writes.push(key);
                storage.set(key, String(value));
            },
        },
    });
    vm.runInContext(storageSource, context);
    return {
        storage, reads, writes,
        load(key = 'playerData') {
            context.key = key;
            return JSON.parse(JSON.stringify(vm.runInContext('safeLoad(key, key + "_backup")', context)));
        },
    };
}

test('a valid primary save takes precedence without reading or changing the backup', () => {
    const primary = { ...savedState, lvl: 51 };
    const state = createStorage([
        ['playerData', JSON.stringify(primary)],
        ['playerData_backup', backupRaw],
    ]);

    assert.deepEqual(state.load(), primary);
    assert.deepEqual(state.reads, ['playerData']);
    assert.deepEqual(state.writes, []);
    assert.equal(state.storage.get('playerData_backup'), backupRaw);
});

const unusablePrimaryValues = [
    ['missing', undefined],
    ['empty', ''],
    ['null', 'null'],
    ['corrupt', '{broken'],
];

for (const key of ['playerData', 'dungeonData', 'enemyData']) {
    for (const [description, raw] of unusablePrimaryValues) {
        test(`${key} recovers from backup when the primary save is ${description}`, () => {
            const entries = [[`${key}_backup`, backupRaw]];
            if (raw !== undefined) entries.push([key, raw]);
            const state = createStorage(entries);

            assert.deepEqual(state.load(key), savedState);
            assert.equal(state.storage.get(key), backupRaw);
            assert.equal(state.storage.get(`${key}_backup`), backupRaw);
            assert.deepEqual(state.writes, [key]);
        });
    }
}

for (const [description, raw] of unusablePrimaryValues) {
    test(`backup loads even if restoring the ${description} primary save fails`, () => {
        const entries = [['playerData_backup', backupRaw]];
        if (raw !== undefined) entries.push(['playerData', raw]);
        const state = createStorage(entries, { failWrites: true });

        assert.deepEqual(state.load(), savedState);
        assert.deepEqual(state.load(), savedState, 'repeated loads can still recover');
        assert.deepEqual([...state.storage], entries);
    });
}

test('a primary read error still allows recovery from a readable backup', () => {
    const state = createStorage([['playerData_backup', backupRaw]], {
        failedReads: ['playerData'],
    });

    assert.deepEqual(state.load(), savedState);
    assert.equal(state.storage.get('playerData_backup'), backupRaw);
});

test('unusable backups return null without replacing either stored entry', () => {
    for (const [, raw] of unusablePrimaryValues) {
        const entries = [['playerData', '{broken']];
        if (raw !== undefined) entries.push(['playerData_backup', raw]);
        const state = createStorage(entries);

        assert.equal(state.load(), null);
        assert.deepEqual([...state.storage], entries);
        assert.deepEqual(state.writes, []);
    }
});

test('unavailable storage returns null without throwing or attempting a write', () => {
    const state = createStorage([], { failedReads: ['playerData', 'playerData_backup'] });

    assert.equal(state.load(), null);
    assert.deepEqual(state.writes, []);
});

test('a new installation with no saves returns null without writing', () => {
    const state = createStorage([]);

    assert.equal(state.load(), null);
    assert.deepEqual(state.writes, []);
    assert.equal(state.storage.size, 0);
});
