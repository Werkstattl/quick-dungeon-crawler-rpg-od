const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = name => fs.readFileSync(path.join(root, 'assets/js', name), 'utf8');

function setup({ preference = 'true', enabled = true, random = 0 } = {}) {
    const storage = new Map([
        ['autoModePermanentUnlocked', 'true'],
        ['autoModeBtnVisible', 'true'],
        ['autoMode', String(enabled)],
        ['autoStopFloor', '0'],
        ['autoStopNewPet', preference],
    ]);
    const elements = new Map();
    const pending = [];
    let automaticClicks = 0;
    const getElement = selector => {
        if (!elements.has(selector)) {
            const classes = new Set();
            elements.set(selector, {
                style: {}, attributes: {}, children: [], checked: false,
                classList: {
                    add: name => classes.add(name),
                    remove: name => classes.delete(name),
                    toggle: (name, on) => on ? classes.add(name) : classes.delete(name),
                    contains: name => classes.has(name),
                },
                setAttribute(name, value) { this.attributes[name] = value; },
                removeAttribute(name) { delete this.attributes[name]; },
                addEventListener() {},
                querySelectorAll: () => [],
                appendChild(child) { this.children.push(child); },
                checkValidity: () => true,
                click: () => automaticClicks++,
            });
        }
        return elements.get(selector);
    };
    const context = vm.createContext({
        document: {
            querySelector: getElement,
            getElementById: id => getElement(`#${id}`),
            createElement: () => getElement(Symbol()),
            querySelectorAll: () => [],
        },
        localStorage: {
            getItem: key => storage.get(key) ?? null,
            setItem: (key, value) => storage.set(key, String(value)),
        },
        window: { getComputedStyle: element => element.style },
        player: { stats: { hp: 100, hpMax: 100 }, selectedCurseLevel: 1 },
        MIN_CURSE_LEVEL: 1, MAX_STANDARD_CURSE_LEVEL: 10,
        MAX_EQUIPMENT_LEVEL: 100,
        sfxPause: { play() {} }, sfxUnpause: { play() {} },
        sfxOpen: { play() {} }, sfxDecline: { play() {} }, sfxConfirm: { play() {} },
        t: key => key, nFormatter: String,
        applyTranslations() {}, addDungeonLog() {},
        continueExploring() {},
        setTimeout: callback => pending.push(callback),
        Math: Object.assign(Object.create(Math), { random: () => random }),
        defaultModalElement: getElement('#defaultModal'),
        menuModalElement: getElement('#menuModal'),
    });
    for (const name of ['automode.js', 'dungeon.js', 'companion.js']) {
        vm.runInContext(source(name), context);
    }
    const run = code => vm.runInContext(code, context);
    run('dungeon.status.paused = false; dungeon.status.exploring = true');
    return { context, storage, getElement, run, pending, clicks: () => automaticClicks };
}

test('finding a new pet stops Auto Mode, cancels queued actions and allows summoning', () => {
    const game = setup();
    game.run('autoConfirm(); autoDecline(); autoClaim(); findCompanionAfterCombat(10)');
    assert.equal(game.run('playerCompanions.length'), 1);
    assert.equal(JSON.parse(game.storage.get('playerCompanions')).length, 1);
    assert.equal(game.storage.get('autoMode'), 'false');
    assert.equal(game.run('dungeon.status.paused'), true);
    assert.equal(game.run('dungeon.status.exploring'), false);
    assert.equal(game.run('dungeon.status.event'), false);
    for (const selector of ['#auto-mode-btn', '#combat-auto-mode-btn']) {
        assert.equal(game.getElement(selector).attributes['aria-pressed'], 'false');
        assert.equal(game.getElement(selector).classList.contains('active'), false);
    }
    game.pending.forEach(callback => callback());
    assert.equal(game.clicks(), 0);

    const summon = game.getElement('#summon-companion');
    assert.equal(summon.classList.contains('hidden'), false);
    summon.onclick();
    assert.equal(game.getElement('#companionModal').style.display, 'flex');
    game.getElement('#available-companions').children[0].onclick();
    assert.equal(game.run('activeCompanion.id'), 1);
    assert.equal(game.run('activeCompanion.isActive'), true);
    assert.equal(game.run('dungeon.status.paused'), true, 'summoning must leave exploration paused');
});

test('disabled or unset preference leaves Auto Mode running after discovery', () => {
    for (const preference of ['false', null]) {
        const game = setup({ preference });
        game.run('findCompanionAfterCombat(10)');
        assert.equal(game.run('playerCompanions.length'), 1);
        assert.equal(game.run('autoMode'), true);
        assert.equal(game.run('dungeon.status.paused'), false);
    }
});

test('manual exploration and unsuccessful discoveries do not pause', () => {
    const manual = setup({ enabled: false });
    manual.run('findCompanionAfterCombat(10)');
    assert.equal(manual.run('playerCompanions.length'), 1);
    assert.equal(manual.run('dungeon.status.paused'), false);

    const noDrop = setup({ random: 0.99 });
    noDrop.run('findCompanionAfterCombat(10)');
    assert.equal(noDrop.run('playerCompanions.length'), 0);
    assert.equal(noDrop.run('autoMode'), true);
    assert.equal(noDrop.run('dungeon.status.paused'), false);
});

test('owned pets, evolved lines and starting grants do not trigger the stop', () => {
    for (const id of [1, 6]) {
        const game = setup();
        game.run(`giveCompanion(${id}); findCompanionAfterCombat(10)`);
        assert.equal(game.run('playerCompanions.length'), 1);
        assert.equal(game.run('autoMode'), true);
        assert.equal(game.run('dungeon.status.paused'), false);
    }
    const game = setup();
    game.run('grantStartingCompanions()');
    assert.equal(game.run('autoMode'), true);
    assert.equal(game.run('dungeon.status.paused'), false);
});

test('discovering a pet while already paused keeps exploration paused', () => {
    const game = setup();
    game.run('dungeonStartPause(); findCompanionAfterCombat(10)');
    assert.equal(game.run('autoMode'), false);
    assert.equal(game.run('dungeon.status.paused'), true);
});

test('settings restore, apply and persist the new-pet preference', () => {
    const game = setup();
    const main = source('main.js');
    vm.runInContext(main.slice(
        main.indexOf('window.renderAutoModeSettingsModal = function'),
        main.indexOf('// Opens auto mode settings'),
    ), game.context);
    game.context.window.renderAutoModeSettingsModal(false);
    assert.match(game.context.defaultModalElement.innerHTML, /id="auto-new-pet-toggle" checked/);
    game.getElement('#auto-mode-toggle').checked = true;
    game.getElement('#auto-new-pet-toggle').checked = false;
    game.getElement('#apply-auto').onclick();
    assert.equal(game.storage.get('autoStopNewPet'), 'false');
    assert.equal(setup({ preference: game.storage.get('autoStopNewPet') }).run('autoStopNewPet'), false);

    game.context.window.renderAutoModeSettingsModal(false);
    assert.doesNotMatch(game.context.defaultModalElement.innerHTML, /id="auto-new-pet-toggle" checked/);
    game.getElement('#auto-new-pet-toggle').checked = true;
    game.getElement('#apply-auto').onclick();
    assert.equal(game.storage.get('autoStopNewPet'), 'true');
    assert.equal(setup({ preference: game.storage.get('autoStopNewPet') }).run('autoStopNewPet'), true);
});

test('all supported languages include the new-pet setting', () => {
    for (const file of fs.readdirSync(path.join(root, 'assets/locales'))) {
        const locale = JSON.parse(fs.readFileSync(path.join(root, 'assets/locales', file), 'utf8'));
        assert.ok(locale['auto-mode-new-pet']?.trim(), file);
    }
});
