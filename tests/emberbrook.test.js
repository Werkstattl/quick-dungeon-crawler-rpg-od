const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../assets/js/dungeon.js'), 'utf8');
const utility = fs.readFileSync(path.join(__dirname, '../assets/js/utility.js'), 'utf8');
const formatter = utility.match(/const nFormatter = \(num\) => \{[\s\S]+?\n\}/)[0];

function game({ floor = 5, room = 1, specialEvents = {}, auto = false } = {}) {
    const sound = { play() {} };
    const buttons = Object.fromEntries(['rest', 'buy', 'leave'].map(action => [action, {}]));
    const log = { entries: [], querySelectorAll: () => [], appendChild(node) { this.entries.push(node); } };
    Object.defineProperty(log, 'innerHTML', { set() { this.entries = []; } });
    const offer = { category: 'Sword', lvl: 25, tier: 1, rarity: 'Rare', stats: [{ atk: 123 }], icon: '<i></i>' };
    const calls = { rolls: 0, items: [] };
    const context = vm.createContext({
        document: {
            querySelector: selector => selector === '#dungeonLog' ? log : buttons[selector.slice('#emberbrook-'.length)] || { addEventListener() {} },
            createElement: () => ({}),
        },
        localStorage: { getItem: () => null },
        player: { selectedCurseLevel: 1, lvl: 15, gold: 30000, stats: { hp: 200, hpMax: 1000 } },
        t: (key, vars = {}) => `${key} ${Object.values(vars).join(' ')}`,
        autoMode: auto, autoEngage: auto,
        forgeUnlocked: false,
        autoConfirm() {},
        playerLoadStats() {},
        receiveEquipment: item => {
            calls.items.push(item);
            if (calls.maxHpAfterEquip) context.player.stats.hpMax = calls.maxHpAfterEquip;
        },
        saveData() {},
        equipmentIcon: () => '<i></i>',
        equipmentDisplayLabel: item => item.category,
        EQUIPMENT_STAT_DISPLAY_ORDER: ['atk'],
        getEquipmentStatTotals: item => item.stats[0],
        renderEquipmentCard: ({ totals }) => `<strong>ATK ${totals.atk}</strong>`,
        createEquipment: (add, options) => {
            assert.equal(add, false);
            assert.equal(options.minRarity, 'Rare');
            assert.equal(options.allowCompanionCharm, false);
            calls.rolls++;
            return offer;
        },
        hasEmptyEquipmentSlotFor: () => false,
        inventoryItemCount: () => calls.full ? 100 : 0,
        getMaxInventoryItems: () => 100,
        sfxSell: sound, sfxConfirm: sound, sfxDeny: sound,
    });
    const run = code => vm.runInContext(code, context);
    run(formatter);
    run(source);
    Object.assign(run('dungeon.progress'), { floor, room });
    Object.assign(run('dungeon.status'), { exploring: true, paused: false });
    run('dungeon.specialEvents = ' + JSON.stringify(specialEvents));
    return { run, buttons, player: context.player, offer, calls, markup: () => log.entries.map(node => node.innerHTML).join('\n') };
}

test('Emberbrook opens before route selection on Floor 5 Room 1 and can be skipped', () => {
    const g = game();
    g.run('dungeonEvent()');
    assert.equal(g.run('currentEvent'), 'emberbrook');
    assert.equal(g.run('dungeon.action'), 0);
    assert.match(g.markup(), /emberbrook-rest/);
    assert.match(g.markup(), /emberbrook-buy/);
    assert.doesNotMatch(g.markup(), /healer|medicine/);
    g.buttons.leave.onclick();
    assert.equal(g.run('dungeon.status.event'), false);
    assert.equal(g.run('shouldTriggerEmberbrook()'), false);
    g.run('resetSpecialEvents()');
    assert.equal(g.run('shouldTriggerEmberbrook()'), true);
    assert.equal(game({ floor: 6 }).run('shouldTriggerEmberbrook()'), false);
    assert.equal(game({ room: 2 }).run('shouldTriggerEmberbrook()'), false);
});

test('the free inn fully heals once and does not spend a full-health visit', () => {
    const g = game();
    g.player.stats.hp = 1000;
    g.run('dungeonEvent()');
    g.buttons.rest.onclick();
    g.player.stats.hp = 100;
    g.buttons.rest.onclick();
    assert.equal(g.player.stats.hp, 1000);
    assert.equal(g.player.gold, 30000);
    g.player.stats.hp = 100;
    g.buttons.rest.onclick();
    assert.equal(g.player.stats.hp, 100);
    assert.equal(g.run('currentEvent'), 'emberbrook');
});

test('the advertised item and price survive reopening; a successful purchase delivers that item once', () => {
    const g = game();
    g.run('dungeonEvent()');
    assert.match(g.markup(), /ATK 123/);
    const saved = JSON.parse(g.run('JSON.stringify(dungeon.specialEvents)'));
    const reload = game({ specialEvents: saved });
    reload.player.lvl = 17;
    reload.run('dungeonEvent()');
    assert.match(reload.markup(), /ATK 123/);
    assert.match(reload.markup(), /emberbrook-buy 14\.63k/);
    assert.equal(reload.calls.rolls, 0);
    reload.buttons.buy.onclick();
    reload.buttons.buy.onclick();
    assert.deepEqual(JSON.parse(JSON.stringify(reload.calls.items)), [g.offer]);
    assert.equal(reload.player.gold, 15375);
    assert.equal(reload.run('currentEvent'), 'emberbrook');
    const bought = game({ specialEvents: JSON.parse(reload.run('JSON.stringify(dungeon.specialEvents)')) });
    bought.run('dungeonEvent()');
    assert.equal(bought.calls.rolls, 0);
    assert.match(bought.markup(), /emberbrook-market-empty/);
    reload.run('dungeon.progress.floor = 8');
    assert.equal(reload.run('shouldTriggerWanderingShop()'), true);
});

test('an unaffordable offer or a full inventory does not consume the stock or the player’s gold', () => {
    const g = game();
    g.run('dungeonEvent()');
    g.player.gold = 10;
    g.buttons.buy.onclick();
    assert.equal(g.player.gold, 10);
    g.player.gold = 30000;
    g.calls.full = true;
    g.buttons.buy.onclick();
    assert.equal(g.player.gold, 30000);
    assert.equal(g.calls.items.length, 0);
    assert.match(g.markup(), /ATK 123/);
});

test('Auto Engage rests and leaves without buying', () => {
    const g = game({ auto: true });
    g.run('dungeonEvent()');
    assert.equal(g.player.stats.hp, 1000);
    assert.equal(g.player.gold, 30000);
    assert.equal(g.calls.items.length, 0);
    assert.equal(g.run('dungeon.status.event'), false);
    assert.equal(g.run('shouldTriggerEmberbrook()'), false);
});

test('a legacy Floor 6 merchant visit does not affect the village stand', () => {
    const g = game({ specialEvents: { floor6WanderingShopVisited: true } });
    g.run('dungeonEvent()');
    assert.match(g.markup(), /emberbrook-rest/);
    assert.equal(g.calls.rolls, 1);
    g.buttons.buy.onclick();
    assert.equal(g.calls.items.length, 1);
});

test('the traveling merchant is on Floor 8 only, once per run, without a second visit for legacy saves', () => {
    for (const floor of [5, 6, 7, 9]) {
        assert.equal(game({ floor }).run('shouldTriggerWanderingShop()'), false);
    }
    const g = game({ floor: 8 });
    assert.equal(g.run('shouldTriggerWanderingShop()'), true);
    g.run('dungeon.routeChoice = { floor: 8, selected: "balanced" }; dungeonEvent()');
    assert.equal(g.run('currentEvent'), 'wanderingShop');
    assert.match(g.markup(), /wandering-shop-offer/);
    assert.equal(g.run('shouldTriggerWanderingShop()'), false);
    g.run('resetSpecialEvents()');
    assert.equal(g.run('shouldTriggerWanderingShop()'), true);
    assert.equal(game({ floor: 8, specialEvents: { floor6WanderingShopVisited: true } }).run('shouldTriggerWanderingShop()'), false);
});

test('an existing Floor 5 route selection is not interrupted by the new stop', () => {
    const g = game();
    g.run('dungeon.routeChoice = { floor: 5, selected: "balanced" }');
    assert.equal(g.run('shouldTriggerEmberbrook()'), false);
});

test('the inn reflects new maximum HP immediately after an item purchase', () => {
    const g = game();
    g.player.stats.hp = 1000;
    g.calls.maxHpAfterEquip = 1300;
    g.run('dungeonEvent()');
    assert.match(g.markup(), /emberbrook-full-health/);
    g.buttons.buy.onclick();
    assert.match(g.markup(), /emberbrook-rest 100/);
    g.buttons.rest.onclick();
    assert.equal(g.player.stats.hp, 1300);
});
