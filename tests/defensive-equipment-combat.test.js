const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../assets/js/combat.js'), 'utf8');
const setup = (bonuses = {}) => {
    const node = { classList: { add() {}, remove() {}, toggle() {} }, style: {}, appendChild() {} };
    const sound = { play() {}, pause() {}, stop() {} };
    const context = vm.createContext({
        bonuses, rolls: [], draws: 0, dealt: [], taken: [], delays: [],
        document: {
            addEventListener() {}, getElementById: () => null, createElement: () => node,
            querySelector: (selector) => ['#playerPanel', '#enemy-sprite', '#dmg-container', '#combatPanel'].includes(selector) ? node : null,
        },
        window: { setTimeout() {} }, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
        player: {
            inCombat: true, skills: [], selectedClass: 'Knight', gold: 0, kills: 0, deaths: 0,
            stats: { hp: 1000, hpMax: 1000, atk: 100, atkSpd: 1, def: 0, dodge: 0, vamp: 0, critRate: 0 },
        },
        enemy: {
            id: 1, rewards: { exp: 10, gold: 5, drop: false },
            stats: { hp: 1000, hpMax: 1000, atk: 100, atkSpd: 1, def: 0, dodge: 0, vamp: 0, critRate: 0, critDmg: 100 },
        },
        dungeon: { statistics: { kills: 0 }, status: {}, progress: {} },
        activeCompanion: null, sfxAttack: sound, sfxCombatEnd: sound, bgmDungeon: sound, sfxEncounter: sound,
        getEquippedSpecialBonus: (key) => bonuses[key] || 0,
        getDisplayEnemyName: () => 'Enemy', nFormatter: String, t: (key) => key,
        playerLoadStats() {}, enemyLoadStats() {}, objectValidation() {}, autoClaim() {}, playerExpGain() {},
        applyForgeMembershipGoldBonus: (value) => value,
    });
    const run = (code) => vm.runInContext(code, context);
    run(`
        Math.random = () => { draws++; return rolls.length ? rolls.shift() : 0.5; };
        const setTimeout = (_callback, delay) => delays.push(delay);
        const recordRunDamageDealt = damage => dealt.push(damage);
        const recordRunDamageTaken = damage => taken.push(damage);
    `);
    run(source);
    run('currentBattleMusic = bgmDungeon');
    return { run, context, player: context.player, enemy: context.enemy };
};

test('critical defense mitigates the critical portion and leaves ordinary hits alone', () => {
    const { run, enemy, context } = setup({ criticalDefense: 50 });
    enemy.stats.critRate = 100;
    run('enemyAttack()');
    enemy.stats.critRate = 0;
    run('enemyAttack()');
    assert.deepEqual(context.taken, [150, 100]);
    assert.equal(context.draws, 6, 'absent chance bonuses use no random rolls');
});

test('recoil carries into a resumed encounter and skips exactly one enemy attack', () => {
    const { run, enemy, context } = setup({ hitRecoil: 12 });
    context.rolls.push(0.5, 0.5, 0.5, 0.11);
    run('enemyAttack()');
    assert.equal(enemy.skipAttackFromRecoil, true);
    assert.deepEqual(context.taken, [100]);
    run('enemy = JSON.parse(JSON.stringify(enemy)); startCombat(bgmDungeon)');
    run('enemyAttack()');
    assert.deepEqual(context.taken, [100]);
    assert.equal(context.delays.at(-1), 1000, 'another full attack interval starts');
    run('enemyAttack()');
    assert.deepEqual(context.taken, [100, 100]);
    assert.equal(context.enemy.skipAttackFromRecoil, false, 'a failed roll leaves the enemy able to attack');
});

test('dodge healing caps at max HP and both Scout and ordinary dodges can trigger a riposte', () => {
    const { run, player, enemy, context } = setup({ evasionHeal: 3, riposte: 20 });
    player.stats.hp = 955;
    enemy.stats.def = 100;
    for (const dodge of [100, 0]) {
        player.stats.dodge = dodge;
        context.rolls.push(0.5, 0.5, 0.5, 0.19);
        if (dodge === 0) run('scoutDodgeReady = true');
        run('enemyAttack()');
        assert.equal(player.stats.hp, dodge === 100 ? 985 : 1000);
    }
    assert.deepEqual(context.taken, [0, 0]);
    assert.deepEqual(context.dealt, [50, 50]);
    assert.equal(enemy.stats.hp, 900);
    assert.equal(run('playerAttackTimeout'), undefined);
});

test('blocking halves a landed hit, and last stand starts below 30% HP', () => {
    const { run, player, context } = setup({ blockChance: 10, lastStand: 20 });
    player.stats.hp = 300;
    context.rolls.push(0.5, 0.5, 0.5, 0.09);
    run('enemyAttack()');
    run('enemyAttack()');
    assert.deepEqual(context.taken, [50, 80]);
});

test('deflection uses damage after mitigation and a counter kill awards victory', () => {
    const { run, enemy, player, context } = setup({ deflection: 10 });
    player.skills.push("Paladin's Heart");
    enemy.stats.hp = 8;
    run('enemyAttack()');
    assert.deepEqual(context.taken, [75]);
    assert.deepEqual(context.dealt, [8]);
    assert.equal(player.kills, 1);
    assert.equal(player.inCombat, false);
});

test('deflection on a lethal hit counts only HP lost and simultaneous death resolves as defeat', () => {
    const { run, enemy, player, context } = setup({ deflection: 10 });
    player.stats.hp = 20;
    enemy.stats.hp = 2;
    run('enemyAttack()');
    assert.deepEqual(context.dealt, [2]);
    assert.equal(player.deaths, 1);
    assert.equal(player.kills, 0);
    assert.equal(player.inCombat, false);
});

test('a missed attack preserves the opener for a damaging special, and resuming cannot grant it again', () => {
    const { run, enemy, player, context } = setup({ openingStrike: 20 });
    player.stats.hp = 700;
    player.stats.vamp = 10;
    enemy.stats.dodge = 100;
    run('setPlayerAttackReady(true); playerAttack()');
    enemy.stats.dodge = 0;
    run('setPlayerAttackReady(true); useSpecialAbility()');
    run('enemy = JSON.parse(JSON.stringify(enemy)); startCombat(bgmDungeon)');
    run('setPlayerAttackReady(true); playerAttack()');
    assert.deepEqual(context.dealt, [0, 180, 100]);
    assert.equal(player.stats.hp, 728);
});
