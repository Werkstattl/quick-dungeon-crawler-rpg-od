const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets/js/automode.js'), 'utf8');
const dungeonSource = fs.readFileSync(path.join(root, 'assets/js/dungeon.js'), 'utf8');

function setup(route) {
    const storage = new Map([['autoMode', 'true'], ['autoModeBtnVisible', 'true'], ['autoRoute', route]]);
    const buttons = new Map();
    const pending = [];
    const selected = [];
    const context = vm.createContext({
        localStorage: {
            getItem: key => storage.get(key) ?? null,
            setItem: (key, value) => storage.set(key, String(value)),
        },
        document: { querySelector: selector => buttons.get(selector) || null },
        setTimeout: callback => pending.push(callback),
        window: {},
        currentEvent: null,
        dungeon: { progress: { floor: 3 }, status: {} },
        sfxConfirm: { play() {} },
        ensureRouteChoiceState() { context.dungeon.routeChoice ||= {}; },
        t: key => key,
        addDungeonLog(message, markup) {
            if (!markup) return selected.push(message);
            for (const match of markup.matchAll(/id="(choice\d)" data-route="([^"]+)"/g)) {
                const button = { click() { this.onclick(); } };
                buttons.set(`#${match[1]}`, button);
                buttons.set(`.route-choice-panel [data-route="${match[2]}"]`, button);
            }
        },
    });
    buttons.set('#auto-mode-btn', {
        classList: { add() {}, remove() {}, toggle() {} },
        setAttribute() {}, addEventListener() {},
    });
    vm.runInContext(source, context);
    const events = dungeonSource.slice(dungeonSource.indexOf('const selectDungeonRoute ='), dungeonSource.indexOf('const dungeonEvent ='));
    vm.runInContext('const DUNGEON_ROUTE_KEYS = ["balanced", "spoils", "sanctuary", "descent"];\n' + events, context);
    return { context, storage, buttons, pending, selected };
}

for (const route of ['balanced', 'spoils', 'sanctuary', 'descent']) {
    test(`auto mode selects the ${route} path through its real event handler`, () => {
        const { context, pending } = setup(route);
        vm.runInContext('showRouteChoiceEvent()', context);
        pending.shift()();
        assert.equal(context.dungeon.routeChoice.selected, route);
        assert.equal(context.dungeon.routeChoice.floor, 3);
        assert.equal(context.dungeon.status.event, false);
        assert.equal(context.currentEvent, null);
    });
}

test('path preference defaults safely and persists across reloads', () => {
    const { context, storage } = setup('invalid');
    assert.equal(vm.runInContext('autoRoute', context), 'balanced');
    vm.runInContext('setAutoRoute("descent")', context);
    assert.equal(storage.get('autoRoute'), 'descent');
    assert.equal(vm.runInContext('autoRoute', setup(storage.get('autoRoute')).context), 'descent');
    vm.runInContext('setAutoRoute(null)', context);
    assert.equal(storage.get('autoRoute'), 'balanced');
    assert.equal(vm.runInContext('autoRoute', setup(null).context), 'balanced');
});

test('other events still confirm their first choice', () => {
    const { context, buttons, pending } = setup('descent');
    let clicks = 0;
    buttons.set('#choice1', { click: () => clicks++ });
    context.currentEvent = 'treasure';
    vm.runInContext('autoConfirm()', context);
    pending.shift()();
    assert.equal(clicks, 1);
});

for (const setting of ['autoMode', 'autoEngage']) {
    test(`disabling ${setting} cancels a pending path selection`, () => {
        const { context, pending } = setup('spoils');
        vm.runInContext('showRouteChoiceEvent()', context);
        vm.runInContext(`${setting} = false`, context);
        pending.shift()();
        assert.equal(context.dungeon.routeChoice, undefined);
    });
}
