const dungeonActivity = document.querySelector("#dungeonActivity");
const dungeonAction = document.querySelector("#dungeonAction");
const dungeonTime = document.querySelector("#dungeonTime");
const floorCount = document.querySelector("#floorCount");
const roomCount = document.querySelector("#roomCount");

const RUN_LOOT_RARITIES = ["Common", "Uncommon", "Rare", "Epic", "Legendary", "Heirloom"];

const createDefaultLootStatistics = () => ({
    total: 0,
    highestRarity: null,
    rarityCounts: RUN_LOOT_RARITIES.reduce((acc, rarity) => {
        acc[rarity] = 0;
        return acc;
    }, {}),
});

const createDefaultRunStatistics = () => ({
    kills: 0,
    bossesDefeated: 0,
    runtime: 0,
    damageDealt: 0,
    damageTaken: 0,
    goldEarned: 0,
    lootDrops: createDefaultLootStatistics(),
    latestCurseUnlock: null,
});

// Track dungeon loop timers even before the dungeon has started
let dungeonTimer = null;
let playTimer = null;

// Maximum number of entries to keep in the dungeon log backlog
const DUNGEON_BACKLOG_LIMIT = 40;

// Holds the type of the currently active event
let currentEvent = null;

const BASE_DUNGEON_EVENT_INTERVAL_MS = 1000;
const MIN_DUNGEON_EVENT_INTERVAL_MS = 100;
const DUNGEON_TIMER_TICK_MS = 100;
let lastDungeonEventTimestamp = Date.now();

let dungeon = {
    rating: 500,
    grade: "E",
    initialized: false,
    progress: {
        floor: 1,
        room: 1,
        floorLimit: 100,
        roomLimit: 5,
        stairsFloor: null,
    },
    settings: {
        enemyBaseLvl: 1,
        enemyLvlGap: 5,
        enemyBaseStats: 1,
        enemyScaling: 1.1,
    },
    status: {
        exploring: false,
        paused: true,
        event: false,
    },
    statistics: createDefaultRunStatistics(),
    floorBuffs: {
        atk: 0,
        def: 0,
        atkSpd: 0,
        currentFloor: 1,
    },
    // Add resting system properties
    resting: {
        duration: 0,
        // Percent of max HP regenerated each second while resting
        healthRegenRate: 1.0,
        restingBonusActive: false,
        restingBonusType: null,
        restingBonusValue: 0,
        restingBonusDuration: 0,
    },
    backlog: [],
    action: 0,
    // Tracks how often the player ignored door events
    nothingBias: 0,
    roomEvents: {
        blessingOccurred: false,
        stairsIgnored: false,
    },
};

const ensureRoomEventsState = () => {
    if (!dungeon.roomEvents || typeof dungeon.roomEvents !== 'object') {
        dungeon.roomEvents = { blessingOccurred: false };
    } else if (typeof dungeon.roomEvents.blessingOccurred !== 'boolean') {
        dungeon.roomEvents.blessingOccurred = false;
    }
};

// Reset per-room event flags
const resetRoomEvents = () => {
    ensureRoomEventsState();
    dungeon.roomEvents.blessingOccurred = false;
    dungeon.roomEvents.stairsIgnored = false;
};

const ensureRunStatisticsShape = () => {
    if (!dungeon.statistics || typeof dungeon.statistics !== 'object') {
        dungeon.statistics = createDefaultRunStatistics();
        return;
    }
    const stats = dungeon.statistics;
    const numericFields = ['kills', 'bossesDefeated', 'runtime', 'damageDealt', 'damageTaken', 'goldEarned'];
    numericFields.forEach((field) => {
        if (!Number.isFinite(stats[field])) {
            stats[field] = 0;
        }
    });
    if (!stats.lootDrops || typeof stats.lootDrops !== 'object') {
        stats.lootDrops = createDefaultLootStatistics();
    }
    if (!stats.lootDrops.rarityCounts || typeof stats.lootDrops.rarityCounts !== 'object') {
        stats.lootDrops.rarityCounts = createDefaultLootStatistics().rarityCounts;
    }
    RUN_LOOT_RARITIES.forEach((rarity) => {
        if (!Number.isFinite(stats.lootDrops.rarityCounts[rarity])) {
            stats.lootDrops.rarityCounts[rarity] = 0;
        }
    });
    if (typeof stats.lootDrops.total !== 'number') {
        stats.lootDrops.total = 0;
    }
    if (typeof stats.lootDrops.highestRarity !== 'string' || !stats.lootDrops.highestRarity) {
        stats.lootDrops.highestRarity = null;
    }

    if (!Number.isFinite(stats.latestCurseUnlock)) {
        stats.latestCurseUnlock = null;
    } else {
        const normalized = Math.round(stats.latestCurseUnlock);
        stats.latestCurseUnlock = Math.min(10, Math.max(1, normalized));
    }
};

const resetRunStatistics = () => {
    dungeon.statistics = createDefaultRunStatistics();
};

const recordRunBossDefeat = () => {
    ensureRunStatisticsShape();
    dungeon.statistics.bossesDefeated += 1;
};

const recordRunDamageDealt = (amount) => {
    ensureRunStatisticsShape();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
        return;
    }
    dungeon.statistics.damageDealt += Math.round(value);
};

const recordRunDamageTaken = (amount) => {
    ensureRunStatisticsShape();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
        return;
    }
    dungeon.statistics.damageTaken += Math.round(value);
};

const recordRunGoldEarned = (amount) => {
    ensureRunStatisticsShape();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
        return;
    }
    dungeon.statistics.goldEarned += Math.round(value);
};

const getRarityRank = (rarity) => RUN_LOOT_RARITIES.indexOf(rarity);

const recordRunLootDrop = (rarity) => {
    ensureRunStatisticsShape();
    const lootStats = dungeon.statistics.lootDrops;
    lootStats.total += 1;
    const normalizedRarity = RUN_LOOT_RARITIES.includes(rarity) ? rarity : 'Common';
    lootStats.rarityCounts[normalizedRarity] += 1;
    if (!lootStats.highestRarity || getRarityRank(normalizedRarity) > getRarityRank(lootStats.highestRarity)) {
        lootStats.highestRarity = normalizedRarity;
    }
};

if (typeof window !== 'undefined') {
    window.recordRunDamageDealt = recordRunDamageDealt;
    window.recordRunDamageTaken = recordRunDamageTaken;
    window.recordRunGoldEarned = recordRunGoldEarned;
    window.recordRunLootDrop = recordRunLootDrop;
    window.recordRunBossDefeat = recordRunBossDefeat;
    window.resetRunStatistics = resetRunStatistics;
    window.ensureRunStatisticsShape = ensureRunStatisticsShape;
}

const getFasterRunBonus = () => {
    if (player && player.stats && Number.isFinite(player.stats.fasterRun)) {
        return player.stats.fasterRun;
    }
    return 0;
};

const getDungeonEventInterval = () => {
    const fasterRun = Math.max(0, getFasterRunBonus());
    const reduction = Math.min(fasterRun / 100, 0.9);
    const adjusted = BASE_DUNGEON_EVENT_INTERVAL_MS * (1 - reduction);
    return Math.max(MIN_DUNGEON_EVENT_INTERVAL_MS, adjusted);
};

const dungeonEventTick = () => {
    if (!dungeon.status.exploring || dungeon.status.event) {
        return;
    }
    const now = Date.now();
    if (now - lastDungeonEventTimestamp < getDungeonEventInterval()) {
        return;
    }
    lastDungeonEventTimestamp = now;
    dungeonEvent();
};

// ===== Dungeon Setup =====
// Enables start and pause on button click
dungeonActivity.addEventListener('click', function () {
    dungeonStartPause();
});

const updateExploreButtonAttention = () => {
    if (player && player.stats.hp >= player.stats.hpMax && !dungeon.status.exploring) {
        dungeonActivity.classList.add('attention');
    } else {
        dungeonActivity.classList.remove('attention');
    }
};

// Sets up the initial dungeon
const initialDungeonLoad = () => {
    if (localStorage.getItem("dungeonData") !== null) {
        dungeon = JSON.parse(localStorage.getItem("dungeonData"));
        dungeon.status = {
            exploring: false,
            paused: true,
            event: false,
        };
        
        if (dungeon.progress.stairsFloor === undefined) {
            dungeon.progress.stairsFloor = null;
        }

        // Initialize resting system if it doesn't exist
        if (!dungeon.resting) {
            dungeon.resting = {
                duration: 0,
                // Percent of max HP regenerated each second while resting
                healthRegenRate: 1.0,
                restingBonusActive: false,
                restingBonusType: null,
                restingBonusValue: 0,
                restingBonusDuration: 0,
            };
        }

        // Ensure new properties exist on older saves
        if (dungeon.nothingBias === undefined) {
            dungeon.nothingBias = 0;
        }

        ensureRunStatisticsShape();
        updateDungeonLog();
    }
    
    // Initialize floor buffs system
    initializeFloorBuffs();
    
    // Check if we need to clear floor buffs due to floor advancement
    if (dungeon.floorBuffs.currentFloor < dungeon.progress.floor) {
        clearFloorBuffs();
    }
    
    loadDungeonProgress();
    dungeonTime.innerHTML = new Date(dungeon.statistics.runtime * 1000).toISOString().slice(11, 19);
    updateRestingDisplay();
    dungeonActivity.setAttribute('data-i18n', 'explore');
    dungeonActivity.textContent = t('explore');
    updateExploreButtonAttention();
    dungeon.initialized = true;
    dungeonTime.innerHTML = "00:00:00";
    lastDungeonEventTimestamp = Date.now();
    dungeonTimer = setInterval(dungeonEventTick, DUNGEON_TIMER_TICK_MS);
    playTimer = setInterval(dungeonCounter, 1000);
}

// Start and Pause Functionality
const dungeonStartPause = () => {
    if (!dungeon.status.paused) {
        sfxPause.play();

        updateRestingDisplay();
        dungeonActivity.setAttribute('data-i18n', 'explore');
        dungeonActivity.textContent = t('explore');
        dungeon.status.exploring = false;
        dungeon.status.paused = true;
    } else {
         if (!checkInventoryLimit(true)) {
            sfxDeny.play();
            return;
        }
        sfxUnpause.play();

        dungeonAction.innerHTML = t("exploring");
        dungeonActivity.textContent = "Pause";
        dungeonActivity.removeAttribute('data-i18n');
        dungeon.status.exploring = true;
        dungeon.status.paused = false;
        
        // Reset resting duration when starting exploration
        dungeon.resting.duration = 0;
    }
    updateExploreButtonAttention();
}

// Counts the total time for the current run and total playtime
const dungeonCounter = () => {
    player.playtime++;
    dungeon.statistics.runtime++;
    dungeonTime.innerHTML = new Date(dungeon.statistics.runtime * 1000).toISOString().slice(11, 19);
    if (Date.now() - lastSaveTime >= 3000) {
        saveData();
    }
}

// Loads the floor and room count
const loadDungeonProgress = () => {
    ensureRoomEventsState();
    if (dungeon.progress.room > dungeon.progress.roomLimit) {
        dungeon.progress.room = 1;
        dungeon.progress.floor++;
        dungeon.progress.stairsFloor = null;

        // Clear floor buffs when advancing to next floor
        clearFloorBuffs();

        resetRoomEvents();
    }
    floorCount.setAttribute('data-i18n', 'floor-count');
    floorCount.setAttribute('data-i18n-params', JSON.stringify({ floor: dungeon.progress.floor }));
    floorCount.textContent = t('floor-count', { floor: dungeon.progress.floor });
    roomCount.setAttribute('data-i18n', 'room-count');
    roomCount.setAttribute('data-i18n-params', JSON.stringify({ room: dungeon.progress.room }));
    roomCount.textContent = t('room-count', { room: dungeon.progress.room });
    if (typeof maybeUnlockNextCurseLevel === 'function') {
        maybeUnlockNextCurseLevel();
    }
}

// ========== Events in the Dungeon ==========
const dungeonEvent = () => {
    if (dungeon.status.exploring && !dungeon.status.event) {
        dungeon.action++;
        let choices;
        let eventRoll;
        let event;
        ensureRoomEventsState();
        let eventTypes = ["treasure", "enemy", "enemy", "enemy", "enemy", "nothing", "shrine"];
        if (!dungeon.roomEvents.blessingOccurred) {
            eventTypes.unshift("blessing");
        }
        if ( dungeon.progress.floor < 5 && dungeon.progress.room === 1 && player.equipped.length === 6 && !dungeon.roomEvents.stairsIgnored) {
        	eventTypes.push("stairs");        	
        	eventTypes.push("stairs");
        }
        for (let i = 0; i < dungeon.nothingBias; i++) {
            eventTypes.push("nothing");
        }
        if (dungeon.action > 2 && dungeon.action < 6) {
            eventTypes.push("nextroom");
        } else if (dungeon.action > 5) {
            eventTypes = ["nextroom"];
        }
        event = eventTypes[Math.floor(Math.random() * eventTypes.length)];
        if ( dungeon.progress.floor === 1 && dungeon.progress.room === 1 && dungeon.action === 1 && dungeon.nothingBias === 0) {
            if (!localStorage.getItem('introHintShown')) {
                localStorage.setItem('introHintShown', true);
                event = "enemy";
            } else {
                event = "stairs";
            }
        }
        currentEvent = event;

        switch (event) {
            case "nextroom":
                dungeon.status.event = true;
                choices = `
                    <div class="decision-panel">
                        <button id="choice1" data-i18n="enter">${t('enter')}</button>
                        <button id="choice2" data-i18n="ignore">${t('ignore')}</button>
                    </div>`;
                if (dungeon.progress.room == dungeon.progress.roomLimit) {
                    addDungeonLog(t('boss-room-door-discovered'), choices);
                } else {
                    addDungeonLog(t('door-found'), choices);
                }
                document.querySelector("#choice1").onclick = function () {
                    sfxConfirm.play();
                    dungeon.nothingBias = 0;
                    currentEvent = null;
                    if (dungeon.progress.room == dungeon.progress.roomLimit) {
                        guardianBattle();
                    } else {
                        eventRoll = randomizeNum(1, 3);
                        if (eventRoll == 1) {
                            incrementRoom();
                            mimicBattle("door");
                        } else if (eventRoll == 2) {
                            incrementRoom();
                            currentEvent = "treasure";
                            choices = `
                                <div class="decision-panel">
                                    <button id="choice1" data-i18n="open-the-chest">${t('open-the-chest')}</button>
                                    <button id="choice2" data-i18n="ignore">${t('ignore')}</button>
                                </div>`;
                            addDungeonLog(t('treasure-chamber-entered'), choices);
                            document.querySelector("#choice1").onclick = function () {
                                chestEvent();
                            }
                            document.querySelector("#choice2").onclick = function () {
                                dungeon.action = 0;
                                ignoreEvent();
                            };
                            autoConfirm();
                        } else {
                            dungeon.status.event = false;
                            incrementRoom();
                            addDungeonLog(t('moved-to-next-room'));
                        }
                    }
                };
                document.querySelector("#choice2").onclick = function () {
                    dungeon.action = 0;
                    ignoreEvent();
                };
                if (dungeon.progress.room == dungeon.progress.roomLimit) {
                    if ( (dungeon.nothingBias < autoIgnoreDoors) || !autoBossDoors) {
                        autoDecline();
                    } else {
                        autoConfirm();
                    }
                } else {
                    if (dungeon.nothingBias < autoIgnoreDoors) {
                        autoDecline();
                    } else {
                        autoConfirm();
                    }
                }
                break;
            case "treasure":
                dungeon.status.event = true;
                choices = `
                    <div class="decision-panel">
                        <button id="choice1">${t('open-the-chest')}</button>
                        <button id="choice2">${t('ignore')}</button>
                    </div>`;
                addDungeonLog(t('treasure-chamber-found'), choices);
                document.querySelector("#choice1").onclick = function () {
                    chestEvent();
                }
                document.querySelector("#choice2").onclick = function () {
                    ignoreEvent();
                };
                autoConfirm();
                break;
            case "nothing":
                nothingEvent();
                break;
            case "stairs":
                dungeon.status.event = true;
                choices = `
                    <div class="decision-panel">
                        <button id="choice1" data-i18n="descend">${t('descend')}</button>
                        <button id="choice2" data-i18n="ignore">${t('ignore')}</button>
                    </div>`;
                addDungeonLog(t('found-stairs'), choices);
                document.querySelector("#choice1").onclick = function () {
                    sfxConfirm.play();
                    dungeon.progress.floor += 1;
                    dungeon.progress.room = 1;
                    dungeon.action = 0;
                    dungeon.progress.stairsFloor = dungeon.progress.floor;
                    resetRoomEvents();
                    loadDungeonProgress();
                    addDungeonLog(t('descended-to-floor', { floor: dungeon.progress.floor }));
                    dungeon.status.event = false;
                    currentEvent = null;
                }
                document.querySelector("#choice2").onclick = function () {
                    dungeon.roomEvents.stairsIgnored = true;
                    ignoreEvent();
                };
                autoDecline();
                break;
            case "enemy":
                dungeon.status.event = true;
                choices = `
                    <div class="decision-panel">
                        <button id="choice1" data-i18n="engage">${t('engage')}</button>
                        <button id="choice2" data-i18n="flee">${t('flee')}</button>
                    </div>`;
                generateRandomEnemy();
                // Ensure name reflects current language
                // if (typeof getEnemyTranslatedName === 'function') {
                    enemy.name = getEnemyTranslatedName(enemy.id);
                // }
                addDungeonLog(t('encountered-enemy', { enemy: enemy.name }), choices);
                // player.inCombat = true;
                document.querySelector("#choice1").onclick = function () {
                    engageBattle();
                }
                document.querySelector("#choice2").onclick = function () {
                    fleeBattle();
                }
                autoConfirm();
                break;
            case "blessing":
                eventRoll = randomizeNum(1, 2);
                if (eventRoll == 1) {
                    dungeon.status.event = true;
                    dungeon.roomEvents.blessingOccurred = true;
                    blessingValidation();
                    let cost = player.blessing * (500 * (player.blessing * 0.5)) + 750;
                    choices = `
                        <div class="decision-panel">
                            <button id="choice1">${t('offer')}</button>
                            <button id="choice2">${t('ignore')}</button>
                        </div>`;
                    addDungeonLog(t('statue-of-blessing-offer', { cost: nFormatter(cost), level: player.blessing }), choices);
                    document.querySelector("#choice1").onclick = function () {
                        if (player.gold < cost) {
                            sfxDeny.play();
                            addDungeonLog(t('not-enough-gold'));
                        } else {
                            player.gold -= cost;
                            sfxConfirm.play();
                            statBlessing();
                        }
                        dungeon.status.event = false;
                    }
                    document.querySelector("#choice2").onclick = function () {
                        ignoreEvent();
                    };
                    if (autoBlessings) {
                        autoConfirm();
                    } else {
                        autoDecline();
                    }
                } else {
                    nothingEvent();
                }
                break;
            case "monarch":
                eventRoll = randomizeNum(1, 7);
                if (eventRoll == 1) {
                    dungeon.status.event = true;
                    choices = `
                            <div class="decision-panel">
                                <button id="choice1" data-i18n="enter">${t('enter')}</button>
                                <button id="choice2" data-i18n="ignore">${t('ignore')}</button>
                            </div>`;
                    addDungeonLog(t('mysterious-chamber'), choices);
                    document.querySelector("#choice1").onclick = function () {
                        specialBossBattle();
                    }
                    document.querySelector("#choice2").onclick = function () {
                        ignoreEvent();
                    };
                } else {
                    nothingEvent();
                }
                break;
            case "shrine":
                eventRoll = randomizeNum(1, 3);
                if (eventRoll == 1) {
                    dungeon.status.event = true;
                    let healCost = Math.round(player.stats.hpMax * 0.4) + (dungeon.progress.floor * 70);
                    choices = `
                            <div class="decision-panel">
                                <button id="choice1" data-i18n="pray">${t('pray')}</button>
                                <button id="choice2" data-i18n="ignore">${t('ignore')}</button>
                            </div>`;
                    addDungeonLog(t('healing-shrine-offer', { cost: nFormatter(healCost) }), choices);
                    document.querySelector("#choice1").onclick = function () {
                        if (player.gold < healCost) {
                            sfxDeny.play();
                            addDungeonLog(t('not-enough-gold'));
                        } else {
                            player.gold -= healCost;
                            sfxBuff.play();
                            shrineHealing();
                        }
                        dungeon.status.event = false;
                    }
                    document.querySelector("#choice2").onclick = function () {
                        ignoreEvent();
                    };
                    if (autoHeal) {
                        autoConfirm();
                    } else {
                        autoDecline();
                    }
                } else {
                    nothingEvent();
                }
        }
    } else if (dungeon.status.paused && !dungeon.status.event) {
        // Handle resting activities
        processRestingActivities();
    }
}

// ========= Dungeon Choice Events ==========
// Starts the battle
const engageBattle = () => {
    showCombatInfo();
    addCombatLog(t('encountered-enemy', { enemy: enemy.name }));
    startCombat(bgmBattleMain);
    updateDungeonLog();
}

// Mimic encounter
const mimicBattle = (type) => {
    generateRandomEnemy(type);
    showCombatInfo();
    addCombatLog(t('encountered-enemy', { enemy: enemy.name }));
    startCombat(bgmBattleMain);
    addDungeonLog(t('encountered-enemy', { enemy: enemy.name }));
}

// boss fight
const guardianBattle = () => {
    generateRandomEnemy("guardian");
    showCombatInfo();
    addCombatLog(t('guardian-blocking-way', { enemy: enemy.name }));
    startCombat(bgmBattleBoss);
    updateDungeonLog();
}

// mysterious chamber fight
const specialBossBattle = () => {
    generateRandomEnemy("sboss");
    showCombatInfo();
    addCombatLog(t('enemy-awoken', { enemy: enemy.name }));
    startCombat(bgmBattleBoss);
    addDungeonLog(t('enemy-awoken', { enemy: enemy.name }));
}

// Flee from the monster
const fleeBattle = () => {
    let eventRoll = randomizeNum(1, 10);
    if (eventRoll <= 9) {
        sfxConfirm.play();
    addDungeonLog(t('flee-success'));
        player.inCombat = false;
        dungeon.status.event = false;
    } else {
    addDungeonLog(t('flee-failure'));
        showCombatInfo();
    addCombatLog(t('encountered-enemy', { enemy: enemy.name }));
        startCombat(bgmBattleMain);
    addCombatLog(t('flee-failure'));
    }
}

// Chest event randomizer
const isGoldOnlyFloor = () => {
    return dungeon.progress.floor === 1 || dungeon.progress.stairsFloor === dungeon.progress.floor;
}

const chestEvent = () => {
    sfxConfirm.play();
    let eventRoll = randomizeNum(1, 4);
    if (eventRoll == 1) {
        mimicBattle("chest");
    } else if (eventRoll == 2) {
        if (isGoldOnlyFloor()) {
            goldDrop();
        } else {
            createEquipmentPrint("dungeon");
        }
        dungeon.status.event = false;
    } else if (eventRoll == 3) {
        goldDrop();
        dungeon.status.event = false;
    } else {
    addDungeonLog(t('chest-empty'));
        dungeon.status.event = false;
    }
}

// Calculates Gold Drop
const goldDrop = () => {
    sfxSell.play();
    let goldValue = randomizeNum(50, 500) * dungeon.progress.floor;
    addDungeonLog(t('gold-found', { gold: nFormatter(goldValue) }));
    player.gold += goldValue;
    if (typeof recordRunGoldEarned === 'function') {
        recordRunGoldEarned(goldValue);
    }
    playerLoadStats();
}

// Non choices dungeon event messages
const nothingEvent = () => {
    let eventRoll = randomizeNum(1, 5);
    if (eventRoll == 1) {
    addDungeonLog(t('explored-found-nothing'));
    } else if (eventRoll == 2) {
    addDungeonLog(t('found-empty-chest'));
    } else if (eventRoll == 3) {
    addDungeonLog(t('found-monster-corpse'));
    } else if (eventRoll == 4) {
    addDungeonLog(t('found-corpse'));
    } else if (eventRoll == 5) {
    addDungeonLog(t('nothing-here'));
    }
}

// Random stat buff
const statBlessing = () => {
    sfxBuff.play();
    let stats = ["hp", "atk", "def", "atkSpd", "vamp", "critRate", "critDmg", "dodge", "luck"];
    let buff = stats[Math.floor(Math.random() * stats.length)];
    let value;
    switch (buff) {
        case "hp":
            value = 10;
            player.bonusStats.hp += value;
            break;
        case "atk":
            value = 8;
            player.bonusStats.atk += value;
            break;
        case "def":
            value = 8;
            player.bonusStats.def += value;
            break;
        case "atkSpd":
            value = 3;
            player.bonusStats.atkSpd += value;
            break;
        case "vamp":
            value = 0.5;
            player.bonusStats.vamp += value;
            break;
        case "critRate":
            value = 1;
            player.bonusStats.critRate += value;
            break;
        case "critDmg":
            value = 6;
            player.bonusStats.critDmg += value;
            break;
        case "dodge":
            value = 0.3;
            player.bonusStats.dodge += value;
            break;
        case "luck":
            value = 1;
            player.bonusStats.luck += value;
            break;
    }
    addDungeonLog(t('blessing-gain', { value: value, stat: buff.replace(/([A-Z])/g, ".$1").replace(/crit/g, "c").toUpperCase(), old: player.blessing, new: player.blessing + 1 }));
    blessingUp();
    playerLoadStats();
}

// Shrine healing offering
const shrineHealing = () => {
    let healAmount = Math.round(player.stats.hpMax * (0.25 + Math.random() * 0.5)); // 25-75% healing
    let actualHeal = Math.min(healAmount, player.stats.hpMax - player.stats.hp);
    
    if (actualHeal > 0) {
        player.stats.hp += actualHeal;
    addDungeonLog(t('divine-light-heals', { hp: actualHeal }));
    }
    let buffRoll = randomizeNum(1, 3);
    if (buffRoll == 1) {
        applyFloorBuff("atkSpd", 2);
    addDungeonLog(t('reflexes-sharpen'));
    } else if (buffRoll == 2) {
        applyFloorBuff("atk", 5);
    addDungeonLog(t('weapons-glow'));
    } else {
        applyFloorBuff("def", 3);
    addDungeonLog(t('armor-fortifies'));
    }
    
    playerLoadStats();
}

// Ignore event and proceed exploring
const ignoreEvent = () => {
    sfxConfirm.play();
    if (currentEvent === "nextroom") {
        if (dungeon.nothingBias < 40) {
            dungeon.nothingBias++;
        }
    }
    dungeon.status.event = false;
    currentEvent = null;
    addDungeonLog(t('ignored-move-on'));
}

// Increase room or floor accordingly
const incrementRoom = () => {
    dungeon.progress.room++;
    dungeon.action = 0;
    resetRoomEvents();
    loadDungeonProgress();
}

// Increases player total blessing
const blessingUp = () => {
    blessingValidation();
    player.blessing++;
}

// Validates whether blessing exists or not
const blessingValidation = () => {
    if (player.blessing == undefined) {
        player.blessing = 1;
    }
}

// ========= Floor Buff System ==========
// Initialize floor buffs if they don't exist
const initializeFloorBuffs = () => {
    if (dungeon.floorBuffs == undefined) {
        dungeon.floorBuffs = {
            atk: 0,
            def: 0,
            atkSpd: 0,
            currentFloor: dungeon.progress.floor,
        };
    }
}

// Apply a temporary floor buff
const applyFloorBuff = (statType, value) => {
    initializeFloorBuffs();
    dungeon.floorBuffs[statType] += value;
    if (dungeon.floorBuffs[statType] > 25) {
        dungeon.floorBuffs[statType] = 25;
    }
    dungeon.floorBuffs.currentFloor = dungeon.progress.floor;
}

// Clear floor buffs when advancing to next floor
const clearFloorBuffs = () => {
    initializeFloorBuffs();
    if (dungeon.floorBuffs.currentFloor < dungeon.progress.floor) {
        let hadBuffs = dungeon.floorBuffs.atk > 0 || dungeon.floorBuffs.def > 0 || dungeon.floorBuffs.atkSpd > 0;
        
        if (hadBuffs) {
            addDungeonLog(t('shrine-blessings-fade'));
        }
        
        dungeon.floorBuffs.atk = 0;
        dungeon.floorBuffs.def = 0;
        dungeon.floorBuffs.atkSpd = 0;
        dungeon.floorBuffs.currentFloor = dungeon.progress.floor;
        playerLoadStats();
    }
}

// ========= Dungeon Backlog ==========
// Displays every dungeon activity
const updateDungeonLog = (choices) => {
    let dungeonLog = document.querySelector("#dungeonLog");
    dungeonLog.innerHTML = "";

    // Determine log flow direction (default: bottom)
    const logFlow = (localStorage.getItem('logFlow') || 'bottom');
    const recent = dungeon.backlog.slice(-DUNGEON_BACKLOG_LIMIT);
    const messages = (logFlow === 'top') ? [...recent].reverse() : recent;

    // Display the recent dungeon logs in the chosen order
    for (let message of messages) {
        let logElement = document.createElement("p");
        logElement.innerHTML = message;
        dungeonLog.appendChild(logElement);
    }

    // If the event has choices, display it
    if (typeof choices !== 'undefined') {
        let eventChoices = document.createElement("div");
        eventChoices.innerHTML = choices;
        if (logFlow === 'top') {
            // Insert choices right after the newest log (which is the first child)
            if (dungeonLog.firstChild) {
                dungeonLog.insertBefore(eventChoices, dungeonLog.children[1] || null);
            } else {
                dungeonLog.appendChild(eventChoices);
            }
        } else {
            dungeonLog.appendChild(eventChoices);
        }
    }

    // Adjust scroll position based on flow
    if (logFlow === 'top') {
        dungeonLog.scrollTop = 0;
    } else {
        dungeonLog.scrollTop = dungeonLog.scrollHeight;
    }

    bindDungeonSellButtons();
}

// Add a log to the dungeon backlog
const addDungeonLog = (message, choices) => {
    dungeon.backlog.push(message);
    if (dungeon.backlog.length > DUNGEON_BACKLOG_LIMIT) {
        dungeon.backlog.shift();
    }
    updateDungeonLog(choices);
}

const bindDungeonSellButtons = () => {
    const dungeonLog = document.querySelector('#dungeonLog');
    if (!dungeonLog) {
        return;
    }
    const buttons = dungeonLog.querySelectorAll('.dungeon-sell-button');
    buttons.forEach((button) => {
        if (button.dataset.bound === 'true') {
            return;
        }
        button.dataset.bound = 'true';
        button.onclick = () => sellDungeonLoot(button);
    });
};

const markDungeonLootSold = (lootId) => {
    if (!lootId || !Array.isArray(dungeon.backlog)) {
        return;
    }
    const marker = `data-loot-id="${lootId}"`;
    for (let i = dungeon.backlog.length - 1; i >= 0; i--) {
        const entry = dungeon.backlog[i];
        if (typeof entry === 'string' && entry.includes(marker) && !entry.includes(`${marker} disabled`)) {
            dungeon.backlog[i] = entry.replace(marker, `${marker} disabled`);
            return;
        }
    }
};

const sellDungeonLoot = (button) => {
    if (!button || button.disabled) {
        return;
    }
    const { placement, index, serialized, value, lootId } = button.dataset;
    const serializedItem = serialized ? decodeURIComponent(serialized) : '';
    const goldValue = Number(value);
    let removed = false;

    if (placement === 'inventory' && player && player.inventory && Array.isArray(player.inventory.equipment)) {
        const targetIndex = Number(index);
        if (Number.isInteger(targetIndex) && player.inventory.equipment[targetIndex] === serializedItem) {
            player.inventory.equipment.splice(targetIndex, 1);
            removed = true;
        } else {
            const fallbackIndex = player.inventory.equipment.lastIndexOf(serializedItem);
            if (fallbackIndex >= 0) {
                player.inventory.equipment.splice(fallbackIndex, 1);
                removed = true;
            }
        }
    } else if (placement === 'equipped' && player && Array.isArray(player.equipped)) {
        const targetIndex = Number(index);
        if (Number.isInteger(targetIndex)) {
            const equippedItem = player.equipped[targetIndex];
            if (equippedItem && JSON.stringify(equippedItem) === serializedItem) {
                player.equipped.splice(targetIndex, 1);
                removed = true;
            }
        }
        if (!removed) {
            const fallbackIndex = player.equipped.findIndex((item) => JSON.stringify(item) === serializedItem);
            if (fallbackIndex >= 0) {
                player.equipped.splice(fallbackIndex, 1);
                removed = true;
            }
        }
    }

    if (!removed) {
        console.warn('Unable to locate dungeon loot for sale.');
        return;
    }

    const payout = Number.isFinite(goldValue) ? goldValue : 0;
    player.gold += payout;
    if (typeof recordRunGoldEarned === 'function') {
        recordRunGoldEarned(payout);
    }
    sfxSell.play();
    markDungeonLootSold(lootId);
//    const sellLabel = typeof t === 'function' ? t('sell') : 'Sell';
//    addDungeonLog(`<span class="combat-sell-log"><i class="fas fa-coins" style="color: #FFD700;"></i>${sellLabel}: +${nFormatter(payout)}</span>`);
    playerLoadStats();
    saveData();
};

// Clear the dungeon log without disrupting active choices
const clearDungeonLog = () => {
    let storedChoiceContainer = null;
    let preservedLogEntry = null;
    const dungeonLogElement = document.querySelector('#dungeonLog');
    if (dungeonLogElement) {
        const activeChoiceButton = dungeonLogElement.querySelector('#choice1, #choice2, #choice3');
        if (activeChoiceButton) {
            storedChoiceContainer = activeChoiceButton.parentElement;
            if (storedChoiceContainer && storedChoiceContainer.parentElement) {
                storedChoiceContainer.parentElement.removeChild(storedChoiceContainer);
            }

            if (dungeon.backlog.length > 0) {
                preservedLogEntry = dungeon.backlog[dungeon.backlog.length - 1];
            }
        }
    }

    dungeon.backlog.length = 0;
    if (preservedLogEntry !== null) {
        dungeon.backlog.push(preservedLogEntry);
    }
    updateDungeonLog();

    if (storedChoiceContainer && dungeonLogElement) {
        const logFlow = (localStorage.getItem('logFlow') || 'bottom');
        if (logFlow === 'top') {
            dungeonLogElement.insertBefore(storedChoiceContainer, dungeonLogElement.firstChild);
            dungeonLogElement.scrollTop = 0;
        } else {
            dungeonLogElement.appendChild(storedChoiceContainer);
            dungeonLogElement.scrollTop = dungeonLogElement.scrollHeight;
        }
    }

    saveData();
}

// ========= Resting System ==========
// Process all resting activities while paused
const processRestingActivities = () => {
    if (player.inCombat) return;

    dungeon.resting.duration++;

    // Passive health regeneration (percentage based)
    if (player.stats.hp < player.stats.hpMax) {
        const regenAmount = Math.round(player.stats.hpMax * (dungeon.resting.healthRegenRate / 100));
        player.stats.hp = Math.min(player.stats.hpMax, player.stats.hp + regenAmount);
    }

    // Temporary resting bonus generation
    if (dungeon.resting.duration % 120 === 0) { // Every 2 minutes
        generateRestingBonus();
    }

    // Update resting bonus duration
    if (dungeon.resting.restingBonusActive) {
        dungeon.resting.restingBonusDuration--;
        if (dungeon.resting.restingBonusDuration <= 0) {
            expireRestingBonus();
        }
    }

    updateRestingDisplay();
    playerLoadStats();
}

// Update the resting display
const updateRestingDisplay = () => {
    let restingMessage = t('resting');
    
    if (dungeon.resting.duration > 0) {
        const minutes = Math.floor(dungeon.resting.duration / 60);
        const seconds = dungeon.resting.duration % 60;
        restingMessage += ` (${minutes}:${seconds.toString().padStart(2, '0')})`;
    }
    
    // Add active bonus indicator
    if (dungeon.resting.restingBonusActive) {
        restingMessage += ` <span style="color: #FFD700;">✨</span>`;
    }
    
    // Add health regen indicator
    if (player.stats.hp < player.stats.hpMax) {
        restingMessage += ` <span style="color: #4CAF50;">❤️</span>`;
    }

    dungeonAction.innerHTML = restingMessage + "...";
}

// Generate temporary resting bonuses
const generateRestingBonus = () => {
    if (dungeon.resting.restingBonusActive) return; // Already have an active bonus
    
    const bonusTypes = ["focus", "vitality", "serenity"];
    const selectedType = bonusTypes[Math.floor(Math.random() * bonusTypes.length)];
    
    dungeon.resting.restingBonusActive = true;
    dungeon.resting.restingBonusType = selectedType;
    dungeon.resting.restingBonusDuration = 300; // 5 minutes
    
    switch (selectedType) {
        case "focus":
            dungeon.resting.restingBonusValue = 10;
            applyFloorBuff("atkSpd", 10);
            addDungeonLog(t('resting-bonus-focus'));
            break;
        case "vitality":
            dungeon.resting.restingBonusValue = 15;
            applyFloorBuff("atk", 15);
            addDungeonLog(t('resting-bonus-vitality'));
            break;
        case "serenity":
            dungeon.resting.restingBonusValue = 12;
            applyFloorBuff("def", 12);
            addDungeonLog(t('resting-bonus-serenity'));
            break;
    }
}

// Expire resting bonus
const expireRestingBonus = () => {    
    dungeon.resting.restingBonusActive = false;
    dungeon.resting.restingBonusType = null;
    dungeon.resting.restingBonusValue = 0;
    dungeon.resting.restingBonusDuration = 0;
}
