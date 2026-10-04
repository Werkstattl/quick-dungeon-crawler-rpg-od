const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const source = fs.readFileSync(
    path.resolve(__dirname, '../assets/js/native.js'),
    'utf8'
);
const autoModeSource = fs.readFileSync(
    path.resolve(__dirname, '../assets/js/automode.js'), 'utf8'
);
const mainSource = fs.readFileSync(
    path.resolve(__dirname, '../assets/js/main.js'), 'utf8'
);

function createPurchaseContext(platform = 'ios-appstore') {
    const callbacks = {};
    const registered = [];
    const initialized = [];
    const owned = new Set();
    const activeMembershipStates = [];
    const unlocked = [];
    let restoreCount = 0;
    let finishCount = 0;

    const when = {};
    for (const event of [
        'productUpdated', 'receiptUpdated', 'receiptsReady', 'approved',
        'verified', 'unverified',
    ]) {
        when[event] = callback => {
            callbacks[event] = callback;
            return when;
        };
    }

    const products = new Map();
    const store = {
        validator: null,
        defaultPlatform: () => platform,
        register: entries => registered.push(...entries),
        error: callback => { callbacks.error = callback; },
        when: () => when,
        initialize: async options => {
            initialized.push(...options);
            return [];
        },
        owned: ({ id }) => owned.has(id),
        get: id => products.get(id),
        restorePurchases: async () => {
            restoreCount += 1;
            return undefined;
        },
        manageSubscriptions: async () => undefined,
    };

    const context = vm.createContext({
        console,
        window: {
            Capacitor: {
                isNativePlatform: () => platform !== 'web',
                getPlatform: () => platform === 'ios-appstore' ? 'ios'
                    : platform === 'android-playstore' ? 'android' : 'web',
            },
        },
        document: { querySelectorAll: () => [] },
        setTimeout: callback => callback(),
        mockPurchaseApi: {
            store,
            Platform: {
                APPLE_APPSTORE: 'ios-appstore',
                GOOGLE_PLAY: 'android-playstore',
            },
            ProductType: {
                NON_CONSUMABLE: 'non consumable',
                PAID_SUBSCRIPTION: 'paid subscription',
            },
            ErrorCode: { PAYMENT_CANCELLED: 6777006 },
        },
        FORGE_PRODUCT_ID: 'forge_unlock_premium',
        AUTO_MODE_PRODUCT_ID: 'automode_unlock_premium',
        ENEMY_CUSTOMIZATION_PRODUCT_ID: 'unlock_enemy_customization',
        FORGE_MEMBERSHIP_PRODUCT_ID: 'the_forge_membership',
        unlockForge: source => unlocked.push(['forge', source]),
        unlockAutoMode: (open, source) => unlocked.push(['auto', source, open]),
        unlockEnemyCustomization: persist => unlocked.push(['enemy', persist]),
        setForgeMembershipActive: active => activeMembershipStates.push(active),
        isForgeMembershipActive: () => activeMembershipStates.at(-1) === true,
        t: (key, params) => params && params.price ? `${key}:${params.price}` : key,
    });
    vm.runInContext(source, context);
    vm.runInContext('purchaseApi = mockPurchaseApi', context);

    return {
        context,
        callbacks,
        registered,
        initialized,
        owned,
        products,
        activeMembershipStates,
        unlocked,
        get restoreCount() { return restoreCount; },
        get finishCount() { return finishCount; },
        transaction(products) {
            return {
                products: products.map(id => ({ id })),
                finish: () => { finishCount += 1; },
                verify() {},
            };
        },
    };
}

function createAutoModePurchaseContext(platform, storage = new Map()) {
    const state = createPurchaseContext(platform);
    const context = state.context;
    context.localStorage = {
        getItem: key => storage.has(key) ? storage.get(key) : null,
        setItem: (key, value) => storage.set(key, String(value)),
        removeItem: key => storage.delete(key),
    };
    context.document.querySelector = selector => selector === '#auto-mode-btn' ? {
        classList: { add() {}, remove() {}, toggle() {} },
        setAttribute() {},
        addEventListener() {},
    } : null;
    context.FORGE_MEMBERSHIP_STORAGE_KEY = 'forgeMembershipActive';
    context.isForgeMembershipActive = () => storage.get('forgeMembershipActive') === 'true';
    context.player = null;
    vm.runInContext(autoModeSource, context);
    // Exercise the application's membership propagation, including its writes
    // to Auto Mode settings, rather than replacing it with an entitlement stub.
    vm.runInContext(mainSource.slice(
        mainSource.indexOf('function setForgeMembershipActive('),
        mainSource.indexOf('function unlockForgeMembership(')
    ), context);
    return state;
}

for (const platform of ['ios-appstore', 'android-playstore']) {
    test(`${platform}: restore without purchases stays locked across repeated app starts`, async () => {
        const storage = new Map();
        for (let start = 0; start < 3; start++) {
            const state = createAutoModePurchaseContext(platform, storage);
            assert.equal(vm.runInContext('autoModeUnlocked', state.context), false);
            assert.equal(storage.get('autoModeEntitlementsMigrated'), 'true');
            assert.equal(storage.has('autoModeLegacyUnlocked'), false);
            await vm.runInContext('initializePurchases()', state.context);
            state.callbacks.receiptsReady();
            await vm.runInContext('restoreNativePurchases()', state.context);
            assert.equal(state.restoreCount, 1);
            assert.equal(vm.runInContext('autoModeUnlocked', state.context), false);
            assert.equal(storage.get('autoMode'), 'false');
        }
    });

    test(`${platform}: restored permanent Auto Mode purchase survives a restart`, async () => {
        const storage = new Map();
        const state = createAutoModePurchaseContext(platform, storage);
        await vm.runInContext('initializePurchases()', state.context);
        state.callbacks.receiptsReady();
        state.owned.add('automode_unlock_premium');
        await vm.runInContext('restoreNativePurchases()', state.context);
        assert.equal(vm.runInContext('autoModeUnlocked', state.context), true);

        const restarted = createAutoModePurchaseContext(platform, storage);
        assert.equal(vm.runInContext('autoModeUnlocked', restarted.context), true);
        assert.equal(storage.has('autoModeLegacyUnlocked'), false);
        await vm.runInContext('initializePurchases()', restarted.context);
        restarted.owned.add('automode_unlock_premium');
        restarted.callbacks.receiptsReady();
        assert.equal(vm.runInContext('autoModeUnlocked', restarted.context), true);
    });

    test(`${platform}: expired membership does not become a permanent Auto Mode unlock`, async () => {
        const storage = new Map();
        const state = createAutoModePurchaseContext(platform, storage);
        await vm.runInContext('initializePurchases()', state.context);
        state.owned.add('the_forge_membership');
        state.callbacks.receiptsReady();
        assert.equal(vm.runInContext('autoModeUnlocked', state.context), true);
        state.owned.clear();
        state.callbacks.receiptUpdated({});
        assert.equal(vm.runInContext('autoModeUnlocked', state.context), false);
        assert.equal(vm.runInContext('autoModeUnlocked',
            createAutoModePurchaseContext(platform, storage).context), false);
    });

    test(`${platform}: approved Auto Mode purchase remains unlocked after membership expires`, async () => {
        const storage = new Map();
        const state = createAutoModePurchaseContext(platform, storage);
        await vm.runInContext('initializePurchases()', state.context);
        state.callbacks.receiptsReady();
        state.callbacks.approved(state.transaction(['automode_unlock_premium']));
        state.owned.add('the_forge_membership');
        state.callbacks.receiptUpdated({});
        state.owned.clear();
        state.callbacks.receiptUpdated({});
        assert.equal(vm.runInContext('autoModeUnlocked', state.context), true);
        assert.equal(vm.runInContext('autoModeUnlocked',
            createAutoModePurchaseContext(platform, storage).context), true);
    });
}

test('Auto Mode settings written after migration never grant an entitlement', () => {
    for (const autoMode of ['false', 'true']) {
        for (const visible of ['false', 'true']) {
            const storage = new Map([
                ['autoModeEntitlementsMigrated', 'true'],
                ['autoMode', autoMode], ['autoModeBtnVisible', visible],
            ]);
            const state = createAutoModePurchaseContext('ios-appstore', storage);
            assert.equal(vm.runInContext('autoModeUnlocked', state.context), false);
            assert.equal(vm.runInContext('autoMode', state.context), false);
        }
    }
});

for (const platform of ['ios-appstore', 'android-playstore']) {
    test(`${platform}: legacy unlocks survive migration, empty restores and restarts`, async () => {
        // The old rule also treated a stored false setting as an unlock.
        for (const settings of [
            [['autoMode', 'false']],
            [['autoMode', 'true'], ['autoModeBtnVisible', 'true']],
            [['autoModeBtnVisible', 'true']],
        ]) {
            const storage = new Map(settings);
            for (let start = 0; start < 3; start++) {
                const state = createAutoModePurchaseContext(platform, storage);
                assert.equal(vm.runInContext('autoModeUnlocked', state.context), true);
                await vm.runInContext('initializePurchases()', state.context);
                state.callbacks.receiptsReady();
                await vm.runInContext('restoreNativePurchases()', state.context);
                assert.equal(vm.runInContext('autoModeUnlocked', state.context), true);
                if (start === 0) {
                    for (const [key, value] of settings) {
                        assert.equal(storage.get(key), value);
                    }
                }
                // Legacy access is separate from an actual store purchase.
                assert.equal(storage.has('autoModePermanentUnlocked'), false);
                storage.delete('autoMode');
                storage.delete('autoModeBtnVisible');
            }
        }
    });

    test(`${platform}: an existing membership stays temporary after migration`, async () => {
        const storage = new Map([
            ['forgeMembershipActive', 'true'],
            ['autoMode', 'true'], ['autoModeBtnVisible', 'true'],
        ]);
        const state = createAutoModePurchaseContext(platform, storage);
        await vm.runInContext('initializePurchases()', state.context);
        state.owned.add('the_forge_membership');
        state.callbacks.receiptsReady();
        assert.equal(vm.runInContext('autoModeUnlocked', state.context), true);
        state.owned.clear();
        state.callbacks.receiptUpdated({});
        assert.equal(vm.runInContext('autoModeUnlocked', state.context), false);
        assert.equal(vm.runInContext('autoModeUnlocked',
            createAutoModePurchaseContext(platform, storage).context), false);
    });
}

test('iOS registers every product with App Store using the StoreKit 2 adapter', async () => {
    const state = createPurchaseContext();

    await vm.runInContext('initializePurchases()', state.context);

    assert.equal(state.registered.length, 4);
    assert.ok(state.registered.every(product => product.platform === 'ios-appstore'));
    assert.deepEqual(
        JSON.parse(JSON.stringify(state.initialized)),
        ['ios-appstore']
    );
});

test('native startup works with Capacitor and no Cordova purchase global', async () => {
    const state = createPurchaseContext('android-playstore');
    assert.equal(state.context.CdvPurchase, undefined);
    assert.equal(state.context.window.cordova, undefined);

    await vm.runInContext('nativeInit()', state.context);
    assert.equal(state.registered.length, 4);
    assert.deepEqual(Array.from(state.initialized), ['android-playstore']);
});

test('the shipped bundle registers the Capacitor bridge and loads through nativeInit', () => {
    // Use an isolated process for Node's experimental VM module loader so this
    // test exercises the browser module without changing the other test globals.
    const result = spawnSync(process.execPath, ['--experimental-vm-modules', '-e', `
        const assert = require('node:assert/strict');
        const fs = require('node:fs');
        const vm = require('node:vm');
        const nativeSource = fs.readFileSync('assets/js/native.js', 'utf8');
        const bundle = fs.readFileSync('assets/js/purchase-plugin.js', 'utf8');
        (async () => {
            for (const platform of ['ios', 'android']) {
                for (const cordovaBridge of [false, true]) {
                    const context = vm.createContext({
                        console, setTimeout, clearTimeout, setInterval, clearInterval,
                        navigator: { userAgent: platform },
                        document: { querySelectorAll: () => [] },
                        Capacitor: {
                            getPlatform: () => platform,
                            isNativePlatform: () => true,
                            PluginHeaders: [{ name: 'PurchasePlugin', methods: [] }],
                        },
                        FORGE_PRODUCT_ID: 'forge', AUTO_MODE_PRODUCT_ID: 'auto',
                        ENEMY_CUSTOMIZATION_PRODUCT_ID: 'enemy',
                        FORGE_MEMBERSHIP_PRODUCT_ID: 'membership',
                    });
                    context.window = context;
                    if (cordovaBridge) context.cordova = { platformId: platform };
                    let module;
                    let initialized;
                    const script = new vm.Script(nativeSource, {
                        importModuleDynamically: async specifier => {
                            assert.equal(specifier, './purchase-plugin.js');
                            module = new vm.SourceTextModule(bundle, { context });
                            await module.link(() => { throw new Error('Unbundled import'); });
                            await module.evaluate();
                            module.namespace.CdvPurchase.Store.prototype.initialize = async options => {
                                initialized = Array.from(options);
                                return [];
                            };
                            return module;
                        },
                    });
                    script.runInContext(context);
                    await vm.runInContext('nativeInit()', context);
                    assert.ok(module.namespace.CdvPurchase.store);
                    assert.equal(context.CdvPurchaseCapacitor.installed, true);
                    assert.ok(context.Capacitor.Plugins.PurchasePlugin);
                    assert.deepEqual(initialized, [platform === 'ios'
                        ? 'ios-appstore' : 'android-playstore']);
                }
            }
        })().then(() => process.exit(0)).catch(error => {
            console.error(error);
            process.exit(1);
        });
    `], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 10000 });

    assert.equal(result.status, 0, result.stderr + result.stdout);
});

test('web and desktop builds skip the native purchase store', async () => {
    const web = createPurchaseContext('web');
    await vm.runInContext('nativeInit()', web.context);
    assert.equal(web.registered.length, 0);

    const desktop = createPurchaseContext();
    desktop.context.window.electronAPI = {};
    await vm.runInContext('nativeInit()', desktop.context);
    assert.equal(desktop.registered.length, 0);
    assert.ok(desktop.unlocked.some(entry => entry[0] === 'forge' && entry[1] === 'desktop'));
});

test('StoreKit 2 launch and restore approvals reapply unlocks without purchase UI', async () => {
    const state = createPurchaseContext();
    const statuses = [];
    state.context.showPurchaseStatus = key => statuses.push(key);
    await vm.runInContext('initializePurchases()', state.context);
    state.callbacks.receiptsReady();

    const transaction = state.transaction(['automode_unlock_premium']);
    state.callbacks.approved(transaction);
    state.callbacks.approved(transaction);

    assert.ok(state.unlocked.filter(entry => entry[0] === 'auto').every(entry => entry[2] === false));
    assert.equal(statuses.includes('iap-status-purchased'), false);
    assert.equal(state.finishCount, 2);
});

test('an explicit purchase opens its UI once even when approved is redelivered', async () => {
    const state = createPurchaseContext();
    const statuses = [];
    state.context.showPurchaseStatus = key => statuses.push(key);
    await vm.runInContext('initializePurchases()', state.context);
    state.callbacks.receiptsReady();
    state.products.set('automode_unlock_premium', {
        getOffer: () => ({ order: async () => undefined }),
    });

    await vm.runInContext('buyAutoModeUnlock()', state.context);
    const transaction = state.transaction(['automode_unlock_premium']);
    state.callbacks.approved(transaction);
    state.callbacks.approved(transaction);

    assert.equal(state.unlocked.filter(entry => entry[0] === 'auto' && entry[2] === true).length, 1);
    assert.equal(statuses.filter(key => key === 'iap-status-purchased').length, 1);
});

test('loaded receipts activate and revoke the subscription entitlement', async () => {
    const state = createPurchaseContext();
    await vm.runInContext('initializePurchases()', state.context);

    state.owned.add('the_forge_membership');
    state.callbacks.receiptsReady();
    assert.equal(state.activeMembershipStates.at(-1), true);

    state.owned.delete('the_forge_membership');
    state.callbacks.receiptUpdated({});
    assert.equal(state.activeMembershipStates.at(-1), false);
});

test('approved local purchases are granted and restore uses the store adapter', async () => {
    const state = createPurchaseContext('android-playstore');
    await vm.runInContext('initializePurchases()', state.context);
    state.callbacks.receiptsReady();

    state.callbacks.approved(state.transaction([
        'forge_unlock_premium',
        'the_forge_membership',
    ]));
    assert.ok(state.unlocked.some(entry => entry[0] === 'forge' && entry[1] === 'purchase'));
    assert.equal(state.activeMembershipStates.at(-1), true);
    assert.equal(state.finishCount, 1);

    await vm.runInContext('restoreNativePurchases()', state.context);
    assert.equal(state.restoreCount, 1);
});

test('Apple legal terms are shown only for App Store purchases', () => {
    for (const [platform, expectedHidden] of [
        ['ios-appstore', false],
        ['android-playstore', true],
        ['web', true],
    ]) {
        const state = createPurchaseContext(platform);
        const appleLegal = { hidden: true };
        state.context.testRoot = {
            querySelectorAll: selector => selector === '[data-iap-apple-only]'
                ? [appleLegal]
                : [],
        };

        vm.runInContext('refreshPurchaseUI(testRoot)', state.context);

        assert.equal(appleLegal.hidden, expectedHidden, platform);
    }
});

test('every purchase dialog marks the Apple EULA as iOS-only', () => {
    for (const file of ['automode.js', 'main.js', 'forge.js']) {
        const dialogSource = fs.readFileSync(
            path.resolve(__dirname, '../assets/js', file),
            'utf8'
        );
        assert.match(
            dialogSource,
            /<span data-iap-apple-only hidden>.*stdeula\/.*<\/span>/,
            file
        );
    }
});
