const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');

for (const platform of ['android', 'ios']) {
    test(`${platform}: real bundled review plugin loads without Promise assimilation of its proxy`, () => {
        // Each process gets a fresh Capacitor runtime and module cache. Exercise
        // the production loader and generated bundle, rather than a plain mock
        // that would hide the plugin proxy's callable `then` property.
        const output = execFileSync(process.execPath, ['--no-warnings', '-e', `
            const fs = require('node:fs');
            const path = require('node:path');
            const vm = require('node:vm');
            const calls = [];
            const errors = [];
            if (process.argv[1] === 'android') {
                globalThis.androidBridge = {};
            } else {
                globalThis.webkit = { messageHandlers: { bridge: {} } };
            }
            globalThis.Capacitor = {
                PluginHeaders: [{ name: 'InAppReview', methods: [{ name: 'requestReview', rtype: 'promise' }] }],
                nativePromise: async (plugin, method) => { calls.push({ plugin, method }); },
            };
            process.on('unhandledRejection', error => errors.push(error.message));
            const filename = path.resolve('assets/js/native.js');
            const context = vm.createContext({ console });
            new vm.Script(fs.readFileSync(filename, 'utf8'), {
                filename,
                importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
            }).runInContext(context);
            let timer;
            const timeout = new Promise(resolve => { timer = setTimeout(() => resolve({ status: 'timeout' }), 1000); });
            const check = async () => {
                const [first, second] = await Promise.all([
                    vm.runInContext('loadNativeReviewApi()', context),
                    vm.runInContext('loadNativeReviewApi()', context),
                ]);
                await first.requestReview();
                return {
                    status: 'ready',
                    sameApi: first === second,
                    thenType: typeof first.then,
                    platform: globalThis.Capacitor.getPlatform(),
                    registered: globalThis.Capacitor.isPluginAvailable('InAppReview'),
                };
            };
            Promise.race([check(), timeout]).then(result => {
                clearTimeout(timer);
                console.log(JSON.stringify({ ...result, calls, errors }));
            });
        `, platform], { cwd: root, encoding: 'utf8', timeout: 10000 });
        const result = JSON.parse(output.trim());
        assert.equal(result.status, 'ready', 'the real plugin must not leave the loader pending');
        assert.equal(result.sameApi, true, 'concurrent callers share the cached API');
        assert.equal(result.thenType, 'undefined', 'the API facade must not be thenable');
        assert.equal(result.platform, platform);
        assert.equal(result.registered, true);
        assert.deepEqual(result.calls, [{ plugin: 'InAppReview', method: 'requestReview' }]);
        assert.deepEqual(result.errors, []);
    });
}
