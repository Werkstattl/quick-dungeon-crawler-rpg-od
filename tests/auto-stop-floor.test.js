const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const automodeSource = fs.readFileSync(path.join(root, 'assets/js/automode.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(root, 'assets/js/main.js'), 'utf8');
const dungeonSource = fs.readFileSync(path.join(root, 'assets/js/dungeon.js'), 'utf8');
const localesDirectory = path.join(root, 'assets/locales');

function setup(storageEntries, floor = 1) {
    const storage = new Map([
        ['autoModePermanentUnlocked', 'true'],
        ['autoMode', 'true'],
        ['autoModeBtnVisible', 'true'],
        ...Object.entries(storageEntries || {}),
    ]);
    const logs = [];
    const context = vm.createContext({
        localStorage: {
            getItem: key => storage.get(key) ?? null,
            setItem: (key, value) => storage.set(key, String(value)),
        },
        document: {
            querySelector: selector => (selector === '#auto-mode-btn' ? autoModeBtn : null),
        },
        setTimeout: () => 0,
        window: {},
        sfxConfirm: { play() {} },
        sfxPause: { play() {} },
        sfxUnpause: { play() {} },
        addDungeonLog: message => logs.push(message),
        t: (key, params) => `${key}:${params && params.floor}`,
    });
    const autoModeBtn = {
        classList: { add() {}, remove() {}, toggle() {} },
        setAttribute() {}, addEventListener() {},
    };
    context.dungeon = { progress: { floor }, status: {} };
    vm.runInContext(automodeSource, context);
    return { context, storage, logs };
}

for (const [stored, expected] of [[null, 0], ['0', 0], ['', 0], ['abc', 0], ['-5', 0], ['25', 25], ['150', 100]]) {
    test(`auto stop floor normalizes ${JSON.stringify(stored)} to ${expected}`, () => {
        const { context } = setup(stored === null ? {} : { autoStopFloor: stored });
        assert.equal(vm.runInContext('autoStopFloor', context), expected);
    });
}

test('auto mode keeps running below the configured stop floor', () => {
    const { context } = setup({ autoStopFloor: '10' }, 9);
    assert.equal(vm.runInContext('maybeAutoStopAtFloor()', context), false);
    assert.equal(vm.runInContext('autoMode', context), true);
});

test('auto mode turns off when the stop floor is reached and logs it once', () => {
    const { context, storage, logs } = setup({ autoStopFloor: '10' }, 10);
    assert.equal(vm.runInContext('maybeAutoStopAtFloor()', context), true);
    assert.equal(vm.runInContext('autoMode', context), false);
    assert.equal(storage.get('autoMode'), 'false');
    assert.deepEqual(logs, ['auto-stopped-at-floor:10']);
    assert.equal(vm.runInContext('maybeAutoStopAtFloor()', context), false);
    assert.equal(logs.length, 1);
});

test('auto stop floor off never stops auto mode', () => {
    const { context } = setup({}, 42);
    assert.equal(vm.runInContext('maybeAutoStopAtFloor()', context), false);
    assert.equal(vm.runInContext('autoMode', context), true);
});

test('auto stop floor does nothing when auto mode is already off', () => {
    const { context, logs } = setup({ autoStopFloor: '5', autoMode: 'false' }, 7);
    assert.equal(vm.runInContext('maybeAutoStopAtFloor()', context), false);
    assert.deepEqual(logs, []);
});

test('auto stop floor handles a missing dungeon state', () => {
    const { context } = setup({ autoStopFloor: '5' }, 6);
    context.dungeon = undefined;
    assert.equal(vm.runInContext('maybeAutoStopAtFloor()', context), false);
    assert.equal(vm.runInContext('autoMode', context), true);
});

test('dungeon progress checks the auto stop floor on every room and floor change', () => {
    const progressFn = dungeonSource.slice(
        dungeonSource.indexOf('const loadDungeonProgress ='),
        dungeonSource.indexOf('// ========== Events in the Dungeon'),
    );
    assert.ok(progressFn.length > 0, 'loadDungeonProgress source should be extractable');
    assert.match(progressFn, /typeof maybeAutoStopAtFloor === 'function'/);
});

test('auto mode settings expose the stop floor select and persist it', () => {
    assert.match(mainSource, /id="auto-stop-floor-select"/);
    assert.match(mainSource, /data-i18n="auto-stop-floor"/);
    assert.match(mainSource, /autoStopFloor = parseInt\(autoStopFloorSelect\.value, 10\)/);
    assert.match(mainSource, /localStorage\.setItem\("autoStopFloor", autoStopFloor\)/);
});

test('all locales provide the auto stop floor texts', () => {
    const localeFiles = fs.readdirSync(localesDirectory)
        .filter(file => file.endsWith('.json'))
        .sort();
    assert.ok(localeFiles.length >= 31);
    for (const file of localeFiles) {
        const locale = JSON.parse(fs.readFileSync(path.join(localesDirectory, file), 'utf8'));
        for (const key of ['auto-stop-floor', 'auto-stopped-at-floor']) {
            assert.equal(typeof locale[key], 'string', `${file} is missing ${key}`);
            assert.ok(locale[key].trim().length > 0, `${file} has an empty ${key}`);
        }
        assert.match(locale['auto-stopped-at-floor'], /\{floor\}/, `${file} must retain {floor}`);
    }
    const english = JSON.parse(fs.readFileSync(path.join(localesDirectory, 'en.json'), 'utf8'));
    assert.equal(english['auto-stop-floor'], 'Stop at floor');
    assert.equal(english['auto-stopped-at-floor'], 'Auto Mode stopped at floor {floor}.');
});
