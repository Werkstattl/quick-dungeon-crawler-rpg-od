const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const mainSource = fs.readFileSync(path.join(root, 'assets/js/main.js'), 'utf8');
const affixSource = fs.readFileSync(path.join(root, 'assets/js/affixes.js'), 'utf8');
const startupHelpersSource = mainSource.split('// Use DOMContentLoaded')[0];
const saveDataSource = mainSource.slice(
    mainSource.indexOf('let isSaving = false;'),
    mainSource.indexOf('const maybeUnlockNextCurseLevel')
);
const enemySource = fs.readFileSync(path.join(root, 'assets/js/enemy.js'), 'utf8');

const createDungeon = (floor = 1) => ({
    progress: { floor },
    settings: { enemyBaseLvl: 1, enemyLvlGap: 5 },
});

const createEnemy = (level = 3) => ({
    id: 1,
    name: 'Goblin',
    type: 'Balanced',
    lvl: level,
    condition: null,
    affixes: [],
    phase: { index: 0 },
    stats: {
        hp: 100,
        hpMax: 100,
        atk: 10,
        def: 5,
        atkSpd: 0.4,
        vamp: 0,
        critRate: 1,
        critDmg: 50,
        dodge: 0,
    },
    image: { name: 'goblin', size: '50%' },
    rewards: { exp: 10, gold: 5, drop: false },
});

const createSaveContext = () => {
    const savedValues = new Map();
    const context = vm.createContext({
        console,
        Date,
        player: { lvl: 1 },
        dungeon: { initialized: false, progress: { floor: 1, room: 1 } },
        enemy: { id: null },
        STORAGE_KEYS: {
            player: 'playerData',
            playerBackup: 'playerData_backup',
            playerTemp: 'playerData_temp',
            dungeon: 'dungeonData',
            dungeonBackup: 'dungeonData_backup',
            dungeonTemp: 'dungeonData_temp',
            enemy: 'enemyData',
            enemyBackup: 'enemyData_backup',
            enemyTemp: 'enemyData_temp',
        },
        localStorage: {
            getItem: (key) => key === 'dungeonData' ? '{"progress":{"floor":7,"room":3}}' : null,
        },
        safeSave: (key, value) => {
            savedValues.set(key, JSON.parse(JSON.stringify(value)));
            return true;
        },
    });
    vm.runInContext(saveDataSource, context);
    return { context, savedValues };
};

const createStartupContext = ({ savedEnemy, floor = 1, playerLevel = 1 } = {}) => {
    const context = vm.createContext({
        console,
        player: { inCombat: true, lvl: playerLevel },
        dungeon: createDungeon(floor),
        savedEnemy: savedEnemy ?? null,
        staleEnemy: createEnemy(33),
        STORAGE_KEYS: {
            enemy: 'enemyData',
            enemyBackup: 'enemyData_backup',
        },
        safeLoad: () => context.savedEnemy,
    });
    vm.runInContext(affixSource, context);
    vm.runInContext(enemySource, context);
    vm.runInContext('enemy = staleEnemy', context);
    vm.runInContext(startupHelpersSource, context);
    return context;
};

test('missing enemy data cancels combat resume without abandoning the run', () => {
    const context = createStartupContext({ savedEnemy: null });

    const resumed = vm.runInContext('restoreSavedCombatState()', context);

    assert.equal(resumed, false);
    assert.equal(context.player.inCombat, false);
    assert.equal(vm.runInContext('enemy.id', context), null);
    assert.equal(vm.runInContext('enemy.lvl', context), null);
});

test('stale enemy from a later floor is rejected during combat resume', () => {
    const context = createStartupContext({ savedEnemy: createEnemy(33), floor: 1 });

    const resumed = vm.runInContext('restoreSavedCombatState()', context);

    assert.equal(resumed, false);
    assert.equal(context.player.inCombat, false);
    assert.equal(vm.runInContext('enemy.id', context), null);
});

test('stale enemy from an earlier floor is rejected during combat resume', () => {
    const context = createStartupContext({ savedEnemy: createEnemy(3), floor: 7, playerLevel: 10 });

    const resumed = vm.runInContext('restoreSavedCombatState()', context);

    assert.equal(resumed, false);
    assert.equal(context.player.inCombat, false);
});

test('enemy data with invalid combat values is rejected', () => {
    const malformedEnemy = createEnemy(3);
    malformedEnemy.stats.hp = -5;
    malformedEnemy.stats.hpMax = 0;
    malformedEnemy.stats.atkSpd = -1;
    malformedEnemy.rewards.gold = -10;
    const context = createStartupContext({ savedEnemy: malformedEnemy });

    const resumed = vm.runInContext('restoreSavedCombatState()', context);

    assert.equal(resumed, false);
    assert.equal(context.player.inCombat, false);
});

test('enemy data with non-canonical image attributes is rejected', () => {
    const malformedEnemy = createEnemy(3);
    malformedEnemy.image.name = 'goblin\" onerror=\"alert(1)';
    malformedEnemy.image.size = '100%\" onload=\"alert(1)';
    const context = createStartupContext({ savedEnemy: malformedEnemy });

    const resumed = vm.runInContext('restoreSavedCombatState()', context);

    assert.equal(resumed, false);
    assert.equal(context.player.inCombat, false);
});

test('saved hp percentage is recomputed before combat rendering', () => {
    const savedEnemy = createEnemy(3);
    savedEnemy.stats.hp = 25;
    savedEnemy.stats.hpMax = 100;
    savedEnemy.stats.hpPercent = '</div><img src=x onerror=alert(1)>';
    const context = createStartupContext({ savedEnemy, floor: 1 });

    const resumed = vm.runInContext('restoreSavedCombatState()', context);

    assert.equal(resumed, true);
    assert.equal(vm.runInContext('enemy.stats.hpPercent', context), 25);
});

test('valid enemy data resumes combat', () => {
    const savedEnemy = createEnemy(3);
    const context = createStartupContext({ savedEnemy, floor: 1 });

    const resumed = vm.runInContext('restoreSavedCombatState()', context);

    assert.equal(resumed, true);
    assert.equal(context.player.inCombat, true);
    assert.equal(vm.runInContext('enemy.id', context), savedEnemy.id);
    assert.equal(vm.runInContext('enemy.lvl', context), savedEnemy.lvl);
});

test('old regenerating enemy saves receive their reserve during combat recovery', () => {
    const savedEnemy = createEnemy(3);
    savedEnemy.affixes = ['regenerating'];
    const context = createStartupContext({ savedEnemy, floor: 1 });

    assert.equal(vm.runInContext('restoreSavedCombatState()', context), true);
    assert.equal(vm.runInContext('enemy.regenerationReserve', context), 50);
});

test('combat recovery preserves a depleted regeneration reserve', () => {
    const savedEnemy = createEnemy(3);
    savedEnemy.affixes = ['regenerating'];
    savedEnemy.regenerationReserve = 0;
    const context = createStartupContext({ savedEnemy, floor: 1 });

    assert.equal(vm.runInContext('restoreSavedCombatState()', context), true);
    assert.equal(vm.runInContext('enemy.regenerationReserve', context), 0);
});

test('enemy reset replaces stale combat state with an empty enemy', () => {
    const context = vm.createContext({ console });
    vm.runInContext(enemySource, context);

    vm.runInContext('enemy.lvl = 33; enemy.id = 1; resetEnemyState()', context);
    const resetEnemy = vm.runInContext('enemy', context);

    assert.equal(resetEnemy.id, null);
    assert.equal(resetEnemy.lvl, null);
    assert.equal(resetEnemy.type, null);
    assert.equal(Array.isArray(resetEnemy.affixes), true);
    assert.equal(resetEnemy.affixes.length, 0);
});

test('ordinary saves preserve the startup guard for an uninitialized dungeon', () => {
    const { context, savedValues } = createSaveContext();

    vm.runInContext('saveData()', context);

    assert.equal(savedValues.has('playerData'), true);
    assert.equal(savedValues.has('enemyData'), true);
    assert.equal(savedValues.has('dungeonData'), false);
});

test('forced save persists a reset dungeon before normal initialization', () => {
    const { context, savedValues } = createSaveContext();

    vm.runInContext('saveData({ forceDungeon: true })', context);

    assert.deepEqual(savedValues.get('dungeonData').progress, { floor: 1, room: 1 });
});

test('new-run reset forces the reset dungeon to replace stale saved progress', () => {
    assert.match(mainSource, /const progressReset[\s\S]*?resetEnemyState\(\)[\s\S]*?saveData\(\{ forceDungeon: true \}\)/);
});
