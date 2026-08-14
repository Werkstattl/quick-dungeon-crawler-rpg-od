// Enemy affixes: rolled modifiers that change how a fight plays, not just its numbers.
// Pure data + pure roll/apply helpers so combat.js and enemy.js stay the only stateful callers.

const AFFIX_REGEN_HP_PCT_PER_SECOND = 0.015;
const AFFIX_THORNS_REFLECT_PCT = 0.10;
const AFFIX_VOLATILE_PLAYER_HP_PCT = 0.12;
const AFFIX_REWARD_BONUS_PER_AFFIX = 0.25;
const AFFIX_DROP_BONUS_PER_AFFIX = 0.05;

// Base enemies stay clean on floor 1 so a first fight is never a Volatile ambush.
const AFFIX_MIN_FLOOR = 2;
const AFFIX_BASE_CHANCE = 0.12;
const AFFIX_BASE_CHANCE_PER_CURSE = 0.03;
const AFFIX_BASE_SECOND_CURSE_LEVEL = 8;
const AFFIX_GUARDIAN_SECOND_CURSE_LEVEL = 5;
const AFFIX_SBOSS_THIRD_CURSE_LEVEL = 10;
const AFFIX_MAX_COUNT = 3;

// Mimics are already a gimmick encounter, so they stay unmodified.
const AFFIX_EXCLUDED_CONDITIONS = ['chest', 'door'];

const AFFIX_ENEMY_DODGE_CAP = 50;
const AFFIX_ENEMY_ATKSPD_CAP = 2.75;

// mult = multiplicative on the rolled stat, flat = added after. behavior is handled in combat.js.
const ENEMY_AFFIXES = [
    { id: 'enraged', behavior: null, mult: { atk: 1.35, hpMax: 0.80 }, flat: null },
    { id: 'armored', behavior: null, mult: { def: 1.60, atkSpd: 0.85 }, flat: null },
    { id: 'swift', behavior: null, mult: { atkSpd: 1.35, hpMax: 0.85 }, flat: null },
    { id: 'vampiric', behavior: null, mult: null, flat: { vamp: 20 } },
    { id: 'elusive', behavior: null, mult: null, flat: { dodge: 12 } },
    { id: 'regenerating', behavior: 'regen', mult: { hpMax: 0.90 }, flat: null },
    { id: 'thorned', behavior: 'thorns', mult: { def: 1.15 }, flat: null },
    { id: 'volatile', behavior: 'volatile', mult: { hpMax: 0.90 }, flat: null }
];

const getAffixById = (id) => {
    for (let i = 0; i < ENEMY_AFFIXES.length; i++) {
        if (ENEMY_AFFIXES[i].id === id) {
            return ENEMY_AFFIXES[i];
        }
    }
    return null;
};

const isValidAffixId = (id) => getAffixById(id) !== null;

// Drops unknown ids and duplicates so a stale save can never resurrect a removed affix.
const normalizeAffixList = (affixes) => {
    if (!Array.isArray(affixes)) {
        return [];
    }
    const cleaned = [];
    for (let i = 0; i < affixes.length; i++) {
        const id = affixes[i];
        if (isValidAffixId(id) && cleaned.indexOf(id) === -1) {
            cleaned.push(id);
        }
        if (cleaned.length >= AFFIX_MAX_COUNT) {
            break;
        }
    }
    return cleaned;
};

const enemyHasAffix = (affixes, id) => normalizeAffixList(affixes).indexOf(id) !== -1;

const getAffixCountForCondition = (condition, curseLevel, floor, roll) => {
    const curse = Number.isFinite(Number(curseLevel)) ? Number(curseLevel) : 1;

    if (condition === 'sboss') {
        return curse >= AFFIX_SBOSS_THIRD_CURSE_LEVEL ? 3 : 2;
    }
    if (condition === 'guardian') {
        return curse >= AFFIX_GUARDIAN_SECOND_CURSE_LEVEL ? 2 : 1;
    }
    // Regular encounters call generateRandomEnemy() with no argument, so undefined means base.
    if (AFFIX_EXCLUDED_CONDITIONS.indexOf(condition) !== -1) {
        return 0;
    }

    const currentFloor = Number.isFinite(Number(floor)) ? Number(floor) : 1;
    if (currentFloor < AFFIX_MIN_FLOOR) {
        return 0;
    }

    const chance = AFFIX_BASE_CHANCE + (curse * AFFIX_BASE_CHANCE_PER_CURSE);
    if (roll() >= chance) {
        return 0;
    }
    if (curse >= AFFIX_BASE_SECOND_CURSE_LEVEL && roll() < chance) {
        return 2;
    }
    return 1;
};

const rollEnemyAffixes = (condition, curseLevel, floor, randomFn) => {
    const roll = typeof randomFn === 'function' ? randomFn : Math.random;
    const count = getAffixCountForCondition(condition, curseLevel, floor, roll);
    if (count < 1) {
        return [];
    }

    const pool = ENEMY_AFFIXES.map((affix) => affix.id);
    const picked = [];
    while (picked.length < count && pool.length > 0) {
        const index = Math.floor(roll() * pool.length) % pool.length;
        picked.push(pool[index]);
        pool.splice(index, 1);
    }
    return picked;
};

const applyAffixStats = (stats, affixes) => {
    if (!stats || typeof stats !== 'object') {
        return stats;
    }
    const ids = normalizeAffixList(affixes);

    for (let i = 0; i < ids.length; i++) {
        const affix = getAffixById(ids[i]);
        if (!affix) {
            continue;
        }
        if (affix.mult) {
            for (const stat in affix.mult) {
                if (Number.isFinite(Number(stats[stat]))) {
                    stats[stat] = Number(stats[stat]) * affix.mult[stat];
                }
            }
        }
        if (affix.flat) {
            for (const stat in affix.flat) {
                const current = Number.isFinite(Number(stats[stat])) ? Number(stats[stat]) : 0;
                stats[stat] = current + affix.flat[stat];
            }
        }
    }

    if (ids.length > 0) {
        stats.hpMax = Math.max(1, Math.round(Number(stats.hpMax) || 1));
        stats.atk = Math.max(1, Math.round(Number(stats.atk) || 1));
        stats.def = Math.max(0, Math.round(Number(stats.def) || 0));
        stats.atkSpd = Math.min(AFFIX_ENEMY_ATKSPD_CAP, Number(stats.atkSpd) || 0);
        stats.dodge = Math.min(AFFIX_ENEMY_DODGE_CAP, Math.max(0, Number(stats.dodge) || 0));
    }
    return stats;
};

const getAffixRewardMultiplier = (affixes) => (
    1 + (normalizeAffixList(affixes).length * AFFIX_REWARD_BONUS_PER_AFFIX)
);

const getAffixDropBonus = (affixes) => (
    normalizeAffixList(affixes).length * AFFIX_DROP_BONUS_PER_AFFIX
);

const getAffixName = (id) => {
    if (!isValidAffixId(id)) {
        return '';
    }
    if (typeof t !== 'function') {
        return id;
    }
    const key = 'affix-names.' + id;
    const translated = t(key);
    return translated === key ? id : translated;
};

const getAffixDescription = (id) => {
    if (!isValidAffixId(id)) {
        return '';
    }
    if (typeof t !== 'function') {
        return '';
    }
    const key = 'affix-descriptions.' + id;
    const translated = t(key);
    return translated === key ? '' : translated;
};

// Only the first affix prefixes the name; the rest render as badges next to it.
const formatAffixedEnemyName = (baseName, affixes) => {
    const ids = normalizeAffixList(affixes);
    if (ids.length === 0) {
        return baseName;
    }
    const affixName = getAffixName(ids[0]);
    if (!affixName) {
        return baseName;
    }
    if (typeof t !== 'function') {
        return affixName + ' ' + baseName;
    }
    const formatted = t('affix-name-format', { affix: affixName, name: baseName });
    return formatted === 'affix-name-format' ? affixName + ' ' + baseName : formatted;
};

if (typeof window !== 'undefined') {
    window.ENEMY_AFFIXES = ENEMY_AFFIXES;
    window.rollEnemyAffixes = rollEnemyAffixes;
    window.applyAffixStats = applyAffixStats;
    window.normalizeAffixList = normalizeAffixList;
    window.enemyHasAffix = enemyHasAffix;
    window.getAffixRewardMultiplier = getAffixRewardMultiplier;
    window.getAffixDropBonus = getAffixDropBonus;
    window.getAffixName = getAffixName;
    window.getAffixDescription = getAffixDescription;
    window.formatAffixedEnemyName = formatAffixedEnemyName;
}
