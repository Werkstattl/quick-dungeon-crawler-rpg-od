const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets/js/screen-wake-lock.js'), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));

function setup(request) {
    const document = new EventTarget();
    const window = new EventTarget();
    document.hidden = false;
    const locks = [];
    const requests = [];
    const context = vm.createContext({
        document, window,
        navigator: { wakeLock: { request: async type => {
            requests.push(type);
            if (request) return request();
            const lock = new EventTarget();
            lock.released = false;
            lock.release = async () => {
                lock.released = true;
                lock.dispatchEvent(new Event('release'));
            };
            locks.push(lock);
            return lock;
        } } },
    });
    vm.runInContext(source, context);
    return {
        context, document, window, locks, requests,
        setActive: active => vm.runInContext(`setScreenWakeLockActive(${active})`, context),
    };
}

test('playing keeps the display awake; pause releases it; resuming reacquires once', async () => {
    const game = setup();
    await game.setActive(false);
    assert.equal(game.requests.length, 0);
    await game.setActive(true);
    await game.setActive(true);
    assert.deepEqual(game.requests, ['screen']);
    await game.setActive(false);
    assert.equal(game.locks[0].released, true);
    await game.setActive(true);
    assert.equal(game.requests.length, 2);
});

test('backgrounding and leaving the page release the lock; paused games stay released', async () => {
    const game = setup();
    await game.setActive(true);
    game.document.hidden = true;
    game.document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    assert.equal(game.locks[0].released, true);
    game.document.hidden = false;
    game.document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    assert.equal(game.requests.length, 2);
    game.document.dispatchEvent(new Event('pause'));
    await settle();
    assert.equal(game.locks[1].released, true);
    game.document.dispatchEvent(new Event('resume'));
    await settle();
    assert.equal(game.requests.length, 3);
    game.window.dispatchEvent(new Event('pagehide'));
    await settle();
    assert.equal(game.locks[2].released, true);
    await game.setActive(false);
    game.window.dispatchEvent(new Event('pageshow'));
    game.document.dispatchEvent(new Event('visibilitychange'));
    game.document.dispatchEvent(new Event('pointerdown'));
    await settle();
    assert.equal(game.requests.length, 3);
});

test('pausing during a pending request releases the late lock', async () => {
    let resolve;
    const lock = { released: false, async release() { this.released = true; } };
    const game = setup(() => new Promise(done => { resolve = done; }));
    const starting = game.setActive(true);
    await settle();
    const pausing = game.setActive(false);
    resolve(lock);
    await Promise.all([starting, pausing]);
    assert.equal(lock.released, true);
    assert.equal(game.requests.length, 1);
});

test('rapid pause and resume does not lose the latest desired state', async () => {
    const game = setup();
    await game.setActive(true);
    await Promise.all([game.setActive(false), game.setActive(true)]);
    assert.equal(game.locks.at(-1).released, false);
    await Promise.all([game.setActive(true), game.setActive(false)]);
    assert.equal(game.locks.at(-1).released, true);
});

test('unsupported and rejected wake locks do not interrupt play; interactions can retry', async () => {
    const game = setup(() => { throw new Error('Power saving mode'); });
    await game.setActive(true);
    game.document.dispatchEvent(new Event('pointerdown'));
    await settle();
    assert.equal(game.requests.length, 2);
    await game.setActive(false);
    game.context.navigator = {};
    await game.setActive(true);
    await game.setActive(false);
});

test('a system-released lock can be reacquired without duplicating an active lock', async () => {
    const game = setup();
    await game.setActive(true);
    await game.locks[0].release();
    game.document.dispatchEvent(new Event('pointerdown'));
    await settle();
    assert.equal(game.requests.length, 2);
    game.document.dispatchEvent(new Event('pointerdown'));
    await settle();
    assert.equal(game.requests.length, 2);
});

test('the actual exploration toggle controls the display lock and respects inventory limits', async () => {
    const game = setup();
    const element = {
        textContent: '', innerHTML: '', addEventListener() {},
        setAttribute() {}, removeAttribute() {},
        classList: { add() {}, remove() {} },
    };
    game.document.querySelector = () => element;
    Object.assign(game.context, {
        player: { stats: { hp: 100, hpMax: 100 } },
        sfxPause: { play() {} }, sfxUnpause: { play() {} }, sfxDeny: { play() {} },
        checkInventoryLimit: () => true, t: key => key,
    });
    vm.runInContext(fs.readFileSync(path.join(root, 'assets/js/dungeon.js'), 'utf8'), game.context);
    vm.runInContext('dungeonStartPause()', game.context);
    await settle();
    assert.equal(game.requests.length, 1);
    vm.runInContext('dungeonStartPause()', game.context);
    await settle();
    assert.equal(game.locks[0].released, true);
    game.context.checkInventoryLimit = () => false;
    vm.runInContext('dungeonStartPause()', game.context);
    await settle();
    assert.equal(game.requests.length, 1);
});

test('returning to the title screen releases the gameplay lock', async () => {
    const game = setup();
    const main = fs.readFileSync(path.join(root, 'assets/js/main.js'), 'utf8');
    game.document.querySelector = () => ({ style: {} });
    game.context.setTimeout = callback => callback();
    vm.runInContext(main.slice(main.indexOf('const runLoad ='),
        main.indexOf('// Display character creation screen')), game.context);
    await game.setActive(true);
    vm.runInContext('runLoad("title-screen", "flex")', game.context);
    await settle();
    assert.equal(game.locks[0].released, true);
});

for (const platform of ['android', 'ios']) {
    test(`${platform}: the production controller calls the real bundled native plugin`, () => {
        const output = execFileSync(process.execPath, ['--no-warnings', '-e', `
            const fs = require('node:fs');
            const path = require('node:path');
            const vm = require('node:vm');
            const calls = [];
            if (process.argv[1] === 'android') globalThis.androidBridge = {};
            else globalThis.webkit = { messageHandlers: { bridge: {} } };
            globalThis.Capacitor = {
                PluginHeaders: [{ name: 'KeepAwake', methods: [
                    { name: 'keepAwake', rtype: 'promise' }, { name: 'allowSleep', rtype: 'promise' },
                ] }],
                nativePromise: async (plugin, method) => { calls.push({ plugin, method }); },
            };
            const context = vm.createContext({
                document: { hidden: false, addEventListener() {} },
                window: { addEventListener() {}, Capacitor: {
                    isNativePlatform: () => true, getPlatform: () => process.argv[1],
                } },
            });
            const filename = path.resolve('assets/js/screen-wake-lock.js');
            new vm.Script(fs.readFileSync(filename, 'utf8'), {
                filename, importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
            }).runInContext(context);
            const timeout = setTimeout(() => { throw new Error('Native lock timed out'); }, 1500);
            (async () => {
                await vm.runInContext('setScreenWakeLockActive(true)', context);
                await vm.runInContext('setScreenWakeLockActive(false)', context);
                clearTimeout(timeout);
                console.log(JSON.stringify(calls));
            })();
        `, platform], { cwd: root, encoding: 'utf8', timeout: 10000 });
        assert.deepEqual(JSON.parse(output.trim()), [
            { plugin: 'KeepAwake', method: 'keepAwake' },
            { plugin: 'KeepAwake', method: 'allowSleep' },
        ]);
    });
}
