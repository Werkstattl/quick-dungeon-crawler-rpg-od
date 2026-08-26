const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const combatSource = fs.readFileSync(path.join(root, 'assets/js/combat.js'), 'utf8');
const styleSource = fs.readFileSync(path.join(root, 'assets/css/style.css'), 'utf8');

const createButton = () => {
    const classes = new Set();
    return {
        attributes: {},
        disabled: false,
        textContent: '',
        title: '',
        classList: {
            toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
            contains: (name) => classes.has(name),
        },
        setAttribute(name, value) {
            this.attributes[name] = value;
        },
        removeAttribute(name) {
            delete this.attributes[name];
        },
    };
};

test('manual special ability input queues and runs before Auto Attack', () => {
    const attackButton = createButton();
    const specialButton = createButton();
    const scheduledDelays = [];
    let specialSoundCount = 0;
    const context = vm.createContext({
        autoAttack: true,
        autoMode: false,
        document: {
            addEventListener() {},
            getElementById: () => null,
            querySelector: (selector) => {
                if (selector === '#combatPanel') return {};
                if (selector === '#player-attack-btn') return attackButton;
                if (selector === '#special-ability-btn') return specialButton;
                return null;
            },
        },
        performance: { now: () => 0 },
        player: {
            inCombat: true,
            name: 'Scout',
            selectedClass: 'Scout',
            stats: { atkSpd: 1 },
        },
        sfxUnpause: { play: () => specialSoundCount++ },
        t: (key) => ({
            attack: 'Attack',
            cooling: 'Cooling',
            'special-ability-scout': 'Tumble',
            'special-ability-queued': 'Queued',
            'special-ability-scout-dodge': 'Dodge prepared',
        }[key] || key),
        setTimeout: (_callback, delay) => {
            scheduledDelays.push(delay);
            return scheduledDelays.length;
        },
        clearTimeout() {},
        setInterval: () => 1,
        clearInterval() {},
        window: {},
    });

    vm.runInContext(combatSource, context);
    vm.runInContext('useSpecialAbility()', context);

    assert.equal(vm.runInContext('specialAbilityQueued', context), true);
    assert.equal(specialButton.disabled, false);
    assert.equal(specialButton.classList.contains('is-queued'), true);
    assert.equal(specialButton.textContent, 'Tumble (Queued)');
    assert.equal(specialButton.attributes['aria-label'], 'Tumble: Queued');

    vm.runInContext('setPlayerAttackReady(true)', context);

    assert.equal(vm.runInContext('specialAbilityQueued', context), false);
    assert.equal(vm.runInContext('specialAbilityCooldown', context), true);
    assert.equal(vm.runInContext('scoutDodgeReady', context), true);
    assert.equal(specialSoundCount, 1);
    assert.equal(specialButton.disabled, true);
    assert.equal(specialButton.classList.contains('is-cooldown'), true);
    assert.equal(scheduledDelays.includes(200), false);
});

test('special ability control provides stable touch and keyboard affordances', () => {
    assert.match(combatSource, /id="special-ability-btn" type="button"/);
    assert.match(styleSource, /#special-ability-btn\s*\{[\s\S]*?width:\s*100%;[\s\S]*?min-height:\s*3\.25rem;/);
    assert.match(styleSource, /#special-ability-btn\.is-ready/);
    assert.match(styleSource, /#special-ability-btn\.is-queued/);
    assert.match(styleSource, /#special-ability-btn\.is-cooldown/);
    assert.match(styleSource, /#special-ability-btn:focus-visible/);
});

test('queued special ability state is translated in every locale', () => {
    const localeDirectory = path.join(root, 'assets/locales');
    const localeFiles = fs.readdirSync(localeDirectory).filter((file) => file.endsWith('.json'));

    assert.equal(localeFiles.length, 20);
    for (const localeFile of localeFiles) {
        const locale = JSON.parse(fs.readFileSync(path.join(localeDirectory, localeFile), 'utf8'));
        assert.equal(typeof locale['special-ability-queued'], 'string', localeFile);
        assert.notEqual(locale['special-ability-queued'].trim(), '', localeFile);
    }
});
