// Enemy
let enemy = {
    id: null,
    name: null,
    type: null,
    lvl: null,
    condition: null,
    stats: {
        hp: null,
        hpMax: null,
        atk: 0,
        def: 0,
        atkSpd: 0,
        vamp: 0,
        critRate: 0,
        critDmg: 0,
        dodge: 0
    },
    image: {
        name: null,
        size: null
    },
    rewards: {
        exp: null,
        gold: null,
        drop: null
    }
};

// Data for all enemies keyed by ID
// NOTE: "key" is used for i18n lookups: t('enemy-names.' + key)
const enemyData = {
    1: { key: 'goblin', name: 'Goblin', sprite: 'goblin' },
    2: { key: 'goblin-rogue', name: 'Goblin Rogue', sprite: 'goblin_rogue' },
    3: { key: 'goblin-mage', name: 'Goblin Mage', sprite: 'goblin_mage' },
    4: { key: 'goblin-archer', name: 'Goblin Archer', sprite: 'goblin_archer' },
    5: { key: 'wolf', name: 'Wolf', sprite: 'wolf' },
    6: { key: 'black-wolf', name: 'Black Wolf', sprite: 'wolf_black' },
    7: { key: 'winter-wolf', name: 'Winter Wolf', sprite: 'wolf_winter' },
    8: { key: 'slime', name: 'Slime', sprite: 'slime' },
    9: { key: 'angel-slime', name: 'Angel Slime', sprite: 'slime_angel' },
    10: { key: 'knight-slime', name: 'Knight Slime', sprite: 'slime_knight' },
    11: { key: 'crusader-slime', name: 'Crusader Slime', sprite: 'slime_crusader' },
    12: { key: 'orc-swordsmaster', name: 'Orc Swordsmaster', sprite: 'orc_swordsmaster' },
    13: { key: 'orc-axe', name: 'Orc Axe', sprite: 'orc_axe' },
    14: { key: 'orc-archer', name: 'Orc Archer', sprite: 'orc_archer' },
    15: { key: 'orc-mage', name: 'Orc Mage', sprite: 'orc_mage' },
    16: { key: 'spider', name: 'Spider', sprite: 'spider' },
    17: { key: 'red-spider', name: 'Red Spider', sprite: 'spider_red' },
    18: { key: 'green-spider', name: 'Green Spider', sprite: 'spider_green' },
    19: { key: 'skeleton-archer', name: 'Skeleton Archer', sprite: 'skeleton_archer' },
    20: { key: 'skeleton-swordsmaster', name: 'Skeleton Swordsmaster', sprite: 'skeleton_swordsmaster' },
    21: { key: 'skeleton-knight', name: 'Skeleton Knight', sprite: 'skeleton_knight' },
    22: { key: 'skeleton-mage', name: 'Skeleton Mage', sprite: ['skeleton_mage1', 'skeleton_mage2'] },
    23: { key: 'skeleton-pirate', name: 'Skeleton Pirate', sprite: 'skeleton_pirate' },
    24: { key: 'skeleton-samurai', name: 'Skeleton Samurai', sprite: 'skeleton_samurai' },
    25: { key: 'skeleton-warrior', name: 'Skeleton Warrior', sprite: 'skeleton_warrior' },
    26: { key: 'mimic', name: 'Mimic', sprite: 'mimic' },
    27: { key: 'door-mimic', name: 'Door Mimic', sprite: 'mimic_door' },
    28: { key: 'zaart-dominator-goblin', name: 'Zaart, the Dominator Goblin', sprite: 'goblin_boss', size: '70%' },
    29: { key: 'banshee-skeleton-lord', name: 'Banshee, Skeleton Lord', sprite: 'skeleton_boss' },
    30: { key: 'molten-spider', name: 'Molten Spider', sprite: 'spider_fire' },
    31: { key: 'cerberus-ptolemaios', name: 'Cerberus Ptolemaios', sprite: 'cerberus_ptolemaios' },
    32: { key: 'hellhound-inferni', name: 'Hellhound Inferni', sprite: 'hellhound' },
    33: { key: 'berthelot-undead-king', name: 'Berthelot, the Undead King', sprite: 'berthelot' },
    34: { key: 'slime-king', name: 'Slime King', sprite: 'slime_boss' },
    35: { key: 'zodiac-cancer', name: 'Zodiac Cancer', sprite: 'zodiac_cancer' },
    36: { key: 'alfadriel-light-titan', name: 'Alfadriel, the Light Titan', sprite: 'alfadriel' },
    37: { key: 'tiamat-dragon-knight', name: 'Tiamat, the Dragon Knight', sprite: 'tiamat' },
    38: { key: 'nameless-fallen-king', name: 'Nameless Fallen King', sprite: 'fallen_king' },
    39: { key: 'zodiac-aries', name: 'Zodiac Aries', sprite: 'zodiac_aries' },
    40: { key: 'llyrrad-ant-queen', name: 'Llyrrad, the Ant Queen', sprite: 'ant_queen' },
    41: { key: 'clockwork-spider', name: 'Clockwork Spider', sprite: 'spider_boss' },
    42: { key: 'aragorn-lethal-wolf', name: 'Aragorn, the Lethal Wolf', sprite: 'wolf_boss' },
    43: { key: 'naizicher-spider-dragon', name: 'Naizicher, the Spider Dragon', sprite: 'spider_dragon', size: '70%' },
    44: { key: 'ulliot-deathlord', name: 'Ulliot, the Deathlord', sprite: 'skeleton_dragon', size: '70%' },
    45: { key: 'ifrit', name: 'Ifrit', sprite: 'firelord', size: '70%' },
    46: { key: 'shiva', name: 'Shiva', sprite: 'icemaiden', size: '70%' },
    47: { key: 'behemoth', name: 'Behemoth', sprite: 'behemoth', size: '70%' },
    48: { key: 'blood-manipulation-feral', name: 'Blood Manipulation Feral', sprite: 'bm-feral', size: '70%' },
    49: { key: 'thanatos', name: 'Thanatos', sprite: 'thanatos', size: '70%' },
    50: { key: 'darkness-angel-reaper', name: 'Darkness Angel Reaper', sprite: 'da-reaper', size: '70%' },
    51: { key: 'zalaras-dragon-emperor', name: 'Zalaras, the Dragon Emperor', sprite: 'zalaras', size: '70%' }
};

// Map of IDs to enemy names
// Map of IDs to i18n keys (fallback to English name if translation missing)
const enemyIdMap = Object.keys(enemyData).reduce((acc, id) => {
    acc[id] = enemyData[id].key;
    return acc;
}, {});

function getEnemyTranslatedName(id) {
    const data = enemyData[id];
    if (!data) return 'Unknown';
    // Attempt translation; fallback handled by t() to default language where key exists
    const translated = t('enemy-names.' + data.key);
    // If translation failed (returns the key path), fallback to English name
    if (translated === 'enemy-names.' + data.key) return data.name;
    return translated;
}

// Pools of enemies for each type and condition
const enemyPools = {
    Offensive: {
        base: [3, 4, 5, 6, 7, 10, 12, 13, 14, 15, 17, 19, 20, 22, 23, 24],
        guardian: [28, 29, 30, 33],
        sboss: [47, 51]
    },
    Defensive: {
        base: [9, 10, 11, 18, 21, 25],
        guardian: [34, 35, 36],
        sboss: [44]
    },
    Balanced: {
        base: [1, 8, 9, 10, 12, 13, 14, 15, 16, 21, 25],
        guardian: [37, 38, 39],
        sboss: [45, 46, 49]
    },
    Quick: {
        base: [1, 2, 4, 5, 6, 7, 12, 16, 17, 18, 20, 23, 24],
        guardian: [40, 41],
        sboss: [50, 43]
    },
    Lethal: {
        base: [2, 5, 6, 7, 12, 13, 17, 20, 24],
        guardian: [42, 31, 32],
        sboss: [48]
    }
};

const generateRandomEnemy = (condition) => {
    enemy.condition = condition;
    const enemyTypes = Object.keys(enemyPools);
    enemy.type = enemyTypes[Math.floor(Math.random() * enemyTypes.length)];

    const maxLvl = dungeon.progress.floor * dungeon.settings.enemyLvlGap + (dungeon.settings.enemyBaseLvl - 1);
    const minLvl = maxLvl - (dungeon.settings.enemyLvlGap - 1);
    if (condition === 'guardian') {
        enemy.lvl = minLvl;
    } else if (condition === 'sboss') {
        enemy.lvl = maxLvl;
    } else {
        enemy.lvl = randomizeNum(minLvl, maxLvl);
    }
    if (player && player.lvl === 1 && enemy.lvl > 3) {
        enemy.lvl = 3;
    }

    let pool = enemyPools[enemy.type].base;
    if (condition === 'guardian') {
        pool = enemyPools[enemy.type].guardian;
    } else if (condition === 'sboss') {
        pool = enemyPools[enemy.type].sboss;
    }
    enemy.id = pool[Math.floor(Math.random() * pool.length)];
    setEnemyStats(enemy.type, condition);

    if (condition === 'chest') {
        enemy.id = 26;
    } else if (condition === 'door') {
        enemy.id = 27;
    }

    // Set translated display name
    enemy.name = getEnemyTranslatedName(enemy.id);
    setEnemyImg();
    if (typeof addToBestiary === 'function') {
        addToBestiary(enemy.id);
    }
};

// Set a randomly generated stat for the enemy
const setEnemyStats = (type, condition) => {
    if (type == 'Offensive') {
        enemy.stats = {
            hp: 0,
            hpMax: randomizeNum(300, 370),
            atk: randomizeNum(70, 100),
            def: randomizeNum(20, 50),
            atkSpd: randomizeDecimal(0.2, 0.4),
            vamp: 0,
            critRate: randomizeDecimal(1, 4),
            critDmg: randomizeDecimal(6.5, 7.5),
            dodge: 0
        };
    } else if (type == 'Defensive') {
        enemy.stats = {
            hp: 0,
            hpMax: randomizeNum(400, 500),
            atk: randomizeNum(40, 70),
            def: randomizeNum(40, 70),
            atkSpd: randomizeDecimal(0.1, 0.3),
            vamp: 0,
            critRate: 0,
            critDmg: 0,
            dodge: 0
        };
    } else if (type == 'Balanced') {
        enemy.stats = {
            hp: 0,
            hpMax: randomizeNum(320, 420),
            atk: randomizeNum(50, 80),
            def: randomizeNum(30, 60),
            atkSpd: randomizeDecimal(0.15, 0.35),
            vamp: 0,
            critRate: randomizeDecimal(0.5, 1.5),
            critDmg: randomizeDecimal(1, 3),
            dodge: 0
        };
    } else if (type == 'Quick') {
        enemy.stats = {
            hp: 0,
            hpMax: randomizeNum(300, 370),
            atk: randomizeNum(50, 80),
            def: randomizeNum(30, 60),
            atkSpd: randomizeDecimal(0.35, 0.45),
            vamp: 0,
            critRate: randomizeDecimal(1, 4),
            critDmg: randomizeDecimal(3, 6),
            dodge: 0
        };
    } else if (type == 'Lethal') {
        enemy.stats = {
            hp: 0,
            hpMax: randomizeNum(300, 370),
            atk: randomizeNum(70, 100),
            def: randomizeNum(20, 50),
            atkSpd: randomizeDecimal(0.15, 0.35),
            vamp: 0,
            critRate: randomizeDecimal(4, 8),
            critDmg: randomizeDecimal(6, 9),
            dodge: 0
        };
    }

    if (dungeon.enemyMultipliers == undefined) {
        dungeon.enemyMultipliers = {
            hp: 1,
            atk: 1,
            def: 1,
            atkSpd: 1,
            vamp: 1,
            critRate: 1,
            critDmg: 1
        }
    }

    // Apply stat scaling for enemies each level
    for (const stat in enemy.stats) {
        if (["hpMax", "atk", "def"].includes(stat)) {
            enemy.stats[stat] += Math.round(enemy.stats[stat] * ((dungeon.settings.enemyScaling - 1) * enemy.lvl));
        } else if (["atkSpd"].includes(stat)) {
            enemy.stats[stat] = 0.4;
            enemy.stats[stat] += enemy.stats[stat] * (((dungeon.settings.enemyScaling - 1) / 4) * enemy.lvl);
        } else if (["critRate"].includes(stat)) {
            enemy.stats[stat] += enemy.stats[stat] * (((dungeon.settings.enemyScaling - 1) / 4) * enemy.lvl);
        } else if (["critDmg"].includes(stat)) {
            enemy.stats[stat] = 50;
            enemy.stats[stat] += enemy.stats[stat] * (((dungeon.settings.enemyScaling - 1) / 4) * enemy.lvl);
        }
    }

    // Stat multiplier for floor guardians
    if (condition == 'guardian') {
        enemy.stats.hpMax = enemy.stats.hpMax * 1.5;
        enemy.stats.atk = enemy.stats.atk * 1.3;
        enemy.stats.def = enemy.stats.def * 1.3;
        enemy.stats.critRate = enemy.stats.critRate * 1.1;
        enemy.stats.critDmg = enemy.stats.critDmg * 1.2;
    }

    // Stat multiplier for monarchs
    if (condition == 'sboss') {
        enemy.stats.hpMax = enemy.stats.hpMax * 6;
        enemy.stats.atk = enemy.stats.atk * 2;
        enemy.stats.def = enemy.stats.def * 2;
        enemy.stats.critRate = enemy.stats.critRate * 1.1;
        enemy.stats.critDmg = enemy.stats.critDmg * 1.3;
    }

    // Apply stat multipliers for every stat
    let floorMultiplier = (dungeon.progress.floor / 3);
    if (floorMultiplier < 1) {
        floorMultiplier = 1;
    }
    enemy.stats.hpMax = Math.round((enemy.stats.hpMax * floorMultiplier) * dungeon.enemyMultipliers.hp);
    enemy.stats.atk = Math.round(enemy.stats.atk * dungeon.enemyMultipliers.atk);
    enemy.stats.def = Math.round(enemy.stats.def * dungeon.enemyMultipliers.def);
    enemy.stats.atkSpd = enemy.stats.atkSpd * dungeon.enemyMultipliers.atkSpd;
    enemy.stats.vamp = enemy.stats.vamp * dungeon.enemyMultipliers.vamp;
    enemy.stats.critRate = enemy.stats.critRate * dungeon.enemyMultipliers.critRate;
    enemy.stats.critDmg = enemy.stats.critDmg * dungeon.enemyMultipliers.critDmg;

    // Calculate dodge chance based on curse level and enemy level
    let curseLvl = Math.round((dungeon.settings.enemyScaling - 1) * 10);
    enemy.stats.dodge = ((curseLvl - 1) * 2) + (enemy.lvl / 10);
    if (enemy.stats.dodge < 0) {
        enemy.stats.dodge = 0;
    }
    if (enemy.stats.dodge > 50) {
        enemy.stats.dodge = 50;
    }

    const expYield = [];
    for (const stat in enemy.stats) {
        let statExp;
        if (["hpMax", "atk", "def"].includes(stat)) {
            statExp = enemy.stats[stat] + enemy.stats[stat] * 0.5;
        } else if (["atkSpd", "critRate", "critDmg"].includes(stat)) {
            statExp = enemy.stats[stat] + enemy.stats[stat] * 2;
        } else if (["vamp", "hp", "dodge"].includes(stat)) {
            statExp = enemy.stats[stat] + enemy.stats[stat] * 1;
        }
        expYield.push(statExp);
    }

    let expCalculation = (expYield.reduce((acc, cur) => acc + cur, 0)) / 20;
    enemy.rewards.exp = Math.round(expCalculation + expCalculation * (enemy.lvl * 0.1));
    if (enemy.rewards.exp > 1000000) {
        enemy.rewards.exp = 1000000 * randomizeDecimal(0.9, 1.1);
    }
    enemy.rewards.gold = Math.round((enemy.rewards.exp * randomizeDecimal(0.9, 1.1)) * 1.3);
    enemy.rewards.drop = randomizeNum(1, 3) == 1;

    enemy.stats.hp = enemy.stats.hpMax;
    enemy.stats.hpPercent = 100;

    if (enemy.stats.atkSpd > 2.5) {
        enemy.stats.atkSpd = 2.5;
    }
};

const setEnemyImg = () => {
    const data = enemyData[enemy.id];
    if (!data) return;
    let sprite = data.sprite;
    if (Array.isArray(sprite)) {
        sprite = sprite[Math.floor(Math.random() * sprite.length)];
    }
    enemy.image.name = sprite;
    enemy.image.size = data.size || '50%';
};

const enemyLoadStats = () => {
    let rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
    if (enemy.stats.hp > enemy.stats.hpMax) {
        enemy.stats.hp = enemy.stats.hpMax;
    }
    enemy.stats.hpPercent = ((enemy.stats.hp / enemy.stats.hpMax) * 100).toFixed(2).replace(rx, "$1");

    const enemyHpElement = document.querySelector('#enemy-hp-battle');
    const enemyHpDamageElement = document.querySelector('#enemy-hp-dmg');
    enemyHpElement.innerHTML = `&nbsp${nFormatter(enemy.stats.hp)}/${nFormatter(enemy.stats.hpMax)}(${enemy.stats.hpPercent}%)`;
    enemyHpElement.style.width = `${enemy.stats.hpPercent}%`;
    enemyHpDamageElement.style.width = `${enemy.stats.hpPercent}%`;
};
