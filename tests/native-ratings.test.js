const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const utilitySource = fs.readFileSync(path.join(root, 'assets/js/utility.js'), 'utf8');
const ratingSource = utilitySource.slice(utilitySource.indexOf('const ratingSystem ='),
    utilitySource.indexOf('function closeDefaultModal()'));
const nativeSource = fs.readFileSync(path.join(root, 'assets/js/native.js'), 'utf8');
const playerSource = fs.readFileSync(path.join(root, 'assets/js/player.js'), 'utf8');
const daysAgo = days => new Date(Date.now() - days * 86400000).toISOString();

function setup({ platform = 'ios', premium = false, config = null, requestReview = async () => {} } = {}) {
    const storage = new Map(config ? [['ratingConfig', JSON.stringify(config)]] : []);
    const calls = { native: 0, custom: 0, load: 0, warnings: 0, links: [], gameLog: [] };
    const modals = [];
    const context = vm.createContext({
        window: {
            open: url => calls.links.push(url),
            Capacitor: {
                isNativePlatform: () => ['android', 'ios'].includes(platform),
                getPlatform: () => platform,
            },
            getComputedStyle: element => element.style,
        },
        navigator: { userAgent: platform === 'android' ? 'Android' : '' },
        document: { hidden: false, querySelectorAll: () => modals },
        localStorage: {
            getItem: key => storage.get(key) ?? null,
            setItem: (key, value) => storage.set(key, value),
        },
        console: { warn: () => calls.warnings++ },
        addDungeonLog: message => calls.gameLog.push(message),
        player: { playtime: 1800 },
        dungeon: { progress: { floor: 10 }, status: { event: false } },
        isForgeMembershipActive: () => premium,
        loadReview: async () => {
            calls.load++;
            return { requestReview: async () => { calls.native++; await requestReview(); } };
        },
        customPrompt: () => calls.custom++,
    });
    vm.runInContext(nativeSource, context);
    vm.runInContext(ratingSource + `
        loadNativeReviewApi = loadReview;
        ratingSystem.showPrompt = customPrompt;
        ratingSystem.init();
    `, context);
    return { context, storage, calls, modals, run: code => vm.runInContext(code, context) };
}

for (const platform of ['ios', 'android']) {
    test(`${platform}: automatic request uses native UI and persists an attempt, not a rating`, async () => {
        const game = setup({ platform });
        await game.run('ratingSystem.checkAndPrompt()');
        assert.equal(game.calls.native, 1);
        assert.equal(game.calls.custom, 0);
        assert.deepEqual(game.calls.links, []);
        const config = JSON.parse(game.storage.get('ratingConfig'));
        assert.ok(Number.isFinite(Date.parse(config.lastPromptDate)));
        assert.equal(config.hasRated, false);
        await game.run('ratingSystem.checkAndPrompt()');
        assert.equal(game.calls.native, 1, 'an attempt starts the cooldown even if no dialog appeared');
    });

    test(`${platform}: manual action opens its store even with Forge membership`, () => {
        const game = setup({ platform, premium: true });
        game.run('ratingSystem.openRating()');
        assert.equal(game.calls.native, 0);
        assert.equal(game.calls.links.length, 1);
        assert.match(game.calls.links[0], platform === 'ios' ? /apps\.apple\.com.*action=write-review/ : /market:\/\/details/);
    });
}

test('native requests respect existing opt-outs, playtime and progress requirements', async () => {
    const optedOut = setup({ config: { hasRated: true } });
    await optedOut.run('ratingSystem.checkAndPrompt()');
    assert.equal(optedOut.calls.load, 0);
    const game = setup();
    await game.run('player.playtime = 1799; ratingSystem.checkAndPrompt()');
    await game.run('player.playtime = 1800; dungeon.progress.floor = 9; ratingSystem.checkAndPrompt()');
    assert.equal(game.calls.native, 0);
    await game.run('dungeon.progress.floor = 10; ratingSystem.checkAndPrompt()');
    assert.equal(game.calls.native, 1);
});

test('native cooldown is 120 days and survives restarting the game', async () => {
    for (const [days, expected] of [[119, 0], [121, 1]]) {
        const game = setup({ config: { hasRated: false, lastPromptDate: daysAgo(days) } });
        await game.run('ratingSystem.checkAndPrompt()');
        assert.equal(game.calls.native, expected);
    }
});

test('native API failure stays quiet, retains cooldown and allows the game to continue', async () => {
    const game = setup({ requestReview: async () => { throw new Error('Unavailable'); } });
    await game.run('ratingSystem.checkAndPrompt()');
    assert.equal(game.calls.native, 1);
    assert.equal(game.calls.custom, 0);
    assert.deepEqual(game.calls.links, []);
    assert.equal(game.run('ratingSystem.config.hasRated'), false);
    assert.equal(game.run('ratingSystem.requestInFlight'), false);
    await game.run('ratingSystem.checkAndPrompt()');
    assert.equal(game.calls.native, 1);
});

test('overlapping checks cannot launch multiple native requests', async () => {
    let finish;
    const game = setup({ requestReview: () => new Promise(resolve => { finish = resolve; }) });
    const first = game.run('ratingSystem.checkAndPrompt()');
    await game.run('ratingSystem.checkAndPrompt()');
    assert.equal(game.calls.native, 1);
    finish();
    await first;
    assert.equal(game.run('ratingSystem.requestInFlight'), false);
});

test('combat, open modals, background state and automatic choices defer the request', async () => {
    const game = setup();
    for (const state of [
        'dungeon.status.event = true',
        'dungeon.status.event = false; document.hidden = true',
        'document.hidden = false; autoMode = true; autoStopLevelUp = false',
    ]) {
        await game.run(`${state}; ratingSystem.checkAndPrompt()`);
    }
    game.run('autoMode = false');
    game.modals.push({ style: { display: 'flex' } });
    await game.run('ratingSystem.checkAndPrompt()');
    assert.equal(game.calls.load, 0);
    game.modals[0].style.display = 'none';
    await game.run('ratingSystem.checkAndPrompt()');
    assert.equal(game.calls.native, 1);
});

test('a new combat during plugin loading cancels the attempt without consuming cooldown', async () => {
    const game = setup();
    const pending = game.run('ratingSystem.checkAndPrompt()');
    game.run('dungeon.status.event = true');
    await pending;
    assert.equal(game.calls.native, 0);
    assert.equal(game.storage.has('ratingConfig'), false);
    assert.equal(game.run('ratingSystem.requestInFlight'), false);
});

test('native review requests do not add messages to the game log', async () => {
    const game = setup();
    await game.run('ratingSystem.checkAndPrompt()');
    assert.deepEqual(game.calls.gameLog, []);
});

test('web and desktop retain the custom prompt, itch.io link and seven-day cooldown', async () => {
    for (const premium of [false, true]) {
        const game = setup({ platform: 'web', premium, config: { lastPromptDate: daysAgo(8) } });
        await game.run('ratingSystem.checkAndPrompt()');
        assert.equal(game.calls.custom, 1);
        assert.equal(game.calls.load, 0);
        game.run('ratingSystem.openRating()');
        assert.match(game.calls.links[0], /itch\.io.*\/rate/);
        game.run(`ratingSystem.config.lastPromptDate = ${JSON.stringify(daysAgo(6))}`);
        await game.run('ratingSystem.checkAndPrompt()');
        assert.equal(game.calls.custom, 1);
    }
});

test('review check runs only after the final level-up choice and updated stats', () => {
    const element = () => ({
        style: { display: 'none' }, dataset: {}, children: [], listeners: {},
        set innerHTML(value) { this.children = []; },
        appendChild(child) { this.children.push(child); },
        addEventListener(event, callback) { this.listeners[event] = callback; },
    });
    const panel = element();
    const select = element();
    const calls = [];
    const context = vm.createContext({
        document: { querySelector: () => null, createElement: element },
        lvlupPanel: panel, lvlupSelect: select,
        player: { exp: { lvlGained: 2 }, bonusStats: { hp: 0, atk: 0, def: 0 } },
        dungeon: { status: { event: false } },
        levelUpDimTarget: null, levelUpPausedForChoice: false,
        leveled: true, luckAsLevelUpOption: false,
        sfxItem: { play() {} }, t: key => key,
        playerLoadStats: () => calls.push('stats'),
        continueExploring() {},
        ratingSystem: { checkAndPrompt: () => {
            assert.equal(panel.style.display, 'none');
            calls.push('review');
        } },
    });
    vm.runInContext(playerSource.slice(playerSource.indexOf('const clickLevelUpStatOption =')), context);
    vm.runInContext('lvlupPopup()', context);
    assert.deepEqual(calls, []);
    select.children[0].listeners.click();
    assert.deepEqual(calls, ['stats']);
    select.children[0].listeners.click();
    assert.deepEqual(calls, ['stats', 'stats', 'review']);
});
