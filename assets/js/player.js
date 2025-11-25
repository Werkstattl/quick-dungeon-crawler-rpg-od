let savedPlayer = localStorage.getItem("playerData");
let player = savedPlayer ? JSON.parse(savedPlayer) : null;

// Ensure newly added dodge stats exist on old saves
if (player) {
    const clampCurseLevel = (value) => {
        let level = Number(value);
        if (!Number.isFinite(level)) {
            level = 1;
        }
        level = Math.round(level);
        if (level < 1) {
            level = 1;
        }
        if (level > 10) {
            level = 10;
        }
        return level;
    };
    if (typeof player.preferences !== 'object' || player.preferences === null) {
        player.preferences = {};
    }
    if (typeof player.preferences.equipBestUseCustom !== 'boolean') {
        player.preferences.equipBestUseCustom = false;
    }
    if (!Array.isArray(player.preferences.equipBestPriorities)) {
        player.preferences.equipBestPriorities = [];
    }
    if (player.baseStats && player.baseStats.dodge === undefined) {
        player.baseStats.dodge = 0;
    }
    if (player.stats && player.stats.dodge === undefined) {
        player.stats.dodge = 0;
    }
    // Backfill Luck on old saves
    if (player.stats && player.stats.luck === undefined) {
        player.stats.luck = 0;
    }
    if (player.equippedStats && player.equippedStats.dodge === undefined) {
        player.equippedStats.dodge = 0;
    }
    if (player.equippedStats && player.equippedStats.luck === undefined) {
        player.equippedStats.luck = 0;
    }
    if (player.bonusStats && player.bonusStats.dodge === undefined) {
        player.bonusStats.dodge = 0;
    }
    if (player.bonusStats && player.bonusStats.luck === undefined) {
        player.bonusStats.luck = 0;
    }
    if (player.maxUnlockedCurseLevel === undefined) {
        player.maxUnlockedCurseLevel = 1;
    }
    player.maxUnlockedCurseLevel = clampCurseLevel(player.maxUnlockedCurseLevel);
    if (player.selectedCurseLevel === undefined) {
        const savedDungeon = localStorage.getItem("dungeonData");
        if (savedDungeon) {
            try {
                const parsedDungeon = JSON.parse(savedDungeon);
                if (parsedDungeon && parsedDungeon.settings && Number.isFinite(parsedDungeon.settings.enemyScaling)) {
                    const inferredLevel = clampCurseLevel(Math.round((parsedDungeon.settings.enemyScaling - 1) * 10));
                    player.selectedCurseLevel = inferredLevel;
                }
            } catch (err) {
                player.selectedCurseLevel = 1;
            }
        }
    }
    if (player.selectedCurseLevel === undefined) {
        player.selectedCurseLevel = 1;
    }
    player.selectedCurseLevel = clampCurseLevel(player.selectedCurseLevel);
    if (player.selectedCurseLevel > player.maxUnlockedCurseLevel) {
        player.maxUnlockedCurseLevel = player.selectedCurseLevel;
    }
    if (player.selectedCurseLevel > player.maxUnlockedCurseLevel) {
        player.selectedCurseLevel = player.maxUnlockedCurseLevel;
    }
}

let inventoryOpen = false;
let leveled = false;

const PASSIVE_LIMIT_BREAKER = "Limit Breaker";
const PASSIVE_EAGLE_EYE = "Eagle Eye";
const PASSIVE_COMPANION_INSIGHT = "Companion's Insight";

const getPlayerAtkSpdCap = () => {
    if (player && Array.isArray(player.skills) && player.skills.includes(PASSIVE_LIMIT_BREAKER)) {
        return 3;
    }
    if (player && player.selectedPassive === PASSIVE_LIMIT_BREAKER) {
        return 3;
    }
    return 2.5;
};

const MAX_INVENTORY_ITEMS = 100;

function getFallbackCompanionBonuses() {
    return {
        hp: 0,
        atk: 0,
        def: 0,
        atkSpd: 0,
        vamp: 0,
        critRate: 0,
        critDmg: 0,
        dodge: 0,
        luck: 0,
    };
}

function getCurrentCompanionBonuses() {
    if (typeof getActiveCompanionBonuses === 'function') {
        return getActiveCompanionBonuses();
    }
    return getFallbackCompanionBonuses();
}

const inventoryItemCount = () => {
    const consumables = player.inventory && player.inventory.consumables ? player.inventory.consumables.length : 0;
    const equipment = player.inventory && player.inventory.equipment ? player.inventory.equipment.length : 0;
    return consumables + equipment;
};

const checkInventoryLimit = (logMessage = false) => {
    if (inventoryItemCount() > MAX_INVENTORY_ITEMS) {
        dungeon.status.exploring = false;
        if (logMessage && typeof addDungeonLog === 'function') {
            addDungeonLog(`<span class='Common'><i class="fas fa-box-open"></i> Inventory limit reached. Sell equipment to continue exploring.</span>`);
        }
        return false;
    }
    return true;
};

const lvlupSelect = document.querySelector("#lvlupSelect");
const lvlupPanel = document.querySelector("#lvlupPanel");
let levelUpDimTarget = null;

const playerExpGain = () => {
    player.exp.expCurr += enemy.rewards.exp;
    player.exp.expCurrLvl += enemy.rewards.exp;

    while (player.exp.expCurr >= player.exp.expMax) {
        playerLvlUp();
    }
    playerLoadStats();
}

// Levels up the player
const playerLvlUp = () => {
    leveled = true;

    // Calculates the excess exp and the new exp required to level up
    let expMaxIncrease = Math.floor(((player.exp.expMax * 1.1) + 100) - player.exp.expMax);
    if (player.lvl > 100) {
        expMaxIncrease = 1000000;
    }
    let excessExp = player.exp.expCurr - player.exp.expMax;
    player.exp.expCurrLvl = excessExp;
    player.exp.expMaxLvl = expMaxIncrease;

    // Increase player level and maximum exp
    const previousLvl = player.lvl;
    player.lvl++;
    player.exp.lvlGained++;
    player.exp.expMax += expMaxIncrease;

    // Increase player bonus stats per level
    player.bonusStats.hp += 5;
    player.bonusStats.atk += 2;
    player.bonusStats.def += 3;
    player.bonusStats.atkSpd += 0.15;
    player.bonusStats.critRate += 0.1;
    player.bonusStats.critDmg += 0.1;

    // Play level up effects
    sfxLvlUp.play();
    addCombatLog(t('you-leveled-up', { previousLvl, newLvl: player.lvl }));

    // Recover 20% extra hp on level up
    player.stats.hp += Math.round((player.stats.hpMax * 20) / 100);

    // Update remaining level count if popup is open
    if (lvlupPanel.style.display === "flex") {
        const remainingHeader = document.querySelector("#lvlupSelect h4");
        if (remainingHeader) {
            remainingHeader.textContent = t('remaining', { count: player.exp.lvlGained });
        }
    }
}

const showLevelUpModalIfPending = () => {
    if (!leveled || !lvlupPanel) {
        return;
    }
    if (lvlupPanel.style.display === "flex") {
        return;
    }
    lvlupPopup();
};

if (typeof window !== 'undefined') {
    window.showLevelUpModalIfPending = showLevelUpModalIfPending;
}

// Refresh the player stats
const playerLoadStats = () => {
    showEquipment();
    showInventory();
    applyEquipmentStats();

    let rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
    if (player.stats.hp > player.stats.hpMax) {
        player.stats.hp = player.stats.hpMax;
    }
    player.stats.hpPercent = Number((player.stats.hp / player.stats.hpMax) * 100).toFixed(2).replace(rx, "$1");
    player.exp.expPercent = Number((player.exp.expCurrLvl / player.exp.expMaxLvl) * 100).toFixed(2).replace(rx, "$1");

    // Generate battle info for player if in combat
    if (player.inCombat || (typeof playerDead !== 'undefined' && playerDead)) {
        const playerCombatHpElement = document.querySelector('#player-hp-battle');
        const playerHpDamageElement = document.querySelector('#player-hp-dmg');
        const playerExpElement = document.querySelector('#player-exp-bar');
        const playerInfoElement = document.querySelector('#player-combat-info');
        if (playerCombatHpElement && playerHpDamageElement && playerExpElement && playerInfoElement) {
            playerCombatHpElement.innerHTML = `&nbsp${nFormatter(player.stats.hp)}/${nFormatter(player.stats.hpMax)}(${player.stats.hpPercent}%)`;
            playerCombatHpElement.style.width = `${player.stats.hpPercent}%`;
            playerHpDamageElement.style.width = `${player.stats.hpPercent}%`;
            playerExpElement.style.width = `${player.exp.expPercent}%`;
            playerInfoElement.innerHTML = `${player.name} Lv.${player.lvl} (${player.exp.expPercent}%)`;
        }
    }

    // Header
    document.querySelector("#player-name").innerHTML = `<i class="fas fa-user"></i>${player.name} Lv.${player.lvl}`;
    document.querySelector("#player-exp").innerHTML = `<p>Exp</p> ${nFormatter(player.exp.expCurr)}/${nFormatter(player.exp.expMax)} (${player.exp.expPercent}%)`;
    document.querySelector("#player-gold").innerHTML = `<i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(player.gold)}`;

    // Player Stats
    const hpPercentInt = Math.round(parseFloat(player.stats.hpPercent));
    const hpPercentText = hpPercentInt >= 100 ? "" : ` (${hpPercentInt}%)`;
    playerHpElement.innerHTML = `${nFormatter(player.stats.hp)}${hpPercentText}`;
    const heartIcon = document.getElementById('player-hp-icon');
    if (heartIcon) {
        if (player.stats.hp <= 0 || (typeof playerDead !== 'undefined' && playerDead)) {
            heartIcon.classList.add('dead');
            heartIcon.classList.remove('low-hp', 'medium-hp', 'high-hp', 'critical-hp');
        } else if (player.stats.hpPercent <= 10) {
            heartIcon.classList.add('critical-hp');
            heartIcon.classList.remove('low-hp', 'medium-hp', 'high-hp', 'dead');
        } else if (player.stats.hpPercent <= 30) {
            heartIcon.classList.add('low-hp');
            heartIcon.classList.remove('critical-hp', 'medium-hp', 'high-hp', 'dead');
        } else if (player.stats.hpPercent <= 60) {
            heartIcon.classList.add('medium-hp');
            heartIcon.classList.remove('low-hp', 'critical-hp', 'high-hp', 'dead');
        } else if (player.stats.hpPercent >= 90) {
            heartIcon.classList.add('high-hp');
            heartIcon.classList.remove('low-hp', 'medium-hp', 'critical-hp', 'dead');
        } else {
            heartIcon.classList.remove('low-hp', 'medium-hp', 'high-hp', 'critical-hp', 'dead');
        }
    }
    playerAtkElement.innerHTML = nFormatter(player.stats.atk);
    playerDefElement.innerHTML = nFormatter(player.stats.def);
    playerAtkSpdElement.innerHTML = player.stats.atkSpd.toFixed(2).replace(rx, "$1");
    const atkSpdCap = getPlayerAtkSpdCap();
    if (player.stats.atkSpd >= atkSpdCap) {
        playerAtkSpdElement.style.color = '#e30b5c';
    } else {
        playerAtkSpdElement.style.color = 'white';
    }
    playerVampElement.innerHTML = (player.stats.vamp).toFixed(2).replace(rx, "$1") + "%";
    playerCrateElement.innerHTML = (player.stats.critRate).toFixed(2).replace(rx, "$1") + "%";
    if (player.stats.critRate >= 100) {
        playerCrateElement.style.color = '#e30b5c';
    } else {
        playerCrateElement.style.color = 'white';
    }
    playerCdmgElement.innerHTML = (player.stats.critDmg).toFixed(2).replace(rx, "$1") + "%";
    playerDodgeElement.innerHTML = (player.stats.dodge).toFixed(2).replace(rx, "$1") + "%";
    if (player.stats.dodge >= 75) {
        playerDodgeElement.style.color = '#e30b5c';
    } else {
        playerDodgeElement.style.color = 'white';
    }
    if (typeof playerLuckElement !== 'undefined' && playerLuckElement) {
        const luckVal = (player.stats && Number.isFinite(player.stats.luck)) ? player.stats.luck : 0;
        playerLuckElement.innerHTML = (luckVal).toFixed(2).replace(rx, "$1") + "%";
        // Highlight when reaching max effective luck (~140% for 80% cap from 33% base)
        if (luckVal >= 140) {
            playerLuckElement.style.color = '#e30b5c';
        } else {
            playerLuckElement.style.color = 'white';
        }
    }

    // Player Bonus Stats (hide 0% entries)
    let bonusStatsHTML = `<h4>${t('bonus')}</h4>`;
    const bonusEntries = [
        { val: player.bonusStats.hp, icon: '<i class="fas fa-heart"></i>' },
        { val: player.bonusStats.atk, icon: '<i class="ra ra-sword"></i>' },
        { val: player.bonusStats.def, icon: '<i class="ra ra-round-shield"></i>' },
        { val: player.bonusStats.atkSpd, icon: '<i class="ra ra-plain-dagger"></i>' },
        { val: player.bonusStats.vamp, icon: '<i class="ra ra-dripping-blade"></i>' },
        { val: player.bonusStats.critRate, icon: '<i class="ra ra-lightning-bolt"></i>' },
        { val: player.bonusStats.critDmg, icon: '<i class="ra ra-focused-lightning"></i>' },
        { val: player.bonusStats.dodge, icon: '<i class="ra ra-player-dodge"></i>' },
        { val: player.bonusStats.luck, icon: '<i class="ra ra-perspective-dice-one"></i>' }
    ];
    bonusEntries.forEach(({ val, icon }) => {
        if (Number(val) > 0) {
            bonusStatsHTML += `<p>${icon}+${Number(val).toFixed(2).replace(rx, '$1')}%</p>`;
        }
    });

    // Add floor buffs display if any are active
    if (dungeon.floorBuffs && (dungeon.floorBuffs.atk > 0 || dungeon.floorBuffs.def > 0 || dungeon.floorBuffs.atkSpd > 0)) {
        const normalColor = '#FFD700';
        const maxColor = '#e30b5c';
        bonusStatsHTML += `<h4 style="color: ${normalColor};">${t('floor-buffs')}</h4>`;
        if (dungeon.floorBuffs.atk > 0) {
            let color = dungeon.floorBuffs.atk >= 50 ? maxColor : normalColor;
            bonusStatsHTML += `<p style="color: ${color};"><i class="ra ra-sword"></i>+${dungeon.floorBuffs.atk}%</p>`;
        }
        if (dungeon.floorBuffs.def > 0) {
            let color = dungeon.floorBuffs.def >= 50 ? maxColor : normalColor;
            bonusStatsHTML += `<p style="color: ${color};"><i class="ra ra-round-shield"></i>+${dungeon.floorBuffs.def}%</p>`;
        }
        if (dungeon.floorBuffs.atkSpd > 0) {
            let color = dungeon.floorBuffs.atkSpd >= 50 ? maxColor : normalColor;
            bonusStatsHTML += `<p style="color: ${color};"><i class="ra ra-plain-dagger"></i>+${dungeon.floorBuffs.atkSpd.toFixed(2).replace(rx, "$1")}%</p>`;
        }
    }

    document.querySelector("#bonus-stats").innerHTML = bonusStatsHTML;
    if (typeof updateExploreButtonAttention === 'function') {
        updateExploreButtonAttention();
    }
}

// Opens inventory
const openInventory = () => {
    sfxOpen.play();

    dungeon.status.exploring = false;
    inventoryOpen = true;
    let openInv = document.querySelector('#inventory');
    let dimDungeon = document.querySelector('#dungeon-main');
    openInv.style.display = "flex";
    dimDungeon.style.filter = "brightness(50%)";

    sortInventoryElement.value = 'none';
    sortInventoryElement.onchange = function () {
        sortInventory(this.value);
    };

    sellRarityElement.value = 'none';
    sellRarityElement.className = '';
    sellRarityElement.onchange = function () {
        let rarity = sellRarityElement.value;
        sellRarityElement.className = rarity === 'none' ? '' : rarity;
        if (rarity === 'none') { return; }

        sfxOpen.play();
        openInv.style.filter = "brightness(50%)";

        defaultModalElement.style.display = "flex";
        if (rarity == "All") {
            defaultModalElement.innerHTML = `
            <div class="content">
                <p data-i18n="sell-all-question">${t('sell-all-question')}</p>
                <div class="button-container">
                    <button id="sell-confirm" data-i18n="sell-all">${t('sell-all')}</button>
                    <button id="sell-cancel" data-i18n="cancel">${t('cancel')}</button>
                </div>
            </div>`;
        } else {
            defaultModalElement.innerHTML = `
            <div class="content">
                <p>${t('sell-all-rarity-question', { rarity: `<span class="${rarity}">${rarityName(rarity)}</span>` })}</p>
                <div class="button-container">
                    <button id="sell-confirm" data-i18n="sell-all">${t('sell-all')}</button>
                    <button id="sell-cancel" data-i18n="cancel">${t('cancel')}</button>
                </div>
            </div>`;
        }

        let confirm = document.querySelector('#sell-confirm');
        let cancel = document.querySelector('#sell-cancel');
        confirm.onclick = function () {
            sellAll(rarity);
            defaultModalElement.style.display = "none";
            defaultModalElement.innerHTML = "";
            openInv.style.filter = "brightness(100%)";
            sellRarityElement.value = 'none';
            sellRarityElement.className = '';
        };
        cancel.onclick = function () {
            sfxDecline.play();
            defaultModalElement.style.display = "none";
            defaultModalElement.innerHTML = "";
            openInv.style.filter = "brightness(100%)";
            sellRarityElement.value = 'none';
            sellRarityElement.className = '';
        };
    };
}

// Closes inventory
const closeInventory = (silent = false) => {
    if (!silent) sfxDecline.play();

    let openInv = document.querySelector('#inventory');
    let dimDungeon = document.querySelector('#dungeon-main');
    openInv.style.display = "none";
    dimDungeon.style.filter = "brightness(100%)";
    inventoryOpen = false;
    if (!dungeon.status.paused && checkInventoryLimit()) {
        dungeon.status.exploring = true;
    }
}

// Continue exploring if inventory is not open and the game is not paused
const continueExploring = () => {
    if (!inventoryOpen && !dungeon.status.paused && checkInventoryLimit()) {
        dungeon.status.exploring = true;
    }
}

const lvlupPopup = () => {
    if (!lvlupPanel) {
        return;
    }

    lvlupPanel.style.display = "flex";

    if (typeof combatPanel !== 'undefined' && combatPanel && combatPanel.style.display === "flex") {
        levelUpDimTarget = combatPanel;
    } else {
        levelUpDimTarget = document.querySelector('#dungeon-main');
    }
    if (levelUpDimTarget) {
        levelUpDimTarget.style.filter = "brightness(50%)";
    }

    if (typeof dungeon !== 'undefined' && dungeon.status) {
        dungeon.status.exploring = false;
        dungeon.status.event = true;
    }

    const percentages = {
        "hp": 10,
        "atk": 8,
        "def": 8,
        "atkSpd": 3.5,
        "vamp": 0.5,
        "critRate": 1,
        "critDmg": 3,
        "dodge": 0.3,
        "luck": 1
    };
    ratingSystem.checkAndPrompt();
    generateLvlStats(2, percentages);
}

const generateLvlStats = (rerolls, percentages) => {
    let selectedStats = [];
    let stats = ["hp", "atk", "def", "atkSpd", "vamp", "critRate", "critDmg", "dodge", "luck"];
    while (selectedStats.length < 3) {
        let randomIndex = Math.floor(Math.random() * stats.length);
        if (!selectedStats.includes(stats[randomIndex])) {
            selectedStats.push(stats[randomIndex]);
        }
    }

    const loadLvlHeader = () => {
        lvlupSelect.innerHTML = `
            <h1>${t('level-up')}</h1>
            <div class="content-head">
                <h4>${t('remaining', { count: player.exp.lvlGained })}</h4>
                <button data-level-up-control="reroll" id="lvlReroll">${t('reroll-button', { remaining: rerolls, total: 2 })}</button>
            </div>
        `;
    }
    loadLvlHeader();

    const lvlReroll = document.querySelector("#lvlReroll");

    if (lvlReroll) {
        lvlReroll.addEventListener("click", function () {
            if (rerolls > 0) {
                sfxSell.play();
                rerolls--;
                generateLvlStats(rerolls, percentages);
            } else if (typeof sfxDeny !== "undefined") {
                sfxDeny.play();
            }
        });
    }

    try {
        for (let i = 0; i < selectedStats.length; i++) {
            let button = document.createElement("button");
            button.id = "lvlSlot" + i;
            button.dataset.levelUpControl = "option";

            let stat = selectedStats[i];
            let h3 = document.createElement("h3");
            h3.innerHTML = t(`level-up-option.${stat}.title`);
            button.appendChild(h3);

            let p = document.createElement("p");
            p.innerHTML = t(`level-up-option.${stat}.desc`, { value: percentages[stat] });
            
            try {
                let marginalValue = 0.0;
                if (selectedStats[i] == "hp") {
                    let statFinal = Math.round(player.baseStats.hp + player.baseStats.hp * (player.bonusStats.hp + percentages["hp"]) / 100 + player.equippedStats.hp);
                    let statInitial = player.stats.hpMax;
                    marginalValue = (statFinal - statInitial) / statInitial;
                } else if (selectedStats[i] == "atk") {
                    const companionBonuses = getCurrentCompanionBonuses();
                    let statFinal = Math.round(((player.baseStats.atk + player.baseStats.atk * ((player.bonusStats.atk + percentages["atk"]) / 100)) + player.equippedStats.atk) * (1 + (dungeon.floorBuffs.atk / 100)) * (1 + ((companionBonuses.atk || 0) / 100)));
                    let statInitial = player.stats.atk;
                    marginalValue = (statFinal - statInitial) / statInitial;
                } else if (selectedStats[i] == "def") {
                    let statFinal = Math.round(((player.baseStats.def + player.baseStats.def * ((player.bonusStats.def + percentages["def"]) / 100)) + player.equippedStats.def) * (1 + (dungeon.floorBuffs.def / 100)));
                    let statInitial = player.stats.def;
                    marginalValue = (statFinal - statInitial) / statInitial;
                } else if (selectedStats[i] == "atkSpd") {
                    let equipmentAtkSpd = player.baseStats.atkSpd * (player.equippedStats.atkSpd / 100);
                    let statFinal = Math.min(getPlayerAtkSpdCap(), player.baseStats.atkSpd + player.baseStats.atkSpd * ((player.bonusStats.atkSpd + percentages["atkSpd"]) / 100) + player.baseStats.atkSpd * (dungeon.floorBuffs.atkSpd / 100) + equipmentAtkSpd + equipmentAtkSpd * player.equippedStats.atkSpd / 100);
                    let statInitial = player.stats.atkSpd;
                    marginalValue = (statFinal - statInitial) / statInitial;
                } else if (selectedStats[i] == "vamp") {
                    let statFinal = percentages["vamp"] + player.stats.vamp;
                    let statInitial = player.stats.vamp;
                    marginalValue = (statFinal - statInitial) / statInitial;
                } else if (selectedStats[i] == "critRate") {
                    let statFinal = Math.min(percentages["critRate"] + player.stats.critRate, 100) + 100;
                    let statInitial = Math.min(player.stats.critRate, 100) + 100;
                    marginalValue = (statFinal - statInitial) / statInitial * player.stats.critDmg / 100;
                } else if (selectedStats[i] == "critDmg") {
                    let statFinal = percentages["critDmg"] + player.stats.critDmg;
                    let statInitial = player.stats.critDmg;
                    marginalValue = (statFinal - statInitial) / statInitial * Math.min(player.stats.critRate / 100, 1);
                } else if (selectedStats[i] == "dodge") {
                    let statFinal = percentages["dodge"] + player.stats.dodge;
                    let statInitial = player.stats.dodge;
                    let ehpInitial = 1 / (1 - statInitial / 100);
                    let ehpFinal = 1 / (1 - statFinal / 100);
                    marginalValue = (ehpFinal / ehpInitial) - 1;
                } else if (selectedStats[i] == "luck") {
                    let add = percentages["luck"];
                    let currentLuck = (player.stats && Number.isFinite(player.stats.luck)) ? player.stats.luck : 0;
                    let baseDrop = 1 / 3;
                    let initial = baseDrop * (1 + currentLuck / 100);
                    let final = baseDrop * (1 + (currentLuck + add) / 100);
                    marginalValue = (final - initial) / initial;
                }
                if (Number.isFinite(marginalValue)) {
                    p.innerHTML += ` (+${Math.round(1000 * marginalValue) / 10.0}%)`;
                }
            } catch (err) { }
            button.appendChild(p);

            button.addEventListener("click", function () {
                sfxItem.play();
                player.bonusStats[stat] += percentages[stat];

                if (player.exp.lvlGained > 1) {
                    player.exp.lvlGained--;
                    generateLvlStats(2, percentages);
                } else {
                    player.exp.lvlGained = 0;
                    lvlupPanel.style.display = "none";
                    if (levelUpDimTarget) {
                        levelUpDimTarget.style.filter = "brightness(100%)";
                        levelUpDimTarget = null;
                    }
                    leveled = false;
                    if (typeof dungeon !== 'undefined' && dungeon.status) {
                        dungeon.status.event = false;
                    }
                    continueExploring();
                }

                playerLoadStats();
            });

            lvlupSelect.appendChild(button);
        }
    } catch (err) { }
}
