const createEquipment = (addToInventory = true) => {
    const equipment = {
        category: null,
        attribute: null,
        type: null,
        rarity: null,
        lvl: null,
        tier: null,
        value: null,
        stats: [],
    };
    const maxLvl = dungeon.progress.floor * dungeon.settings.enemyLvlGap + (dungeon.settings.enemyBaseLvl - 1);
    const minLvl = maxLvl - (dungeon.settings.enemyLvlGap - 1);
    equipment.lvl = randomizeNum(minLvl, maxLvl);
    if (equipment.lvl > 100) {
        equipment.lvl = 100;
    }
    const equipmentAttributes = ["Damage", "Defense"];
    equipment.attribute = equipmentAttributes[Math.floor(Math.random() * equipmentAttributes.length)];
    if (equipment.attribute == "Damage") {
        const equipmentCategories = ["Sword", "Axe", "Hammer", "Dagger", "Flail", "Scythe"];
        equipment.category = equipmentCategories[Math.floor(Math.random() * equipmentCategories.length)];
        equipment.type = "Weapon";
    } else if (equipment.attribute == "Defense") {
        const equipmentTypes = ["Armor", "Shield", "Helmet", "Mask"];
        equipment.type = equipmentTypes[Math.floor(Math.random() * equipmentTypes.length)];
        if (equipment.type == "Armor") {
            const equipmentCategories = ["Plate", "Chain", "Leather"];
            equipment.category = equipmentCategories[Math.floor(Math.random() * equipmentCategories.length)];
        } else if (equipment.type == "Shield") {
            const equipmentCategories = ["Tower", "Kite", "Buckler"];
            equipment.category = equipmentCategories[Math.floor(Math.random() * equipmentCategories.length)];
        } else if (equipment.type == "Helmet") {
            const equipmentCategories = ["Great Helm", "Horned Helm"];
            equipment.category = equipmentCategories[Math.floor(Math.random() * equipmentCategories.length)];
        } else if (equipment.type == "Mask") {
            equipment.category = "Mask";
        }
    }
    const rarityChances = {
        "Common": 0.698,
        "Uncommon": 0.2,
        "Rare": 0.04,
        "Epic": 0.03,
        "Legendary": 0.02,
        "Heirloom": 0.012
    };
    const randomNumber = Math.random();
    let cumulativeChance = 0;
    for (let rarity in rarityChances) {
        cumulativeChance += rarityChances[rarity];
        if (randomNumber <= cumulativeChance) {
            equipment.rarity = rarity;
            break;
        }
    }
    let enemyScaling = dungeon.settings.enemyScaling;
    if (enemyScaling > 2) {
        enemyScaling = 2;
    }
    equipment.tier = Math.round((enemyScaling - 1) * 10);
    rerollEquipmentStats(equipment);
    if (addToInventory) {
        player.inventory.equipment.push(JSON.stringify(equipment));
        saveData();
        showInventory();
        showEquipment();
    }
    return equipment;
}

const receiveEquipment = (equipment) => {
    if (player.equipped.length < 6) {
        player.equipped.push(equipment);
    } else {
        player.inventory.equipment.push(JSON.stringify(equipment));
    }
    saveData();
    playerLoadStats();
};

const rerollEquipmentStats = (equipment) => {
    let enemyScaling = 1 + (equipment.tier / 10);
    if (enemyScaling > 2) {
        enemyScaling = 2;
    }
    equipment.stats = [];
    let loopCount;
    let equipmentValue = 0;
    let statValue;
    switch (equipment.rarity) {
        case "Common":
            loopCount = 2;
            break;
        case "Uncommon":
            loopCount = 3;
            break;
        case "Rare":
            loopCount = 4;
            break;
        case "Epic":
            loopCount = 5;
            break;
        case "Legendary":
            loopCount = 6;
            break;
        case "Heirloom":
            loopCount = 8;
            break;
    }
    const physicalStats = ["atk", "atkSpd", "vamp", "critRate", "critDmg"];
    const damageyStats = ["atk", "atk", "vamp", "critRate", "critDmg", "critDmg"];
    const speedyStats = ["atkSpd", "atkSpd", "atk", "vamp", "critRate", "critRate", "critDmg"];
    const defenseStats = ["hp", "hp", "def", "def", "atk", "dodge"];
    const evasiveStats = ["dodge", "dodge", "luck", "luck", "atkSpd", "critRate"];
    const dmgDefStats = ["hp", "def", "atk", "atk", "critRate", "critDmg", "luck"];
    let statTypes;
    if (equipment.attribute == "Damage") {
        if (equipment.category == "Axe" || equipment.category == "Scythe") {
            statTypes = damageyStats;
        } else if (equipment.category == "Dagger" || equipment.category == "Flail") {
            statTypes = speedyStats;
        } else if (equipment.category == "Hammer") {
            statTypes = dmgDefStats;
        } else {
            statTypes = physicalStats;
        }
    } else if (equipment.attribute == "Defense") {
        if (equipment.type == "Mask" || equipment.category == "Mask") {
            statTypes = evasiveStats;
        } else {
            statTypes = defenseStats;
        }
    }
    for (let i = 0; i < loopCount; i++) {
        let statType = statTypes[Math.floor(Math.random() * statTypes.length)];
        let statMultiplier = (enemyScaling - 1) * equipment.lvl;
        let hpScaling = (40 * randomizeDecimal(0.5, 1.5)) + ((40 * randomizeDecimal(0.5, 1.5)) * statMultiplier);
        let atkDefScaling = (16 * randomizeDecimal(0.5, 1.5)) + ((16 * randomizeDecimal(0.5, 1.5)) * statMultiplier);
        let cdAtkSpdScaling = (3 * randomizeDecimal(0.5, 1.5)) + ((3 * randomizeDecimal(0.5, 1.5)) * statMultiplier);
        let crVampScaling = (2 * randomizeDecimal(0.5, 1.5)) + ((2 * randomizeDecimal(0.5, 1.5)) * statMultiplier);
        if (statType === "hp") {
            statValue = randomizeNum(hpScaling * 0.5, hpScaling);
            equipmentValue += statValue;
        } else if (statType === "atk") {
            statValue = randomizeNum(atkDefScaling * 0.5, atkDefScaling);
            equipmentValue += statValue * 2.5;
        } else if (statType === "def") {
            statValue = randomizeNum(atkDefScaling * 0.5, atkDefScaling);
            equipmentValue += statValue * 2.5;
        } else if (statType === "atkSpd") {
            statValue = randomizeDecimal(cdAtkSpdScaling * 0.5, cdAtkSpdScaling);
            if (statValue > 16) {
                statValue = 16 * randomizeDecimal(0.5, 1);
                loopCount++;
            }
            equipmentValue += statValue * 8.33;
        } else if (statType === "vamp") {
            statValue = randomizeDecimal(crVampScaling * 0.5, crVampScaling);
            if (statValue > 8) {
                statValue = 8 * randomizeDecimal(0.5, 1);
                loopCount++;
            }
            equipmentValue += statValue * 20.83;
        } else if (statType === "critRate") {
            statValue = randomizeDecimal(crVampScaling * 0.5, crVampScaling);
            if (statValue > 10) {
                statValue = 10 * randomizeDecimal(0.5, 1);
                loopCount++;
            }
            equipmentValue += statValue * 20.83;
        } else if (statType === "critDmg") {
            statValue = randomizeDecimal(cdAtkSpdScaling * 0.1, cdAtkSpdScaling * 0.2);
            if (statValue > 25) {
                statValue = 25 * randomizeDecimal(0.5, 1);
                loopCount++;
            }
            equipmentValue += statValue * 10.83;
        } else if (statType === "dodge") {
            statValue = randomizeDecimal(crVampScaling * 0.2, crVampScaling * 0.4);
            if (statValue > 4) {
                statValue = 4 * randomizeDecimal(0.5, 1);
                loopCount++;
            }
            equipmentValue += statValue * 33.33;
        } else if (statType === "luck") {
            statValue = randomizeDecimal(crVampScaling * 0.2, crVampScaling * 0.4);
            if (statValue > 8) {
                statValue = 8 * randomizeDecimal(0.5, 1);
                loopCount++;
            }
            equipmentValue += statValue * 20.83;
        }
        if (equipment.rarity == "Common" && loopCount > 3) {
            loopCount--;
        } else if (equipment.rarity == "Uncommon" && loopCount > 4) {
            loopCount--;
        } else if (equipment.rarity == "Rare" && loopCount > 5) {
            loopCount--;
        } else if (equipment.rarity == "Epic" && loopCount > 6) {
            loopCount--;
        } else if (equipment.rarity == "Legendary" && loopCount > 7) {
            loopCount--;
        } else if (equipment.rarity == "Heirloom" && loopCount > 9) {
            loopCount--;
        }
        let statExists = false;
        for (let j = 0; j < equipment.stats.length; j++) {
            if (Object.keys(equipment.stats[j])[0] == statType) {
                statExists = true;
                break;
            }
        }
        if (statExists) {
            for (let j = 0; j < equipment.stats.length; j++) {
                if (Object.keys(equipment.stats[j])[0] == statType) {
                    equipment.stats[j][statType] += statValue;
                    break;
                }
            }
        } else {
            equipment.stats.push({ [statType]: statValue });
        }
    }
    equipment.value = Math.round(equipmentValue * 3);
    equipment.icon = equipmentIcon(equipment.category);
};
const equipmentName = (category) => {
    const key = category.toLowerCase().replace(/\s+/g, '-');
    if (typeof t === 'function') {
        const translated = t(`equipment-names.${key}`);
        return translated === `equipment-names.${key}` ? category : translated;
    }
    return category;
};

const equipmentGender = (category) => {
    const key = category.toLowerCase().replace(/\s+/g, '-');
    if (typeof t === 'function') {
        const gender = t(`equipment-genders.${key}`);
        return gender === `equipment-genders.${key}` ? null : gender;
    }
    return null;
};

const rarityName = (rarity, category) => {
    if (typeof t === 'function') {
        const key = rarity.toLowerCase();
        let translated = t(key);
        if (translated !== key) {
            if (typeof currentLanguage !== 'undefined' && currentLanguage === 'de' && category) {
                const adjectival = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
                if (adjectival.includes(key)) {
                    const gender = equipmentGender(category);
                    if (gender === 'm') translated += 'er';
                    else if (gender === 'f') translated += 'e';
                    else if (gender === 'n') translated += 'es';
                }
            }
            return translated;
        }
    }
    return rarity;
};

const equipmentIcon = (equipment) => {
    if (equipment == "Sword") {
        return '<i class="ra ra-relic-blade"></i>';
    } else if (equipment == "Axe") {
        return '<i class="ra ra-axe"></i>';
    } else if (equipment == "Hammer") {
        return '<i class="ra ra-flat-hammer"></i>';
    } else if (equipment == "Dagger") {
        return '<i class="ra ra-bowie-knife"></i>';
    } else if (equipment == "Flail") {
        return '<i class="ra ra-chain"></i>';
    } else if (equipment == "Scythe") {
        return '<i class="ra ra-scythe"></i>';
    } else if (equipment == "Plate") {
        return '<i class="ra ra-vest"></i>';
    } else if (equipment == "Chain") {
        return '<i class="ra ra-vest"></i>';
    } else if (equipment == "Leather") {
        return '<i class="ra ra-vest"></i>';
    } else if (equipment == "Tower") {
        return '<i class="ra ra-shield"></i>';
    } else if (equipment == "Kite") {
        return '<i class="ra ra-heavy-shield"></i>';
    } else if (equipment == "Buckler") {
        return '<i class="ra ra-round-shield"></i>';
    } else if (equipment == "Great Helm") {
        return '<i class="ra ra-knight-helmet"></i>';
    } else if (equipment == "Horned Helm") {
        return '<i class="ra ra-helmet"></i>';
    } else if (equipment == "Mask") {
        return '<i class="ra ra-arcane-mask"></i>';
    }
}

// Close equipment info modal helper (used by click-away)
function closeEquipmentInfo() {
    const itemInfo = document.querySelector('#equipmentInfo');
    const dimContainer = document.querySelector('#inventory');
    if (typeof sfxDecline !== 'undefined' && sfxDecline && typeof sfxDecline.play === 'function') sfxDecline.play();
    if (itemInfo) itemInfo.style.display = 'none';
    if (dimContainer) dimContainer.style.filter = 'brightness(100%)';
    if (typeof continueExploring === 'function') continueExploring();
}

// Show full detail of the item
const showItemInfo = (item, icon, action, i) => {
    sfxOpen.play();

    dungeon.status.exploring = false;
    let itemInfo = document.querySelector("#equipmentInfo");
    let rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
    let dimContainer = document.querySelector(`#inventory`);
    if (item.tier == undefined) {
        item.tier = 1;
    }
    const isLocked = Boolean(item.locked);
    const lockButtonLabel = translateEquipText(isLocked ? 'unlock-item' : 'lock-item', isLocked ? 'Unlock item' : 'Lock item');
    const lockButtonMarkup = action === 'unequip' ? `<button id="toggle-lock">${lockButtonLabel}</button>` : '';
    itemInfo.style.display = "flex";
    dimContainer.style.filter = "brightness(50%)";
    const actionLabel = t(action);
    itemInfo.innerHTML = `
            <div class="content">
                <h3 class="${item.rarity}">${icon}${rarityName(item.rarity, item.category)} ${equipmentName(item.category)}</h3>
                <h5 class="lvltier ${item.rarity}"><b>Lv.${item.lvl} Tier ${item.tier}</b></h5>
                <ul>
                ${item.stats.map(stat => {
        if (["critRate","critDmg","atkSpd","vamp","dodge","luck"].includes(Object.keys(stat)[0])) {
            return `<li>${Object.keys(stat)[0].toString().replace(/([A-Z])/g, ".$1").replace(/crit/g, "c").toUpperCase()}+${stat[Object.keys(stat)[0]].toFixed(2).replace(rx, "$1")}%</li>`;
        }
        else {
            return `<li>${Object.keys(stat)[0].toString().replace(/([A-Z])/g, ".$1").replace(/crit/g, "c").toUpperCase()}+${stat[Object.keys(stat)[0]]}</li>`;
        }
                }).join('')}
                </ul>
                <div class="button-container">
                    <button id="un-equip">${actionLabel}</button>
                    ${lockButtonMarkup}
                    <button id="sell-equip"><i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(item.value)}</button>
                    <button id="close-item-info">${t('close')}</button>
                </div>
            </div>`;

    // Equip/Unequip button for the item
    let unEquip = document.querySelector("#un-equip");
    unEquip.onclick = function () {
        if (action === "equip") {
            // Remove the item from the inventory and add it to the equipment
            if (player.equipped.length >= 6) {
                sfxDeny.play();
            } else {
                sfxEquip.play();

                // Equip the item
                player.inventory.equipment.splice(i, 1);
                player.equipped.push(item);

                itemInfo.style.display = "none";
                dimContainer.style.filter = "brightness(100%)";
                playerLoadStats();
                continueExploring();
            }
        } else if (action === "unequip") {
            sfxUnequip.play();

            // Remove the item from the equipment and add it to the inventory
            player.equipped.splice(i, 1);
            player.inventory.equipment.push(JSON.stringify(item));

            itemInfo.style.display = "none";
            dimContainer.style.filter = "brightness(100%)";
            playerLoadStats();
            continueExploring();
        }
    };

    const toggleLock = document.querySelector("#toggle-lock");
    if (toggleLock) {
        toggleLock.setAttribute('aria-pressed', isLocked ? 'true' : 'false');
        toggleLock.onclick = function () {
            item.locked = !item.locked;
            const updatedLabel = translateEquipText(item.locked ? 'unlock-item' : 'lock-item', item.locked ? 'Unlock item' : 'Lock item');
            toggleLock.textContent = updatedLabel;
            toggleLock.setAttribute('aria-pressed', item.locked ? 'true' : 'false');
            showEquipment();
            saveData();
        };
    }

    // Sell equipment
    let sell = document.querySelector("#sell-equip");
    sell.onclick = function () {
        sfxOpen.play();
        itemInfo.style.display = "none";
        defaultModalElement.style.display = "flex";
        defaultModalElement.innerHTML = `
        <div class="content">
            <p>${t('sell-item', { item: `<span class="${item.rarity}">${icon}${rarityName(item.rarity, item.category)} ${equipmentName(item.category)}</span>` })}</p>
            <div class="button-container">
                <button id="sell-confirm" data-i18n="sell">${t('sell')}</button>
                <button id="sell-cancel" data-i18n="cancel">${t('cancel')}</button>
            </div>
        </div>`;

        let confirm = document.querySelector("#sell-confirm");
        let cancel = document.querySelector("#sell-cancel");
        confirm.onclick = function () {
            sfxSell.play();

            // Sell the equipment
            if (action === "equip") {
                player.gold += item.value;
                player.inventory.equipment.splice(i, 1);
            } else if (action === "unequip") {
                player.gold += item.value;
                player.equipped.splice(i, 1);
            }

            defaultModalElement.style.display = "none";
            defaultModalElement.innerHTML = "";
            dimContainer.style.filter = "brightness(100%)";
            playerLoadStats();
            continueExploring();
        }
        cancel.onclick = function () {
            sfxDecline.play();
            defaultModalElement.style.display = "none";
            defaultModalElement.innerHTML = "";
            itemInfo.style.display = "flex";
            continueExploring();
        }
    };

    // Close item info
    let close = document.querySelector("#close-item-info");
    close.onclick = function () {
        sfxDecline.play();

        itemInfo.style.display = "none";
        dimContainer.style.filter = "brightness(100%)";
        continueExploring();
    };
}

// Sort inventory
const sortInventory = (type) => {
    if (type === 'rarity') {
        // Sort by rarity from highest to lowest
        const order = ['Heirloom', 'Legendary', 'Epic', 'Rare', 'Uncommon', 'Common'];
        player.inventory.equipment.sort((a, b) => {
            const itemA = JSON.parse(a);
            const itemB = JSON.parse(b);
            return order.indexOf(itemA.rarity) - order.indexOf(itemB.rarity);
        });
    } else if (type === 'category') {
        // Sort categories in reverse alphabetical order
        player.inventory.equipment.sort((a, b) => {
            const itemA = JSON.parse(a);
            const itemB = JSON.parse(b);
            const nameA = (itemA.baseCategory || itemA.category).toLowerCase();
            const nameB = (itemB.baseCategory || itemB.category).toLowerCase();
            return nameB.localeCompare(nameA);
        });
    } else if (type === 'tier') {
        // Sort tier from highest to lowest
        player.inventory.equipment.sort((a, b) => {
            const itemA = JSON.parse(a);
            const itemB = JSON.parse(b);
            return (itemB.tier || 0) - (itemA.tier || 0);
        });
    } else if (type === 'level') {
        // Sort level from highest to lowest
        player.inventory.equipment.sort((a, b) => {
            const itemA = JSON.parse(a);
            const itemB = JSON.parse(b);
            return (itemB.lvl || 0) - (itemA.lvl || 0);
        });
    }
    showInventory();
};

const showInventory = () => {
    let playerInventoryList = document.getElementById("playerInventory");
    playerInventoryList.innerHTML = "";

    const countSpan = document.getElementById('inventory-item-count');
    const totalItems = (typeof inventoryItemCount === 'function') ? inventoryItemCount() : (player.inventory && player.inventory.equipment ? player.inventory.equipment.length : 0);
    if (countSpan) {
        countSpan.textContent = totalItems;
    }
    
    if (player.inventory.equipment.length == 0) {
        playerInventoryList.innerHTML = t('there-are-no-items-available');
    }

    for (let i = 0; i < player.inventory.equipment.length; i++) {
        const item = JSON.parse(player.inventory.equipment[i]);

        // Create an element to display the item's name
        let itemDiv = document.createElement('div');
        let icon = equipmentIcon(item.baseCategory || item.category);
        itemDiv.className = "items";
        itemDiv.innerHTML = `<p class="${item.rarity}">${icon}${rarityName(item.rarity, item.category)} ${equipmentName(item.category)}</p>`;
        itemDiv.addEventListener('click', function () {
            showItemInfo(item, icon, 'equip', i);
        });

        // Add the itemDiv to the inventory container
        playerInventoryList.appendChild(itemDiv);
    }
}

// Show equipment
const showEquipment = () => {
    // Clear the inventory container
    let playerEquipmentList = document.getElementById("playerEquipment");
    playerEquipmentList.innerHTML = "";

    // Show a message if a player has no equipment
    if (player.equipped.length == 0) {
        playerEquipmentList.innerHTML = t('nothing-equipped');
    }

    for (let i = 0; i < player.equipped.length; i++) {
        const item = player.equipped[i];

        // Create an element to display the item's name
        const equipDiv = document.createElement('div');
        const icon = equipmentIcon(item.baseCategory || item.category);
        const isLocked = Boolean(item.locked);
        equipDiv.className = isLocked ? "items locked-item" : "items";
        equipDiv.innerHTML = `<button class="${item.rarity}">${icon}</button>`;
        if (isLocked) {
            const lockLabel = translateEquipText('locked', 'Locked');
            const lockIndicator = document.createElement('span');
            lockIndicator.className = 'lock-indicator';
            lockIndicator.innerHTML = '<i class="fas fa-lock"></i>';
            lockIndicator.setAttribute('aria-hidden', 'true');
            lockIndicator.setAttribute('title', lockLabel);
            equipDiv.setAttribute('title', lockLabel);
            equipDiv.appendChild(lockIndicator);
        }
        equipDiv.addEventListener('click', function () {
            showItemInfo(item, icon, 'unequip', i);
        });

        // Add the equipDiv to the inventory container
        playerEquipmentList.appendChild(equipDiv);
    }
}

// Apply the equipment stats to the player
const applyEquipmentStats = () => {
    // Reset the equipment stats
    player.equippedStats = {
        hp: 0,
        atk: 0,
        def: 0,
        atkSpd: 0,
        vamp: 0,
        critRate: 0,
        critDmg: 0,
        dodge: 0,
        luck: 0
    };

    for (let i = 0; i < player.equipped.length; i++) {
        const item = player.equipped[i];

        // Iterate through the stats array and update the player stats
        item.stats.forEach(stat => {
            for (const key in stat) {
                player.equippedStats[key] += stat[key];
            }
        });
    }
    calculateStats();
}

const unequipAll = () => {
    for (let i = player.equipped.length - 1; i >= 0; i--) {
        const item = player.equipped[i];
        player.equipped.splice(i, 1);
        player.inventory.equipment.push(JSON.stringify(item));
    }
    playerLoadStats();
};

const EQUIP_BEST_STATS = ['atk', 'critRate', 'critDmg', 'atkSpd', 'hp', 'def', 'vamp', 'dodge', 'luck'];
const EQUIP_BEST_LABEL_KEYS = {
    atk: 'stat-display.attack',
    critRate: 'stat-display.crit-rate',
    critDmg: 'stat-display.crit-dmg',
    atkSpd: 'stat-display.attack-speed',
    hp: 'stat-display.health',
    def: 'stat-display.defense',
    vamp: 'stat-display.vampirism',
    dodge: 'stat-display.dodge',
    luck: 'stat-display.luck'
};
const EQUIP_BEST_LABEL_FALLBACKS = {
    atk: 'Attack',
    critRate: 'Crit Rate',
    critDmg: 'Crit Damage',
    atkSpd: 'Attack Speed',
    hp: 'HP',
    def: 'Defense',
    vamp: 'Vampirism',
    dodge: 'Dodge',
    luck: 'Luck'
};

const translateEquipText = (key, fallback) => {
    if (typeof t === 'function') {
        const translated = t(key);
        if (translated !== key) {
            return translated;
        }
    }
    return fallback;
};

const ensureEquipBestPriorities = () => {
    if (!player.preferences) {
        player.preferences = {
            equipBestUseCustom: false,
            equipBestPriorities: [...EQUIP_BEST_STATS],
        };
    }
    if (typeof player.preferences.equipBestUseCustom !== 'boolean') {
        player.preferences.equipBestUseCustom = false;
    }
    if (!Array.isArray(player.preferences.equipBestPriorities)) {
        player.preferences.equipBestPriorities = [];
    }

    const unique = [];
    const seen = new Set();
    for (const stat of player.preferences.equipBestPriorities) {
        if (EQUIP_BEST_STATS.includes(stat) && !seen.has(stat)) {
            unique.push(stat);
            seen.add(stat);
        }
    }
    for (const stat of EQUIP_BEST_STATS) {
        if (!seen.has(stat)) {
            unique.push(stat);
            seen.add(stat);
        }
    }
    player.preferences.equipBestPriorities = unique;
    return unique;
};

const getEquipPriorityLabel = (stat) => {
    const key = EQUIP_BEST_LABEL_KEYS[stat];
    const fallback = EQUIP_BEST_LABEL_FALLBACKS[stat] || stat.toUpperCase();
    if (key) {
        return translateEquipText(key, fallback);
    }
    return fallback;
};

const getItemStatValue = (item, stat) => {
    if (!item || !Array.isArray(item.stats)) {
        return 0;
    }
    let total = 0;
    for (const entry of item.stats) {
        if (entry && typeof entry === 'object' && entry[stat] !== undefined) {
            total += entry[stat];
        }
    }
    return total;
};

const compareItemsByPriority = (itemA, itemB, priorities) => {
    for (const stat of priorities) {
        const valueA = getItemStatValue(itemA, stat);
        const valueB = getItemStatValue(itemB, stat);
        if (valueA !== valueB) {
            return valueB - valueA;
        }
    }
    const aValue = itemA.value || 0;
    const bValue = itemB.value || 0;
    if (aValue !== bValue) {
        return bValue - aValue;
    }
    return 0;
};

function openEquipBestSettings() {
    const modal = typeof defaultModalElement !== 'undefined' ? defaultModalElement : null;
    if (!modal) {
        return;
    }
    if (typeof sfxOpen !== 'undefined') {
        sfxOpen.play();
    }
    if (typeof dungeon !== 'undefined' && dungeon.status) {
        dungeon.status.exploring = false;
    }
    const dimTarget = document.querySelector('#inventory');
    if (dimTarget) {
        dimTarget.style.filter = 'brightness(50%)';
    }

    const priorities = [...ensureEquipBestPriorities()];
    let useCustom = Boolean(player.preferences && player.preferences.equipBestUseCustom);

    const title = translateEquipText('auto-equip-priorities', 'Auto Equip Priorities');
    const help = translateEquipText('auto-equip-priorities-help', 'Reorder the stats to set their importance when using Auto Equip.');
    const toggleLabel = translateEquipText('use-custom-priorities', 'Use custom priorities');
    const toggleHint = translateEquipText('use-custom-priorities-detail', 'When disabled, Auto Equip will choose gear by overall item value.');
    const saveLabel = translateEquipText('apply', 'Apply');
    const closeLabel = translateEquipText('close', 'Close');
    const moveUpLabel = translateEquipText('move-up', 'Move up');
    const moveDownLabel = translateEquipText('move-down', 'Move down');

    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="content equip-priority-modal">
            <h3>${title}</h3>
            <p class="equip-priority-description">${help}</p>
            <label class="equip-priority-toggle">
                <input type="checkbox" id="equip-priority-toggle"${useCustom ? ' checked' : ''}>
                <span>${toggleLabel}</span>
            </label>
            <p class="equip-priority-hint">${toggleHint}</p>
            <ul id="equip-priority-list" class="${useCustom ? '' : 'equip-priority-disabled'}"></ul>
            <div class="button-container">
                <button id="equip-priority-save">${saveLabel}</button>
                <button id="equip-priority-cancel">${closeLabel}</button>
            </div>
        </div>`;

    const listEl = modal.querySelector('#equip-priority-list');
    const toggleEl = modal.querySelector('#equip-priority-toggle');
    const saveBtn = modal.querySelector('#equip-priority-save');
    const cancelBtn = modal.querySelector('#equip-priority-cancel');

    const renderList = () => {
        if (!listEl) {
            return;
        }
        listEl.innerHTML = '';
        if (!useCustom) {
            listEl.classList.add('equip-priority-disabled');
        } else {
            listEl.classList.remove('equip-priority-disabled');
        }

        priorities.forEach((stat, index) => {
            const li = document.createElement('li');
            li.dataset.stat = stat;

            const labelWrap = document.createElement('span');
            labelWrap.className = 'equip-priority-label';

            const rankSpan = document.createElement('span');
            rankSpan.className = 'equip-priority-rank';
            rankSpan.textContent = `${index + 1}.`;

            const nameSpan = document.createElement('span');
            nameSpan.className = 'equip-priority-name';
            nameSpan.textContent = getEquipPriorityLabel(stat);

            labelWrap.appendChild(rankSpan);
            labelWrap.appendChild(nameSpan);

            const controls = document.createElement('div');
            controls.className = 'equip-priority-buttons';

            const upBtn = document.createElement('button');
            upBtn.type = 'button';
            upBtn.className = 'priority-btn';
            upBtn.dataset.direction = 'up';
            upBtn.setAttribute('aria-label', moveUpLabel);
            upBtn.innerHTML = '<i class="fa fa-angle-up"></i>';
            if (!useCustom || index === 0) {
                upBtn.disabled = true;
            }

            const downBtn = document.createElement('button');
            downBtn.type = 'button';
            downBtn.className = 'priority-btn';
            downBtn.dataset.direction = 'down';
            downBtn.setAttribute('aria-label', moveDownLabel);
            downBtn.innerHTML = '<i class="fa fa-angle-down"></i>';
            if (!useCustom || index === priorities.length - 1) {
                downBtn.disabled = true;
            }

            controls.appendChild(upBtn);
            controls.appendChild(downBtn);

            li.appendChild(labelWrap);
            li.appendChild(controls);

            listEl.appendChild(li);
        });
    };

    const closeModal = (sound) => {
        if (sound === 'decline' && typeof sfxDecline !== 'undefined') {
            sfxDecline.play();
        }
        if (dimTarget) {
            dimTarget.style.filter = 'brightness(100%)';
        }
        modal.style.display = 'none';
        modal.innerHTML = '';
        if (typeof continueExploring === 'function') {
            continueExploring();
        }
    };

    if (toggleEl) {
        toggleEl.addEventListener('change', () => {
            useCustom = toggleEl.checked;
            renderList();
        });
    }

    if (listEl) {
        listEl.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-direction]');
            if (!button || !useCustom || button.disabled) {
                return;
            }
            const direction = button.dataset.direction;
            const parentLi = button.closest('li');
            if (!parentLi) {
                return;
            }
            const stat = parentLi.dataset.stat;
            const currentIndex = priorities.indexOf(stat);
            if (currentIndex === -1) {
                return;
            }
            if (direction === 'up' && currentIndex > 0) {
                const temp = priorities[currentIndex - 1];
                priorities[currentIndex - 1] = priorities[currentIndex];
                priorities[currentIndex] = temp;
            } else if (direction === 'down' && currentIndex < priorities.length - 1) {
                const temp = priorities[currentIndex + 1];
                priorities[currentIndex + 1] = priorities[currentIndex];
                priorities[currentIndex] = temp;
            }
            renderList();
        });
    }

    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            if (!player.preferences) {
                player.preferences = {};
            }
            player.preferences.equipBestUseCustom = useCustom;
            player.preferences.equipBestPriorities = [...priorities];
            saveData();
            if (typeof sfxConfirm !== 'undefined') {
                sfxConfirm.play();
            }
            closeModal();
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            closeModal('decline');
        });
    }

    renderList();
}

const equipBest = () => {
    if (player.inventory.equipment.length === 0 && player.equipped.length === 0) {
        if (typeof sfxDeny !== 'undefined') sfxDeny.play();
        return;
    }
    if (typeof sfxEquip !== 'undefined') sfxEquip.play();
    const maxEquippedSlots = 6;
    const equippedItems = Array.isArray(player.equipped) ? player.equipped : [];
    const lockedItems = equippedItems.filter(item => item && item.locked);
    const unlockedEquipped = equippedItems.filter(item => item && !item.locked);
    const candidateItems = [...unlockedEquipped];
    for (const eq of player.inventory.equipment) {
        candidateItems.push(JSON.parse(eq));
    }
    if (player.preferences && player.preferences.equipBestUseCustom) {
        const priorities = [...ensureEquipBestPriorities()];
        candidateItems.sort((a, b) => compareItemsByPriority(a, b, priorities));
    } else {
        candidateItems.sort((a, b) => (b.value || 0) - (a.value || 0));
    }
    const lockedSlots = Math.min(lockedItems.length, maxEquippedSlots);
    const availableSlots = Math.max(0, maxEquippedSlots - lockedSlots);
    const selected = candidateItems.slice(0, availableSlots);
    const remaining = candidateItems.slice(availableSlots);
    const overflowLocked = lockedItems.slice(maxEquippedSlots);
    player.equipped = lockedItems.slice(0, maxEquippedSlots).concat(selected).filter(Boolean);
    player.inventory.equipment = remaining.concat(overflowLocked).filter(Boolean).map(item => JSON.stringify(item));
    playerLoadStats();
};

const sellAll = (rarity) => {
    if (rarity == "All") {
        if (player.inventory.equipment.length !== 0) {
            sfxSell.play();
            for (let i = 0; i < player.inventory.equipment.length; i++) {
                const equipment = JSON.parse(player.inventory.equipment[i]);
                player.gold += equipment.value;
                player.inventory.equipment.splice(i, 1);
                i--;
            }
            playerLoadStats();
        } else {
            sfxDeny.play();
        }
    } else {
        let rarityCheck = false;
        for (let i = 0; i < player.inventory.equipment.length; i++) {
            const equipment = JSON.parse(player.inventory.equipment[i]);
            if (equipment.rarity === rarity) {
                rarityCheck = true;
                break;
            }
        }
        if (rarityCheck) {
            sfxSell.play();
            for (let i = 0; i < player.inventory.equipment.length; i++) {
                const equipment = JSON.parse(player.inventory.equipment[i]);
                if (equipment.rarity === rarity) {
                    player.gold += equipment.value;
                    player.inventory.equipment.splice(i, 1);
                    i--;
                }
            }
            playerLoadStats();
        } else {
            sfxDeny.play();
        }
    }
}

const createEquipmentPrint = (condition) => {
    let rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
    let item = createEquipment(false);
    receiveEquipment(item);
    let panel = `
        <div class="primary-panel" style="padding: 0.5rem; margin-top: 0.5rem;">
                <h4 class="${item.rarity}"><b>${item.icon}${rarityName(item.rarity, item.category)} ${equipmentName(item.category)}</b></h4>
                <h5 class="${item.rarity}"><b>Lv.${item.lvl} Tier ${item.tier}</b></h5>
                <ul>
                ${item.stats.map(stat => {
        if (["critRate","critDmg","atkSpd","vamp","dodge","luck"].includes(Object.keys(stat)[0])) {
            return `<li>${Object.keys(stat)[0].toString().replace(/([A-Z])/g, ".$1").replace(/crit/g, "c").toUpperCase()}+${stat[Object.keys(stat)[0]].toFixed(2).replace(rx, "$1")}%</li>`;
        }
        else {
            return `<li>${Object.keys(stat)[0].toString().replace(/([A-Z])/g, ".$1").replace(/crit/g, "c").toUpperCase()}+${stat[Object.keys(stat)[0]]}</li>`;
        }
    }).join('')}
            </ul>
        </div>`;
    const itemLabel = `<span class="${item.rarity}">${rarityName(item.rarity, item.category)} ${equipmentName(item.category)}</span>`;
    if (condition == "combat") {
        const msg = typeof t === 'function' ? t('enemy-dropped-item', { enemy: enemy.name, item: itemLabel }) : `${enemy.name} dropped ${itemLabel}.`;
        addCombatLog(`${msg}<br>${panel}`);
        checkInventoryLimit(true);
    } else if (condition == "dungeon") {
        const msg = typeof t === 'function' ? t('you-got-item', { item: itemLabel }) : `You got ${itemLabel}.`;
        addDungeonLog(`${msg}<br>${panel}`);
        checkInventoryLimit(true);
    }
}
