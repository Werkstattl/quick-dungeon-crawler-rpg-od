const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('assets/js/main.js', 'utf8').split('// Use DOMContentLoaded')[0];

async function setup({ confirm = true, failDelete = false, failLocalRead = false, failLocalClear = false, clipboard = false, rejectClipboard = false, legacyCopy = false, exportGate = null, failExport = false, failLocalItem = false } = {}) {
    const entries = new Map([['playerData', '{broken'], ['playerData_temp', '勇者'], ['__proto__', 'raw']]);
    const calls = [];
    const elements = new Map();
    const element = selector => {
        if (!elements.has(selector)) elements.set(selector, {
            style: {}, hidden: true, setAttribute() {},
            focus() {}, select() {}, setSelectionRange() {},
        });
        return elements.get(selector);
    };
    const panel = { style: {}, setAttribute() {}, querySelector: element };
    const context = vm.createContext({
        console: { error() {} }, t: key => key, applyTranslations() {},
        nativeSaveBackup: {
            initialize: async () => { throw new Error('Invalid backup'); },
            exportRaw: async () => {
                if (exportGate) await exportGate;
                if (failExport) throw new Error('Export denied');
                return { files: { 'slot-0.json': '{broken native' }, errors: {} };
            },
            clear: async () => {
                calls.push('native-clear');
                if (failDelete) throw new Error('Delete denied');
            },
        },
        recoveredSaveData: { clear: () => calls.push('memory-clear') },
        localStorage: {
            get length() { if (failLocalRead) throw new Error('Storage denied'); return entries.size; },
            key: i => [...entries.keys()][i], getItem: key => {
                if (failLocalItem && key === 'playerData') throw new Error('Item denied');
                return entries.get(key);
            },
            clear: () => { calls.push('local-clear'); if (failLocalClear) throw new Error('Clear denied'); entries.clear(); },
        },
        navigator: clipboard ? { clipboard: { writeText: async text => {
            if (rejectClipboard) throw new Error('Clipboard denied');
            calls.push(['copy', text]);
        } } } : {},
        window: { confirm: () => confirm, location: { reload: () => calls.push('reload') } },
        document: { createElement: () => panel, querySelector: () => ({ appendChild() {} }), execCommand: command => { calls.push(['legacy-copy', command]); return legacyCopy; } },
    });
    vm.runInContext(source, context);
    assert.equal(await vm.runInContext('initializeNativeSaveRecovery()', context), false);
    assert.equal((panel.innerHTML.match(/<button /g) || []).length, 2);
    return { entries, calls, element };
}

test('recovery export includes raw local and native data and copies the report', async () => {
    const state = await setup({ clipboard: true });
    await state.element('[data-recovery-export]').onclick();
    const report = JSON.parse(state.element('textarea').value);
    assert.equal(report.localStorage.playerData, '{broken');
    assert.equal(report.localStorage.playerData_temp, '勇者');
    assert.equal(report.localStorage.__proto__, 'raw');
    assert.equal(report.nativeStorage.files['slot-0.json'], '{broken native');
    assert.equal(state.calls[0][0], 'copy');
    assert.equal(state.element('[data-recovery-report]').hidden, false);
    assert.equal(state.element('[data-recovery-status]').textContent, 'save-recovery-copied');
    assert.equal(state.entries.size, 3);
});

test('blocked local storage and clipboard still leave native data available for manual copying', async () => {
    const state = await setup({ failLocalRead: true });
    await state.element('[data-recovery-export]').onclick();
    const report = JSON.parse(state.element('textarea').value);
    assert.equal(report.localStorageErrors.storage, 'Storage denied');
    assert.equal(report.nativeStorage.files['slot-0.json'], '{broken native');
    assert.equal(state.element('[data-recovery-status]').textContent, 'save-recovery-copy-manually');
    assert.equal(state.element('[data-recovery-delete]').disabled, false);
});

test('cancelling reset leaves every store intact', async () => {
    const state = await setup({ confirm: false });
    await state.element('[data-recovery-delete]').onclick();
    assert.deepEqual(state.calls, []);
    assert.equal(state.entries.size, 3);
});

test('reset clears native, local and memory data before restarting', async () => {
    const state = await setup();
    await state.element('[data-recovery-delete]').onclick();
    assert.deepEqual(state.calls, ['native-clear', 'local-clear', 'memory-clear', 'reload']);
    assert.equal(state.entries.size, 0);
});

for (const failure of ['failDelete', 'failLocalClear']) {
    test(`${failure} prevents restart and leaves the actions available for retry`, async () => {
        const state = await setup({ [failure]: true });
        await state.element('[data-recovery-delete]').onclick();
        assert.equal(state.calls.includes('reload'), false);
        assert.equal(state.element('[data-recovery-status]').textContent, 'save-recovery-delete-error');
        assert.equal(state.element('[data-recovery-delete]').disabled, false);
    });
}

for (const legacyCopy of [true, false]) {
    test(`native WebView clipboard denial falls back to ${legacyCopy ? 'legacy copying' : 'manual selection'}`, async () => {
        const state = await setup({ clipboard: true, rejectClipboard: true, legacyCopy });
        await state.element('[data-recovery-export]').onclick();
        assert.equal(state.element('[data-recovery-status]').textContent,
            legacyCopy ? 'save-recovery-copied' : 'save-recovery-copy-manually');
        assert.ok(state.calls.some(call => call[0] === 'legacy-copy' && call[1] === 'copy'));
        assert.equal(state.element('[data-recovery-report]').hidden, false);
        assert.equal(JSON.parse(state.element('textarea').value).localStorage.playerData, '{broken');
    });
}

test('slow native export disables both actions until all diagnostic data is collected', async () => {
    let release;
    const exportGate = new Promise(resolve => { release = resolve; });
    const state = await setup({ exportGate });
    const exporting = state.element('[data-recovery-export]').onclick();
    assert.equal(state.element('[data-recovery-export]').disabled, true);
    assert.equal(state.element('[data-recovery-delete]').disabled, true);
    assert.equal(state.element('[data-recovery-report]').hidden, true);
    release();
    await exporting;
    assert.equal(state.element('[data-recovery-export]').disabled, false);
    assert.equal(state.element('[data-recovery-delete]').disabled, false);
    assert.equal(state.element('[data-recovery-report]').hidden, false);
});

test('failed diagnostic export keeps saved data and re-enables both actions', async () => {
    const state = await setup({ failExport: true });
    await state.element('[data-recovery-export]').onclick();
    assert.equal(state.element('[data-recovery-status]').textContent, 'save-recovery-export-error');
    assert.equal(state.entries.size, 3);
    assert.equal(state.element('[data-recovery-export]').disabled, false);
    assert.equal(state.element('[data-recovery-delete]').disabled, false);
    assert.equal(state.calls.includes('reload'), false);
});

test('an individual unreadable local key does not prevent export of other local and native data', async () => {
    const state = await setup({ failLocalItem: true });
    await state.element('[data-recovery-export]').onclick();
    const report = JSON.parse(state.element('textarea').value);
    assert.equal(report.localStorageErrors.playerData, 'Item denied');
    assert.equal(report.localStorage.playerData_temp, '勇者');
    assert.equal(report.nativeStorage.files['slot-0.json'], '{broken native');
});

test('startup awaits native recovery before loading and normalizing the restored player', async () => {
    let release;
    const recovered = new Promise(resolve => { release = resolve; });
    const calls = [];
    const saved = { name: 'Restored hero' };
    const validPlayer = () => true;
    const context = vm.createContext({
        nativeSaveBackup: { initialize: () => recovered, validPlayer },
        STORAGE_KEYS: { player: 'playerData', playerBackup: 'playerData_backup' },
        player: null,
        safeLoad: (key, backup, validate) => {
            calls.push('load');
            assert.equal(key, 'playerData');
            assert.equal(backup, 'playerData_backup');
            assert.equal(validate, validPlayer);
            return saved;
        },
        normalizeLoadedPlayer: () => { calls.push('normalize'); assert.equal(context.player, saved); },
    });
    vm.runInContext(source, context);
    const starting = vm.runInContext('initializeNativeSaveRecovery()', context);
    assert.deepEqual(calls, []);
    assert.equal(context.player, null);
    release();
    assert.equal(await starting, true);
    assert.deepEqual(calls, ['load', 'normalize']);
});

test('startup remains compatible with builds without the native backup module', async () => {
    const context = vm.createContext({});
    vm.runInContext(source, context);
    assert.equal(await vm.runInContext('initializeNativeSaveRecovery()', context), true);
});
