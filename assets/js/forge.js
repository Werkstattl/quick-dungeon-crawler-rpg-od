// ========== The Forge System ==========
// Late game feature for combining equipment

let forgeModalElement = null;
let forgeGoldElement = null;
let forgeMode = 'merge';
let selectedForgeItems = [null, null, null];
let forgeResult = null;
let forgeLevelRange = null;
let forgeCost = 0;
let selectedRerollItem = null;
let rerollCost = 0;
let forgeUnlocked = false;

const FORGE_PRODUCT_ID = 'forge_unlock_premium';
const FORGE_PURCHASE_URL = 'https://werkstattl.itch.io/quick-dungeon-crawler-on-demand/purchase';

const closeForgeUnlockModal = () => {
    closeDefaultModal();
};

const buyPermanentForgeUnlock = () => {
    closeForgeUnlockModal();
    if (isCordova() && typeof buyForgeUnlock === 'function') {
        buyForgeUnlock();
        return;
    }

    if (/Android/i.test(navigator.userAgent)) {
        ratingSystem.openGooglePlayForRating();
    } else {
        openExternal(FORGE_PURCHASE_URL);
    }
};

const buyForgeMembershipUnlock = () => {
    closeForgeUnlockModal();
    if (isCordova() && typeof buyForgeMembership === 'function') {
        buyForgeMembership();
        return;
    }

    if (/Android/i.test(navigator.userAgent)) {
        ratingSystem.openGooglePlayForRating();
    } else {
        openExternal(FORGE_PURCHASE_URL);
    }
};

const openForgeUnlockModal = () => {
    if (!defaultModalElement) {
        return;
    }

    sfxOpen.play();
    defaultModalElement.style.zIndex = "2";
    defaultModalElement.style.display = "flex";
    defaultModalElement.innerHTML = `
        <div class="content forge-unlock-modal">
            <div class="content-head">
                <h3><i class="ra ra-anvil"></i> <span data-i18n="unlock-the-forge">Unlock The Forge</span></h3>
                <p id="forge-unlock-close"><i class="fa fa-xmark"></i></p>
            </div>
            <div class="forge-unlock-options">
                <section class="forge-unlock-option">
                    <h4 data-i18n="forge-permanent-unlock">Permanent Unlock</h4>
                    <p class="forge-unlock-price" data-i18n="forge-permanent-unlock-price">€2.89 + VAT one-time</p>
                    <ul class="forge-membership-benefits">
                        <li data-i18n="forge-permanent-unlock-keep-forever">Keep forever</li>
                    </ul>
                    <button id="forge-buy-permanent" type="button" data-i18n="buy-permanently">Buy Permanently</button>
                </section>
                <section class="forge-unlock-option">
                    <h4 data-i18n="forge-membership">The Forge Membership</h4>
                    <p class="forge-unlock-price" data-i18n="forge-membership-price">€0.99 + VAT / month</p>
                    <ul class="forge-membership-benefits">
                        <li data-i18n="forge-membership-benefit-premium">Access to all premium features</li>
                        <li data-i18n="forge-membership-benefit-inventory">Expanded inventory (+50 slots)</li>
                        <li data-i18n="forge-membership-benefit-resting">Enhanced resting recovery</li>
                        <li data-i18n="forge-membership-benefit-gold">10% gold found</li>
                        <li data-i18n="forge-membership-benefit-title">Exclusive Forge Member title</li>
                        <li data-i18n="forge-membership-benefit-supports-development">Supports ongoing development</li>
                    </ul>
                    <p class="forge-membership-terms" data-i18n="forge-membership-cancel-google-play">Cancel anytime through Google Play.</p>
                    <button id="forge-buy-membership" type="button" data-i18n="subscribe">Subscribe</button>
                </section>
            </div>
        </div>`;
    applyTranslations(defaultModalElement);

    const buyPermanentButton = document.querySelector('#forge-buy-permanent');
    const buyMembershipButton = document.querySelector('#forge-buy-membership');
    const closeButton = document.querySelector('#forge-unlock-close');
    const cancelButton = document.querySelector('#forge-unlock-cancel');

    if (isForgeMembershipActive() && buyMembershipButton) {
        buyMembershipButton.disabled = true;
        buyMembershipButton.setAttribute('data-i18n', 'forge-membership-subscribed');
        buyMembershipButton.textContent = t('forge-membership-subscribed');
    }

    if (buyPermanentButton) {
        buyPermanentButton.onclick = () => {
            sfxConfirm.play();
            buyPermanentForgeUnlock();
        };
    }
    if (buyMembershipButton) {
        buyMembershipButton.onclick = () => {
            sfxConfirm.play();
            buyForgeMembershipUnlock();
        };
    }
    [closeButton, cancelButton].forEach(button => {
        if (!button) return;
        button.onclick = () => {
            sfxDecline.play();
            closeForgeUnlockModal();
        };
    });
};

const setForgeUnlockButton = (confirmButton) => {
    confirmButton.disabled = false;
    confirmButton.setAttribute('data-i18n', 'unlock-the-forge-premium');
    confirmButton.textContent = t('unlock-the-forge-premium');
    confirmButton.onclick = openForgeUnlockModal;
};

// Initialize forge system
const initializeForge = () => {
    forgeModalElement = document.querySelector('#forgeModal');
    forgeGoldElement = document.querySelector('#forge-player-gold');
    const modeButtons = document.querySelectorAll('[data-forge-mode]');
    modeButtons.forEach(button => {
        button.onclick = () => setForgeMode(button.dataset.forgeMode);
    });
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

const resetMergeState = () => {
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
};

const resetRerollState = () => {
    selectedRerollItem = null;
    rerollCost = 0;
    const rerollPreviewContainer = document.querySelector('#reroll-preview');
    if (rerollPreviewContainer) {
        rerollPreviewContainer.style.display = 'none';
    }
    const rerollCostContainer = document.querySelector('#reroll-cost');
    if (rerollCostContainer) {
        rerollCostContainer.style.display = 'none';
    }
    const currentItem = document.querySelector('#reroll-current-item');
    if (currentItem) {
        currentItem.innerHTML = '';
    }
    const previewItem = document.querySelector('#reroll-preview-item');
    if (previewItem) {
        previewItem.innerHTML = '';
    }
};

const resetForgeState = () => {
    resetMergeState();
    resetRerollState();
};

const updateForgeModeVisibility = () => {
    const mergePanel = document.querySelector('#forge-merge-panel');
    const rerollPanel = document.querySelector('#forge-reroll-panel');
    const forgeResultPanel = document.querySelector('#forge-result');
    const description = document.querySelector('#forgeModal .forge-description p:first-child');
    const modeButtons = document.querySelectorAll('[data-forge-mode]');

    if (mergePanel) {
        mergePanel.style.display = forgeMode === 'merge' ? 'flex' : 'none';
    }
    if (rerollPanel) {
        rerollPanel.style.display = forgeMode === 'reroll' ? 'block' : 'none';
    }
    if (forgeResultPanel && forgeMode === 'reroll') {
        forgeResultPanel.style.display = 'none';
    }
    if (description) {
        const key = forgeMode === 'reroll'
            ? 'reroll-description'
            : 'combine-three-items-of-the-same-tier-and-rarity-to-forge-one-of-the-next-rarity';
        description.setAttribute('data-i18n', key);
        description.textContent = t(key);
    }
    modeButtons.forEach(button => {
        const isActive = button.dataset.forgeMode === forgeMode;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
};

const setForgeMode = (mode) => {
    if (mode !== 'merge' && mode !== 'reroll') {
        return;
    }
    if (forgeMode !== mode) {
        resetForgeState();
    }
    forgeMode = mode;
    updateForgeModeVisibility();
    loadForgeEquipment();
    updateForgeDisplay();
};

const getRerollCost = (equipment) => Math.max(1000, Math.round((equipment.value || 0) * 10));

const cloneEquipment = (equipment) => JSON.parse(JSON.stringify(equipment));

const openForgeModal = () => {
    if (!forgeModalElement) initializeForge();

    if (inventoryOpen) {
        closeInventory(true);
    }

    sfxOpen.play();
    menuModalElement.style.display = "none";

    forgeModalElement.style.display = "flex";
    let dimDungeon = document.querySelector('#dungeon-main');
    if (dimDungeon) {
        dimDungeon.style.filter = "brightness(50%)";
    }
    
    forgeMode = 'merge';
    resetForgeState();
    updateForgeModeVisibility();
    
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

    resetForgeState();
    updateForgeDisplay();
};

// Load available equipment for forging
const loadForgeEquipment = () => {
    const equipmentGrid = document.querySelector('#forge-equipment-grid');
    if (!equipmentGrid) {
        return;
    }
    equipmentGrid.innerHTML = "";
    
    // Collect forgeable equipment from both inventory and equipped items
    const forgeableEquipment = [];

    // Add inventory equipment
    player.inventory.equipment.forEach((equipStr, sourceIndex) => {
        const equip = JSON.parse(equipStr);
        if (typeof isCompanionCharm === 'function' && isCompanionCharm(equip)) {
            return;
        }
        forgeableEquipment.push({
            equipStr,
            equip,
            source: 'inventory',
            sourceIndex
        });
    });

    // Add equipped items
    player.equipped.forEach((equip, sourceIndex) => {
        if (typeof isCompanionCharm === 'function' && isCompanionCharm(equip)) {
            return;
        }
        forgeableEquipment.push({
            equipStr: JSON.stringify(equip),
            equip,
            source: 'equipped',
            sourceIndex
        });
    });
    
    if (forgeableEquipment.length === 0) {
        equipmentGrid.innerHTML = `<p class="forge-empty">${t('no-forge-equipment')}</p>`;
        return;
    }

    // Sort equipment by rarity (highest to lowest), then by level (highest to lowest)
    const rarityOrder = ['Heirloom', 'Legendary', 'Epic', 'Rare', 'Uncommon', 'Common'];
    
    // Filter out equipment that is already selected in any forge slot
    const selectedStrs = forgeMode === 'reroll'
        ? (selectedRerollItem ? [selectedRerollItem.equipmentStr] : [])
        : selectedForgeItems.filter(Boolean).map(item => item.equipmentStr);
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
        const { equipStr, equip, source, sourceIndex } = item;
        const equipDiv = document.createElement('div');
        equipDiv.className = `forge-equipment-item ${equip.rarity}`;
        
        // Format stats display
        let rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
        const statsHtml = equip.stats.map(stat => {
            const statName = Object.keys(stat)[0];
            const statValue = stat[statName];
            // Treat luck as a percentage-based stat and round like others
            if (["critRate", "critDmg", "atkSpd", "vamp", "dodge", "luck"].includes(statName)) {
                return `<li>${statName.replace(/([A-Z])/g, ".$1").replace(/crit/g, "c").toUpperCase()}+${statValue.toFixed(2).replace(rx, "$1")}%</li>`;
            } else {
                return `<li>${statName.replace(/([A-Z])/g, ".$1").replace(/crit/g, "c").toUpperCase()}+${statValue}</li>`;
            }
        }).join('');
        
        equipDiv.innerHTML = `
            <div class="equipment-icon">${equipmentIcon(equip.category)}</div>
            <div class="equipment-info">
                <p class="${equip.rarity}">${equipmentName(equip.category)}</p>
                <p>Lv.${equip.lvl} T${equip.tier}</p>
                <ul class="equipment-stats">
                    ${statsHtml}
                </ul>
                <p class="equipment-value">${t('value')}: ${nFormatter(equip.value)}</p>
                ${source === 'equipped' ? `<p class="equipped-indicator">⚔️ ${t('equipped')}</p>` : ''}
            </div>
        `;
        // Only allow click if a slot is free
        equipDiv.addEventListener('click', () => {
            if (forgeMode === 'reroll') {
                selectRerollEquipment(equipStr, source, sourceIndex, equip);
                return;
            }
            if (selectedForgeItems[0] === null || selectedForgeItems[1] === null || selectedForgeItems[2] === null) {
                selectForgeEquipment(equipStr, index, source, sourceIndex, equip);
            } else {
                sfxDeny.play();
            }
        });
        equipmentGrid.appendChild(equipDiv);
    });
};

// Select equipment for forging
const selectForgeEquipment = (equipmentStr, index, source = 'inventory', sourceIndex = -1, equipmentOverride = null) => {
    const equipment = equipmentOverride || JSON.parse(equipmentStr);
    
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
        selectedForgeItems[0] = { equipment, equipmentStr, source, sourceIndex };
        sfxEquip.play();
    } else if (selectedForgeItems[1] === null) {
        selectedForgeItems[1] = { equipment, equipmentStr, source, sourceIndex };
        sfxEquip.play();
    } else if (selectedForgeItems[2] === null) {
        selectedForgeItems[2] = { equipment, equipmentStr, source, sourceIndex };
        sfxEquip.play();
    } else {
        // All slots full, replace first item
        selectedForgeItems[0] = { equipment, equipmentStr, source, sourceIndex };
        sfxEquip.play();
    }
    
    updateForgeDisplay();
    loadForgeEquipment(); // <-- update equipment list after selection
    calculateForgeResult();
};

const selectRerollEquipment = (equipmentStr, source = 'inventory', sourceIndex = -1, equipmentOverride = null) => {
    const equipment = equipmentOverride || JSON.parse(equipmentStr);
    selectedRerollItem = { equipment, equipmentStr, source, sourceIndex };
    calculateRerollPreview();
    updateForgeDisplay();
    loadForgeEquipment();
    sfxEquip.play();
};

const calculateRerollPreview = () => {
    if (!selectedRerollItem) {
        rerollCost = 0;
        return;
    }
    rerollCost = getRerollCost(selectedRerollItem.equipment);
    displayRerollPreview();
};

const renderPossibleRerollStats = (equipment) => {
    const statPool = typeof getEquipmentRerollStatPool === 'function'
        ? getEquipmentRerollStatPool(equipment)
        : [];
    const uniqueStats = Array.from(new Set(statPool));
    const orderedStats = getOrderedEquipmentStats(uniqueStats.reduce((totals, stat) => {
        totals[stat] = 1;
        return totals;
    }, {}));
    const statsMarkup = orderedStats.map(stat => `
        <li class="equipment-stat-row">
            <span class="stat-name">${formatEquipmentStatLabel(stat)}</span>
        </li>`).join('');

    return `
        <div class="equipment-card reroll-possible-card">
            <h3 class="${equipment.rarity}">${equipmentIcon(equipment.baseCategory || equipment.category)}${equipmentLabel(equipment.rarity, equipment.category)}</h3>
            <h5 class="lvltier ${equipment.rarity}"><b>Lv.${equipment.lvl} ${t('tier')} ${equipment.tier === undefined ? 1 : equipment.tier}</b></h5>
            <ul class="equipment-stat-list reroll-possible-list">
                ${statsMarkup || `<li class="equipment-stat-row"><span class="stat-name">${translateEquipText('no-stats-available', 'No stats available')}</span></li>`}
            </ul>
        </div>`;
};

const displayRerollPreview = () => {
    const previewContainer = document.querySelector('#reroll-preview');
    const costContainer = document.querySelector('#reroll-cost');
    const currentItem = document.querySelector('#reroll-current-item');
    const previewItem = document.querySelector('#reroll-preview-item');
    const costAmount = document.querySelector('#reroll-cost-amount');

    if (!selectedRerollItem || !previewContainer || !costContainer || !currentItem || !previewItem || !costAmount) {
        return;
    }

    const currentEquipment = selectedRerollItem.equipment;
    const currentTotals = getEquipmentStatTotals(currentEquipment);
    const currentIcon = equipmentIcon(currentEquipment.baseCategory || currentEquipment.category);

    currentItem.innerHTML = renderEquipmentCard({
        item: currentEquipment,
        icon: currentIcon,
        totals: currentTotals,
        labelFallback: ''
    });
    previewItem.innerHTML = renderPossibleRerollStats(currentEquipment);

    costAmount.textContent = nFormatter(rerollCost);
    const costElement = costAmount.parentElement;
    if (costElement) {
        costElement.style.color = player.gold >= rerollCost ? '#4CAF50' : '#F44336';
    }
    previewContainer.style.display = 'grid';
    costContainer.style.display = 'block';
    updateForgeGold();
};

const updateRerollDisplay = () => {
    updateForgeGold();
    updateForgeModeVisibility();

    const slot = document.querySelector('#reroll-slot');
    if (slot) {
        if (selectedRerollItem) {
            const equip = selectedRerollItem.equipment;
            slot.innerHTML = `
                <div class="selected-equipment ${equip.rarity}">
                    ${equipmentIcon(equip.category)}
                    <p>${equipmentName(equip.category)}</p>
                    <p>Lv.${equip.lvl} T${equip.tier}</p>
                </div>
            `;
            slot.className = 'forge-slot reroll-slot selected';
            slot.onclick = () => {
                resetRerollState();
                updateForgeDisplay();
                loadForgeEquipment();
                sfxUnequip.play();
            };
        } else {
            slot.innerHTML = `<p data-i18n="select-equipment">${t('select-equipment')}</p>`;
            slot.className = 'forge-slot reroll-slot';
            slot.onclick = null;
        }
    }

    if (selectedRerollItem) {
        displayRerollPreview();
    }

    const confirmButton = document.querySelector('#forge-confirm');
    const clearButton = document.querySelector('#forge-clear');

    if (clearButton) {
        clearButton.onclick = () => {
            resetRerollState();
            updateForgeDisplay();
            loadForgeEquipment();
            sfxUnequip.play();
        };
    }

    if (!confirmButton) {
        return;
    }

    if (!forgeUnlocked) {
        setForgeUnlockButton(confirmButton);
        return;
    }

    if (selectedRerollItem && player.gold >= rerollCost) {
        confirmButton.disabled = false;
        confirmButton.setAttribute('data-i18n', 'reroll-equipment');
        confirmButton.textContent = t('reroll-equipment');
    } else if (selectedRerollItem) {
        confirmButton.disabled = true;
        confirmButton.setAttribute('data-i18n', 'not-enough-gold');
        confirmButton.textContent = t('not-enough-gold');
    } else {
        confirmButton.disabled = true;
        confirmButton.setAttribute('data-i18n', 'select-1-item');
        confirmButton.textContent = t('select-1-item');
    }

    confirmButton.onclick = () => {
        if (selectedRerollItem && player.gold >= rerollCost) {
            executeReroll();
        } else {
            sfxDeny.play();
        }
    };
};

// Update forge display
const updateForgeDisplay = () => {
    updateForgeGold();
    updateForgeModeVisibility();
    if (forgeMode === 'reroll') {
        updateRerollDisplay();
        return;
    }
    // Update slot 1
    const slot1 = document.querySelector('#forge-slot-1');
    if (selectedForgeItems[0]) {
        const equip = selectedForgeItems[0].equipment;
        slot1.innerHTML = `
            <div class="selected-equipment ${equip.rarity}">
                ${equipmentIcon(equip.category)}
                <p>${equipmentName(equip.category)}</p>
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
        slot1.innerHTML = `<p data-i18n="select-equipment">${t('select-equipment')}</p>`;
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
                <p>${equipmentName(equip.category)}</p>
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
        slot2.innerHTML = `<p data-i18n="select-equipment">${t('select-equipment')}</p>`;
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
                <p>${equipmentName(equip3.category)}</p>
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
            slot3.innerHTML = `<p data-i18n="select-equipment">${t('select-equipment')}</p>`;
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
        setForgeUnlockButton(confirmButton);
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
        if (!sameTier) {
            confirmButton.setAttribute('data-i18n', 'items-must-share-tier');
            confirmButton.textContent = `${t('items-must-share-tier')}`;
        } else {
            confirmButton.setAttribute('data-i18n', 'items-must-share-rarity');
            confirmButton.textContent = `${t('items-must-share-rarity')}`;
        }
    } else if (allSelected && player.gold >= forgeCost) {
        confirmButton.disabled = false;
        confirmButton.setAttribute('data-i18n', 'forge-equipment');
        confirmButton.textContent = `${t('forge-equipment')}`;
    } else if (allSelected) {
        confirmButton.disabled = true;
        confirmButton.setAttribute('data-i18n', 'not-enough-gold');
        confirmButton.textContent = `${t('not-enough-gold')}`;
    } else {
        confirmButton.disabled = true;
        confirmButton.setAttribute('data-i18n', 'select-3-items');
        confirmButton.textContent = `${t('select-3-items')}`;
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
    const forgedEquipment = createEquipment(false, { allowCompanionCharm: false });

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
                ${forgeResult.icon}${equipmentLabel(forgeResult.rarity, forgeResult.category)}
            </h4>
            <h5 class="${forgeResult.rarity}">Lv.${forgeLevelRange.min}-${forgeLevelRange.max} ${t('tier')} ${forgeResult.tier}</h5>
            <ul style="display:none">
                ${forgeResult.stats.map(stat => {
                    const statName = Object.keys(stat)[0];
                    const statValue = stat[statName];
                    if (["critRate", "critDmg", "atkSpd", "vamp", "dodge", "luck"].includes(statName)) {
                        return `<li>${statName.replace(/([A-Z])/g, ".$1").replace(/crit/g, "c").toUpperCase()}+${statValue.toFixed(2).replace(rx, "$1")}%</li>`;
                    } else {
                        return `<li>${statName.replace(/([A-Z])/g, ".$1").replace(/crit/g, "c").toUpperCase()}+${statValue}</li>`;
                    }
                }).join('')}
            </ul>
            <p class="forged-indicator">⚒️ ${t('forged-equipment')}</p>
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

const applyRerolledEquipment = (equipment, rerolledEquipment) => {
    equipment.stats = cloneEquipment(rerolledEquipment.stats);
    equipment.value = rerolledEquipment.value;
    equipment.icon = rerolledEquipment.icon;
};

const executeReroll = () => {
    if (!forgeUnlocked || !selectedRerollItem || player.gold < rerollCost) {
        sfxDeny.play();
        return;
    }

    const rerolledEquipment = cloneEquipment(selectedRerollItem.equipment);
    rerollEquipmentStats(rerolledEquipment);

    let updated = false;
    if (selectedRerollItem.source === 'inventory') {
        let itemIndex = Number.isInteger(selectedRerollItem.sourceIndex) ? selectedRerollItem.sourceIndex : -1;
        if (itemIndex < 0 || player.inventory.equipment[itemIndex] !== selectedRerollItem.equipmentStr) {
            itemIndex = player.inventory.equipment.indexOf(selectedRerollItem.equipmentStr);
        }
        if (itemIndex !== -1) {
            const equipment = JSON.parse(player.inventory.equipment[itemIndex]);
            applyRerolledEquipment(equipment, rerolledEquipment);
            player.inventory.equipment[itemIndex] = JSON.stringify(equipment);
            updated = true;
        }
    } else if (selectedRerollItem.source === 'equipped') {
        let itemIndex = Number.isInteger(selectedRerollItem.sourceIndex) ? selectedRerollItem.sourceIndex : -1;
        if (itemIndex < 0 || player.equipped[itemIndex] !== selectedRerollItem.equipment) {
            itemIndex = player.equipped.indexOf(selectedRerollItem.equipment);
        }
        if (itemIndex < 0) {
            itemIndex = player.equipped.findIndex(eq => JSON.stringify(eq) === selectedRerollItem.equipmentStr);
        }
        if (itemIndex !== -1) {
            applyRerolledEquipment(player.equipped[itemIndex], rerolledEquipment);
            updated = true;
        }
    }

    if (!updated) {
        sfxDeny.play();
        return;
    }

    player.gold -= rerollCost;
    saveData();
    playerLoadStats();
    if (typeof updateCompanionUI === 'function') {
        updateCompanionUI();
    }
    sfxEquip.play();
    resetRerollState();
    loadForgeEquipment();
    updateForgeDisplay();
};

// Execute forging
const executeForging = () => {
    if (!forgeUnlocked || !selectedForgeItems[0] || !selectedForgeItems[1] || !selectedForgeItems[2] || player.gold < forgeCost) {
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
