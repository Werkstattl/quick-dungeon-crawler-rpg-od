const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const affixSource = fs.readFileSync(path.join(root, 'assets/js/affixes.js'), 'utf8');
const localesDir = path.join(root, 'assets/locales');

const createAffixContext = () => {
    const context = vm.createContext({});
    vm.runInContext(affixSource, context);
    return context;
};

const evaluateAffixes = (expression) => vm.runInContext(expression, createAffixContext());

// Arrays built inside the vm realm have a foreign prototype, so deepEqual needs host copies.
const toHostArray = (value) => Array.from(value);

// Deterministic stand-in for Math.random so roll outcomes are assertable.
const sequenceRandom = (values) => {
    let index = 0;
    return () => {
        const value = values[index % values.length];
        index++;
        return value;
    };
};

const rollWith = (context, condition, curseLevel, floor, values) => {
    context.__values = values;
    context.__sequenceRandom = sequenceRandom;
    return toHostArray(vm.runInContext(
        `rollEnemyAffixes(${JSON.stringify(condition)}, ${curseLevel}, ${floor}, __sequenceRandom(__values))`,
        context,
    ));
};

const affixIds = () => toHostArray(evaluateAffixes('ENEMY_AFFIXES.map((affix) => affix.id)'));

test('every affix has a unique id and a known behavior', () => {
    const ids = affixIds();
    assert.ok(ids.length > 0, 'expected at least one affix');
    assert.equal(new Set(ids).size, ids.length, 'affix ids must be unique');

    const behaviors = toHostArray(evaluateAffixes('ENEMY_AFFIXES.map((affix) => affix.behavior)'));
    const allowed = new Set([null, 'regen', 'thorns', 'volatile']);
    for (const behavior of behaviors) {
        assert.ok(allowed.has(behavior), `unexpected affix behavior: ${behavior}`);
    }
});

test('mimic encounters never roll affixes', () => {
    const context = createAffixContext();
    for (const condition of ['chest', 'door']) {
        const rolled = rollWith(context, condition, 15, 50, [0]);
        assert.deepEqual(rolled, [], `${condition} should not roll affixes`);
    }
});

// Regular encounters call generateRandomEnemy() with no argument, so undefined must roll.
test('an omitted condition is treated as a plain enemy', () => {
    const context = createAffixContext();
    context.__sequenceRandom = sequenceRandom;
    context.__values = [0];
    const rolled = toHostArray(vm.runInContext(
        'rollEnemyAffixes(undefined, 1, 10, __sequenceRandom(__values))',
        context,
    ));
    assert.equal(rolled.length, 1, 'undefined condition should roll like a base enemy');
});

test('the regular encounter path can produce affixed enemies', () => {
    const dungeonSource = fs.readFileSync(path.join(root, 'assets/js/dungeon.js'), 'utf8');
    // Guards the exact call that regressed: a bare generateRandomEnemy() must still roll affixes.
    assert.match(dungeonSource, /generateRandomEnemy\(\);/);

    const context = createAffixContext();
    let affixed = 0;
    for (let attempt = 0; attempt < 500; attempt++) {
        const rolled = toHostArray(vm.runInContext('rollEnemyAffixes(undefined, 10, 20)', context));
        if (rolled.length > 0) {
            affixed++;
        }
    }
    assert.ok(affixed > 0, 'plain encounters never rolled an affix');
});

test('base enemies stay clean on floor 1 regardless of curse level', () => {
    const context = createAffixContext();
    const rolled = rollWith(context, 'base', 15, 1, [0]);
    assert.deepEqual(rolled, []);
});

test('base enemies roll at most one affix below the second-affix curse level', () => {
    const context = createAffixContext();
    // A roll of 0 always clears the chance gate, so this isolates the count cap.
    const rolled = rollWith(context, 'base', 1, 10, [0]);
    assert.equal(rolled.length, 1);
});

test('base enemies can roll two affixes at high curse levels', () => {
    const context = createAffixContext();
    const rolled = rollWith(context, 'base', 8, 10, [0]);
    assert.equal(rolled.length, 2);
});

test('base enemies roll no affixes when the chance gate fails', () => {
    const context = createAffixContext();
    const rolled = rollWith(context, 'base', 1, 10, [0.99]);
    assert.deepEqual(rolled, []);
});

test('guardians always roll at least one affix and gain a second at curse 5', () => {
    const context = createAffixContext();
    assert.equal(rollWith(context, 'guardian', 1, 10, [0.99]).length, 1);
    assert.equal(rollWith(context, 'guardian', 5, 10, [0.99]).length, 2);
});

test('monarchs always roll two affixes and gain a third at curse 10', () => {
    const context = createAffixContext();
    assert.equal(rollWith(context, 'sboss', 1, 10, [0.99]).length, 2);
    assert.equal(rollWith(context, 'sboss', 10, 10, [0.99]).length, 3);
});

test('a roll never contains duplicate affixes', () => {
    const context = createAffixContext();
    for (let curseLevel = 1; curseLevel <= 15; curseLevel++) {
        for (let attempt = 0; attempt < 200; attempt++) {
            const rolled = toHostArray(vm.runInContext(
                `rollEnemyAffixes('sboss', ${curseLevel}, 30)`,
                context,
            ));
            assert.equal(new Set(rolled).size, rolled.length, 'duplicate affix rolled');
        }
    }
});

test('normalizeAffixList drops unknown ids, duplicates and non-arrays', () => {
    const context = createAffixContext();
    context.__input = ['enraged', 'enraged', 'not-a-real-affix', 'swift'];
    assert.deepEqual(
        toHostArray(vm.runInContext('normalizeAffixList(__input)', context)),
        ['enraged', 'swift'],
    );
    assert.deepEqual(toHostArray(vm.runInContext('normalizeAffixList(undefined)', context)), []);
    assert.deepEqual(toHostArray(vm.runInContext('normalizeAffixList(null)', context)), []);
    assert.deepEqual(toHostArray(vm.runInContext('normalizeAffixList("enraged")', context)), []);
});

test('regenerating enemies receive a reserve equal to half their maximum health', () => {
    const context = createAffixContext();
    context.__enemy = { affixes: ['regenerating'], stats: { hpMax: 1001 } };

    assert.equal(vm.runInContext('ensureEnemyRegenerationReserve(__enemy)', context), 501);
    assert.equal(context.__enemy.regenerationReserve, 501);
});

test('a depleted regeneration reserve is preserved instead of refilled', () => {
    const context = createAffixContext();
    context.__enemy = {
        affixes: ['regenerating'],
        regenerationReserve: 0,
        stats: { hpMax: 1000 },
    };

    assert.equal(vm.runInContext('ensureEnemyRegenerationReserve(__enemy)', context), 0);
    assert.equal(context.__enemy.regenerationReserve, 0);
});

test('affix stats respect the enemy dodge and attack speed caps', () => {
    const context = createAffixContext();
    context.__stats = { hpMax: 1000, atk: 100, def: 50, atkSpd: 2.7, dodge: 48, vamp: 0 };
    const result = vm.runInContext(
        `applyAffixStats(__stats, ['elusive', 'swift'])`,
        context,
    );
    assert.ok(result.dodge <= 50, `dodge ${result.dodge} exceeded the cap`);
    assert.ok(result.atkSpd <= 2.75, `atkSpd ${result.atkSpd} exceeded the cap`);
});

test('Enraged trades thirty percent more attack for twenty percent less health', () => {
    const context = createAffixContext();
    context.__stats = { hpMax: 1000, atk: 100, def: 50, atkSpd: 1.5, dodge: 10, vamp: 0 };
    const result = vm.runInContext(`applyAffixStats(__stats, ['enraged'])`, context);

    assert.equal(result.atk, 130);
    assert.equal(result.hpMax, 800);
});

test('applying no affixes leaves stats untouched', () => {
    const context = createAffixContext();
    context.__stats = { hpMax: 1000, atk: 100, def: 50, atkSpd: 1.5, dodge: 10, vamp: 0 };
    const result = vm.runInContext('applyAffixStats(__stats, [])', context);
    assert.deepEqual(
        Object.assign({}, result),
        { hpMax: 1000, atk: 100, def: 50, atkSpd: 1.5, dodge: 10, vamp: 0 },
    );
});

test('every affix keeps stats finite and positive where required', () => {
    const context = createAffixContext();
    for (const id of affixIds()) {
        context.__stats = { hpMax: 1000, atk: 100, def: 50, atkSpd: 1.5, dodge: 10, vamp: 0 };
        const result = vm.runInContext(`applyAffixStats(__stats, ['${id}'])`, context);
        assert.ok(Number.isFinite(result.hpMax) && result.hpMax >= 1, `${id} produced bad hpMax`);
        assert.ok(Number.isFinite(result.atk) && result.atk >= 1, `${id} produced bad atk`);
        assert.ok(Number.isFinite(result.def) && result.def >= 0, `${id} produced bad def`);
        assert.ok(Number.isFinite(result.atkSpd) && result.atkSpd > 0, `${id} produced bad atkSpd`);
    }
});

test('reward multiplier increases strictly with affix count', () => {
    const context = createAffixContext();
    const none = vm.runInContext(`getAffixRewardMultiplier([])`, context);
    const one = vm.runInContext(`getAffixRewardMultiplier(['enraged'])`, context);
    const two = vm.runInContext(`getAffixRewardMultiplier(['enraged', 'swift'])`, context);

    assert.equal(none, 1);
    assert.ok(one > none, 'one affix should beat none');
    assert.ok(two > one, 'two affixes should beat one');
});

test('drop bonus increases with affix count and stays modest', () => {
    const context = createAffixContext();
    const none = vm.runInContext(`getAffixDropBonus([])`, context);
    const three = vm.runInContext(`getAffixDropBonus(['enraged', 'swift', 'volatile'])`, context);

    assert.equal(none, 0);
    assert.ok(three > 0, 'affixes should raise the drop chance');
    assert.ok(three <= 0.2, `drop bonus ${three} is too generous`);
});

test('en.json defines a name and description for every affix', () => {
    const en = JSON.parse(fs.readFileSync(path.join(localesDir, 'en.json'), 'utf8'));
    assert.ok(en['affix-names'], 'en.json is missing affix-names');
    assert.ok(en['affix-descriptions'], 'en.json is missing affix-descriptions');

    for (const id of affixIds()) {
        assert.ok(en['affix-names'][id], `en.json is missing affix-names.${id}`);
        assert.ok(en['affix-descriptions'][id], `en.json is missing affix-descriptions.${id}`);
    }
});

test('en.json defines the affix name format and every affix log line', () => {
    const en = JSON.parse(fs.readFileSync(path.join(localesDir, 'en.json'), 'utf8'));
    assert.match(en['affix-name-format'], /\{affix\}/);
    assert.match(en['affix-name-format'], /\{name\}/);

    for (const key of ['enemy-thorns-damage', 'enemy-volatile-death', 'enemy-boss-enrage']) {
        assert.ok(en[key], `en.json is missing ${key}`);
        assert.match(en[key], /\{enemy\}/, `${key} must interpolate {enemy}`);
    }
    for (const key of ['enemy-thorns-damage', 'enemy-volatile-death']) {
        assert.match(en[key], /\{value\}/, `${key} must interpolate {value}`);
    }
});

// A half-translated block would silently show raw ids, so every locale must be complete.
test('all locales provide every affix name and description', () => {
    const ids = affixIds();
    const localeFiles = fs.readdirSync(localesDir).filter((file) => file.endsWith('.json'));
    assert.ok(localeFiles.length > 0, 'expected locale files');

    for (const file of localeFiles) {
        const locale = JSON.parse(fs.readFileSync(path.join(localesDir, file), 'utf8'));
        for (const block of ['affix-names', 'affix-descriptions']) {
            assert.ok(locale[block], `${file} is missing ${block}`);
            for (const id of ids) {
                assert.equal(typeof locale[block][id], 'string', `${file}: ${block}.${id}`);
            }
        }
    }
});

test('all locales provide the affix name format and affix log lines', () => {
    const localeFiles = fs.readdirSync(localesDir).filter((file) => file.endsWith('.json'));
    for (const file of localeFiles) {
        const locale = JSON.parse(fs.readFileSync(path.join(localesDir, file), 'utf8'));
        assert.match(locale['affix-name-format'], /\{affix\}/, `${file} lost {affix}`);
        assert.match(locale['affix-name-format'], /\{name\}/, `${file} lost {name}`);

        for (const key of ['enemy-thorns-damage', 'enemy-volatile-death', 'enemy-boss-enrage']) {
            assert.equal(typeof locale[key], 'string', `${file} is missing ${key}`);
            assert.match(locale[key], /\{enemy\}/, `${file}: ${key} must interpolate {enemy}`);
        }
        for (const key of ['enemy-thorns-damage', 'enemy-volatile-death']) {
            assert.match(locale[key], /\{value\}/, `${file}: ${key} must interpolate {value}`);
        }
    }
});

test('all locales provide the regeneration reserve label', () => {
    const localeFiles = fs.readdirSync(localesDir).filter((file) => file.endsWith('.json'));
    for (const file of localeFiles) {
        const locale = JSON.parse(fs.readFileSync(path.join(localesDir, file), 'utf8'));
        assert.equal(typeof locale['enemy-regeneration-reserve'], 'string', `${file} is missing the reserve label`);
        assert.ok(locale['enemy-regeneration-reserve'].trim().length > 0, `${file} has an empty reserve label`);
    }
});

test('formatAffixedEnemyName falls back to the base name without affixes', () => {
    const context = createAffixContext();
    assert.equal(vm.runInContext(`formatAffixedEnemyName('Goblin', [])`, context), 'Goblin');
    assert.equal(vm.runInContext(`formatAffixedEnemyName('Goblin', null)`, context), 'Goblin');
});

test('formatAffixedEnemyName prefixes only the first affix', () => {
    const context = createAffixContext();
    context.t = (key, vars) => {
        if (key === 'affix-names.enraged') return 'Enraged';
        if (key === 'affix-names.swift') return 'Swift';
        if (key === 'affix-name-format') return `${vars.affix} ${vars.name}`;
        return key;
    };
    const formatted = vm.runInContext(
        `formatAffixedEnemyName('Goblin', ['enraged', 'swift'])`,
        context,
    );
    assert.equal(formatted, 'Enraged Goblin');
});

// ========== Combat behaviour ==========
const combatSource = fs.readFileSync(path.join(root, 'assets/js/combat.js'), 'utf8');

const createCombatContext = ({ condition, affixes, hpMax, atk, atkSpd }) => {
    const logs = [];
    const context = vm.createContext({
        document: {
            addEventListener() {},
            getElementById: () => null,
            querySelector: () => null,
        },
        performance: { now: () => 0 },
        player: {
            inCombat: true,
            name: 'Hero',
            hardcore: false,
            deaths: 0,
            kills: 0,
            skills: [],
            stats: { hp: 1000, hpMax: 1000, atkSpd: 1 },
        },
        enemy: {
            id: 1,
            name: 'Goblin',
            condition,
            affixes,
            phase: { index: 0 },
            stats: { hp: hpMax, hpMax, atk, def: 10, atkSpd, vamp: 0 },
        },
        dungeon: { statistics: { kills: 0 } },
        t: (key, vars) => `${key}:${JSON.stringify(vars || {})}`,
        nFormatter: (value) => String(value),
        addCombatLog: (message) => logs.push(message),
        getDisplayEnemyName: () => 'Goblin',
        playerLoadStats() {},
        enemyLoadStats() {},
        sfxBuff: { play() {} },
        setTimeout: () => 1,
        clearTimeout() {},
        setInterval: () => 1,
        clearInterval() {},
        window: {},
    });
    vm.runInContext(affixSource, context);
    vm.runInContext(combatSource, context);
    context.__logs = logs;
    return context;
};

test('guardians do not enrage above the phase threshold', () => {
    const context = createCombatContext({
        condition: 'guardian', affixes: [], hpMax: 1000, atk: 100, atkSpd: 1,
    });
    context.enemy.stats.hp = 600;
    vm.runInContext('checkBossPhase()', context);

    assert.equal(context.enemy.stats.atk, 100);
    assert.equal(context.enemy.phase.index, 0);
});

test('guardians enrage exactly once at half health', () => {
    const context = createCombatContext({
        condition: 'guardian', affixes: [], hpMax: 1000, atk: 100, atkSpd: 1,
    });
    context.enemy.stats.hp = 500;
    vm.runInContext('checkBossPhase()', context);

    const enragedAtk = context.enemy.stats.atk;
    assert.ok(enragedAtk > 100, 'guardian should gain attack');
    assert.equal(context.enemy.phase.index, 1);

    // Further hits below the same threshold must not stack another enrage.
    context.enemy.stats.hp = 400;
    vm.runInContext('checkBossPhase()', context);
    assert.equal(context.enemy.stats.atk, enragedAtk);
    assert.equal(context.enemy.phase.index, 1);
});

test('monarchs enrage at both thresholds but never more than twice', () => {
    const context = createCombatContext({
        condition: 'sboss', affixes: [], hpMax: 1000, atk: 100, atkSpd: 1,
    });
    context.enemy.stats.hp = 500;
    vm.runInContext('checkBossPhase()', context);
    assert.equal(context.enemy.phase.index, 1);

    context.enemy.stats.hp = 250;
    vm.runInContext('checkBossPhase()', context);
    assert.equal(context.enemy.phase.index, 2);

    const finalAtk = context.enemy.stats.atk;
    context.enemy.stats.hp = 10;
    vm.runInContext('checkBossPhase()', context);
    assert.equal(context.enemy.phase.index, 2);
    assert.equal(context.enemy.stats.atk, finalAtk);
});

test('plain enemies never enrage', () => {
    const context = createCombatContext({
        condition: 'base', affixes: [], hpMax: 1000, atk: 100, atkSpd: 1,
    });
    context.enemy.stats.hp = 1;
    vm.runInContext('checkBossPhase()', context);

    assert.equal(context.enemy.stats.atk, 100);
    assert.equal(context.enemy.phase.index, 0);
});

test('boss enrage respects the enemy attack speed cap', () => {
    const context = createCombatContext({
        condition: 'sboss', affixes: [], hpMax: 1000, atk: 100, atkSpd: 2.7,
    });
    context.enemy.stats.hp = 500;
    vm.runInContext('checkBossPhase()', context);
    context.enemy.stats.hp = 250;
    vm.runInContext('checkBossPhase()', context);

    assert.ok(context.enemy.stats.atkSpd <= 2.75, `atkSpd ${context.enemy.stats.atkSpd} exceeded the cap`);
});

test('thorns reflects damage only for thorned enemies', () => {
    const plain = createCombatContext({
        condition: 'base', affixes: [], hpMax: 1000, atk: 100, atkSpd: 1,
    });
    assert.equal(vm.runInContext('applyThornsReflect(500)', plain), 0);
    assert.equal(plain.player.stats.hp, 1000);

    const thorned = createCombatContext({
        condition: 'base', affixes: ['thorned'], hpMax: 1000, atk: 100, atkSpd: 1,
    });
    const reflected = vm.runInContext('applyThornsReflect(500)', thorned);
    assert.ok(reflected > 0, 'thorned enemy should reflect damage');
    assert.equal(thorned.player.stats.hp, 1000 - reflected);
});

test('volatile detonates once and only for volatile enemies', () => {
    const plain = createCombatContext({
        condition: 'base', affixes: [], hpMax: 1000, atk: 100, atkSpd: 1,
    });
    assert.equal(vm.runInContext('applyVolatileDeath()', plain), 0);
    assert.equal(plain.player.stats.hp, 1000);

    const volatileEnemy = createCombatContext({
        condition: 'base', affixes: ['volatile'], hpMax: 1000, atk: 100, atkSpd: 1,
    });
    const first = vm.runInContext('applyVolatileDeath()', volatileEnemy);
    assert.ok(first > 0, 'volatile enemy should damage the player on death');
    assert.equal(volatileEnemy.player.stats.hp, 1000 - first);

    assert.equal(vm.runInContext('applyVolatileDeath()', volatileEnemy), 0, 'volatile must not double-trigger');
    assert.equal(volatileEnemy.player.stats.hp, 1000 - first);
});

test('regeneration heals only regenerating enemies and never overheals', () => {
    const plain = createCombatContext({
        condition: 'base', affixes: [], hpMax: 1000, atk: 100, atkSpd: 1,
    });
    plain.enemy.stats.hp = 500;
    vm.runInContext('tickEnemyRegen()', plain);
    assert.equal(plain.enemy.stats.hp, 500);

    const regen = createCombatContext({
        condition: 'base', affixes: ['regenerating'], hpMax: 1000, atk: 100, atkSpd: 1,
    });
    regen.enemy.stats.hp = 500;
    vm.runInContext('tickEnemyRegen()', regen);
    assert.equal(regen.enemy.stats.hp, 515, 'regenerating enemy should heal by 1.5% max HP');
    assert.equal(regen.enemy.regenerationReserve, 485, 'healing should consume the reserve');

    regen.enemy.stats.hp = 999;
    vm.runInContext('tickEnemyRegen()', regen);
    assert.equal(regen.enemy.stats.hp, 1000, 'regen must clamp to hpMax');
    assert.equal(regen.enemy.regenerationReserve, 484, 'only the health actually restored is consumed');
});

test('regeneration stops permanently once its reserve is empty', () => {
    const regen = createCombatContext({
        condition: 'base', affixes: ['regenerating'], hpMax: 1000, atk: 100, atkSpd: 1,
    });
    regen.enemy.stats.hp = 500;
    regen.enemy.regenerationReserve = 10;

    vm.runInContext('tickEnemyRegen()', regen);
    assert.equal(regen.enemy.stats.hp, 510, 'the final tick should be limited by the remaining reserve');
    assert.equal(regen.enemy.regenerationReserve, 0);

    vm.runInContext('tickEnemyRegen()', regen);
    assert.equal(regen.enemy.stats.hp, 510, 'an empty reserve must not refill or heal again');
});

test('a dead enemy never regenerates', () => {
    const regen = createCombatContext({
        condition: 'base', affixes: ['regenerating'], hpMax: 1000, atk: 100, atkSpd: 1,
    });
    regen.enemy.stats.hp = 0;
    vm.runInContext('tickEnemyRegen()', regen);
    assert.equal(regen.enemy.stats.hp, 0);
});

// Basic attacks and the special ability are both player hits, so both must trigger thorns.
test('every player damage path applies thorns', () => {
    const reflectCalls = combatSource.match(/applyThornsReflect\(damage\)/g) || [];
    assert.equal(reflectCalls.length, 2, 'expected thorns on both the basic attack and special ability');
});

test('the per-second combat tick drives affix regeneration', () => {
    assert.match(combatSource, /const combatCounter = \(\) => \{[\s\S]*?tickEnemyRegen\(\);/);
});

test('the regenerating affix badge renders and updates the regeneration reserve', () => {
    assert.match(combatSource, /id="enemy-regeneration-reserve"/);
    assert.match(combatSource, /--regeneration-reserve-percent/);
    assert.doesNotMatch(combatSource, /enemy-regeneration-reserve-track/);
    assert.match(combatSource, /ensureEnemyRegenerationReserve\(enemy\)/);
});
