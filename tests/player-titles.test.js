const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = name => fs.readFileSync(path.join(root, 'assets/js', name), 'utf8');
const english = JSON.parse(fs.readFileSync(path.join(root, 'assets/locales/en.json'), 'utf8'));

function createState(overrides = {}, storage = new Map()) {
    const logs = [];
    const context = vm.createContext({
        console,
        player: { name: 'Hero', maxUnlockedCurseLevel: 1, selectedCurseLevel: 1, ...overrides },
        dungeon: {
            progress: { floor: 1, room: 1 }, settings: { enemyScaling: 1.1 },
            statistics: {}, backlog: [],
        },
        bestiary: {},
        enemyData: Object.fromEntries(Array.from({ length: 51 }, (_, i) => [i + 1, {}])),
        defaultModalElement: { style: { display: 'none' }, querySelector: () => null },
        localStorage: {
            getItem: key => storage.get(key) || null,
            setItem: (key, value) => storage.set(key, String(value)),
            removeItem: key => storage.delete(key),
        },
        t: (key, params) => (english[key] || key).replace(/\{(\w+)\}/g,
            (match, name) => params && name in params ? params[name] : match),
        addDungeonLog: message => logs.push(message),
        addCombatLog: message => logs.push(message),
        playerLoadStats() {},
    });
    vm.runInContext(source('progression.js'), context);
    vm.runInContext(source('utility.js').split('const nFormatter =')[0], context);
    vm.runInContext(source('titles.js'), context);
    context.saveData = () => vm.runInContext('persistPlayerTitles()', context);
    return {
        context, storage, logs,
        run: expression => vm.runInContext(expression, context),
        unlocked: () => Array.from(context.player.titles.unlocked),
    };
}

test('old Curse 15 saves receive proven milestones without claiming a Curse 15 victory', () => {
    const state = createState({ maxUnlockedCurseLevel: 15, selectedCurseLevel: 15 });
    state.run('syncPlayerTitleUnlocks()');
    assert.deepEqual(state.unlocked(), [
        'dungeon-delver', 'depthwalker', 'cursebound', 'hexbreaker',
        'sovereign-of-ruin', 'kingsbane', 'crowncrusher',
    ]);
    assert.equal(state.run('isPlayerTitleUnlocked("crownbreaker")'), false);
    assert.equal(state.run('isPlayerTitleUnlocked("the-unbroken")'), false);
    assert.equal(state.logs.length, 0);
    assert.equal(JSON.parse(state.storage.get('playerData')).titles.progress.highestMonarchCurse, 14);
});

test('depth milestones award at their thresholds and preserve earlier titles', () => {
    const state = createState();
    for (const [floor, expected] of [[4, []], [5, ['dungeon-delver']],
        [20, ['dungeon-delver', 'depthwalker']], [40, ['dungeon-delver', 'depthwalker', 'abyss-strider']]]) {
        state.context.dungeon.progress.floor = floor;
        state.run('syncPlayerTitleUnlocks()');
        assert.deepEqual(state.unlocked(), expected);
    }
    state.context.dungeon.progress.floor = 1;
    state.run('syncPlayerTitleUnlocks()');
    assert.equal(state.context.player.titles.progress.highestFloor, 40);
    assert.equal(state.run('getSelectedPlayerTitle()'), null);
});

test('bestiary milestones count defeated known enemy types and persist across bestiary reloads', () => {
    const state = createState();
    for (let id = 1; id <= 9; id++) state.context.bestiary[id] = { e: 1, k: 1 };
    state.context.bestiary[10] = { e: 100, k: 0 };
    state.context.bestiary[999] = { k: 100 };
    state.run('syncPlayerTitleUnlocks()');
    assert.equal(state.run('isPlayerTitleUnlocked("field-scholar")'), false);
    for (let id = 10; id <= 40; id++) state.context.bestiary[id] = { e: 1, k: 1 };
    state.run('syncPlayerTitleUnlocks({ announce: true })');
    for (const id of ['field-scholar', 'beast-chronicler', 'living-bestiary']) {
        assert.equal(state.run(`isPlayerTitleUnlocked('${id}')`), true);
    }
    state.context.bestiary = {};
    state.run('syncPlayerTitleUnlocks()');
    assert.equal(state.context.player.titles.progress.bestiaryTypes, 40);
    assert.equal(state.logs.length, 3);
});

test('Curse unlocks award their titles through the real progression handler', () => {
    const state = createState({ maxUnlockedCurseLevel: 4, selectedCurseLevel: 4 });
    const main = source('main.js');
    vm.runInContext(main.slice(main.indexOf('const maybeUnlockNextCurseLevel ='),
        main.indexOf('// Calculate every player stat')), state.context);
    state.context.dungeon.progress.floor = 10;
    assert.equal(state.run('maybeUnlockNextCurseLevel()'), true);
    assert.equal(state.run('isPlayerTitleUnlocked("cursebound")'), true);
    assert.equal(state.run('isPlayerTitleUnlocked("hexbreaker")'), false);
    assert.match(state.logs.join('\n'), /Title unlocked:.*Cursebound/);
});

test('a real floor transition awards the first title immediately', () => {
    const state = createState();
    const dungeon = source('dungeon.js');
    const element = { setAttribute() {}, textContent: '' };
    Object.assign(state.context, {
        floorCount: element, roomCount: element,
        ensureRoomEventsState() {}, clearFloorBuffs() {}, resetRouteChoice() {},
        resetRoomEvents() {}, maybeAdvanceDungeonStory() {},
    });
    state.context.dungeon.progress = { floor: 4, room: 6, roomLimit: 5 };
    vm.runInContext(dungeon.slice(dungeon.indexOf('const loadDungeonProgress ='),
        dungeon.indexOf('// ========== Events in the Dungeon')), state.context);
    state.run('loadDungeonProgress()');
    assert.equal(state.run('isPlayerTitleUnlocked("dungeon-delver")'), true);
    assert.match(state.logs[0], /Dungeon Delver/);
});

test('Monarch and challenge rewards use the defeated run difficulty', () => {
    const state = createState({ maxUnlockedCurseLevel: 15, selectedCurseLevel: 15, hardcore: true });
    state.context.dungeon.settings.enemyScaling = 1.9;
    state.context.dungeon.progress.floor = 40;
    state.run('recordPlayerMonarchVictory()');
    assert.equal(state.run('isPlayerTitleUnlocked("crownbreaker")'), false);
    assert.equal(state.run('isPlayerTitleUnlocked("deep-crowned")'), false);
    assert.equal(state.run('isPlayerTitleUnlocked("the-unbroken")'), false);
    state.context.dungeon.settings.enemyScaling = 2.5;
    state.run('recordPlayerMonarchVictory()');
    for (const id of ['crownbreaker', 'deep-crowned', 'the-unbroken']) {
        assert.equal(state.run(`isPlayerTitleUnlocked('${id}')`), true);
    }
    assert.equal(JSON.parse(state.storage.get('playerData')).titles.progress.highestMonarchCurse, 15);
});

test('deep and Hardcore titles require their separate conditions at Curse 10+', () => {
    const state = createState({ maxUnlockedCurseLevel: 10, selectedCurseLevel: 10 });
    state.context.dungeon.settings.enemyScaling = 2;
    state.context.dungeon.progress.floor = 39;
    state.run('recordPlayerMonarchVictory()');
    assert.equal(state.run('isPlayerTitleUnlocked("deep-crowned")'), false);
    assert.equal(state.run('isPlayerTitleUnlocked("the-unbroken")'), false);
    state.context.dungeon.progress.floor = 40;
    state.run('recordPlayerMonarchVictory()');
    assert.equal(state.run('isPlayerTitleUnlocked("deep-crowned")'), true);
    assert.equal(state.run('isPlayerTitleUnlocked("the-unbroken")'), false);
    state.context.player.hardcore = true;
    state.context.dungeon.progress.floor = 20;
    state.run('recordPlayerMonarchVictory()');
    assert.equal(state.run('isPlayerTitleUnlocked("the-unbroken")'), true);
});

test('an imported Forge title cannot grant a membership entitlement', () => {
    const state = createState({ titles: { unlocked: ['forge-member'], selected: 'forge-member' } });
    state.run('syncPlayerTitleUnlocks()');
    assert.equal(state.run('isPlayerTitleUnlocked("forge-member")'), false);
    assert.equal(state.run('setPlayerTitle("forge-member")'), false);
    assert.equal(state.run('getSelectedPlayerTitle()'), null);
    assert.equal(state.run('getPlayerDisplayName("Hero")'), 'Hero');
    assert.equal(state.unlocked().includes('forge-member'), false);
    assert.equal(state.run('applyForgeMembershipGoldBonus(100)'), 100);
});

test('existing members retain their title until they make an explicit choice', () => {
    const state = createState({ maxUnlockedCurseLevel: 5 });
    state.storage.set('forgeMembershipActive', 'true');
    state.run('syncPlayerTitleUnlocks()');
    assert.equal(state.run('getSelectedPlayerTitle().id'), 'forge-member');
    assert.equal(state.run('setPlayerTitle("cursebound")'), true);
    assert.equal(state.run('getSelectedPlayerTitle().id'), 'cursebound');
    assert.equal(state.run('applyForgeMembershipGoldBonus(100)'), 110);
    assert.equal(state.run('setPlayerTitle(null)'), true);
    assert.equal(state.run('getSelectedPlayerTitle()'), null);
    state.storage.delete('forgeMembershipActive');
    state.storage.set('forgeLifetimeMembershipActive', 'true');
    assert.equal(state.run('getSelectedPlayerTitle()'), null);
});

test('a selected membership title is hidden on expiry and restored by lifetime ownership', () => {
    const state = createState();
    state.storage.set('forgeMembershipActive', 'true');
    state.run('setPlayerTitle("forge-member")');
    state.storage.delete('forgeMembershipActive');
    assert.equal(state.run('getSelectedPlayerTitle()'), null);
    assert.equal(state.run('getPlayerTitleHTML()'), '');
    state.storage.set('forgeLifetimeMembershipActive', 'true');
    assert.equal(state.run('getSelectedPlayerTitle().id'), 'forge-member');
});

test('purchase entitlement updates respect title selection and lifetime ownership', () => {
    const state = createState({ maxUnlockedCurseLevel: 10 });
    state.context.document = { querySelector: () => null };
    const main = source('main.js');
    vm.runInContext(main.slice(main.indexOf('function setForgeMembershipActive('),
        main.indexOf('function unlockForgeMembership(')), state.context);
    state.run('syncPlayerTitleUnlocks(); setForgeMembershipActive(true)');
    assert.equal(state.run('getSelectedPlayerTitle().id'), 'forge-member');
    state.run('setPlayerTitle("hexbreaker"); setForgeLifetimeMembershipActive(true); setForgeMembershipActive(false)');
    assert.equal(state.run('getSelectedPlayerTitle().id'), 'hexbreaker');
    assert.equal(state.run('isForgeMembershipActive()'), true);
    state.run('setPlayerTitle("forge-member"); setForgeLifetimeMembershipActive(false)');
    assert.equal(state.run('getSelectedPlayerTitle()'), null);
    assert.equal(state.run('isPlayerTitleUnlocked("hexbreaker")'), true);
});

test('title choices survive save reloads and newly unlocked higher titles', () => {
    const state = createState({ maxUnlockedCurseLevel: 5 });
    state.run('syncPlayerTitleUnlocks()');
    assert.equal(state.run('setPlayerTitle("hexbreaker")'), false);
    assert.equal(state.run('setPlayerTitle("unknown")'), false);
    state.run('setPlayerTitle("cursebound")');
    const reloaded = createState(JSON.parse(state.storage.get('playerData')), state.storage);
    reloaded.context.player.maxUnlockedCurseLevel = 15;
    reloaded.run('syncPlayerTitleUnlocks({ announce: true })');
    assert.equal(reloaded.run('getSelectedPlayerTitle().id'), 'cursebound');
    assert.match(reloaded.run('getPlayerTitleHTML()'), /player-title Rare/);
    assert.equal(reloaded.run('getPlayerDisplayName("Hero")'), 'Hero [Cursebound]');
});

test('normal and Hardcore run resets preserve earned titles and selection', () => {
    for (const hardcore of [false, true]) {
        const state = createState({ hardcore, maxUnlockedCurseLevel: 15,
            selectedCurseLevel: 15, stats: { hp: 10, hpMax: 100 }, equipped: [], gold: 100,
        });
        state.run('syncPlayerTitleUnlocks(); setPlayerTitle("hexbreaker")');
        const before = JSON.stringify(state.context.player.titles);
        Object.assign(state.context, { combatBacklog: [], playerCompanions: [], activeCompanion: null,
            calculateStats() {}, saveCompanions() {},
        });
        const main = source('main.js');
        vm.runInContext(main.slice(main.indexOf('const progressReset ='),
            main.indexOf('const hideEndgameScreen =')), state.context);
        state.run('progressReset(true)');
        assert.equal(JSON.stringify(state.context.player.titles), before);
        assert.equal(state.run('getSelectedPlayerTitle().id'), 'hexbreaker');
    }
});

test('new title announcements happen once and title selection does not grant stats', () => {
    const state = createState({ maxUnlockedCurseLevel: 10, stats: { atk: 100, def: 50 } });
    state.run('syncPlayerTitleUnlocks({ announce: true })');
    const count = state.logs.length;
    state.run('syncPlayerTitleUnlocks({ announce: true })');
    assert.equal(state.logs.length, count);
    const before = JSON.stringify(state.context.player.stats);
    state.run('setPlayerTitle("hexbreaker")');
    assert.equal(JSON.stringify(state.context.player.stats), before);
});

test('run summaries capture the selected earned title and the None option', () => {
    const state = createState({ maxUnlockedCurseLevel: 10 });
    state.storage.set('forgeMembershipActive', 'true');
    state.run('syncPlayerTitleUnlocks(); setPlayerTitle("hexbreaker")');
    const combat = source('combat.js');
    const start = combat.indexOf('const createRunSummary =');
    vm.runInContext(combat.slice(start, combat.indexOf('\n});', start) + 4), state.context);
    assert.equal(state.run('createRunSummary("victory").titleId'), 'hexbreaker');
    state.run('setPlayerTitle(null)');
    assert.equal(state.run('createRunSummary("victory").titleId'), null);
});

test('the real Monarch victory handler persists the final Curse 15 title after timers stop', () => {
    const state = createState({ maxUnlockedCurseLevel: 15, selectedCurseLevel: 15 });
    state.context.dungeon.settings.enemyScaling = 2.5;
    state.context.dungeon.progress.floor = 20;
    state.context.dungeon.status = {};
    state.context.updateCombatLog = () => {};
    const combat = source('combat.js');
    const start = combat.indexOf('const createRunSummary =');
    vm.runInContext(combat.slice(start, combat.indexOf('\n});', start) + 4), state.context);
    vm.runInContext(combat.slice(combat.indexOf('const handleSpecialBossVictory ='),
        combat.indexOf('const hasSellableCombatLoot =')), state.context);
    state.run('handleSpecialBossVictory()');
    assert.equal(state.run('isPlayerTitleUnlocked("crownbreaker")'), true);
    assert.equal(state.context.dungeon.status.paused, true);
    assert.equal(JSON.parse(state.storage.get('playerData')).titles.unlocked.includes('crownbreaker'), true);
});

test('the endgame screen applies the chosen rarity and hides an empty title', () => {
    const state = createState();
    const titleElement = {};
    const modal = { dataset: {}, style: {}, querySelector: selector =>
        selector === '#endgame-player-title' ? titleElement : null,
    };
    state.context.document = { querySelector: selector => selector === '#endgameModal' ? modal : null };
    const main = source('main.js');
    vm.runInContext(main.slice(main.indexOf('const showEndgameScreen ='),
        main.indexOf('const startNewRunAfterEndgame =')), state.context);
    state.run('showEndgameScreen({ titleId: "hexbreaker", result: "victory" })');
    assert.equal(titleElement.textContent, 'Hexbreaker');
    assert.equal(titleElement.className, 'player-title Epic');
    assert.equal(titleElement.hidden, false);
    state.run('showEndgameScreen({ titleId: null })');
    assert.equal(titleElement.textContent, '');
    assert.equal(titleElement.className, 'player-title');
    assert.equal(titleElement.hidden, true);
});

test('malformed title saves are normalized without retaining unknown or paid unlocks', () => {
    const state = createState({ titles: {
        selected: 'nonexistent', unlocked: ['cursebound', 'cursebound', 'forge-member', 'invalid'],
        progress: { highestFloor: 'invalid', highestMonarchCurse: 100, bestiaryTypes: -4, hardcoreMonarch: 'true' },
    } });
    state.run('normalizePlayerTitles(player)');
    assert.deepEqual(state.unlocked(), ['cursebound']);
    assert.equal(state.context.player.titles.selected, null);
    assert.equal(state.context.player.titles.progress.highestFloor, 0);
    assert.equal(state.context.player.titles.progress.highestMonarchCurse, 15);
    assert.equal(state.context.player.titles.progress.bestiaryTypes, 0);
    assert.equal(state.context.player.titles.progress.hardcoreMonarch, false);
});

test('title cards expose requirements, progress and rarity and disable locked titles', () => {
    const state = createState({ maxUnlockedCurseLevel: 5 });
    state.run('syncPlayerTitleUnlocks()');
    const locked = state.run('renderPlayerTitleChoice(getPlayerTitleDefinition("hexbreaker"), null)');
    assert.match(locked, /disabled/);
    assert.match(locked, /5\/10/);
    assert.match(locked, /Unlock Curse Level 10/);
    assert.match(locked, /Epic · Achievement/);
    const selected = state.run('renderPlayerTitleChoice(getPlayerTitleDefinition("cursebound"), "cursebound")');
    assert.doesNotMatch(selected, /disabled/);
    assert.match(selected, /aria-pressed="true"/);
    assert.match(selected, /Equipped/);
});

test('title names are escaped for HTML and missing translations use readable fallback text', () => {
    const state = createState({ maxUnlockedCurseLevel: 5 });
    state.run('syncPlayerTitleUnlocks(); setPlayerTitle("cursebound")');
    state.context.t = () => '<img src=x onerror=alert(1)>';
    const html = state.run('getPlayerTitleHTML()');
    assert.doesNotMatch(html, /<img/);
    assert.match(html, /&lt;img/);
    state.context.t = key => key;
    assert.equal(state.run('getPlayerDisplayName("Hero")'), 'Hero [Cursebound]');
    assert.equal(state.run('getPlayerTitleRequirement(getPlayerTitleDefinition("cursebound"))'), 'Unlock Curse Level 5.');
});

test('English and German title translations retain parameter placeholders', () => {
    for (const lang of ['en', 'de']) {
        const locale = JSON.parse(fs.readFileSync(path.join(root, `assets/locales/${lang}.json`), 'utf8'));
        for (const key of Object.keys(english).filter(key => key === 'titles' || key.startsWith('titles-') || key.startsWith('title-'))) {
            assert.equal(typeof locale[key], 'string', `${lang} needs ${key}`);
            for (const parameter of english[key].match(/\{\w+\}/g) || []) {
                assert.ok(locale[key].includes(parameter), `${lang} ${key} needs ${parameter}`);
            }
        }
    }
});
