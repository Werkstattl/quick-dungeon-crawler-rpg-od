const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const dungeonSource = fs.readFileSync(path.join(root, 'assets/js/dungeon.js'), 'utf8');
const forgeSource = fs.readFileSync(path.join(root, 'assets/js/forge.js'), 'utf8');
const playerSource = fs.readFileSync(path.join(root, 'assets/js/player.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(root, 'assets/js/main.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const evaluate = (context, expression) => vm.runInContext(expression, context);

const createDungeonContext = () => {
    const buttons = {
        '#choice1': {},
        '#choice2': {},
    };
    const dungeonLog = {
        innerHTML: '',
        children: [],
        appendChild() {},
        insertBefore() {},
        querySelectorAll() { return []; },
    };
    const context = vm.createContext({
        console,
        Date,
        localStorage: { getItem() { return null; } },
        document: {
            querySelector(selector) {
                if (selector === '#dungeonLog') return dungeonLog;
                return buttons[selector] || { addEventListener() {} };
            },
            createElement() { return { innerHTML: '' }; },
        },
        t(key, params = {}) {
            return `${key}:${JSON.stringify(params)}`;
        },
        nFormatter(value) {
            return String(value);
        },
        addDungeonLog() {},
        autoConfirm() {},
        autoDecline() {},
        sfxSell: { play() {} },
        sfxDeny: { play() {} },
        playerLoadStats() {},
        saveData() {},
        forgeUnlocked: false,
        MAX_EQUIPMENT_LEVEL: 100,
        clampEquipmentLevel(value) {
            return Math.min(100, Math.max(1, Math.round(Number(value) || 1)));
        },
        randomizeNum(minimum, maximum) {
            return Math.floor(Math.random() * (maximum - minimum + 1)) + minimum;
        },
        createEquipmentPrint() {},
    });
    vm.runInContext(dungeonSource, context);
    context.addDungeonLog = () => {};
    context.autoDecline = () => {};
    context.ignoreEvent = () => {};
    context.buttons = buttons;
    return context;
};

const setDungeonState = (context, { floor = 13, gold = 10000, tokens = 0, visited = false } = {}) => {
    context.player = {
        gold,
        inventory: { consumables: [], equipment: [], refineStones: 0, forgeTokens: tokens },
    };
    evaluate(context, `
        dungeon.progress.floor = ${floor};
        dungeon.status.event = false;
        dungeon.specialEvents.floor13ForgeTokenMerchantVisited = ${visited};
    `);
};

test('the Wandering Merchant scales its item level around the rounded average equipped level', () => {
    const context = createDungeonContext();
    setDungeonState(context, { floor: 6 });
    context.player.lvl = 100;
    context.player.selectedCurseLevel = 11;
    context.player.equipped = [91, 94, 96, 97, 99, 100].map((lvl) => ({ lvl }));

    assert.deepEqual(
        JSON.parse(evaluate(context, 'JSON.stringify(getWanderingShopLevelRange())')),
        { minimum: 91, maximum: 100 }
    );
    assert.equal(evaluate(context, 'getWanderingShopCost()'), 660000);
});

test('the Wandering Merchant keeps its Floor 6 item levels for early progression', () => {
    const context = createDungeonContext();
    setDungeonState(context, { floor: 6 });
    context.player.lvl = 20;
    context.player.selectedCurseLevel = 1;
    context.player.equipped = [{ lvl: 12 }, { lvl: 25 }];

    assert.deepEqual(
        JSON.parse(evaluate(context, 'JSON.stringify(getWanderingShopLevelRange())')),
        { minimum: 26, maximum: 30 }
    );
    assert.equal(evaluate(context, 'getWanderingShopCost()'), 6000);
});

test('the Wandering Merchant keeps Floor 6 levels until all six equipment slots are filled', () => {
    const context = createDungeonContext();
    setDungeonState(context, { floor: 6 });
    context.player.equipped = [96, 97, 98, 99, 100].map((lvl) => ({ lvl }));

    assert.deepEqual(
        JSON.parse(evaluate(context, 'JSON.stringify(getWanderingShopLevelRange())')),
        { minimum: 26, maximum: 30 }
    );
});

test('the Wandering Merchant caps progression-scaled item levels at 100', () => {
    const context = createDungeonContext();
    setDungeonState(context, { floor: 6 });
    context.player.equipped = Array.from({ length: 6 }, () => ({ lvl: 100 }));

    assert.deepEqual(
        JSON.parse(evaluate(context, 'JSON.stringify(getWanderingShopLevelRange())')),
        { minimum: 95, maximum: 100 }
    );
});

test('the Wandering Merchant purchase generates an item inside the scaled range', () => {
    const context = createDungeonContext();
    setDungeonState(context, { floor: 6, gold: 1000000 });
    context.player.lvl = 100;
    context.player.selectedCurseLevel = 11;
    context.player.equipped = [91, 94, 96, 97, 99, 100].map((lvl) => ({ lvl }));
    context.merchantItemOptions = null;
    context.randomizeNum = (minimum, maximum) => maximum;
    context.createEquipmentPrint = (condition, options) => {
        context.merchantItemOptions = { condition, ...options };
    };

    evaluate(context, 'wanderingShopEvent()');
    context.buttons['#choice1'].onclick();

    assert.deepEqual(context.merchantItemOptions, {
        condition: 'dungeon',
        allowCompanionCharm: false,
        minRarity: 'Rare',
        forcedLevel: 100,
        messageKey: 'wandering-shop-item-received',
    });
    assert.equal(context.player.gold, 340000);
});

test('Auto Mode buys from both wandering merchants', () => {
    const wanderingShopBody = dungeonSource.slice(
        dungeonSource.indexOf('const wanderingShopEvent ='),
        dungeonSource.indexOf('const forgeTokenMerchantEvent =')
    );
    const forgeTokenMerchantBody = dungeonSource.slice(
        dungeonSource.indexOf('const forgeTokenMerchantEvent ='),
        dungeonSource.indexOf('const nothingEvent =')
    );

    for (const body of [wanderingShopBody, forgeTokenMerchantBody]) {
        assert.match(body, /autoConfirm\(\)/);
        assert.doesNotMatch(body, /autoDecline\(\)/);
    }
});

test('the Forge Token merchant is forced once on Floor 13 each run', () => {
    const context = createDungeonContext();
    setDungeonState(context);

    assert.equal(evaluate(context, 'shouldTriggerForgeTokenMerchant()'), true);
    evaluate(context, 'forgeTokenMerchantEvent()');
    assert.equal(evaluate(context, 'dungeon.specialEvents.floor13ForgeTokenMerchantVisited'), true);
    assert.equal(evaluate(context, 'shouldTriggerForgeTokenMerchant()'), false);

    evaluate(context, 'resetSpecialEvents()');
    assert.equal(evaluate(context, 'shouldTriggerForgeTokenMerchant()'), true);
    setDungeonState(context, { floor: 12 });
    assert.equal(evaluate(context, 'shouldTriggerForgeTokenMerchant()'), false);
});

test('the Forge Token merchant is hidden from players with an unlocked Forge', () => {
    const context = createDungeonContext();
    setDungeonState(context);
    context.forgeUnlocked = true;

    assert.equal(evaluate(context, 'shouldTriggerForgeTokenMerchant()'), false);
});

test('the Floor 13 Forge Token offer uses the Wandering Merchant styling', () => {
    const context = createDungeonContext();
    setDungeonState(context);

    evaluate(context, 'forgeTokenMerchantEvent()');
    const message = evaluate(context, 'dungeon.backlog[dungeon.backlog.length - 1]');

    assert.match(message, /^<span class='Legendary'>/);
    assert.match(message, /<i class='fas fa-coins' style='color: #FFD700;'><\/i>/);
    assert.match(message, /<span class='Common'>10000<\/span>/);
});

test('buying the Floor 13 offer exchanges exactly 10000 gold for one persistent Forge Token', () => {
    const context = createDungeonContext();
    setDungeonState(context, { gold: 25000, tokens: 2 });

    evaluate(context, 'forgeTokenMerchantEvent()');
    const buy = context.buttons['#choice1'].onclick;
    buy();

    assert.equal(context.player.gold, 15000);
    assert.equal(context.player.inventory.forgeTokens, 3);
    assert.equal(evaluate(context, 'dungeon.status.event'), false);

    buy();
    assert.equal(context.player.gold, 15000);
    assert.equal(context.player.inventory.forgeTokens, 3);
});

test('the Floor 13 merchant never grants a token without enough gold', () => {
    const context = createDungeonContext();
    setDungeonState(context, { gold: 9999, tokens: 1 });

    evaluate(context, 'forgeTokenMerchantEvent()');
    context.buttons['#choice1'].onclick();

    assert.equal(context.player.gold, 9999);
    assert.equal(context.player.inventory.forgeTokens, 1);
});

const createForgeContext = ({ unlocked = false, gold = 5000, tokens = 0 } = {}) => {
    const context = vm.createContext({ console });
    vm.runInContext(forgeSource, context);
    context.player = {
        gold,
        inventory: { consumables: [], equipment: [], refineStones: 0, forgeTokens: tokens },
        equipped: [],
    };
    evaluate(context, `forgeUnlocked = ${unlocked};`);
    return context;
};

test('old saves normalize Forge Tokens to a non-negative integer', () => {
    const context = createForgeContext({ tokens: 0 });
    context.player.inventory.forgeTokens = '2.9';
    assert.equal(evaluate(context, 'ensureForgeTokenInventory()'), 2);
    context.player.inventory.forgeTokens = -5;
    assert.equal(evaluate(context, 'ensureForgeTokenInventory()'), 0);
});

test('a free player spends one token for access and still pays the normal gold cost', () => {
    const context = createForgeContext({ unlocked: false, gold: 5000, tokens: 2 });
    assert.equal(evaluate(context, 'hasForgeActionAccess()'), true);
    assert.equal(evaluate(context, 'getForgeActionGoldCost(1200)'), 1200);
    assert.equal(evaluate(context, 'canPayForgeAction(1200)'), true);
    assert.equal(evaluate(context, 'payForForgeAction(1200)'), true);
    assert.equal(context.player.gold, 3800);
    assert.equal(context.player.inventory.forgeTokens, 1);
});

test('a Forge Token does not bypass insufficient gold', () => {
    const context = createForgeContext({ unlocked: false, gold: 1199, tokens: 2 });

    assert.equal(evaluate(context, 'canPayForgeAction(1200)'), false);
    assert.equal(evaluate(context, 'payForForgeAction(1200)'), false);
    assert.equal(context.player.gold, 1199);
    assert.equal(context.player.inventory.forgeTokens, 2);
});

test('Merge, Reroll, and Refine all use the shared token-aware payment path', () => {
    const rerollBody = forgeSource.slice(
        forgeSource.indexOf('const executeReroll ='),
        forgeSource.indexOf('const applyRefinedEquipment =')
    );
    const refineBody = forgeSource.slice(
        forgeSource.indexOf('const executeRefine ='),
        forgeSource.indexOf('// Execute forging')
    );
    const mergeBody = forgeSource.slice(forgeSource.indexOf('const executeForging ='));

    for (const body of [rerollBody, refineBody, mergeBody]) {
        assert.match(body, /canPayForgeAction\(/);
        assert.match(body, /payForForgeAction\(/);
    }
    assert.match(refineBody, /player\.inventory\.refineStones -= refineStoneCost/);
});

test('a Forge owner pays gold without spending tokens', () => {
    const context = createForgeContext({ unlocked: true, gold: 5000, tokens: 2 });

    assert.equal(evaluate(context, 'getForgeActionGoldCost(1200)'), 1200);
    assert.equal(evaluate(context, 'payForForgeAction(1200)'), true);
    assert.equal(context.player.gold, 3800);
    assert.equal(context.player.inventory.forgeTokens, 2);
});

test('the Forge hides the token count from players with unlocked access', () => {
    const context = createForgeContext({ unlocked: true, gold: 5000, tokens: 2 });
    context.forgeGold = { innerHTML: '' };
    context.nFormatter = (value) => String(value);
    context.t = (key) => key;
    context.getRefineStoneCount = () => 3;
    evaluate(context, 'forgeGoldElement = forgeGold; updateForgeGold();');

    assert.match(context.forgeGold.innerHTML, />5000/);
    assert.match(context.forgeGold.innerHTML, />3<\/span>/);
    assert.doesNotMatch(context.forgeGold.innerHTML, /forge-tokens/);
    assert.doesNotMatch(context.forgeGold.innerHTML, /ra-anvil/);
});

test('Forge Token count and save defaults are wired without a payment checkbox', () => {
    assert.doesNotMatch(indexSource, /id="forge-use-token"/);
    assert.doesNotMatch(forgeSource, /useForgeToken/);
    assert.match(mainSource, /forgeTokens:\s*0/);
    assert.match(playerSource, /player\.inventory\.forgeTokens/);
});

test('every locale includes the Forge Token event and Forge UI text', () => {
    const requiredKeys = [
        'forge-token',
        'forge-tokens',
        'forge-token-merchant-offer',
        'forge-token-merchant-purchase',
    ];
    const localesDirectory = path.join(root, 'assets/locales');
    const localeFiles = fs.readdirSync(localesDirectory).filter((file) => file.endsWith('.json'));

    for (const file of localeFiles) {
        const locale = JSON.parse(fs.readFileSync(path.join(localesDirectory, file), 'utf8'));
        for (const key of requiredKeys) {
            assert.ok(locale[key], `${file} is missing ${key}`);
        }
        assert.equal(locale['use-forge-token'], undefined, `${file} still contains use-forge-token`);
    }
});
