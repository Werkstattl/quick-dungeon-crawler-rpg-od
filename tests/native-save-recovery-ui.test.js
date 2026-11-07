const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('assets/js/main.js', 'utf8').split('// Use DOMContentLoaded')[0];

async function setup({ confirm = true, failDelete = false, failLocalRead = false, failLocalClear = false, clipboard = false } = {}) {
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
            exportRaw: async () => ({ files: { 'slot-0.json': '{broken native' }, errors: {} }),
            clear: async () => {
                calls.push('native-clear');
                if (failDelete) throw new Error('Delete denied');
            },
        },
        recoveredSaveData: { clear: () => calls.push('memory-clear') },
        localStorage: {
            get length() { if (failLocalRead) throw new Error('Storage denied'); return entries.size; },
            key: i => [...entries.keys()][i], getItem: key => entries.get(key),
            clear: () => { calls.push('local-clear'); if (failLocalClear) throw new Error('Clear denied'); entries.clear(); },
        },
        navigator: clipboard ? { clipboard: { writeText: async text => calls.push(['copy', text]) } } : {},
        window: { confirm: () => confirm, location: { reload: () => calls.push('reload') } },
        document: { createElement: () => panel, querySelector: () => ({ appendChild() {} }), execCommand: () => false },
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
