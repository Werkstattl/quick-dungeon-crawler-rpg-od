const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
    path.resolve(__dirname, '../assets/js/native.js'),
    'utf8'
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
        window: {},
        document: { querySelectorAll: () => [] },
        setTimeout: callback => callback(),
        CdvPurchase: {
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

test('iOS registers every product with App Store and requests the app receipt', async () => {
    const state = createPurchaseContext();

    await vm.runInContext('initializePurchases()', state.context);

    assert.equal(state.registered.length, 4);
    assert.ok(state.registered.every(product => product.platform === 'ios-appstore'));
    assert.deepEqual(
        JSON.parse(JSON.stringify(state.initialized)),
        [{ platform: 'ios-appstore', options: { needAppReceipt: true } }]
    );
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
