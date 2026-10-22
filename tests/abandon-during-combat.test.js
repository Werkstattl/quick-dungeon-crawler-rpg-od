const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const mainSource = fs.readFileSync(path.join(root, 'assets/js/main.js'), 'utf8');
const combatSource = fs.readFileSync(path.join(root, 'assets/js/combat.js'), 'utf8');
const menuSource = mainSource.slice(
    mainSource.indexOf('const isRunAbandonBlockedByCombat ='),
    mainSource.indexOf('// Loading Screen'),
);

function createMenu({ inCombat = false, panelOpen = false, hardcore = false, corner = false } = {}) {
    const elements = new Map();
    const element = (selector) => {
        if (!elements.has(selector)) {
            elements.set(selector, { style: { display: 'none' }, disabled: false, innerHTML: '' });
        }
        return elements.get(selector);
    };
    const quit = element('#quit-run');
    const confirm = element('#confirm-quit-run');
    const panel = element('#combatPanel');
    panel.style.display = panelOpen ? 'flex' : 'none';
    panel.className = corner ? 'combat-corner' : '';
    const menuModal = element('#menuModal');
    const defaultModal = element('#defaultModal');
    defaultModal.querySelector = selector => element(selector);
    const calls = { reset: 0, title: 0, confirmSound: 0 };
    const context = vm.createContext({
        player: { name: 'Hero', inCombat, hardcore, stats: { hp: 10 } },
        dungeon: { status: { exploring: false, event: inCombat } },
        combatPanel: panel,
        menuModalElement: menuModal,
        defaultModalElement: defaultModal,
        document: {
            querySelector: selector => selector === '#menuModal #quit-run' ? quit : element(selector),
        },
        window: { getComputedStyle: node => node.style },
        closeInventory() {}, applyTranslations() {}, openPlayerProfile() {},
        sfxOpen: { play() {} }, sfxDecline: { play() {} },
        sfxConfirm: { play: () => calls.confirmSound++ },
        bgmDungeon: { stop() {}, play() {} },
        t: key => key,
        dungeonTimer: 1, playTimer: 2, clearInterval() {},
        progressReset: () => calls.reset++,
        runLoad: () => calls.title++,
    });
    vm.runInContext(menuSource, context);
    vm.runInContext('openMenu()', context);
    return { context, calls, quit, confirm, panel, menuModal, defaultModal };
}

test('abandon is disabled and its handler rejects active fights in both HUDs and game modes', () => {
    for (const hardcore of [false, true]) {
        for (const corner of [false, true]) {
            const state = createMenu({ inCombat: true, panelOpen: true, hardcore, corner });
            assert.equal(state.quit.disabled, true);
            // A direct handler call must not bypass the disabled button.
            state.quit.onclick();
            assert.equal(state.defaultModal.style.display, 'none');
            assert.equal(state.context.player.inCombat, true);
            assert.equal(state.calls.reset, 0);
            assert.equal(state.calls.title, 0);
        }
    }
});

test('the combat flag also blocks abandon before the panel becomes visible', () => {
    const state = createMenu({ inCombat: true });
    assert.equal(state.quit.disabled, true);
    state.quit.onclick();
    assert.equal(state.calls.reset, 0);
});

test('abandon stays disabled while loot or the Hardcore death result is pending', () => {
    for (const hp of [0, 10]) {
        const state = createMenu({ panelOpen: true, hardcore: true });
        state.context.player.stats.hp = hp;
        assert.equal(state.quit.disabled, true);
        state.quit.onclick();
        assert.equal(state.defaultModal.style.display, 'none');
        assert.equal(state.calls.reset, 0);
    }
});

test('abandon outside combat opens and executes the actual confirmation button', () => {
    const state = createMenu();
    assert.equal(state.quit.disabled, false);
    state.quit.onclick();
    assert.equal(state.defaultModal.style.display, 'flex');
    assert.match(state.defaultModal.innerHTML, /id="confirm-quit-run"/);
    state.confirm.onclick();
    assert.equal(state.calls.reset, 1);
    assert.equal(state.calls.title, 1);
    assert.equal(state.calls.confirmSound, 1);
});

test('a stale confirmation cannot abandon a newly started fight or pending result', () => {
    for (const inCombat of [false, true]) {
        const state = createMenu();
        state.quit.onclick();
        state.context.player.inCombat = inCombat;
        state.panel.style.display = 'flex';
        state.confirm.onclick();
        assert.equal(state.calls.reset, 0);
        assert.equal(state.calls.title, 0);
        assert.equal(state.calls.confirmSound, 0);
    }
});

test('claiming loot re-enables abandon in a menu that was already open', () => {
    const state = createMenu({ panelOpen: true });
    Object.assign(state.context, {
        enemy: { condition: null, lvl: 1 },
        combatBacklog: ['victory'],
        findCompanionAfterCombat() {},
    });
    vm.runInContext(combatSource.slice(
        combatSource.indexOf('const handleClaimButtonClick ='),
        combatSource.indexOf('const bindClaimButton ='),
    ), state.context);
    vm.runInContext('handleClaimButtonClick()', state.context);
    assert.equal(state.panel.style.display, 'none');
    assert.equal(state.quit.disabled, false);
    state.quit.onclick();
    state.confirm.onclick();
    assert.equal(state.calls.reset, 1);
});
