const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const autoModeSource = fs.readFileSync(path.join(root, 'assets/js/automode.js'), 'utf8');
const dungeonSource = fs.readFileSync(path.join(root, 'assets/js/dungeon.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(root, 'assets/js/main.js'), 'utf8');
const playerSource = fs.readFileSync(path.join(root, 'assets/js/player.js'), 'utf8');
const combatSource = fs.readFileSync(path.join(root, 'assets/js/combat.js'), 'utf8');

const createElement = () => {
    const classes = new Set();
    return {
        style: {},
        attributes: {},
        classList: {
            add: name => classes.add(name),
            remove: name => classes.delete(name),
            toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
            contains: name => classes.has(name),
        },
        setAttribute(name, value) { this.attributes[name] = value; },
        removeAttribute(name) { delete this.attributes[name]; },
        addEventListener() {},
        appendChild() {},
        querySelectorAll: () => [],
    };
};

function setup({ stopFloor = '3', floor = 2, room = 5, enabled = true } = {}) {
    const storage = new Map([
        ['autoModePermanentUnlocked', 'true'],
        ['autoModeBtnVisible', 'true'],
        ['autoMode', String(enabled)],
        ['autoStopFloor', stopFloor],
    ]);
    const elements = new Map();
    const pending = [];
    let clicks = 0;
    let attacks = 0;
    const context = vm.createContext({
        document: {
            createElement,
            querySelector(selector) {
                if (!elements.has(selector)) elements.set(selector, createElement());
                return elements.get(selector);
            },
            querySelectorAll: () => [],
        },
        localStorage: {
            getItem: key => storage.get(key) ?? null,
            setItem: (key, value) => storage.set(key, String(value)),
        },
        window: { maybeAutoAttack: () => attacks++, getComputedStyle: element => element.style },
        player: { stats: { hp: 100, hpMax: 100 } },
        playerLoadStats() {},
        inventoryOpen: false,
        sfxPause: { play() {} },
        sfxUnpause: { play() {} },
        sfxConfirm: { play() {} },
        sfxOpen: { play() {} },
        t: key => key,
        checkInventoryLimit: () => true,
        setTimeout: callback => pending.push(callback),
    });
    vm.runInContext(autoModeSource, context);
    vm.runInContext(dungeonSource, context);
    vm.runInContext(playerSource.slice(
        playerSource.indexOf('const continueExploring ='),
        playerSource.indexOf('const clickLevelUpStatOption ='),
    ), context);
    vm.runInContext(`
        dungeon.progress.floor = ${floor};
        dungeon.progress.room = ${room};
        dungeon.floorBuffs.currentFloor = ${floor};
        dungeon.status.paused = false;
        dungeon.status.exploring = true;
    `, context);
    for (const selector of ['#choice1', '#choice2', '#battleButton']) {
        context.document.querySelector(selector).click = () => clicks++;
    }
    return {
        context, storage, elements, pending,
        run: code => vm.runInContext(code, context),
        flush: () => pending.splice(0).forEach(callback => callback()),
        clicks: () => clicks,
        attacks: () => attacks,
    };
}

test('reaching the selected floor disables Auto Mode and pauses exploration', () => {
    const game = setup();
    game.run('autoConfirm(); autoDecline(); autoClaim(); incrementRoom()');

    assert.equal(game.run('dungeon.progress.floor'), 3);
    assert.equal(game.run('dungeon.progress.room'), 1);
    assert.equal(game.run('dungeon.status.paused'), true);
    assert.equal(game.run('dungeon.status.exploring'), false);
    assert.equal(game.storage.get('autoMode'), 'false');
    for (const selector of ['#auto-mode-btn', '#combat-auto-mode-btn']) {
        assert.equal(game.elements.get(selector).classList.contains('active'), false);
        assert.equal(game.elements.get(selector).attributes['aria-pressed'], 'false');
    }
    game.flush();
    assert.equal(game.clicks(), 0, 'queued automatic choices and loot claims must be cancelled');
});

test('earlier floors and room changes continue normally', () => {
    const game = setup({ stopFloor: '4', room: 4 });
    game.run('incrementRoom()');
    assert.equal(game.run('dungeon.progress.floor'), 2);
    assert.equal(game.run('autoMode'), true);
    game.run('incrementRoom()');
    assert.equal(game.run('dungeon.progress.floor'), 3);
    assert.equal(game.run('autoMode'), true);
    assert.equal(game.run('dungeon.status.exploring'), true);
});

test('claiming guardian loot stops at the new floor and closes combat normally', () => {
    const game = setup();
    Object.assign(game.context, {
        enemy: { condition: 'guardian', lvl: 12 },
        combatPanel: createElement(),
        bgmDungeon: { play() {} },
        combatBacklog: [],
        enemyDead: true,
        latestCombatLoot: {},
        findCompanionAfterCombat() {},
    });
    vm.runInContext(combatSource.slice(
        combatSource.indexOf('const handleClaimButtonClick ='),
        combatSource.indexOf('const bindClaimButton ='),
    ), game.context);
    game.run('dungeon.status.event = true; handleClaimButtonClick()');
    assert.equal(game.run('dungeon.progress.floor'), 3);
    assert.equal(game.run('autoMode'), false);
    assert.equal(game.run('dungeon.status.paused'), true);
    assert.equal(game.run('dungeon.status.event'), false);
    assert.equal(game.context.combatPanel.style.display, 'none');
});

test('a disabled floor limit leaves Auto Mode running', () => {
    const game = setup({ stopFloor: '0' });
    game.run('incrementRoom()');
    assert.equal(game.run('autoMode'), true);
    assert.equal(game.run('dungeon.status.paused'), false);
});

test('manual exploration is unaffected by the floor limit', () => {
    const game = setup({ enabled: false });
    game.run('incrementRoom()');
    assert.equal(game.run('dungeon.progress.floor'), 3);
    assert.equal(game.run('dungeon.status.exploring'), true);
    assert.equal(game.run('dungeon.status.paused'), false);
});

test('loading progress at or beyond the target stops saved Auto Mode', () => {
    for (const floor of [3, 4]) {
        const game = setup({ floor, room: 1 });
        game.run('dungeon.status.paused = true; dungeon.status.exploring = false; loadDungeonProgress()');
        assert.equal(game.run('autoMode'), false);
        assert.equal(game.run('dungeon.status.paused'), true);
    }
});

test('Auto Mode cannot resume at the target until the limit is changed', () => {
    const game = setup({ floor: 3, room: 1, enabled: false });
    game.run('dungeon.status.paused = true; dungeon.status.exploring = false');
    game.context.window.setAutoModeEnabled(true);
    assert.equal(game.run('autoMode'), false);
    assert.equal(game.run('dungeon.status.paused'), true);
    assert.equal(game.attacks(), 0);

    game.run('setAutoStopFloor(4)');
    game.context.window.setAutoModeEnabled(true);
    assert.equal(game.run('autoMode'), true);
    assert.equal(game.run('dungeon.status.exploring'), true);
    assert.equal(game.attacks(), 1);
});

test('floor preferences survive reloads and malformed values default to off', () => {
    const game = setup();
    assert.equal(setup({ stopFloor: null }).run('autoStopFloor'), 20);
    game.run('setAutoStopFloor("123")');
    assert.equal(game.storage.get('autoStopFloor'), '123');
    assert.equal(setup({ stopFloor: game.storage.get('autoStopFloor') }).run('autoStopFloor'), 123);
    for (const value of ['', '0', '-1', '3.5', '3abc', 'Infinity', 'NaN', '9007199254740992']) {
        assert.equal(setup({ stopFloor: value }).run('autoStopFloor'), 0);
    }
});

test('applying a reached floor pauses without discarding the pending event', () => {
    const game = setup({ stopFloor: '0', floor: 3, room: 1 });
    const eventButton = game.elements.get('#choice1');
    game.run('dungeon.status.event = true; currentEvent = "treasure"; dungeon.status.exploring = false');
    game.run('setAutoStopFloor(3); stopAutoModeAtFloor()');
    assert.equal(game.run('autoMode'), false);
    assert.equal(game.run('dungeon.status.paused'), true);
    assert.equal(game.run('dungeon.status.event'), true);
    assert.equal(game.run('currentEvent'), 'treasure');
    assert.equal(game.elements.get('#choice1'), eventButton);
});

test('Auto Mode settings restore and apply the floor preference', () => {
    const game = setup({ stopFloor: '9', floor: 4, room: 1 });
    game.context.menuModalElement = createElement();
    game.context.defaultModalElement = createElement();
    game.context.MAX_EQUIPMENT_LEVEL = 100;
    game.context.applyTranslations = () => {};
    // Run the modal itself without opening the rest of the menu.
    const modalSource = mainSource.slice(
        mainSource.indexOf('window.renderAutoModeSettingsModal = function'),
        mainSource.indexOf('// Opens auto mode settings'),
    );
    vm.runInContext(modalSource, game.context);
    game.context.window.renderAutoModeSettingsModal(false);
    assert.match(game.context.defaultModalElement.innerHTML, /id="auto-stop-floor-input"[^>]*value="9"/);
    const input = game.elements.get('#auto-stop-floor-input');
    const apply = game.elements.get('#apply-auto');
    input.value = '4';
    input.checkValidity = () => true;
    game.elements.get('#auto-mode-toggle').checked = true;
    apply.onclick();
    assert.equal(game.storage.get('autoStopFloor'), '4');
    assert.equal(game.run('autoMode'), false);
    assert.equal(game.run('dungeon.status.paused'), true);

    let validationShown = false;
    input.value = '-1';
    input.checkValidity = () => false;
    input.reportValidity = () => { validationShown = true; };
    apply.onclick();
    assert.equal(validationShown, true);
    assert.equal(game.storage.get('autoStopFloor'), '4');
});

test('every supported locale includes the stop-floor setting', () => {
    for (const file of fs.readdirSync(path.join(root, 'assets/locales'))) {
        const locale = JSON.parse(fs.readFileSync(path.join(root, 'assets/locales', file), 'utf8'));
        const key = 'auto-mode-stop-floor';
        assert.equal(typeof locale[key], 'string', `${file}: ${key}`);
        assert.ok(locale[key].trim());
    }
});
