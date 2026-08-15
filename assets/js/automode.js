let autoMode = localStorage.getItem("autoMode") === "true";
let autoModeBtnVisible = localStorage.getItem("autoModeBtnVisible") === "true";
let autoEngage = true;
if (localStorage.getItem("autoEngage") === "false") {
    autoEngage = false;
}
let autoBlessings = true;
if (localStorage.getItem("autoBlessings") === "false") {
    autoBlessings = false;
}
let autoHeal = true;
if (localStorage.getItem("autoHeal") === "false") {
    autoHeal = false;
}
let autoSpecialAbility = true;
if (localStorage.getItem("autoSpecialAbility") === "false") {
    autoSpecialAbility = false;
}
let autoStopLevelUp = localStorage.getItem("autoStopLevelUp") === "true";
const AUTO_LEVEL_UP_STATS = ["hp", "atk", "def", "atkSpd", "vamp", "critRate", "critDmg", "dodge", "luck"];
const AUTO_LEVEL_UP_PRIORITY_LIMIT = 3;
const AUTO_LEVEL_UP_STAT_LABEL_KEYS = {
    hp: "stat-display.health",
    atk: "stat-display.attack",
    def: "stat-display.defense",
    atkSpd: "stat-display.attack-speed",
    vamp: "stat-display.vampirism",
    critRate: "stat-display.crit-rate",
    critDmg: "stat-display.crit-dmg",
    dodge: "stat-display.dodge",
    luck: "stat-display.luck"
};
const normalizeAutoLevelUpPriorities = (priorities) => {
    let parsed = priorities;
    if (typeof parsed === "string") {
        try {
            parsed = JSON.parse(parsed);
        } catch (err) {
            parsed = parsed.split(",");
        }
    }
    if (!Array.isArray(parsed)) {
        parsed = [];
    }

    const seen = new Set();
    const normalized = [];
    for (const stat of parsed) {
        if (AUTO_LEVEL_UP_STATS.includes(stat) && !seen.has(stat)) {
            normalized.push(stat);
            seen.add(stat);
        }
        if (normalized.length >= AUTO_LEVEL_UP_PRIORITY_LIMIT) {
            break;
        }
    }
    return normalized;
};
let autoLevelUpPriorities = normalizeAutoLevelUpPriorities(localStorage.getItem("autoLevelUpPriorities"));
const getAutoLevelUpPriorities = () => normalizeAutoLevelUpPriorities(autoLevelUpPriorities);
const setAutoLevelUpPriorities = (priorities) => {
    autoLevelUpPriorities = normalizeAutoLevelUpPriorities(priorities);
    localStorage.setItem("autoLevelUpPriorities", JSON.stringify(autoLevelUpPriorities));
    return autoLevelUpPriorities;
};
const getAutoLevelUpStatLabel = (stat) => {
    const key = AUTO_LEVEL_UP_STAT_LABEL_KEYS[stat];
    if (key && typeof t === 'function') {
        return t(key);
    }
    return stat;
};
const autoAttackSetting = localStorage.getItem("autoAttack");
let autoAttack = autoAttackSetting === "true";
let autoBossDoors = true
if (localStorage.getItem("autoBossDoors") === "false") {
    autoBossDoors = false;
}
let autoIgnoreDoors = parseInt(localStorage.getItem("autoIgnoreDoors"), 10);
if (Number.isNaN(autoIgnoreDoors)) autoIgnoreDoors = 0;
let autoSellRarity = localStorage.getItem("autoSellRarity") || "none";
let autoSellBelowLevel = parseInt(localStorage.getItem("autoSellBelowLevel"), 10);
if (Number.isNaN(autoSellBelowLevel)) autoSellBelowLevel = 0;
const autoModeHasCachedMembership = typeof isForgeMembershipActive === 'function' && isForgeMembershipActive();
const autoModeLegacyUnlocked = !autoModeHasCachedMembership && (
    autoModeBtnVisible || localStorage.getItem("autoMode") !== null
);
let autoModeUnlocked = autoModeLegacyUnlocked;
const autoModeEntitlements = {
    desktop: false,
    legacy: autoModeLegacyUnlocked,
    membership: false,
    purchase: false,
};

const AUTO_MODE_PRODUCT_ID = 'automode_unlock_premium';
const AUTO_MODE_PURCHASE_URL = 'https://werkstattl.itch.io/quick-dungeon-crawler-on-demand/purchase';

const closeAutoModeUnlockModal = () => {
    closeDefaultModal();
    if (typeof menuModalElement !== 'undefined' && menuModalElement) {
        menuModalElement.style.display = "flex";
    }
};

const buyPermanentAutoModeUnlock = () => {
    if (isCordova() && typeof buyAutoModeUnlock === 'function') {
        buyAutoModeUnlock();
        return;
    }

    closeAutoModeUnlockModal();
    if (/Android/i.test(navigator.userAgent)) {
        ratingSystem.openGooglePlayForRating();
    } else {
        openExternal(AUTO_MODE_PURCHASE_URL);
    }
};

const buyAutoModeMembershipUnlock = () => {
    if (isCordova() && typeof buyForgeMembership === 'function') {
        buyForgeMembership();
        return;
    }

    closeAutoModeUnlockModal();
    if (/Android/i.test(navigator.userAgent)) {
        ratingSystem.openGooglePlayForRating();
    } else {
        openExternal(AUTO_MODE_PURCHASE_URL);
    }
};

const openAutoModeUnlockModal = () => {
    if (typeof defaultModalElement === 'undefined' || !defaultModalElement) {
        return;
    }

    sfxOpen.play();
    if (typeof menuModalElement !== 'undefined' && menuModalElement) {
        menuModalElement.style.display = "none";
    }
    defaultModalElement.style.zIndex = "2";
    defaultModalElement.style.display = "flex";
    defaultModalElement.innerHTML = `
        <div class="content forge-unlock-modal auto-mode-unlock-modal">
            <div class="content-head">
                <h3><i class="fas fa-play"></i> <span data-i18n="auto-mode-unlock">Purchase: Auto Mode</span></h3>
                <p id="auto-mode-unlock-close"><i class="fa fa-xmark"></i></p>
            </div>
            <p data-i18n="auto-mode-description">Automatically engage enemies, claim loot and open doors.</p>
            <div class="forge-unlock-options">
                <section class="forge-unlock-option">
                    <h4 data-i18n="forge-permanent-unlock">Permanent Unlock</h4>
                    <p class="forge-unlock-price" data-iap-product="${AUTO_MODE_PRODUCT_ID}" data-i18n="iap-price-loading">Price shown at checkout</p>
                    <ul class="forge-membership-benefits">
                        <li data-i18n="forge-permanent-unlock-keep-forever">Keep forever</li>
                    </ul>
                    <button id="auto-mode-buy-permanent" type="button" data-i18n="buy-permanently">Buy Permanently</button>
                </section>
                <section class="forge-unlock-option">
                    <h4 data-i18n="forge-membership">The Forge Membership</h4>
                    <p class="forge-unlock-price" data-iap-product="${FORGE_MEMBERSHIP_PRODUCT_ID}" data-i18n="iap-price-loading">Price shown at checkout</p>
                    <ul class="forge-membership-benefits">
                        <li data-i18n="forge-membership-benefit-premium">Access to all premium features</li>
                        <li data-i18n="forge-membership-benefit-inventory">Expanded inventory (+50 slots)</li>
                        <li data-i18n="forge-membership-benefit-resting">Enhanced resting recovery</li>
                        <li data-i18n="forge-membership-benefit-gold">10% gold found</li>
                        <li data-i18n="forge-membership-benefit-title">Exclusive Forge Member title</li>
                        <li data-i18n="forge-membership-benefit-supports-development">Supports ongoing development</li>
                    </ul>
                    <p class="forge-membership-terms" data-i18n="forge-membership-auto-renewing">Auto-renewing subscription</p>
                    <p class="forge-membership-terms" data-iap-store-terms data-i18n="forge-membership-cancel-google-play">Cancel anytime through Google Play.</p>
                    <button id="auto-mode-buy-membership" type="button" data-iap-subscribe data-i18n="forge-membership-subscribe">Subscribe</button>
                </section>
            </div>
            <div class="iap-secondary-actions">
                <button type="button" data-iap-restore data-i18n="iap-restore-purchases">Restore purchases</button>
                <button type="button" data-iap-manage-subscriptions data-i18n="iap-manage-subscription">Manage subscription</button>
            </div>
            <p class="iap-legal-links">
                <a href="https://dungeon.werkstattl.com/PRIVACY.md" data-iap-legal-url="https://dungeon.werkstattl.com/PRIVACY.md" data-i18n="iap-privacy-policy">Privacy Policy</a>
                <span data-iap-apple-only hidden><span aria-hidden="true"> · </span><a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/" data-iap-legal-url="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/" data-i18n="iap-terms-of-use">Terms of Use</a></span>
            </p>
            <p class="iap-status" data-iap-status role="status" aria-live="polite"></p>
        </div>`;
    applyTranslations(defaultModalElement);
    if (typeof preparePurchaseUI === 'function') preparePurchaseUI(defaultModalElement);

    const buyPermanentButton = document.querySelector('#auto-mode-buy-permanent');
    const buyMembershipButton = document.querySelector('#auto-mode-buy-membership');
    const closeButton = document.querySelector('#auto-mode-unlock-close');

    if (isForgeMembershipActive() && buyMembershipButton) {
        buyMembershipButton.disabled = true;
        buyMembershipButton.setAttribute('data-i18n', 'forge-membership-subscribed');
        buyMembershipButton.textContent = t('forge-membership-subscribed');
    }

    if (buyPermanentButton) {
        buyPermanentButton.onclick = () => {
            sfxConfirm.play();
            buyPermanentAutoModeUnlock();
        };
    }
    if (buyMembershipButton) {
        buyMembershipButton.onclick = () => {
            sfxConfirm.play();
            buyAutoModeMembershipUnlock();
        };
    }
    if (closeButton) {
        closeButton.onclick = () => {
            sfxDecline.play();
            closeAutoModeUnlockModal();
        };
    }
};

function setAutoModeEntitlement(source, active, openSettings = false) {
    let old = autoModeUnlocked;
    if (Object.prototype.hasOwnProperty.call(autoModeEntitlements, source)) {
        autoModeEntitlements[source] = Boolean(active);
    }
    autoModeUnlocked = Object.values(autoModeEntitlements).some(Boolean);
    if (!autoModeUnlocked) {
        autoMode = false;
        autoModeBtnVisible = false;
        localStorage.setItem('autoMode', 'false');
        localStorage.setItem('autoModeBtnVisible', 'false');
    }
    updateAutoModeBtnVisibility();
    if (openSettings && typeof window.renderAutoModeSettingsModal === 'function') {
        if (!old && autoModeUnlocked) {
            window.renderAutoModeSettingsModal();
        }
    }
}

function unlockAutoMode(openSettings = true, source = 'purchase') {
    setAutoModeEntitlement(source, true, openSettings);
}

const autoConfirm = () => {
    if (autoMode && autoEngage) {
        // Slight delay to ensure button exists
        setTimeout(() => {
            if (!autoMode || !autoEngage) return;
            const btn = document.querySelector('#choice1');
            if (btn) btn.click();
        }, 100);
    }
};

const autoDecline = () => {
    if (autoMode && autoEngage) {
        setTimeout(() => {
            if (!autoMode || !autoEngage) return;
            const btn = document.querySelector('#choice2');
            if (btn) btn.click();
        }, 100);
    }
};

const autoClaim = () => {
    if (autoMode && autoEngage) {
        setTimeout(() => {
            if (!autoMode || !autoEngage) return;
            const btn = document.querySelector('#battleButton');
            if (btn) btn.click();
        }, 100);
    }
};

const autoModeBtn = document.querySelector("#auto-mode-btn");

const updateAutoModeBtn = () => {
    const buttons = [
        autoModeBtn,
        document.querySelector("#combat-auto-mode-btn"),
    ].filter(Boolean);

    for (const button of buttons) {
        button.classList.toggle("active", autoMode);
        button.setAttribute("aria-pressed", autoMode ? "true" : "false");
    }
};

const updateAutoModeBtnVisibility = () => {
    if (autoModeBtnVisible && autoModeUnlocked) {
        autoModeBtn.classList.remove("hidden");
    } else {
        autoModeBtn.classList.add("hidden");
        if (autoMode) {
            autoMode = false;
            localStorage.setItem("autoMode", autoMode);
            updateAutoModeBtn();
        }
    }
};

const setAutoModeEnabled = (enabled) => {
    const nextAutoMode = !!enabled;
    if (nextAutoMode === autoMode) {
        updateAutoModeBtn();
        return;
    }

    if (nextAutoMode) {
        sfxPause.play();
    } else {
        sfxUnpause.play();
    }

    autoMode = nextAutoMode;
    updateAutoModeBtn();
    localStorage.setItem("autoMode", autoMode);
    if (autoMode && typeof window !== 'undefined' && typeof window.maybeAutoAttack === 'function') {
        window.maybeAutoAttack();
    }
    if (autoMode && dungeon.status.paused) {
        dungeonStartPause();
    }
};

const toggleAutoMode = () => {
    setAutoModeEnabled(!autoMode);
};

if (typeof window !== 'undefined') {
    window.setAutoModeEnabled = setAutoModeEnabled;
    window.toggleAutoMode = toggleAutoMode;
}

autoModeBtn.addEventListener('click', function () {
    toggleAutoMode();
});

updateAutoModeBtnVisibility();
updateAutoModeBtn();
