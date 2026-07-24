const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const autoModeSource = fs.readFileSync(path.join(root, 'assets/js/automode.js'), 'utf8');
const combatSource = fs.readFileSync(path.join(root, 'assets/js/combat.js'), 'utf8');

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
