const dungeonActivity = document.querySelector("#dungeonActivity");
const dungeonAction = document.querySelector("#dungeonAction");
const dungeonTime = document.querySelector("#dungeonTime");
const floorCount = document.querySelector("#floorCount");
const roomCount = document.querySelector("#roomCount");

// Auto mode toggle - stored in localStorage
let autoMode = localStorage.getItem("autoMode") === "true";

const autoConfirm = () => {
    if (autoMode) {
        // Slight delay to ensure button exists
        setTimeout(() => {
            const btn = document.querySelector('#choice1');
            if (btn) btn.click();
        }, 100);
    }
};

const autoDecline = () => {
    if (autoMode) {
        setTimeout(() => {
            const btn = document.querySelector('#choice2');
            if (btn) btn.click();
        }, 100);
    }
};

// Maximum number of entries to keep in the dungeon log backlog
const DUNGEON_BACKLOG_LIMIT = 40;

// Holds the type of the currently active event
let currentEvent = null;

let dungeon = {
    rating: 500,
    grade: "E",
    progress: {
        floor: 1,
        room: 1,
        floorLimit: 100,
        roomLimit: 5,
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
    statistics: {
        kills: 0,
        runtime: 0,
    },
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
};

// ===== Dungeon Setup =====
// Enables start and pause on button click
dungeonActivity.addEventListener('click', function () {
    dungeonStartPause();
});

// Sets up the initial dungeon
const initialDungeonLoad = () => {
    if (localStorage.getItem("dungeonData") !== null) {
        dungeon = JSON.parse(localStorage.getItem("dungeonData"));
        dungeon.status = {
            exploring: false,
            paused: true,
            event: false,
        };
        
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
    dungeonActivity.innerHTML = "Explore";
    dungeonTime.innerHTML = "00:00:00";
    dungeonTimer = setInterval(dungeonEvent, 1000);
    playTimer = setInterval(dungeonCounter, 1000);
}

// Start and Pause Functionality
const dungeonStartPause = () => {
    if (!dungeon.status.paused) {
        sfxPause.play();

        updateRestingDisplay();
        dungeonActivity.innerHTML = "Explore";
        dungeon.status.exploring = false;
        dungeon.status.paused = true;
    } else {
         if (!checkInventoryLimit(true)) {
            sfxDeny.play();
            return;
        }
        sfxUnpause.play();

        dungeonAction.innerHTML = "Exploring...";
        dungeonActivity.innerHTML = "Pause";
        dungeon.status.exploring = true;
        dungeon.status.paused = false;
        
        // Reset resting duration when starting exploration
        dungeon.resting.duration = 0;
    }
}

// Counts the total time for the current run and total playtime
const dungeonCounter = () => {
    player.playtime++;
    dungeon.statistics.runtime++;
    dungeonTime.innerHTML = new Date(dungeon.statistics.runtime * 1000).toISOString().slice(11, 19);
    if (dungeon.statistics.runtime % 15 === 0) {
        saveData();
    }
}

// Loads the floor and room count
const loadDungeonProgress = () => {
    if (dungeon.progress.room > dungeon.progress.roomLimit) {
        dungeon.progress.room = 1;
        dungeon.progress.floor++;
        
        // Clear floor buffs when advancing to next floor
        clearFloorBuffs();
    }
    floorCount.innerHTML = `Floor ${dungeon.progress.floor}`;
    roomCount.innerHTML = `Room ${dungeon.progress.room}`;
}

// ========== Events in the Dungeon ==========
const dungeonEvent = () => {
    if (dungeon.status.exploring && !dungeon.status.event) {
        dungeon.action++;
        let choices;
        let eventRoll;
        let eventTypes = ["blessing", "curse", "treasure", "enemy", "enemy", "enemy", "enemy", "nothing", "shrine"];
        for (let i = 0; i < dungeon.nothingBias; i++) {
            eventTypes.push("nothing");
        }
        if (dungeon.action > 2 && dungeon.action < 6) {
            eventTypes.push("nextroom");
        } else if (dungeon.action > 5) {
            eventTypes = ["nextroom"];
        }
        const event = eventTypes[Math.floor(Math.random() * eventTypes.length)];
        currentEvent = event;

        switch (event) {
            case "nextroom":
                dungeon.status.event = true;
                choices = `
                    <div class="decision-panel">
                        <button id="choice1">Enter</button>
                        <button id="choice2">Ignore</button>
                    </div>`;
                if (dungeon.progress.room == dungeon.progress.roomLimit) {
                    addDungeonLog(`<span class="Heirloom">You found the door to the boss room.</span>`, choices);
                } else {
                    addDungeonLog("You found a door.", choices);
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
                            addDungeonLog("You moved to the next floor.");
                        } else if (eventRoll == 2) {
                            incrementRoom();
                            currentEvent = "treasure";
                            choices = `
                                <div class="decision-panel">
                                    <button id="choice1">Open the chest</button>
                                    <button id="choice2">Ignore</button>
                                </div>`;
                            addDungeonLog(`You moved to the next room and found a treasure chamber. There is a <i class="fa fa-toolbox"></i>Chest inside.`, choices);
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
                            addDungeonLog("You moved to the next room.");
                        }
                    }
                };
                document.querySelector("#choice2").onclick = function () {
                    dungeon.action = 0;
                    ignoreEvent();
                };
                if (dungeon.progress.room == dungeon.progress.roomLimit) {
                    autoDecline();
                } else {
                    autoConfirm();
                }
                break;
            case "treasure":
                dungeon.status.event = true;
                choices = `
                    <div class="decision-panel">
                        <button id="choice1">Open the chest</button>
                        <button id="choice2">Ignore</button>
                    </div>`;
                addDungeonLog(`You found a treasure chamber. There is a <i class="fa fa-toolbox"></i>Chest inside.`, choices);
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
            case "enemy":
                dungeon.status.event = true;
                choices = `
                    <div class="decision-panel">
                        <button id="choice1">Engage</button>
                        <button id="choice2">Flee</button>
                    </div>`;
                generateRandomEnemy();
                addDungeonLog(`You encountered ${enemy.name}.`, choices);
                player.inCombat = true;
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
                    blessingValidation();
                    let cost = player.blessing * (500 * (player.blessing * 0.5)) + 750;
                    choices = `
                        <div class="decision-panel">
                            <button id="choice1">Offer</button>
                            <button id="choice2">Ignore</button>
                        </div>`;
                    addDungeonLog(`<span class="Legendary">You found a Statue of Blessing. Do you want to offer <i class="fas fa-coins" style="color: #FFD700;"></i><span class="Common">${nFormatter(cost)}</span> to gain blessings? (Blessing Lv.${player.blessing})</span>`, choices);
                    document.querySelector("#choice1").onclick = function () {
                        if (player.gold < cost) {
                            sfxDeny.play();
                            addDungeonLog("You don't have enough gold.");
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
                    autoDecline();
                } else {
                    nothingEvent();
                }
                break;
            case "curse":
                eventRoll = randomizeNum(1, 3);
                if (eventRoll == 1) {
                    dungeon.status.event = true;
                    let curseLvl = Math.round((dungeon.settings.enemyScaling - 1) * 10);
                    let cost = curseLvl * (10000 * (curseLvl * 0.5)) + 5000;
                    choices = `
                            <div class="decision-panel">
                                <button id="choice1">Offer</button>
                                <button id="choice2">Ignore</button>
                            </div>`;
                    addDungeonLog(`<span class="Heirloom">You found a Cursed Totem. Do you want to offer <i class="fas fa-coins" style="color: #FFD700;"></i><span class="Common">${nFormatter(cost)}</span>? This will strengthen the monsters but will also improve the loot quality. (Curse Lv.${curseLvl})</span>`, choices);
                    document.querySelector("#choice1").onclick = function () {
                        if (player.gold < cost) {
                            sfxDeny.play();
                            addDungeonLog("You don't have enough gold.");
                        } else {
                            player.gold -= cost;
                            sfxConfirm.play();
                            cursedTotem(curseLvl);
                        }
                        dungeon.status.event = false;
                    }
                    document.querySelector("#choice2").onclick = function () {
                        ignoreEvent();
                    };
                    autoDecline();
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
                                <button id="choice1">Enter</button>
                                <button id="choice2">Ignore</button>
                            </div>`;
                    addDungeonLog(`<span class="Heirloom">You found a mysterious chamber. It seems like there is something sleeping inside.</span>`, choices);
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
                                <button id="choice1">Pray</button>
                                <button id="choice2">Ignore</button>
                            </div>`;
                    addDungeonLog(`<span class="Epic">You discovered an ancient healing shrine. The air shimmers with restorative magic. Pray for <i class="fas fa-coins" style="color: #FFD700;"></i><span class="Common">${nFormatter(healCost)}</span> to restore your health?</span>`, choices);
                    document.querySelector("#choice1").onclick = function () {
                        if (player.gold < healCost) {
                            sfxDeny.play();
                            addDungeonLog("You don't have enough gold to make an offering.");
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
                    autoConfirm();
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
    startCombat(bgmBattleMain);
    addCombatLog(`You encountered ${enemy.name}.`);
    updateDungeonLog();
}

// Mimic encounter
const mimicBattle = (type) => {
    generateRandomEnemy(type);
    showCombatInfo();
    startCombat(bgmBattleMain);
    addCombatLog(`You encountered ${enemy.name}.`);
    addDungeonLog(`You encountered ${enemy.name}.`);
}

// boss fight
const guardianBattle = () => {
    generateRandomEnemy("guardian");
    showCombatInfo();
    startCombat(bgmBattleBoss);
    addCombatLog(`Floor Guardian ${enemy.name} is blocking your way.`);
}

// mysterious chamber fight
const specialBossBattle = () => {
    generateRandomEnemy("sboss");
    showCombatInfo();
    startCombat(bgmBattleBoss);
    addCombatLog(`Dungeon Monarch ${enemy.name} has awoken.`);
    addDungeonLog(`Dungeon Monarch ${enemy.name} has awoken.`);
}

// Flee from the monster
const fleeBattle = () => {
    let eventRoll = randomizeNum(1, 2);
    if (eventRoll == 1) {
        sfxConfirm.play();
        addDungeonLog(`You managed to flee.`);
        player.inCombat = false;
        dungeon.status.event = false;
    } else {
        addDungeonLog(`You failed to escape!`);
        showCombatInfo();
        startCombat(bgmBattleMain);
        addCombatLog(`You encountered ${enemy.name}.`);
        addCombatLog(`You failed to escape!`);
    }
}

// Chest event randomizer
const chestEvent = () => {
    sfxConfirm.play();
    let eventRoll = randomizeNum(1, 4);
    if (eventRoll == 1) {
        mimicBattle("chest");
    } else if (eventRoll == 2) {
        if (dungeon.progress.floor == 1) {
            goldDrop();
        } else {
            createEquipmentPrint("dungeon");
        }
        dungeon.status.event = false;
    } else if (eventRoll == 3) {
        goldDrop();
        dungeon.status.event = false;
    } else {
        addDungeonLog("The chest is empty.");
        dungeon.status.event = false;
    }
}

// Calculates Gold Drop
const goldDrop = () => {
    sfxSell.play();
    let goldValue = randomizeNum(50, 500) * dungeon.progress.floor;
    addDungeonLog(`You found <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(goldValue)}.`);
    player.gold += goldValue;
    playerLoadStats();
}

// Non choices dungeon event messages
const nothingEvent = () => {
    let eventRoll = randomizeNum(1, 5);
    if (eventRoll == 1) {
        addDungeonLog("You explored and found nothing.");
    } else if (eventRoll == 2) {
        addDungeonLog("You found an empty chest.");
    } else if (eventRoll == 3) {
        addDungeonLog("You found a monster corpse.");
    } else if (eventRoll == 4) {
        addDungeonLog("You found a corpse.");
    } else if (eventRoll == 5) {
        addDungeonLog("There is nothing in this area.");
    }
}

// Random stat buff
const statBlessing = () => {
    sfxBuff.play();
    let stats = ["hp", "atk", "def", "atkSpd", "vamp", "critRate", "critDmg", "dodge"];
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
    }
    addDungeonLog(`You gained ${value}% bonus ${buff.replace(/([A-Z])/g, ".$1").replace(/crit/g, "c").toUpperCase()} from the blessing. (Blessing Lv.${player.blessing} > Blessing Lv.${player.blessing + 1})`);
    blessingUp();
    playerLoadStats();
    saveData();
}

// Cursed totem offering
const cursedTotem = (curseLvl) => {
    sfxBuff.play();
    dungeon.settings.enemyScaling += 0.1;
    addDungeonLog(`The monsters in the dungeon became stronger and the loot quality improved. (Curse Lv.${curseLvl} > Curse Lv.${curseLvl + 1})`);
    saveData();
}

// Shrine healing offering
const shrineHealing = () => {
    let healAmount = Math.round(player.stats.hpMax * (0.25 + Math.random() * 0.5)); // 25-75% healing
    let actualHeal = Math.min(healAmount, player.stats.hpMax - player.stats.hp);
    
    if (player.stats.hp >= player.stats.hpMax) {
        addDungeonLog("The shrine's magic flows through you, but you are already at full health. The divine energy grants you a temporary blessing instead!");
        // Give a random temporary buff since they're already full health
        let buffRoll = randomizeNum(1, 3);
        if (buffRoll == 1) {
            applyFloorBuff("atkSpd", 2);
            addDungeonLog("You feel your reflexes sharpen! (+2% ATK.SPD for this floor)");
        } else if (buffRoll == 2) {
            applyFloorBuff("atk", 5);
            addDungeonLog("Your weapons gleam with holy light! (+5% ATK for this floor)");
        } else {
            applyFloorBuff("def", 3);
            addDungeonLog("Your armor feels lighter yet stronger! (+3% DEF for this floor)");
        }
    } else {
        player.stats.hp += actualHeal;
        addDungeonLog(`The shrine's divine light washes over you, healing you for <span class="Epic">${actualHeal} HP</span>. You feel renewed and blessed.`);
    }
    
    playerLoadStats();
    saveData();
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
    addDungeonLog("You ignored it and decided to move on.");
}

// Increase room or floor accordingly
const incrementRoom = () => {
    dungeon.progress.room++;
    dungeon.action = 0;
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
    if (dungeon.floorBuffs[statType] > 50) {
        dungeon.floorBuffs[statType] = 50;
    }
    dungeon.floorBuffs.currentFloor = dungeon.progress.floor;
    saveData();
}

// Clear floor buffs when advancing to next floor
const clearFloorBuffs = () => {
    initializeFloorBuffs();
    if (dungeon.floorBuffs.currentFloor < dungeon.progress.floor) {
        let hadBuffs = dungeon.floorBuffs.atk > 0 || dungeon.floorBuffs.def > 0 || dungeon.floorBuffs.atkSpd > 0;
        
        if (hadBuffs) {
            addDungeonLog("<span class='Common'>The temporary shrine blessings fade as you enter the new floor.</span>");
        }
        
        dungeon.floorBuffs.atk = 0;
        dungeon.floorBuffs.def = 0;
        dungeon.floorBuffs.atkSpd = 0;
        dungeon.floorBuffs.currentFloor = dungeon.progress.floor;
        saveData();
        playerLoadStats();
    }
}

// ========= Dungeon Backlog ==========
// Displays every dungeon activity
const updateDungeonLog = (choices) => {
    let dungeonLog = document.querySelector("#dungeonLog");
    dungeonLog.innerHTML = "";

    // Display the recent dungeon logs
    for (let message of dungeon.backlog.slice(-DUNGEON_BACKLOG_LIMIT)) {
        let logElement = document.createElement("p");
        logElement.innerHTML = message;
        dungeonLog.appendChild(logElement);
    }

    // If the event has choices, display it
    if (typeof choices !== 'undefined') {
        let eventChoices = document.createElement("div");
        eventChoices.innerHTML = choices;
        dungeonLog.appendChild(eventChoices);
    }

    dungeonLog.scrollTop = dungeonLog.scrollHeight;
}

// Add a log to the dungeon backlog
const addDungeonLog = (message, choices) => {
    dungeon.backlog.push(message);
    if (dungeon.backlog.length > DUNGEON_BACKLOG_LIMIT) {
        dungeon.backlog.shift();
    }
    updateDungeonLog(choices);
}

// ========= Resting System ==========
// Process all resting activities while paused
const processRestingActivities = () => {
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
    let restingMessage = "Resting";
    
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
            addDungeonLog(`<span style="color: #FFD700;">🧠 You feel mentally focused! (+10% ATK.SPD until next floor)</span>`);
            break;
        case "vitality":
            dungeon.resting.restingBonusValue = 15;
            applyFloorBuff("atk", 15);
            addDungeonLog(`<span style="color: #FF5722;">💪 You feel physically energized! (+15% ATK until next floor)</span>`);
            break;
        case "serenity":
            dungeon.resting.restingBonusValue = 12;
            applyFloorBuff("def", 12);
            addDungeonLog(`<span style="color: #2196F3;">🛡️ You feel inner peace! (+12% DEF until next floor)</span>`);
            break;
        case "preparation":
            dungeon.resting.restingBonusValue = 8;
            // Increase health regen rate temporarily
            dungeon.resting.healthRegenRate = 2.0;
       //     addDungeonLog(`<span style="color: #4CAF50;">⚡ You feel well-prepared! (Double health regeneration for the next 5 minutes)</span>`);
            break;
    }
}

// Expire resting bonus
const expireRestingBonus = () => {
    const bonusType = dungeon.resting.restingBonusType;
    
    dungeon.resting.restingBonusActive = false;
    dungeon.resting.restingBonusType = null;
    dungeon.resting.restingBonusValue = 0;
    dungeon.resting.restingBonusDuration = 0;
    
    if (bonusType === "preparation") {
        dungeon.resting.healthRegenRate = 1.0; // Reset to normal
        addDungeonLog(`<span class="Common">The effects of your restful ${bonusType} have faded.</span>`);
    }
}
