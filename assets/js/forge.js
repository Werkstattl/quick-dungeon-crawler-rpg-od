// ========== The Forge System ==========
// Late game feature for combining equipment

let forgeModalElement = null;
let forgeGoldElement = null;
let selectedForgeItems = [null, null, null];
let forgeResult = null;
let forgeLevelRange = null;
let forgeCost = 0;
let forgeUnlocked = false;

const FORGE_PRODUCT_ID = 'forge_unlock_premium';

// Initialize forge system
const initializeForge = () => {
    forgeModalElement = document.querySelector('#forgeModal');
    forgeGoldElement = document.querySelector('#forge-player-gold');
};

function unlockForge() {
    forgeUnlocked = true;
    if (forgeModalElement && forgeModalElement.style.display === 'flex') {
        updateForgeDisplay();
    }
}

const updateForgeGold = () => {
    if (forgeGoldElement) {
        forgeGoldElement.innerHTML = `<i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(player.gold)}`;
    }
};

const openForgeModal = () => {
    if (!forgeModalElement) initializeForge();

    sfxOpen.play();
    closeInventory();
    menuModalElement.style.display = "none";

    forgeModalElement.style.display = "flex";
    let dimDungeon = document.querySelector('#dungeon-main');
    if (dimDungeon) {
        dimDungeon.style.filter = "brightness(50%)";
    }
    
    // Reset forge state
    selectedForgeItems = [null, null, null];
    forgeResult = null;
    forgeLevelRange = null;
    forgeCost = 0;
    
    loadForgeEquipment();
    updateForgeDisplay();
};

// Close forge modal
const closeForgeModal = () => {
    sfxDecline.play();
    forgeModalElement.style.display = "none";
    let dimDungeon = document.querySelector('#dungeon-main');
    if (dimDungeon) {
        dimDungeon.style.filter = "brightness(100%)";
    }

    // Reset forge state
    selectedForgeItems = [null, null, null];
    forgeResult = null;
    forgeLevelRange = null;
    forgeCost = 0;
    const resultContainer = document.querySelector('#forge-result');
    if (resultContainer) {
        resultContainer.style.display = 'none';
    }
    const resultItem = document.querySelector('#forge-result-item');
    if (resultItem) {
        resultItem.innerHTML = '';
    }
    updateForgeDisplay();
};

// Load available equipment for forging
const loadForgeEquipment = () => {
    const equipmentGrid = document.querySelector('#forge-equipment-grid');
    equipmentGrid.innerHTML = "";
    
    // Collect forgeable equipment from both inventory and equipped items
    const forgeableEquipment = [];

    // Add inventory equipment
    player.inventory.equipment.forEach(equipStr => {
        const equip = JSON.parse(equipStr);
        forgeableEquipment.push({
            equipStr,
            equip,
            source: 'inventory'
        });
    });

    // Add equipped items
    player.equipped.forEach(equip => {
        forgeableEquipment.push({
            equipStr: JSON.stringify(equip),
            equip,
            source: 'equipped'
        });
    });
    
    // Sort equipment by rarity (highest to lowest), then by level (highest to lowest)
    const rarityOrder = ['Heirloom', 'Legendary', 'Epic', 'Rare', 'Uncommon', 'Common'];
    
    // Filter out equipment that is already selected in any forge slot
    const selectedStrs = selectedForgeItems.filter(Boolean).map(item => item.equipmentStr);
    const filteredEquipment = forgeableEquipment.filter(item => !selectedStrs.includes(item.equipStr));

    filteredEquipment.sort((a, b) => {
        const rarityA = rarityOrder.indexOf(a.equip.rarity);
        const rarityB = rarityOrder.indexOf(b.equip.rarity);
        // First sort by rarity
        if (rarityA !== rarityB) {
            return rarityA - rarityB;
        }
        // If same rarity, sort by level (highest to lowest)
        return b.equip.lvl - a.equip.lvl;
    });
    
    filteredEquipment.forEach((item, index) => {
        const { equipStr, equip, source } = item;
        const equipDiv = document.createElement('div');
        equipDiv.className = `forge-equipment-item ${equip.rarity}`;
        
        // Format stats display
        let rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
        const statsHtml = equip.stats.map(stat => {
            const statName = Object.keys(stat)[0];
            const statValue = stat[statName];
            if (["critRate", "critDmg", "atkSpd", "vamp", "dodge"].includes(statName)) {
                return `<li>${statName.replace(/([A-Z])/g, ".$1").replace(/crit/g, "c").toUpperCase()}+${statValue.toFixed(2).replace(rx, "$1")}%</li>`;
            } else {
                return `<li>${statName.replace(/([A-Z])/g, ".$1").replace(/crit/g, "c").toUpperCase()}+${statValue}</li>`;
            }
        }).join('');
        
        equipDiv.innerHTML = `
            <div class="equipment-icon">${equipmentIcon(equip.category)}</div>
            <div class="equipment-info">
                <p class="${equip.rarity}">${equip.category}</p>
                <p>Lv.${equip.lvl} T${equip.tier}</p>
                <ul class="equipment-stats">
                    ${statsHtml}
                </ul>
                <p class="equipment-value">Value: ${nFormatter(equip.value)}</p>
                ${source === 'equipped' ? '<p class="equipped-indicator">⚔️ Equipped</p>' : ''}
            </div>
        `;
        // Only allow click if a slot is free
        equipDiv.addEventListener('click', () => {
            if (selectedForgeItems[0] === null || selectedForgeItems[1] === null || selectedForgeItems[2] === null) {
                selectForgeEquipment(equipStr, index, source);
            } else {
                sfxDeny.play();
            }
        });
        equipmentGrid.appendChild(equipDiv);
    });
};

// Select equipment for forging
const selectForgeEquipment = (equipmentStr, index, source = 'inventory') => {
    const equipment = JSON.parse(equipmentStr);
    
    // Check if this item is already selected in any slot
    if ((selectedForgeItems[0] && selectedForgeItems[0].equipmentStr === equipmentStr) ||
        (selectedForgeItems[1] && selectedForgeItems[1].equipmentStr === equipmentStr) ||
        (selectedForgeItems[2] && selectedForgeItems[2].equipmentStr === equipmentStr)) {
        // Item already selected, play deny sound and return
        sfxDeny.play();
        return;
    }

    // Find first empty slot
    if (selectedForgeItems[0] === null) {
        selectedForgeItems[0] = { equipment, equipmentStr, source };
        sfxEquip.play();
    } else if (selectedForgeItems[1] === null) {
        selectedForgeItems[1] = { equipment, equipmentStr, source };
        sfxEquip.play();
    } else if (selectedForgeItems[2] === null) {
        selectedForgeItems[2] = { equipment, equipmentStr, source };
        sfxEquip.play();
    } else {
        // All slots full, replace first item
        selectedForgeItems[0] = { equipment, equipmentStr, source };
        sfxEquip.play();
    }
    
    updateForgeDisplay();
    loadForgeEquipment(); // <-- update equipment list after selection
    calculateForgeResult();
};

// Update forge display
const updateForgeDisplay = () => {
    updateForgeGold();
    // Update slot 1
    const slot1 = document.querySelector('#forge-slot-1');
    if (selectedForgeItems[0]) {
        const equip = selectedForgeItems[0].equipment;
        slot1.innerHTML = `
            <div class="selected-equipment ${equip.rarity}">
                ${equipmentIcon(equip.category)}
                <p>${equip.category}</p>
                <p>Lv.${equip.lvl} T${equip.tier}</p>
            </div>
        `;
        slot1.className = 'forge-slot selected';
        slot1.onclick = () => {
            selectedForgeItems[0] = null;
            forgeResult = null;
            forgeLevelRange = null;
            forgeCost = 0;
            updateForgeDisplay();
            loadForgeEquipment(); // update equipment list after removal
            document.querySelector('#forge-result').style.display = 'none';
            sfxUnequip.play();
        };
    } else {
        slot1.innerHTML = '<p>Select equipment</p>';
        slot1.className = 'forge-slot';
        slot1.onclick = null;
    }
    
    // Update slot 2
    const slot2 = document.querySelector('#forge-slot-2');
    if (selectedForgeItems[1]) {
        const equip = selectedForgeItems[1].equipment;
        slot2.innerHTML = `
            <div class="selected-equipment ${equip.rarity}">
                ${equipmentIcon(equip.category)}
                <p>${equip.category}</p>
                <p>Lv.${equip.lvl} T${equip.tier}</p>
            </div>
        `;
        slot2.className = 'forge-slot selected';
        slot2.onclick = () => {
            selectedForgeItems[1] = null;
            forgeResult = null;
            forgeLevelRange = null;
            forgeCost = 0;
            updateForgeDisplay();
            loadForgeEquipment(); // update equipment list after removal
            document.querySelector('#forge-result').style.display = 'none';
            sfxUnequip.play();
        };
    } else {
        slot2.innerHTML = '<p>Select equipment</p>';
        slot2.className = 'forge-slot';
        slot2.onclick = null;
    }

    // Update slot 3
    const slot3 = document.querySelector('#forge-slot-3');
    if (slot3) {
        if (selectedForgeItems[2]) {
            const equip3 = selectedForgeItems[2].equipment;
            slot3.innerHTML = `
            <div class="selected-equipment ${equip3.rarity}">
                ${equipmentIcon(equip3.category)}
                <p>${equip3.category}</p>
                <p>Lv.${equip3.lvl} T${equip3.tier}</p>
            </div>
            `;
            slot3.className = 'forge-slot selected';
            slot3.onclick = () => {
                selectedForgeItems[2] = null;
                forgeResult = null;
                forgeLevelRange = null;
                forgeCost = 0;
                updateForgeDisplay();
                loadForgeEquipment(); // update equipment list after removal
                document.querySelector('#forge-result').style.display = 'none';
                sfxUnequip.play();
            };
        } else {
            slot3.innerHTML = '<p>Select equipment</p>';
            slot3.className = 'forge-slot';
            slot3.onclick = null;
        }
    }
    
    // Update buttons
    const confirmButton = document.querySelector('#forge-confirm');
    const clearButton = document.querySelector('#forge-clear');

    clearButton.onclick = () => {
        selectedForgeItems = [null, null, null];
        forgeResult = null;
        forgeLevelRange = null;
        forgeCost = 0;
        updateForgeDisplay();
        loadForgeEquipment();
        document.querySelector('#forge-result').style.display = 'none';
        sfxUnequip.play();
    };

    if (!forgeUnlocked) {
        const isAndroid = /Android/i.test(navigator.userAgent);
        confirmButton.disabled = false;
        confirmButton.textContent = 'Unlock The Forge (Premium)';
        if (!isCordova()) {
            if (isAndroid) {
                confirmButton.textContent = 'Get on Google Play (Premium)';
            }
        }
        confirmButton.onclick = () => {
            if (isCordova()) {
                buyForgeUnlock();
            } else {
                if (isAndroid) {
                    ratingSystem.openGooglePlayForRating();
                } else {
                    openExternal('https://werkstattl.itch.io/quick-dungeon-crawler-on-demand/purchase');
                }
            }
        };
        return;
    }

    const allSelected = selectedForgeItems[0] && selectedForgeItems[1] && selectedForgeItems[2];
    const sameTier = allSelected &&
        selectedForgeItems[0].equipment.tier === selectedForgeItems[1].equipment.tier &&
        selectedForgeItems[0].equipment.tier === selectedForgeItems[2].equipment.tier;
    const sameRarity = allSelected &&
        selectedForgeItems[0].equipment.rarity === selectedForgeItems[1].equipment.rarity &&
        selectedForgeItems[0].equipment.rarity === selectedForgeItems[2].equipment.rarity;

    if (allSelected && (!sameTier || !sameRarity)) {
        confirmButton.disabled = true;
        confirmButton.textContent = !sameTier ? 'Items Must Share Tier' : 'Items Must Share Rarity';
    } else if (allSelected && player.gold >= forgeCost) {
        confirmButton.disabled = false;
        confirmButton.textContent = 'Forge Equipment';
    } else if (allSelected) {
        confirmButton.disabled = true;
        confirmButton.textContent = 'Not Enough Gold';
    } else {
        confirmButton.disabled = true;
        confirmButton.textContent = 'Select 3 Items';
    }
    
    // Confirm button for unlocked forge
    confirmButton.onclick = () => {
        const allSelectedConfirm = selectedForgeItems[0] && selectedForgeItems[1] && selectedForgeItems[2];
        const sameTierConfirm = allSelectedConfirm &&
            selectedForgeItems[0].equipment.tier === selectedForgeItems[1].equipment.tier &&
            selectedForgeItems[0].equipment.tier === selectedForgeItems[2].equipment.tier;
        const sameRarityConfirm = allSelectedConfirm &&
            selectedForgeItems[0].equipment.rarity === selectedForgeItems[1].equipment.rarity &&
            selectedForgeItems[0].equipment.rarity === selectedForgeItems[2].equipment.rarity;

        if (allSelectedConfirm && sameTierConfirm && sameRarityConfirm && player.gold >= forgeCost) {
            executeForging();
        } else {
            sfxDeny.play();
        }
    };
};

// Calculate forge result
const calculateForgeResult = () => {
    if (!selectedForgeItems[0] || !selectedForgeItems[1] || !selectedForgeItems[2]) {
        document.querySelector('#forge-result').style.display = 'none';
        return;
    }

    const item1 = selectedForgeItems[0].equipment;
    const item2 = selectedForgeItems[1].equipment;
    const item3 = selectedForgeItems[2].equipment;

    // Ensure all items share the same tier and rarity
    if (!(item1.tier === item2.tier &&
          item1.tier === item3.tier &&
          item1.rarity === item2.rarity &&
          item1.rarity === item3.rarity)) {
        document.querySelector('#forge-result').style.display = 'none';
        forgeCost = 0;
        return;
    }

    // Determine possible level range
    const avgLvl = Math.round((item1.lvl + item2.lvl + item3.lvl) / 3);
    const minLvl = Math.max(1, avgLvl - 1);
    const maxLvl = Math.min(100, avgLvl + 2);
    forgeLevelRange = { min: minLvl, max: maxLvl };

    // Calculate result equipment
    forgeResult = createForgedEquipment(item1, item2, item3);

    // Calculate cost (based on input item values)
    forgeCost = Math.round((item1.value + item2.value + item3.value) * 2.5);
    
    // Display result
    displayForgeResult();
};

// Create forged equipment
const createForgedEquipment = (item1, item2, item3) => {
    // Generate a fresh piece of equipment similar to a normal dungeon drop
    const forgedEquipment = createEquipment(false);

    // Set tier to the same as input items
    forgedEquipment.tier = item1.tier;

    // Set level roughly around the average of the input items
    const avgLvl = Math.round((item1.lvl + item2.lvl + item3.lvl) / 3);
    const minLvl = Math.max(1, avgLvl - 1);
    const maxLvl = Math.min(100, avgLvl + 2);
    forgedEquipment.lvl = randomizeNum(minLvl, maxLvl);

    // Increase rarity by one step if possible
    const rarityOrder = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Heirloom'];
    let currentRarityIndex = rarityOrder.indexOf(item1.rarity);
    if (currentRarityIndex < rarityOrder.length - 1) {
        forgedEquipment.rarity = rarityOrder[currentRarityIndex + 1];
    } else {
        forgedEquipment.rarity = item1.rarity; // Already max rarity
    }

    // Re-roll stats so the item matches normal drops for its level
    rerollEquipmentStats(forgedEquipment);

    // Mark item as forged
    forgedEquipment.forged = true;

    return forgedEquipment;
};


// Display forge result
const displayForgeResult = () => {
    const resultContainer = document.querySelector('#forge-result');
    const resultItem = document.querySelector('#forge-result-item');
    const costAmount = document.querySelector('#forge-cost-amount');
    
    resultContainer.style.display = 'block';
    
    let rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
    
    resultItem.innerHTML = `
        <div class="forged-equipment ${forgeResult.rarity}">
            <h4 class="${forgeResult.rarity}">
                ${forgeResult.icon}${forgeResult.rarity} ${forgeResult.category}
            </h4>
            <h5 class="${forgeResult.rarity}">Lv.${forgeLevelRange.min}-${forgeLevelRange.max} Tier ${forgeResult.tier}</h5>
            <ul style="display:none">
                ${forgeResult.stats.map(stat => {
                    const statName = Object.keys(stat)[0];
                    const statValue = stat[statName];
                    if (["critRate", "critDmg", "atkSpd", "vamp"].includes(statName)) {
                        return `<li>${statName.replace(/([A-Z])/g, ".$1").replace(/crit/g, "c").toUpperCase()}+${statValue.toFixed(2).replace(rx, "$1")}%</li>`;
                    } else {
                        return `<li>${statName.replace(/([A-Z])/g, ".$1").replace(/crit/g, "c").toUpperCase()}+${statValue}</li>`;
                    }
                }).join('')}
            </ul>
            <p class="forged-indicator">⚒️ Forged Equipment</p>
        </div>
    `;
    
    costAmount.textContent = nFormatter(forgeCost);
    
    // Color cost based on affordability
    const costElement = costAmount.parentElement;
    if (player.gold >= forgeCost) {
        costElement.style.color = '#4CAF50';
    } else {
        costElement.style.color = '#F44336';
    }
    updateForgeGold();
};

// Execute forging
const executeForging = () => {
    if (!selectedForgeItems[0] || !selectedForgeItems[1] || !selectedForgeItems[2] || player.gold < forgeCost) {
        sfxDeny.play();
        return;
    }
    
    const item1 = selectedForgeItems[0];
    const item2 = selectedForgeItems[1];
    const item3 = selectedForgeItems[2];

    // Helper function to remove item from appropriate source
    const removeItem = (item) => {
        if (item.source === 'inventory') {
            const itemIndex = player.inventory.equipment.indexOf(item.equipmentStr);
            if (itemIndex !== -1) {
                player.inventory.equipment.splice(itemIndex, 1);
            }
        } else if (item.source === 'equipped') {
            // Prefer reference comparison to avoid JSON order issues
            const equippedIndex = player.equipped.indexOf(item.equipment);
            if (equippedIndex !== -1) {
                player.equipped.splice(equippedIndex, 1);
            } else {
                // Fallback to string comparison in case reference changed
                const altIndex = player.equipped.findIndex(eq =>
                    JSON.stringify(eq) === item.equipmentStr
                );
                if (altIndex !== -1) {
                    player.equipped.splice(altIndex, 1);
                }
            }
        }
    };

    // Remove all items
    removeItem(item1);
    removeItem(item2);
    removeItem(item3);

    // Deduct gold
    player.gold -= forgeCost;
    updateForgeGold();

    // Validate forgeResult before adding to inventory
    if (!forgeResult || typeof forgeResult !== 'object' || Array.isArray(forgeResult) || !forgeResult.category || !forgeResult.rarity || !forgeResult.stats) {
        sfxDeny.play();
        return;
    }

    // Add forged item to inventory or auto equip if slots are available
    receiveEquipment(forgeResult);
    sfxEquip.play();

    // Reset forge state and UI
    selectedForgeItems = [null, null, null];
    forgeResult = null;
    forgeLevelRange = null;
    forgeCost = 0;
    document.querySelector('#forge-result').style.display = 'none';
    loadForgeEquipment();
    updateForgeDisplay();

};
