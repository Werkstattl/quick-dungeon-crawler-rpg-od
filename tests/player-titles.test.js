const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = name => fs.readFileSync(path.join(root, 'assets/js', name), 'utf8');
const english = JSON.parse(fs.readFileSync(path.join(root, 'assets/locales/en.json'), 'utf8'));
const supportedLanguages = Array.from(source('language.js').match(/const SUPPORTED = \[([^\]]+)\];/)[1]
    .matchAll(/'([^']+)'/g), match => match[1]);
const titleTranslationKeys = Object.keys(english).filter(key =>
    key === 'titles' || key.startsWith('titles-') || key.startsWith('title-'));

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
    vm.runInContext(source('enemy.js').split('const isSavedEnemyValidForDungeon =')[0], context);
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
    state.context.bestiary[43] = { e: 1, k: 1 };
    state.run('syncPlayerTitleUnlocks()');
    assert.deepEqual(state.unlocked(), [
        'dungeon-delver', 'depthwalker', 'cursebound', 'hexbreaker',
        'curseforged', 'crownbreaker', 'kingsbane',
    ]);
    assert.equal(state.run('isPlayerTitleUnlocked("sovereign-of-ruin")'), false);
    assert.equal(state.run('isPlayerTitleUnlocked("the-unbroken")'), false);
    assert.equal(state.logs.length, 0);
    assert.equal(JSON.parse(state.storage.get('playerData')).titles.progress.highestMonarchCurse, 14);
});

test('every recorded Monarch variant credits old winners and persists only the proven milestones', () => {
    for (const id of [43, 44, 45, 46, 47, 48, 49, 50, 51]) {
        const state = createState({ hardcore: true });
        state.context.bestiary[id] = { e: 1, k: '1' };
        state.run('syncPlayerTitleUnlocks({ dungeonData: null })');
        assert.deepEqual(state.unlocked(), ['dungeon-delver', 'depthwalker', 'crownbreaker']);
        assert.equal(state.context.player.titles.progress.highestFloor, 20);
        assert.equal(state.context.player.titles.progress.highestMonarchCurse, 1);
        assert.equal(state.context.player.titles.progress.deepMonarchFloor, 0);
        assert.equal(state.context.player.titles.progress.hardcoreMonarch, false);
        assert.equal(state.context.player.maxUnlockedCurseLevel, 1);
        assert.equal(state.logs.length, 0);

        state.run('setPlayerTitle("crownbreaker")');
        const reloaded = createState(JSON.parse(state.storage.get('playerData')), state.storage);
        assert.equal(reloaded.run('syncPlayerTitleUnlocks({ announce: true }).length'), 0);
        assert.deepEqual(reloaded.unlocked(), ['dungeon-delver', 'depthwalker', 'crownbreaker']);
        assert.equal(reloaded.run('getSelectedPlayerTitle().id'), 'crownbreaker');
        assert.equal(reloaded.context.player.titles.progress.highestFloor, 20);
        assert.equal(reloaded.logs.length, 0);
    }
});

test('encounters, other enemy kills and invalid kill counts do not prove a Monarch victory', () => {
    for (const bestiary of [
        {}, { 43: { e: 10 } }, { 43: { e: 10, k: 0 } },
        { 1: { k: 100 }, 28: { k: 10 }, 42: { k: 10 }, 999: { k: 100 } },
        ...[-1, 0.5, 'invalid', Infinity].map(k => ({ 43: { k } })),
    ]) {
        const state = createState();
        state.context.bestiary = bestiary;
        state.run('syncPlayerTitleUnlocks()');
        assert.deepEqual(state.unlocked(), []);
        assert.equal(state.context.player.titles.progress.highestMonarchCurse, 0);
        assert.equal(state.context.player.titles.progress.highestFloor, 1);
    }
});

test('legacy title unlocks and selections follow their achievement and migrate only once', () => {
    for (const [oldId, newId, name] of [
        ['sovereign-of-ruin', 'curseforged', 'Curseforged'],
        ['kingsbane', 'crownbreaker', 'Crownbreaker'],
        ['crowncrusher', 'kingsbane', 'Kingsbane'],
        ['crownbreaker', 'sovereign-of-ruin', 'Sovereign of Ruin'],
    ]) {
        const state = createState({ titles: { unlocked: [oldId], selected: oldId } });
        // Reading an equipped title must also work before the next unlock sync.
        assert.equal(state.run('getSelectedPlayerTitle().id'), newId);
        assert.equal(state.run('getPlayerDisplayName("Hero")'), `Hero [${name}]`);
        state.run('syncPlayerTitleUnlocks()');
        assert.deepEqual(state.unlocked(), [newId]);
        assert.equal(state.context.player.titles.version, 2);
        const before = JSON.stringify(state.context.player.titles);
        state.run('normalizePlayerTitles(player); persistPlayerTitles()');
        assert.equal(JSON.stringify(state.context.player.titles), before);
        const reloaded = createState(JSON.parse(state.storage.get('playerData')), state.storage);
        reloaded.run('syncPlayerTitleUnlocks()');
        assert.equal(reloaded.run('getSelectedPlayerTitle().id'), newId);
        assert.deepEqual(reloaded.unlocked(), [newId]);
    }
});

test('an old Curse 15 title does not grant the new Curse 15 Monarch achievement', () => {
    const state = createState({ maxUnlockedCurseLevel: 15, titles: {
        unlocked: ['sovereign-of-ruin'], selected: 'sovereign-of-ruin',
    } });
    state.run('syncPlayerTitleUnlocks()');
    assert.equal(state.run('getSelectedPlayerTitle().id'), 'curseforged');
    assert.equal(state.run('isPlayerTitleUnlocked("sovereign-of-ruin")'), false);
    state.context.dungeon.settings.enemyScaling = 2.5;
    state.context.dungeon.progress.floor = 20;
    state.run('recordPlayerMonarchVictory()');
    assert.equal(state.run('isPlayerTitleUnlocked("sovereign-of-ruin")'), true);
    assert.equal(state.run('getSelectedPlayerTitle().id'), 'curseforged');
});

test('Monarch titles progress from the first victory through Curse 10 to Curse 15', () => {
    const state = createState();
    state.context.dungeon.progress.floor = 20;
    for (const [curse, expected] of [
        [1, ['crownbreaker']],
        [9, ['crownbreaker']],
        [10, ['crownbreaker', 'kingsbane']],
        [14, ['crownbreaker', 'kingsbane']],
        [15, ['crownbreaker', 'kingsbane', 'sovereign-of-ruin']],
    ]) {
        state.context.dungeon.settings.enemyScaling = 1 + curse / 10;
        state.run('recordPlayerMonarchVictory()');
        assert.deepEqual(state.unlocked().filter(id =>
            state.run(`getPlayerTitleDefinition('${id}').group`) === 'monarch'), expected);
    }
});

test('earned depth challenge titles survive the raised requirement and explicit None survives migration', () => {
    const state = createState({ titles: { unlocked: ['deep-crowned'], selected: 'deep-crowned',
        progress: { deepMonarchFloor: 40 },
    } });
    state.run('syncPlayerTitleUnlocks()');
    assert.equal(state.run('getSelectedPlayerTitle().id'), 'deep-crowned');
    assert.equal(state.run('getPlayerTitleRequirement(getSelectedPlayerTitle())'),
        'Defeat the Dungeon Monarch on Floor 45 or deeper at Curse Level 10 or higher.');
    const none = createState({ titles: { unlocked: ['kingsbane'], selected: null } });
    none.storage.set('forgeMembershipActive', 'true');
    none.run('syncPlayerTitleUnlocks()');
    assert.equal(none.run('getSelectedPlayerTitle()'), null);
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
    state.context.dungeon.progress.floor = 45;
    state.run('recordPlayerMonarchVictory()');
    assert.equal(state.run('isPlayerTitleUnlocked("sovereign-of-ruin")'), false);
    assert.equal(state.run('isPlayerTitleUnlocked("deep-crowned")'), false);
    assert.equal(state.run('isPlayerTitleUnlocked("the-unbroken")'), false);
    state.context.dungeon.settings.enemyScaling = 2.5;
    state.run('recordPlayerMonarchVictory()');
    for (const id of ['sovereign-of-ruin', 'deep-crowned', 'the-unbroken']) {
        assert.equal(state.run(`isPlayerTitleUnlocked('${id}')`), true);
    }
    assert.equal(JSON.parse(state.storage.get('playerData')).titles.progress.highestMonarchCurse, 15);
});

test('deep and Hardcore titles require their separate conditions at Curse 10+', () => {
    const state = createState({ maxUnlockedCurseLevel: 10, selectedCurseLevel: 10 });
    state.context.dungeon.settings.enemyScaling = 2;
    state.context.dungeon.progress.floor = 44;
    state.run('recordPlayerMonarchVictory()');
    assert.equal(state.run('isPlayerTitleUnlocked("deep-crowned")'), false);
    assert.equal(state.run('isPlayerTitleUnlocked("the-unbroken")'), false);
    state.context.dungeon.progress.floor = 45;
    state.run('recordPlayerMonarchVictory()');
    assert.equal(state.run('isPlayerTitleUnlocked("deep-crowned")'), true);
    assert.equal(state.run('isPlayerTitleUnlocked("the-unbroken")'), false);
    state.context.player.hardcore = true;
    state.context.dungeon.progress.floor = 20;
    state.run('recordPlayerMonarchVictory()');
    assert.equal(state.run('isPlayerTitleUnlocked("the-unbroken")'), true);
});

test('the depth challenge requires a Monarch victory at Floor 45 and Curse 10+', () => {
    const state = createState();
    state.context.dungeon.progress.floor = 45;
    state.run('syncPlayerTitleUnlocks()');
    assert.equal(state.run('isPlayerTitleUnlocked("abyss-strider")'), true);
    assert.equal(state.run('isPlayerTitleUnlocked("deep-crowned")'), false);
    state.context.dungeon.settings.enemyScaling = 1.9;
    state.run('recordPlayerMonarchVictory()');
    assert.equal(state.run('isPlayerTitleUnlocked("deep-crowned")'), false);
    state.context.dungeon.settings.enemyScaling = 2;
    for (const floor of [40, 44, 45]) {
        state.context.dungeon.progress.floor = floor;
        state.run('recordPlayerMonarchVictory()');
        assert.equal(state.run('isPlayerTitleUnlocked("deep-crowned")'), floor === 45);
    }
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
    assert.equal(state.run('isPlayerTitleUnlocked("sovereign-of-ruin")'), true);
    assert.equal(state.context.dungeon.status.paused, true);
    assert.equal(JSON.parse(state.storage.get('playerData')).titles.unlocked.includes('sovereign-of-ruin'), true);
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

test('membership uses its own badge in the picker, profile and run summary', () => {
    const state = createState();
    state.storage.set('forgeMembershipActive', 'true');
    const card = state.run('renderPlayerTitleChoice(getPlayerTitleDefinition("forge-member"), "forge-member")');
    assert.match(card, /class="title-membership"/);
    assert.match(card, /Membership badge/);
    assert.doesNotMatch(card, /Legendary|Achievement|class="null"/);
    assert.match(state.run('getPlayerTitleHTML()'), /class="player-title title-membership"/);
    const titleElement = {};
    state.context.document = { querySelector: () => ({ dataset: {}, style: {},
        querySelector: selector => selector === '#endgame-player-title' ? titleElement : null,
    }) };
    const main = source('main.js');
    vm.runInContext(main.slice(main.indexOf('const showEndgameScreen ='),
        main.indexOf('const startNewRunAfterEndgame =')), state.context);
    state.run('showEndgameScreen({ titleId: "forge-member" })');
    assert.equal(titleElement.className, 'player-title title-membership');
    assert.equal(titleElement.textContent, 'Forge Member');
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

test('every supported language has complete title translations and identical parameter placeholders', () => {
    for (const lang of supportedLanguages) {
        const locale = JSON.parse(fs.readFileSync(path.join(root, `assets/locales/${lang}.json`), 'utf8'));
        for (const key of [...titleTranslationKeys, 'forge-member-title']) {
            assert.ok(Object.hasOwn(locale, key), `${lang} needs its own ${key}`);
            assert.equal(typeof locale[key], 'string', `${lang} needs ${key}`);
            assert.ok(locale[key].trim(), `${lang} ${key} must not be empty`);
            assert.deepEqual((locale[key].match(/\{\w+\}/g) || []).sort(),
                (english[key].match(/\{\w+\}/g) || []).sort(), `${lang} ${key} has incorrect placeholders`);
        }
    }
});

test('changing language refreshes the open title picker and equipped title in every supported language', async () => {
    const state = createState({ maxUnlockedCurseLevel: 10 });
    state.run('syncPlayerTitleUnlocks(); setPlayerTitle("cursebound")');
    const list = { scrollTop: 17 };
    const close = {};
    Object.assign(state.context.defaultModalElement, {
        style: { display: 'flex' },
        querySelector: selector => selector === '#titles-list' ? list : close,
        querySelectorAll: () => [],
    });
    Object.assign(state.context, {
        window: {},
        document: { documentElement: {}, querySelectorAll: () => [] },
        fetch: async url => ({ json: async () => JSON.parse(fs.readFileSync(
            path.join(root, new URL(url, 'http://localhost/').pathname), 'utf8')) }),
    });
    vm.runInContext(source('language.js').split('(function initLanguage()')[0], state.context);

    for (const lang of supportedLanguages) {
        await state.run(`setLanguage(${JSON.stringify(lang)})`);
        const locale = JSON.parse(fs.readFileSync(path.join(root, `assets/locales/${lang}.json`), 'utf8'));
        const html = state.context.defaultModalElement.innerHTML;
        assert.equal(state.context.document.documentElement.lang, lang);
        assert.equal(state.context.document.documentElement.dir, ['ar', 'fa'].includes(lang) ? 'rtl' : 'ltr');
        assert.equal(list.scrollTop, 17, `${lang} must preserve the picker position`);
        assert.equal(state.run('getPlayerDisplayName("Hero")'), `Hero [${locale['title-cursebound']}]`);
        for (const title of state.run('PLAYER_TITLES')) {
            const key = title.id === 'forge-member' ? 'forge-member-title' : `title-${title.id}`;
            assert.ok(html.includes(state.context.escapeTitleHTML(locale[key])), `${lang} must display ${key}`);
        }
        for (const key of ['titles', 'titles-description', 'title-none', 'title-none-description',
            'title-equipped', 'title-unlocked-label', 'title-locked', 'title-membership-badge',
            'title-source-achievement', ...state.run('PLAYER_TITLE_GROUPS').map(group => `title-group-${group}`)]) {
            assert.ok(html.includes(state.context.escapeTitleHTML(locale[key])), `${lang} must display ${key}`);
        }
        assert.ok(html.includes(state.context.escapeTitleHTML(locale['title-back'])), `${lang} must translate the back button label`);
        assert.ok(html.includes(state.context.escapeTitleHTML(locale['title-current'].replace('{title}', locale['title-cursebound']))));
        const groupIds = Array.from(html.matchAll(/<section class="title-group" aria-labelledby="title-group-([^"\s]+)"/g), match => match[1]);
        assert.deepEqual(groupIds, ['depth', 'bestiary', 'curse', 'monarch', 'challenges', 'membership']);
        assert.ok(html.includes(state.context.escapeTitleHTML(locale['title-requirement-deep-monarch'].replace('{target}', '45'))));
        assert.ok(Object.hasOwn(locale, 'title-curseforged'));
        assert.equal(Object.hasOwn(locale, 'title-crowncrusher'), false);
        assert.doesNotMatch(html, /\{(?:current|target|total|title)\}/, `${lang} must interpolate progress and requirement values`);
    }
});
