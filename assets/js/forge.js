// ========== The Forge System ==========
// Late game feature for combining equipment

let forgeModalElement = null;
let selectedForgeItems = [null, null];
let forgeResult = null;
let forgeCost = 0;

// Initialize forge system
const initializeForge = () => {
    forgeModalElement = document.querySelector('#forgeModal');
    
    // Initialize forge unlock status if not exists
    if (player.forgeUnlocked === undefined) {
        player.forgeUnlocked = false;
        saveData();
    }
};

// Check if player can access the forge
const canAccessForge = () => {
    return player.forgeUnlocked; // Late game requirement
};

// Purchase forge access (simulate in-app purchase)
const purchaseForgeAccess = () => {
    const cost = 4.99; // Simulated price
    
    // Show purchase confirmation
    defaultModalElement.style.display = "flex";
    defaultModalElement.innerHTML = `
        <div class="content">
            <h3><i class="ra ra-anvil"></i> Unlock The Forge</h3>
            <p>The Forge is a powerful late-game feature that allows you to combine your best equipment into even more powerful gear!</p>
            <div class="forge-features">
                <p>✓ Combine any two equipment pieces</p>
                <p>✓ Create gear with higher tier and stats</p>
                <p>✓ Unique forge-exclusive equipment names</p>
                <p>✓ Permanent unlock across all runs</p>
            </div>
            <p><strong>Price: $${cost}</strong></p>
            <div class="button-container">
                <button id="purchase-confirm">Purchase</button>
                <button id="purchase-cancel">Cancel</button>
            </div>
        </div>`;
    
    let confirm = document.querySelector('#purchase-confirm');
    let cancel = document.querySelector('#purchase-cancel');
    
    confirm.onclick = function () {
        sfxConfirm.play();
        player.forgeUnlocked = true;
        saveData();
        
        defaultModalElement.style.display = "none";
        defaultModalElement.innerHTML = "";
        
        // Show success message
        setTimeout(() => {
            defaultModalElement.style.display = "flex";
            defaultModalElement.innerHTML = `
                <div class="content">
                    <h3>🎉 The Forge Unlocked!</h3>
                    <p>You can now access The Forge from the main menu to combine your equipment into powerful new gear!</p>
                    <button onclick="closeDefaultModal()">Awesome!</button>
                </div>`;
        }, 500);
    };
    
    cancel.onclick = function () {
        sfxDecline.play();
        defaultModalElement.style.display = "none";
        defaultModalElement.innerHTML = "";
        menuModalElement.style.display = "flex";
    };
};

// Open forge modal
const openForgeModal = () => {
    if (!canAccessForge()) {
        // Show unlock prompt if not accessible
        if (!player.forgeUnlocked) {
            purchaseForgeAccess();
            return;
        }
    }
    
    sfxOpen.play();
    closeInventory();
    menuModalElement.style.display = "none";
    
    forgeModalElement.style.display = "flex";
    let dimDungeon = document.querySelector('#dungeon-main');
    dimDungeon.style.filter = "brightness(50%)";
    
    // Reset forge state
    selectedForgeItems = [null, null];
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
    selectedForgeItems = [null, null];
    forgeResult = null;
    forgeCost = 0;
    updateForgeDisplay();
    
    continueExploring();
};

// Load available equipment for forging
const loadForgeEquipment = () => {
    const equipmentGrid = document.querySelector('#forge-equipment-grid');
    equipmentGrid.innerHTML = "";
    
    // Only show Rare and above equipment that hasn't been forged already
    const forgeableEquipment = player.inventory.equipment.filter(equipStr => {
        const equip = JSON.parse(equipStr);
        return ['Rare', 'Epic', 'Legendary', 'Heirloom'].includes(equip.rarity) && !equip.forged;
    });
    
    if (forgeableEquipment.length === 0) {
        equipmentGrid.innerHTML = "<p>No forgeable equipment available. You need Rare quality or better equipment that hasn't been forged already.</p>";
        return;
    }
    
    forgeableEquipment.forEach((equipStr, index) => {
        const equip = JSON.parse(equipStr);
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
            </div>
        `;
        
        equipDiv.addEventListener('click', () => selectForgeEquipment(equipStr, index));
        equipmentGrid.appendChild(equipDiv);
    });
};

// Select equipment for forging
const selectForgeEquipment = (equipmentStr, index) => {
    const equipment = JSON.parse(equipmentStr);
    
    // Find first empty slot
    if (selectedForgeItems[0] === null) {
        selectedForgeItems[0] = { equipment, index };
        sfxEquip.play();
    } else if (selectedForgeItems[1] === null) {
        selectedForgeItems[1] = { equipment, index };
        sfxEquip.play();
    } else {
        // Both slots full, replace first item
        selectedForgeItems[0] = { equipment, index };
        sfxEquip.play();
    }
    
    updateForgeDisplay();
    calculateForgeResult();
};

// Update forge display
const updateForgeDisplay = () => {
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
    
    // Update buttons
    const confirmButton = document.querySelector('#forge-confirm');
    if (selectedForgeItems[0] && selectedForgeItems[1] && player.gold >= forgeCost) {
        confirmButton.disabled = false;
        confirmButton.textContent = 'Forge Equipment';
    } else if (selectedForgeItems[0] && selectedForgeItems[1]) {
        confirmButton.disabled = true;
        confirmButton.textContent = 'Not Enough Gold';
    } else {
        confirmButton.disabled = true;
        confirmButton.textContent = 'Select 2 Items';
    }
    
    // Clear button
    const clearButton = document.querySelector('#forge-clear');
    clearButton.onclick = () => {
        selectedForgeItems = [null, null];
        forgeResult = null;
        forgeCost = 0;
        updateForgeDisplay();
        document.querySelector('#forge-result').style.display = 'none';
        sfxUnequip.play();
    };
    
    // Confirm button
    confirmButton.onclick = () => {
        if (selectedForgeItems[0] && selectedForgeItems[1] && player.gold >= forgeCost) {
            executeForging();
        } else {
            sfxDeny.play();
        }
    };
};

// Calculate forge result
const calculateForgeResult = () => {
    if (!selectedForgeItems[0] || !selectedForgeItems[1]) {
        document.querySelector('#forge-result').style.display = 'none';
        return;
    }
    
    const item1 = selectedForgeItems[0].equipment;
    const item2 = selectedForgeItems[1].equipment;
    
    // Calculate result equipment
    forgeResult = createForgedEquipment(item1, item2);
    
    // Calculate cost (based on input item values)
    forgeCost = Math.round((item1.value + item2.value) * 2.5);
    
    // Display result
    displayForgeResult();
};

// Create forged equipment
const createForgedEquipment = (item1, item2) => {
    const forgedEquipment = {
        category: null,
        attribute: null,
        type: null,
        rarity: null,
        lvl: null,
        tier: null,
        value: null,
        stats: [],
        forged: true, // Mark as forged item
        baseCategory: null // Store original category for icon purposes
    };
    
    // Determine type (favor higher tier item)
    const primaryItem = item1.tier >= item2.tier ? item1 : item2;
    const secondaryItem = item1.tier >= item2.tier ? item2 : item1;
    
    forgedEquipment.category = generateForgedName(primaryItem.category, secondaryItem.category);
    forgedEquipment.baseCategory = primaryItem.category; // Store original category for icons
    forgedEquipment.attribute = primaryItem.attribute;
    forgedEquipment.type = primaryItem.type;
    
    // Upgrade rarity
    const rarityOrder = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Heirloom'];
    const maxRarityIndex = Math.max(
        rarityOrder.indexOf(item1.rarity), 
        rarityOrder.indexOf(item2.rarity)
    );
    
    // Try to upgrade rarity, cap at Heirloom
    const newRarityIndex = Math.min(maxRarityIndex + 1, rarityOrder.length - 1);
    forgedEquipment.rarity = rarityOrder[newRarityIndex];
    
    // Set level and tier (average + bonus)
    forgedEquipment.lvl = Math.min(100, Math.round((item1.lvl + item2.lvl) / 2) + 5);
    forgedEquipment.tier = Math.min(10, Math.round((item1.tier + item2.tier) / 2) + 1);
    
    // Combine and enhance stats
    const combinedStats = {};
    
    // Collect stats from both items
    [...item1.stats, ...item2.stats].forEach(stat => {
        const statName = Object.keys(stat)[0];
        const statValue = stat[statName];
        
        if (combinedStats[statName]) {
            combinedStats[statName] += statValue;
        } else {
            combinedStats[statName] = statValue;
        }
    });
    
    // Apply forge bonus (20% increase)
    Object.keys(combinedStats).forEach(statName => {
        combinedStats[statName] = Math.round(combinedStats[statName] * 1.2 * 100) / 100;
        forgedEquipment.stats.push({ [statName]: combinedStats[statName] });
    });
    
    // Calculate value
    forgedEquipment.value = Math.round((item1.value + item2.value) * 1.8);
    
    return forgedEquipment;
};

// Generate forged equipment names
const generateForgedName = (name1, name2) => {
    const forgedNames = {
        // Weapon combinations
        'Sword_Axe': 'Blade-Axe',
        'Sword_Hammer': 'War Blade',
        'Sword_Dagger': 'Assassin Blade',
        'Axe_Hammer': 'Devastator',
        'Axe_Dagger': 'Cleaver',
        'Hammer_Dagger': 'Spiked Maul',
        'Sword_Flail': 'Chain Sword',
        'Sword_Scythe': 'Death Blade',
        'Axe_Scythe': 'Reaper Axe',
        'Hammer_Scythe': 'Soul Crusher',
        
        // Armor combinations  
        'Plate_Chain': 'Reinforced Plate',
        'Plate_Leather': 'Studded Plate',
        'Chain_Leather': 'Scaled Mail',
        
        // Shield combinations
        'Tower_Kite': 'Guardian Shield',
        'Tower_Buckler': 'Fortress Guard',
        'Kite_Buckler': 'Battle Shield',
        
        // Helmet combinations
        'Great Helm_Horned Helm': 'Dragon Helm'
    };
    
    // Try both combinations
    const combo1 = `${name1}_${name2}`;
    const combo2 = `${name2}_${name1}`;
    
    if (forgedNames[combo1]) {
        return forgedNames[combo1];
    } else if (forgedNames[combo2]) {
        return forgedNames[combo2];
    } else {
        // Fallback to enhanced version of primary item
        return `Forged ${name1}`;
    }
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
                ${equipmentIcon(forgeResult.baseCategory || forgeResult.category)}${forgeResult.rarity} ${forgeResult.category}
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
};

// Execute forging
const executeForging = () => {
    if (!selectedForgeItems[0] || !selectedForgeItems[1] || player.gold < forgeCost) {
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
        // Remove input items from inventory
        const item1Index = selectedForgeItems[0].index;
        const item2Index = selectedForgeItems[1].index;
        
        // Remove items (sort indices in descending order to avoid index shifting)
        const indicesToRemove = [item1Index, item2Index].sort((a, b) => b - a);
        indicesToRemove.forEach(index => {
            player.inventory.equipment.splice(index, 1);
        });
        
        // Deduct gold
        player.gold -= forgeCost;
        
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
                <button onclick="closeDefaultModal(); loadForgeEquipment(); selectedForgeItems = [null, null]; updateForgeDisplay();">Continue</button>
            </div>`;
    };
    
    cancel.onclick = function () {
        sfxDecline.play();
        defaultModalElement.style.display = "none";
        defaultModalElement.style.zIndex = "1"; // Reset z-index
        defaultModalElement.innerHTML = "";
    };
};

// Initialize forge when page loads
window.addEventListener('load', () => {
    setTimeout(initializeForge, 100);
});
