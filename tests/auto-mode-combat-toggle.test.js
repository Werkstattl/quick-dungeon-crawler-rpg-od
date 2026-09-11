const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const autoModeSource = fs.readFileSync(path.join(root, 'assets/js/automode.js'), 'utf8');
const combatSource = fs.readFileSync(path.join(root, 'assets/js/combat.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const createButton = () => {
    const classes = new Set();
    return {
        attributes: {},
        classList: {
            add: (name) => classes.add(name),
            remove: (name) => classes.delete(name),
            toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
            contains: (name) => classes.has(name),
        },
        setAttribute(name, value) {
            this.attributes[name] = value;
        },
        addEventListener() {},
    };
};

test('auto mode can be disabled during combat and synchronizes both controls', () => {
    const dungeonButton = createButton();
    const combatButton = createButton();
    let delayedAutoAction = null;
    let claimClicks = 0;
    const storage = new Map([
        ['autoMode', 'true'],
        ['autoModeBtnVisible', 'true'],
    ]);
    const context = vm.createContext({
        document: {
            querySelector: (selector) => {
                if (selector === '#auto-mode-btn') return dungeonButton;
                if (selector === '#combat-auto-mode-btn') return combatButton;
                if (selector === '#battleButton') {
                    return { click: () => claimClicks++ };
                }
                return null;
            },
        },
        dungeon: { status: { paused: false } },
        localStorage: {
            getItem: (key) => storage.has(key) ? storage.get(key) : null,
            setItem: (key, value) => storage.set(key, String(value)),
        },
        sfxPause: { play() {} },
        sfxUnpause: { play() {} },
        setTimeout: (callback) => {
            delayedAutoAction = callback;
        },
        window: {},
    });

    vm.runInContext(autoModeSource, context);

    assert.equal(dungeonButton.classList.contains('active'), true);
    assert.equal(combatButton.classList.contains('active'), true);

    vm.runInContext('autoClaim()', context);
    context.window.setAutoModeEnabled(false);
    delayedAutoAction();

    assert.equal(storage.get('autoMode'), 'false');
    assert.equal(claimClicks, 0);
    assert.equal(dungeonButton.classList.contains('active'), false);
    assert.equal(combatButton.classList.contains('active'), false);
    assert.equal(dungeonButton.attributes['aria-pressed'], 'false');
    assert.equal(combatButton.attributes['aria-pressed'], 'false');
});

test('combat Auto Mode button uses the shared toggle and respects feature visibility', () => {
    assert.match(combatSource, /id="combat-auto-mode-btn"/);
    assert.match(combatSource, /window\.toggleAutoMode\(\)/);
    assert.match(combatSource, /autoModeUnlocked[\s\S]*autoModeBtnVisible/);
});

test('combat Auto Mode button is compact and rendered with the attack controls', () => {
    const attackControlsIndex = combatSource.indexOf('<div class="attack-controls">');
    const autoModeControlIndex = combatSource.indexOf('${combatAutoModeControl}');
    const specialAbilityIndex = combatSource.indexOf('<button id="special-ability-btn"');

    assert.ok(attackControlsIndex >= 0);
    assert.ok(autoModeControlIndex > attackControlsIndex);
    assert.ok(autoModeControlIndex < specialAbilityIndex);
    assert.match(combatSource, /id="combat-auto-mode-btn"[\s\S]*<span class="sr-only"/);
    assert.doesNotMatch(combatSource, /class="combat-auto-mode-controls"/);
});

test('Auto Mode settings shortcut remains hidden while Auto Mode is locked', () => {
    const dungeonButton = createButton();
    const settingsShortcut = createButton();
    const context = vm.createContext({
        document: {
            querySelector: (selector) => {
                if (selector === '#auto-mode-btn') return dungeonButton;
                if (selector === '#auto-mode-settings-btn') return settingsShortcut;
                return null;
            },
        },
        dungeon: { status: { paused: false } },
        localStorage: {
            getItem: () => null,
            setItem() {},
        },
        sfxPause: { play() {} },
        sfxUnpause: { play() {} },
        window: {},
    });

    vm.runInContext(autoModeSource, context);

    assert.equal(settingsShortcut.classList.contains('hidden'), true);
});

test('Auto Mode settings shortcut remains hidden when the Auto button is hidden', () => {
    const dungeonButton = createButton();
    const settingsShortcut = createButton();
    const storage = new Map([
        ['autoMode', 'false'],
        ['autoModeBtnVisible', 'false'],
    ]);
    const context = vm.createContext({
        document: {
            querySelector: (selector) => {
                if (selector === '#auto-mode-btn') return dungeonButton;
                if (selector === '#auto-mode-settings-btn') return settingsShortcut;
                return null;
            },
        },
        dungeon: { status: { paused: false } },
        localStorage: {
            getItem: (key) => storage.has(key) ? storage.get(key) : null,
            setItem: (key, value) => storage.set(key, String(value)),
        },
        sfxPause: { play() {} },
        sfxUnpause: { play() {} },
        window: {},
    });

    vm.runInContext(autoModeSource, context);

    assert.equal(dungeonButton.classList.contains('hidden'), true);
    assert.equal(settingsShortcut.classList.contains('hidden'), true);
});

test('Auto Mode settings shortcut opens settings directly when the Auto button is visible', () => {
    assert.match(indexSource, /<button id="auto-mode-settings-btn"[^>]*>[\s\S]*?<span data-i18n="auto-mode">Auto Mode<\/span> <span data-i18n="settings">Settings<\/span><\/span><\/button>/);

    const dungeonButton = createButton();
    const settingsShortcut = createButton();
    let shortcutClick = null;
    let menuOpenCount = 0;
    const settingsOrigins = [];
    settingsShortcut.addEventListener = (event, callback) => {
        if (event === 'click') shortcutClick = callback;
    };

    const storage = new Map([
        ['autoMode', 'false'],
        ['autoModeBtnVisible', 'true'],
    ]);
    const context = vm.createContext({
        document: {
            querySelector: (selector) => {
                if (selector === '#auto-mode-btn') return dungeonButton;
                if (selector === '#auto-mode-settings-btn') return settingsShortcut;
                return null;
            },
        },
        dungeon: { status: { paused: false } },
        localStorage: {
            getItem: (key) => storage.has(key) ? storage.get(key) : null,
            setItem: (key, value) => storage.set(key, String(value)),
        },
        openMenu: () => menuOpenCount++,
        sfxPause: { play() {} },
        sfxUnpause: { play() {} },
        window: {
            renderAutoModeSettingsModal: (returnToMenu) => settingsOrigins.push(returnToMenu),
        },
    });

    vm.runInContext(autoModeSource, context);

    assert.equal(dungeonButton.classList.contains('hidden'), false);
    assert.equal(settingsShortcut.classList.contains('hidden'), false);
    assert.equal(typeof shortcutClick, 'function');

    shortcutClick();

    assert.equal(menuOpenCount, 1);
    assert.deepEqual(settingsOrigins, [false]);
});

test('closing Auto Mode settings opened from the shortcut returns to the game', () => {
    const dungeonButton = createButton();
    const settingsShortcut = createButton();
    const defaultModalElement = { style: { display: 'flex' }, innerHTML: 'settings' };
    const menuModalElement = { style: { display: 'none' }, innerHTML: 'menu' };
    const dungeonElement = { style: { display: 'flex', filter: 'brightness(50%)' } };
    const titleElement = { style: { display: 'none', filter: '' } };
    let continueCount = 0;
    const storage = new Map([
        ['autoMode', 'false'],
        ['autoModeBtnVisible', 'true'],
    ]);
    const context = vm.createContext({
        defaultModalElement,
        menuModalElement,
        document: {
            querySelector: (selector) => {
                if (selector === '#auto-mode-btn') return dungeonButton;
                if (selector === '#auto-mode-settings-btn') return settingsShortcut;
                if (selector === '#dungeon-main') return dungeonElement;
                if (selector === '#title-screen') return titleElement;
                return null;
            },
        },
        localStorage: {
            getItem: (key) => storage.has(key) ? storage.get(key) : null,
            setItem: (key, value) => storage.set(key, String(value)),
        },
        continueExploring: () => continueCount++,
        sfxPause: { play() {} },
        sfxUnpause: { play() {} },
        window: {
            getComputedStyle: (element) => element.style,
        },
    });

    vm.runInContext(autoModeSource, context);
    context.window.closeAutoModeSettingsModal(false);

    assert.equal(defaultModalElement.style.display, 'none');
    assert.equal(defaultModalElement.innerHTML, '');
    assert.equal(menuModalElement.style.display, 'none');
    assert.equal(menuModalElement.innerHTML, '');
    assert.equal(dungeonElement.style.filter, 'brightness(100%)');
    assert.equal(continueCount, 1);
});
