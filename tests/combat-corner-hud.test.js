const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const combatSource = fs.readFileSync(path.join(root, 'assets/js/combat.js'), 'utf8');
const styleSource = fs.readFileSync(path.join(root, 'assets/css/style.css'), 'utf8');

function loadCombatHud({ cornerToggle }) {
    const panelClasses = new Set();
    const combatPanelStub = {
        classList: {
            toggle: (name, enabled) => (enabled ? panelClasses.add(name) : panelClasses.delete(name)),
            contains: (name) => panelClasses.has(name),
        },
    };
    const dungeonMainStub = { style: {} };
    const context = vm.createContext({
        document: {
            addEventListener() {},
            getElementById: () => null,
            querySelector: (selector) => {
                if (selector === '#combatPanel') return combatPanelStub;
                if (selector === '#dungeon-main') return dungeonMainStub;
                return null;
            },
        },
        performance: { now: () => 0 },
        player: null,
        t: (key) => key,
        setTimeout: () => 0,
        clearTimeout() {},
        setInterval: () => 0,
        clearInterval() {},
    });
    if (cornerToggle !== undefined) {
        context.combatCornerHudToggle = cornerToggle;
    }
    const harness = `
        globalThis._applyCombatHudLayout = applyCombatHudLayout;
        globalThis._isCombatCornerHudEnabled = isCombatCornerHudEnabled;
    `;
    vm.runInContext(combatSource + harness, context);
    return {
        apply: () => context._applyCombatHudLayout(),
        enabled: () => context._isCombatCornerHudEnabled(),
        hasCornerClass: () => panelClasses.has('combat-corner'),
        dungeonFilter: () => dungeonMainStub.style.filter,
        setToggle: (value) => {
            if (value === undefined) {
                delete context.combatCornerHudToggle;
            } else {
                context.combatCornerHudToggle = value;
            }
        },
    };
}

test('corner HUD toggle missing or false keeps the classic overlay and dimmed dungeon', () => {
    const hud = loadCombatHud({ cornerToggle: undefined });
    assert.equal(hud.enabled(), false);
    assert.equal(hud.apply(), false);
    assert.equal(hud.hasCornerClass(), false);
    assert.equal(hud.dungeonFilter(), 'brightness(50%)');

    hud.setToggle(false);
    assert.equal(hud.apply(), false);
    assert.equal(hud.hasCornerClass(), false);
    assert.equal(hud.dungeonFilter(), 'brightness(50%)');
});

test('corner HUD enabled dresses the combat panel and leaves the dungeon undimmed', () => {
    const hud = loadCombatHud({ cornerToggle: true });
    assert.equal(hud.enabled(), true);
    assert.equal(hud.apply(), true);
    assert.equal(hud.hasCornerClass(), true);
    assert.equal(hud.dungeonFilter(), 'brightness(100%)');
});

test('tipping the setting mid-fight re-dresses without stale state', () => {
    const hud = loadCombatHud({ cornerToggle: true });
    hud.apply();
    hud.setToggle(false);
    assert.equal(hud.apply(), false);
    assert.equal(hud.hasCornerClass(), false);
    assert.equal(hud.dungeonFilter(), 'brightness(50%)');
});

test('startCombat routes the dim through the corner-aware layout helper', () => {
    assert.match(combatSource, /applyCombatHudLayout\(\);/);
    const startCombatBody = combatSource.slice(
        combatSource.indexOf('const startCombat'),
        combatSource.indexOf('const endCombat'),
    );
    assert.ok(startCombatBody, 'startCombat not found');
    assert.doesNotMatch(
        startCombatBody,
        /dungeon-main[\s\S]{0,80}brightness\(50%\)/,
        'startCombat must not hardcode the dungeon dimming anymore',
    );
});

test('corner HUD CSS ships the floating card rules', () => {
    assert.match(styleSource, /#combatPanel\.combat-corner\s*\{[^}]*pointer-events:\s*none/);
    assert.match(styleSource, /#combatPanel\.combat-corner \.content\s*\{[^}]*pointer-events:\s*auto/);
    assert.match(styleSource, /#combatPanel\.combat-corner \.content\s*\{[^}]*background-color:\s*#161211/);
    assert.match(styleSource, /#combatPanel\.combat-corner \.bb-xb\s*\{[^}]*display:\s*none/);
});
