let savedPlayer = localStorage.getItem("playerData");
let player = savedPlayer ? JSON.parse(savedPlayer) : null;

// Ensure newly added dodge stats exist on old saves
if (player) {
    if (player.baseStats && player.baseStats.dodge === undefined) {
        player.baseStats.dodge = 0;
    }
    if (player.stats && player.stats.dodge === undefined) {
        player.stats.dodge = 0;
    }
    if (player.equippedStats && player.equippedStats.dodge === undefined) {
        player.equippedStats.dodge = 0;
    }
    if (player.bonusStats && player.bonusStats.dodge === undefined) {
        player.bonusStats.dodge = 0;
    }
    if (player.companionBonus === undefined) {
        player.companionBonus = 0;
    }
}
let inventoryOpen = false;
let leveled = false;

const MAX_INVENTORY_ITEMS = 100;

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

const playerExpGain = () => {
    player.exp.expCurr += enemy.rewards.exp;
    player.exp.expCurrLvl += enemy.rewards.exp;

    while (player.exp.expCurr >= player.exp.expMax) {
        playerLvlUp();
    }
    if (leveled && lvlupPanel.style.display !== "flex") {
        lvlupPopup();
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
    player.bonusStats.hp += 4;
    player.bonusStats.atk += 2;
    player.bonusStats.def += 2;
    player.bonusStats.atkSpd += 0.15;
    player.bonusStats.critRate += 0.1;
    player.bonusStats.critDmg += 0.25;

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
    if (player.stats.atkSpd >= 2.5) {
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

    // Player Bonus Stats
    let bonusStatsHTML = `
    <h4>${t('bonus')}</h4>
    <p><i class="fas fa-heart"></i>+${player.bonusStats.hp.toFixed(2).replace(rx, "$1")}%</p>
    <p><i class="ra ra-sword"></i>+${player.bonusStats.atk.toFixed(2).replace(rx, "$1")}%</p>
    <p><i class="ra ra-round-shield"></i>+${player.bonusStats.def.toFixed(2).replace(rx, "$1")}%</p>
    <p><i class="ra ra-plain-dagger"></i>+${player.bonusStats.atkSpd.toFixed(2).replace(rx, "$1")}%</p>
    <p><i class="ra ra-dripping-blade"></i>+${player.bonusStats.vamp.toFixed(2).replace(rx, "$1")}%</p>
    <p><i class="ra ra-lightning-bolt"></i>+${player.bonusStats.critRate.toFixed(2).replace(rx, "$1")}%</p>
    <p><i class="ra ra-focused-lightning"></i>+${player.bonusStats.critDmg.toFixed(2).replace(rx, "$1")}%</p>
    <p><i class="ra ra-player-dodge"></i>+${player.bonusStats.dodge.toFixed(2).replace(rx, "$1")}%</p>`;

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
const closeInventory = () => {
    sfxDecline.play();

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

// Shows the level up popup
const lvlupPopup = () => {
    // Show popup choices
    lvlupPanel.style.display = "flex";
    combatPanel.style.filter = "brightness(50%)";
    const percentages = {
        "hp": 10,
        "atk": 8,
        "def": 8,
        "atkSpd": 3.5,
        "vamp": 0.5,
        "critRate": 1,
        "critDmg": 6,
        "dodge": 0.3
    };
    ratingSystem.checkAndPrompt();
    generateLvlStats(2, percentages);
}

// Generates random stats for level up popup
const generateLvlStats = (rerolls, percentages) => {
    let selectedStats = [];
    let stats = ["hp", "atk", "def", "atkSpd", "vamp", "critRate", "critDmg", "dodge"];
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
                <button id="lvlReroll">${t('reroll-button', { remaining: rerolls, total: 2 })}</button>
            </div>
        `;
    }
    loadLvlHeader();

    const lvlReroll = document.querySelector("#lvlReroll");
    lvlReroll.addEventListener("click", function () {
        if (rerolls > 0) {
            sfxSell.play();
            rerolls--;
            loadLvlHeader();
            generateLvlStats(rerolls, percentages);
        } else {
            sfxDeny.play();
        }
    });

    try {
        for (let i = 0; i < selectedStats.length; i++) {
            let button = document.createElement("button");
            button.id = "lvlSlot" + i;

            let stat = selectedStats[i];
            let h3 = document.createElement("h3");
            h3.innerHTML = t(`level-up-option.${stat}.title`);
            button.appendChild(h3);

            let p = document.createElement("p");
            p.innerHTML = t(`level-up-option.${stat}.desc`, { value: percentages[stat] });
            
            //Append the string with the marginal value of the stat.
            try{
                let marginalValue = 0.0;
                if(selectedStats[i]=="hp"){
                    let statFinal = Math.round(player.baseStats.hp + player.baseStats.hp * (player.bonusStats.hp + percentages["hp"]) / 100 + player.equippedStats.hp);
                    let statInitial = player.stats.hpMax;
                    marginalValue = (statFinal-statInitial) / statInitial;
                } else if(selectedStats[i]=="atk"){
                    let statFinal = Math.round(((player.baseStats.atk + player.baseStats.atk * ((player.bonusStats.atk + percentages["atk"]) / 100)) + player.equippedStats.atk) * (1 + (dungeon.floorBuffs.atk / 100)) * (1 + (player.companionBonus / 100)));
                    let statInitial = player.stats.atk;
                    marginalValue = (statFinal-statInitial) / statInitial;
                } else if(selectedStats[i]=="def"){
                    let statFinal = Math.round(((player.baseStats.def + player.baseStats.def * ((player.bonusStats.def + percentages["def"]) / 100)) + player.equippedStats.def) * (1 + (dungeon.floorBuffs.def / 100)));
                    let statInitial = player.stats.def;
                    marginalValue = (statFinal-statInitial) / statInitial;
                } else if(selectedStats[i]=="atkSpd"){
                    let equipmentAtkSpd = player.baseStats.atkSpd * (player.equippedStats.atkSpd / 100);
                    let statFinal = Math.min(2.5, player.baseStats.atkSpd + player.baseStats.atkSpd * ((player.bonusStats.atkSpd+percentages["atkSpd"]) / 100) + player.baseStats.atkSpd * (dungeon.floorBuffs.atkSpd / 100) + equipmentAtkSpd + equipmentAtkSpd * player.equippedStats.atkSpd / 100);
                    let statInitial = player.stats.atkSpd;
                    marginalValue = (statFinal-statInitial) / statInitial;
                } else if(selectedStats[i]=="vamp"){
                    let statFinal = percentages["vamp"] + player.stats.vamp;
                    let statInitial = player.stats.vamp;
                    marginalValue = (statFinal-statInitial) / statInitial;
                } else if(selectedStats[i]=="critRate"){
                    let statFinal = Math.min(percentages["critRate"] + player.stats.critRate, 100)+100;
                    let statInitial = Math.min(player.stats.critRate, 100)+100;
                    marginalValue = (statFinal-statInitial)/statInitial * player.stats.critDmg/100;
                } else if(selectedStats[i]=="critDmg"){
                    let statFinal = percentages["critDmg"] + player.stats.critDmg;
                    let statInitial = player.stats.critDmg;
                    marginalValue = (statFinal-statInitial)/statInitial * Math.min(player.stats.critRate/100, 1);
                } else if(selectedStats[i]=="dodge"){ 
                    let statFinal = percentages["dodge"] + player.stats.dodge;
                    let statInitial = player.stats.dodge;
                    let ehpInitial = 1 / (1 - statInitial / 100);
                    let ehpFinal = 1 / (1 - statFinal / 100);
                    marginalValue = (ehpFinal / ehpInitial) - 1;
                }
                if (Number.isFinite(marginalValue)) {
                	p.innerHTML += ` (+${Math.round(1000*marginalValue)/10.0}%)`;
                }
            } catch (err) {}
            button.appendChild(p);

            // Increase the selected stat for player
            button.addEventListener("click", function () {
                sfxItem.play();
                player.bonusStats[selectedStats[i]] += percentages[selectedStats[i]];

                if (player.exp.lvlGained > 1) {
                    player.exp.lvlGained--;
                    generateLvlStats(2, percentages);
                } else {
                    player.exp.lvlGained = 0;
                    lvlupPanel.style.display = "none";
                    combatPanel.style.filter = "brightness(100%)";
                    leveled = false;
                }

                playerLoadStats();
            });

            lvlupSelect.appendChild(button);
        }
    } catch (err) { }
}
