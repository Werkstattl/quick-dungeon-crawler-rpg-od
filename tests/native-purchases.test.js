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
const utilitySource = fs.readFileSync(
    path.resolve(__dirname, '../assets/js/utility.js'), 'utf8'
);

function createPurchaseContext(platform = 'ios-appstore') {
    const callbacks = {};
    const registered = [];
    const initialized = [];
    const owned = new Set();
    const activeMembershipStates = [];
    const lifetimeMembershipStates = [];
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
        FORGE_LIFETIME_MEMBERSHIP_PRODUCT_ID: 'the_forge_membership_lifetime',
        unlockForge: source => unlocked.push(['forge', source]),
        unlockAutoMode: (open, source) => unlocked.push(['auto', source, open]),
        unlockEnemyCustomization: persist => unlocked.push(['enemy', persist]),
        setForgeMembershipActive: active => activeMembershipStates.push(active),
        setForgeLifetimeMembershipActive: active => lifetimeMembershipStates.push(active),
        isForgeSubscriptionActive: () => activeMembershipStates.at(-1) === true,
        isForgeLifetimeMembershipActive: () => lifetimeMembershipStates.at(-1) === true,
        isForgeMembershipActive: () => activeMembershipStates.at(-1) === true || lifetimeMembershipStates.at(-1) === true,
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
        lifetimeMembershipStates,
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
    vm.runInContext(utilitySource.slice(
        utilitySource.indexOf('const FORGE_MEMBERSHIP_PRODUCT_ID'),
        utilitySource.indexOf('const safeSave =')
    ), context);
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
    test(`${platform}: a previously visible Auto button preserves access across restores and restarts`, async () => {
        for (const settings of [
            [['autoMode', 'false'], ['autoModeBtnVisible', 'true']],
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

    test(`${platform}: old settings without a visible Auto button do not grant legacy access`, async () => {
        for (const autoMode of ['false', 'true']) {
            for (const visible of [null, 'false']) {
                const storage = new Map([['autoMode', autoMode]]);
                if (visible !== null) storage.set('autoModeBtnVisible', visible);
                for (let start = 0; start < 2; start++) {
                    const state = createAutoModePurchaseContext(platform, storage);
                    assert.equal(vm.runInContext('autoModeUnlocked', state.context), false);
                    assert.equal(storage.has('autoModeLegacyUnlocked'), false);
                    await vm.runInContext('initializePurchases()', state.context);
                    state.callbacks.receiptsReady();
                    await vm.runInContext('restoreNativePurchases()', state.context);
                    assert.equal(vm.runInContext('autoModeUnlocked', state.context), false);
                }
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

    assert.equal(state.registered.length, 5);
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
    assert.equal(state.registered.length, 5);
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
                        FORGE_LIFETIME_MEMBERSHIP_PRODUCT_ID: 'membership_lifetime',
                        isForgeLifetimeMembershipActive: () => false,
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

for (const platform of ['ios-appstore', 'android-playstore']) {
    test(`${platform}: lifetime is a separate non-consumable and can be purchased while subscribed`, async () => {
        const state = createPurchaseContext(platform);
        await vm.runInContext('initializePurchases()', state.context);
        const lifetime = state.registered.find(product => product.id === 'the_forge_membership_lifetime');
        assert.equal(lifetime.type, 'non consumable');
        state.owned.add('the_forge_membership');
        state.callbacks.receiptsReady();
        let orders = 0;
        state.products.set(lifetime.id, { getOffer: () => ({ order: async () => { orders += 1; } }) });
        await vm.runInContext('buyForgeLifetimeMembership()', state.context);
        state.callbacks.approved(state.transaction([lifetime.id]));
        assert.equal(orders, 1);
        assert.equal(state.lifetimeMembershipStates.at(-1), true);
        assert.equal(state.finishCount, 1);
        await vm.runInContext('buyForgeLifetimeMembership()', state.context);
        assert.equal(orders, 1, 'a lifetime owner cannot buy it again');
    });

    test(`${platform}: restored lifetime retains all benefits through subscription expiry and restart`, async () => {
        const storage = new Map();
        const state = createAutoModePurchaseContext(platform, storage);
        const forgeStates = [];
        const enemyStates = [];
        state.context.setForgeEntitlement = (source, active) => forgeStates.push(active);
        state.context.setEnemyCustomizationMembershipActive = active => enemyStates.push(active);
        const playerSource = fs.readFileSync(path.resolve(__dirname, '../assets/js/player.js'), 'utf8');
        vm.runInContext(playerSource.slice(
            playerSource.indexOf('const BASE_MAX_INVENTORY_ITEMS'),
            playerSource.indexOf('function getFallbackCompanionBonuses')
        ), state.context);
        await vm.runInContext('initializePurchases()', state.context);
        state.callbacks.receiptsReady();
        state.owned.add('the_forge_membership_lifetime');
        state.owned.add('the_forge_membership');
        await vm.runInContext('restoreNativePurchases()', state.context);
        state.owned.delete('the_forge_membership');
        state.callbacks.receiptUpdated({});
        assert.equal(storage.get('forgeLifetimeMembershipActive'), 'true');
        assert.equal(storage.has('forgeMembershipActive'), false);
        assert.equal(vm.runInContext('isForgeMembershipActive()', state.context), true);
        assert.equal(vm.runInContext('autoModeUnlocked', state.context), true);
        assert.equal(vm.runInContext('getMaxInventoryItems()', state.context), 150);
        assert.equal(vm.runInContext('applyForgeMembershipGoldBonus(100)', state.context), 110);
        assert.equal(vm.runInContext('applyForgeMembershipRestingRecoveryBonus(10)', state.context), 20);
        assert.match(vm.runInContext('getPlayerDisplayName("Hero")', state.context), /Forge Member/);
        assert.equal(forgeStates.at(-1), true);
        assert.equal(enemyStates.at(-1), true);
        // Cached ownership provides offline access before store receipts arrive.
        const restarted = createAutoModePurchaseContext(platform, storage);
        await vm.runInContext('nativeInit()', restarted.context);
        assert.equal(vm.runInContext('isForgeMembershipActive()', restarted.context), true);
        assert.equal(vm.runInContext('autoModeUnlocked', restarted.context), true);
        assert.equal(storage.has('autoModePermanentUnlocked'), false);
        await vm.runInContext('initializePurchases()', restarted.context);
        restarted.owned.add('the_forge_membership_lifetime');
        restarted.callbacks.receiptsReady();
        assert.equal(vm.runInContext('isForgeMembershipActive()', restarted.context), true);
    });

    test(`${platform}: a revoked lifetime receipt removes benefits unless the subscription remains active`, async () => {
        const state = createAutoModePurchaseContext(platform);
        await vm.runInContext('initializePurchases()', state.context);
        state.owned.add('the_forge_membership_lifetime');
        state.callbacks.receiptsReady();
        assert.equal(vm.runInContext('autoModeUnlocked', state.context), true);
        state.owned.clear();
        state.callbacks.receiptUpdated({});
        assert.equal(vm.runInContext('isForgeLifetimeMembershipActive()', state.context), false);
        assert.equal(vm.runInContext('autoModeUnlocked', state.context), false);
        state.owned.add('the_forge_membership');
        state.callbacks.receiptUpdated({});
        assert.equal(vm.runInContext('isForgeMembershipActive()', state.context), true);
        assert.equal(vm.runInContext('autoModeUnlocked', state.context), true);
    });
}

test('a configured validator must verify lifetime before benefits are granted', async () => {
    const state = createPurchaseContext();
    state.context.window.IAP_VALIDATOR_URL = 'https://validator.example.test';
    await vm.runInContext('initializePurchases()', state.context);
    state.callbacks.receiptsReady();
    const transaction = state.transaction(['the_forge_membership_lifetime']);
    let verifications = 0;
    transaction.verify = () => { verifications += 1; };
    state.callbacks.approved(transaction);
    assert.equal(verifications, 1);
    assert.equal(state.lifetimeMembershipStates.at(-1), false);
    state.callbacks.unverified({});
    assert.equal(state.lifetimeMembershipStates.at(-1), false);
    state.owned.add('the_forge_membership_lifetime');
    state.callbacks.verified({ finish() {} });
    assert.equal(state.lifetimeMembershipStates.at(-1), true);
});

test('membership UI shows store prices, permits subscription upgrades, and keeps subscription management separate', async () => {
    const state = createPurchaseContext();
    const lifetimePrice = { dataset: { iapProduct: 'the_forge_membership_lifetime' } };
    const monthlyPrice = { dataset: { iapProduct: 'the_forge_membership' } };
    const button = () => ({ setAttribute(key, value) { this[key] = value; } });
    const lifetime = button();
    const monthly = button();
    const manage = button();
    const note = {};
    state.context.testRoot = {
        querySelectorAll: selector => ({
            '[data-iap-product]': [lifetimePrice, monthlyPrice],
            '[data-iap-lifetime]': [lifetime],
            '[data-iap-subscribe]': [monthly],
            '[data-iap-manage-subscriptions]': [manage],
            '[data-iap-lifetime-subscription-note]': [note],
        })[selector] || [],
    };
    vm.runInContext('refreshPurchaseUI(testRoot)', state.context);
    assert.equal(lifetime.disabled, true);
    await vm.runInContext('initializePurchases()', state.context);
    state.products.set('the_forge_membership_lifetime', {
        pricing: { price: '$11.99' }, getOffer: () => ({ order: async () => undefined }),
    });
    state.products.set('the_forge_membership', { pricing: { price: '$1.29' } });
    state.callbacks.receiptsReady();
    vm.runInContext('refreshPurchaseUI(testRoot)', state.context);
    assert.equal(lifetimePrice.textContent, 'iap-price-one-time:$11.99');
    assert.equal(monthlyPrice.textContent, 'iap-price-per-month:$1.29');
    assert.equal(lifetime.disabled, false);
    assert.equal(monthly.disabled, false);
    assert.equal(manage.hidden, true);
    state.owned.add('the_forge_membership');
    state.callbacks.receiptUpdated({});
    vm.runInContext('refreshPurchaseUI(testRoot)', state.context);
    assert.equal(lifetime.disabled, false);
    assert.equal(monthly.disabled, true);
    assert.equal(note.hidden, false);
    state.owned.add('the_forge_membership_lifetime');
    state.callbacks.receiptUpdated({});
    vm.runInContext('refreshPurchaseUI(testRoot)', state.context);
    assert.equal(lifetime.disabled, true);
    assert.equal(monthly.textContent, 'forge-membership-lifetime-owned');
    assert.equal(manage.hidden, false, 'both owned: existing subscription can still be cancelled');
    state.owned.delete('the_forge_membership');
    state.callbacks.receiptUpdated({});
    vm.runInContext('refreshPurchaseUI(testRoot)', state.context);
    assert.equal(manage.hidden, true, 'lifetime alone is not a subscription');
    state.products.delete('the_forge_membership_lifetime');
    state.owned.clear();
    state.callbacks.receiptUpdated({});
    vm.runInContext('refreshPurchaseUI(testRoot)', state.context);
    assert.equal(lifetime.disabled, true, 'unconfigured products cannot be purchased');
    assert.equal(lifetimePrice.textContent, 'iap-status-unavailable');
});

test('web lifetime button opens the same stores as the other purchase buttons', () => {
    for (const userAgent of ['Mozilla/5.0 (Linux; Android 15)', 'Mozilla/5.0 (iPhone)', 'Mozilla/5.0 (Macintosh)']) {
        const state = createPurchaseContext('web');
        const opened = [];
        state.context.navigator = { userAgent };
        state.context.ratingSystem = { openGooglePlayForRating: () => opened.push('google-play') };
        state.context.FORGE_PURCHASE_URL = 'https://werkstattl.itch.io/quick-dungeon-crawler-on-demand/purchase';
        state.context.window.open = url => opened.push(url);
        const lifetime = { setAttribute() {} };
        const lifetimePrice = { dataset: { iapProduct: 'the_forge_membership_lifetime' } };
        state.context.testRoot = {
            querySelectorAll: selector => ({
                '[data-iap-lifetime]': [lifetime],
                '[data-iap-product]': [lifetimePrice],
            })[selector] || [],
        };

        vm.runInContext('preparePurchaseUI(testRoot)', state.context);
        assert.equal(lifetime.disabled, false);
        assert.equal(lifetimePrice.textContent, 'forge-membership-lifetime-price');
        lifetime.onclick();
        assert.deepEqual(opened, [/Android/i.test(userAgent)
            ? 'google-play' : state.context.FORGE_PURCHASE_URL]);

        state.lifetimeMembershipStates.push(true);
        vm.runInContext('refreshPurchaseUI(testRoot)', state.context);
        assert.equal(lifetime.disabled, true);
        lifetime.onclick();
        assert.equal(opened.length, 1, 'existing lifetime owners cannot buy again');
    }
});

test('all purchase screens offer lifetime before monthly with translated membership terms', () => {
    for (const file of ['main.js', 'forge.js', 'automode.js']) {
        const dialog = fs.readFileSync(path.resolve(__dirname, '../assets/js', file), 'utf8');
        assert.ok(dialog.indexOf('${getForgeLifetimeMembershipMarkup()}') < dialog.indexOf('data-i18n="forge-membership-monthly"'), file);
        assert.ok(dialog.includes('${getForgeLifetimeMembershipMarkup()}'), file);
    }
    for (const file of fs.readdirSync(path.resolve(__dirname, '../assets/locales'))) {
        if (!file.endsWith('.json')) continue;
        const locale = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../assets/locales', file), 'utf8'));
        for (const key of [
            'forge-membership-lifetime', 'forge-membership-lifetime-price', 'forge-membership-monthly', 'forge-membership-lifetime-terms',
            'forge-membership-buy-lifetime', 'forge-membership-lifetime-owned', 'forge-membership-lifetime-subscription-note',
        ]) assert.ok(typeof locale[key] === 'string' && locale[key].trim(), `${file}: ${key}`);
    }
});
