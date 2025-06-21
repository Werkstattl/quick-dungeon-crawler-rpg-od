// ========== The Forge System ==========
// Late game feature for combining equipment

let forgeModalElement = null;
let forgeGoldElement = null;
let selectedForgeItems = [null, null, null];
let forgeResult = null;
let forgeCost = 0;
let forgeUnlocked = false;

const FORGE_PRODUCT_ID = 'forge_unlock_premium';

// Initialize forge system
const initializeForge = () => {
    forgeModalElement = document.querySelector('#forgeModal');
    forgeGoldElement = document.querySelector('#forge-player-gold');
};

// Check if player can access the forge
const canAccessForge = () => {
    return forgeUnlocked;
};

function unlockForge() {
    forgeUnlocked = true;
}

const updateForgeGold = () => {
    if (forgeGoldElement) {
        forgeGoldElement.innerHTML = `<i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(player.gold)}`;
    }
};

// Show purchase confirmation
const purchaseForgeAccess = () => {
    defaultModalElement.style.display = "flex";
    defaultModalElement.innerHTML = `
        <div class="content">
            <h3><i class="ra ra-anvil"></i> Unlock The Forge</h3>
            <p>The Forge is a powerful late-game feature that allows you to combine your best equipment into even more powerful gear!</p>
            <div class="forge-features">
                <p>✓ Combine three equipment pieces</p>
                <p>✓ Create gear with higher tier and stats</p>
                <p>✓ Permanent unlock across all runs</p>
            </div>
            <div class="button-container">
                <button id="purchase-confirm">Purchase</button>
                <button id="purchase-cancel">Cancel</button>
            </div>
        </div>`;
    
    let confirm = document.querySelector('#purchase-confirm');
    let cancel = document.querySelector('#purchase-cancel');
    
    confirm.onclick = function () {
        if (window.cordova) {
            buyForgeUnlock();
        } else {
            alert('The Forge is currently only available in the Google Play version of "Quick Dungeon Crawler". Please download the app to unlock this feature.');
        }
    };
    
    cancel.onclick = function () {
        sfxDecline.play();
        allocationPopup();
    };
};

const openForgeModal = () => {
    if (!canAccessForge()) {
        purchaseForgeAccess();
        return;
    }
    
    sfxOpen.play();
    closeInventory();
    menuModalElement.style.display = "none";
    
    forgeModalElement.style.display = "flex";
    let dimDungeon = document.querySelector('#dungeon-main');
    dimDungeon.style.filter = "brightness(50%)";
    
    // Reset forge state
    selectedForgeItems = [null, null, null];
    forgeResult = null;
    forgeCost = 0;
    
    loadForgeEquipment();
    updateForgeDisplay();
};

// Close forge modal
const closeForgeModal = () => {
    sfxDecline.play();
    forgeModalElement.style.display = "none";
    let dimDungeon = document.querySelector('#dungeon-main');
    dimDungeon.style.filter = "brightness(100%)";
    
    // Reset forge state
    selectedForgeItems = [null, null, null];
    forgeResult = null;
    forgeCost = 0;
    updateForgeDisplay();
    
    continueExploring();
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
    forgeableEquipment.sort((a, b) => {
        const rarityA = rarityOrder.indexOf(a.equip.rarity);
        const rarityB = rarityOrder.indexOf(b.equip.rarity);
        
        // First sort by rarity
        if (rarityA !== rarityB) {
            return rarityA - rarityB;
        }
        
        // If same rarity, sort by level (highest to lowest)
        return b.equip.lvl - a.equip.lvl;
    });
    
    forgeableEquipment.forEach((item, index) => {
        const { equipStr, equip, source } = item;
        const equipDiv = document.createElement('div');
        equipDiv.className = `forge-equipment-item ${equip.rarity}`;
        
        // Format stats display
        let rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
        const statsHtml = equip.stats.map(stat => {
            const statName = Object.keys(stat)[0];
            const statValue = stat[statName];
            if (["critRate", "critDmg", "atkSpd", "vamp"].includes(statName)) {
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
        
        equipDiv.addEventListener('click', () => selectForgeEquipment(equipStr, index, source));
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
    } else {
        slot1.innerHTML = '<p>Select equipment</p>';
        slot1.className = 'forge-slot';
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
    } else {
        slot2.innerHTML = '<p>Select equipment</p>';
        slot2.className = 'forge-slot';
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
        } else {
            slot3.innerHTML = '<p>Select equipment</p>';
            slot3.className = 'forge-slot';
        }
    }
    
    // Update buttons
    const confirmButton = document.querySelector('#forge-confirm');
    if (selectedForgeItems[0] && selectedForgeItems[1] && selectedForgeItems[2] && player.gold >= forgeCost) {
        confirmButton.disabled = false;
        confirmButton.textContent = 'Forge Equipment';
    } else if (selectedForgeItems[0] && selectedForgeItems[1] && selectedForgeItems[2]) {
        confirmButton.disabled = true;
        confirmButton.textContent = 'Not Enough Gold';
    } else {
        confirmButton.disabled = true;
        confirmButton.textContent = 'Select 3 Items';
    }
    
    // Clear button
    const clearButton = document.querySelector('#forge-clear');
    clearButton.onclick = () => {
        selectedForgeItems = [null, null, null];
        forgeResult = null;
        forgeCost = 0;
        updateForgeDisplay();
        document.querySelector('#forge-result').style.display = 'none';
        sfxUnequip.play();
    };
    
    // Confirm button
    confirmButton.onclick = () => {
        if (selectedForgeItems[0] && selectedForgeItems[1] && selectedForgeItems[2] && player.gold >= forgeCost) {
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

    // Ensure all items share the same tier
    if (!(item1.tier === item2.tier && item1.tier === item3.tier)) {
        document.querySelector('#forge-result').style.display = 'none';
        forgeCost = 0;
        return;
    }

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

    // Upgrade tier based on input items
    forgedEquipment.tier = Math.min(10, item1.tier + 1);

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
            <h5 class="${forgeResult.rarity}">Lv.${forgeResult.lvl} Tier ${forgeResult.tier}</h5>
            <ul>
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
    
    // Show confirmation dialog
    defaultModalElement.style.display = "flex";
    defaultModalElement.style.zIndex = "2"; // Ensure it appears above forge modal
    defaultModalElement.innerHTML = `
        <div class="content">
            <h3>Confirm Forging</h3>
            <p>Are you sure you want to forge these items? This action cannot be undone!</p>
            <p><strong>Cost: <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(forgeCost)} gold</strong></p>
            <div class="button-container">
                <button id="forge-execute">Forge!</button>
                <button id="forge-cancel-confirm">Cancel</button>
            </div>
        </div>`;
    
    let execute = document.querySelector('#forge-execute');
    let cancel = document.querySelector('#forge-cancel-confirm');
    
    execute.onclick = function () {
        // Remove input items from their respective sources
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
                // Find and remove from equipped array
                const equippedIndex = player.equipped.findIndex(equipped => 
                    JSON.stringify(equipped) === item.equipmentStr
                );
                if (equippedIndex !== -1) {
                    player.equipped.splice(equippedIndex, 1);
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
        
        // Add forged item to inventory
        player.inventory.equipment.push(JSON.stringify(forgeResult));
        
        sfxConfirm.play();
        saveData();
        playerLoadStats();
        
        // Show success message
        defaultModalElement.innerHTML = `
            <div class="content">
                <h3>🎉 Forging Complete!</h3>
                <p>Your equipment has been successfully forged into a more powerful item!</p>
                <div class="forged-result">
                    <p class="${forgeResult.rarity}">Created: ${forgeResult.rarity} ${forgeResult.category}</p>
                </div>
                <button onclick="closeDefaultModal(); loadForgeEquipment(); selectedForgeItems = [null, null, null]; forgeResult = null; forgeCost = 0; updateForgeDisplay(); document.querySelector('#forge-result').style.display = 'none';">Continue</button>
            </div>`;
    };
    
    cancel.onclick = function () {
        sfxDecline.play();
        defaultModalElement.style.display = "none";
        defaultModalElement.style.zIndex = "1"; // Reset z-index
        defaultModalElement.innerHTML = "";
    };
};
