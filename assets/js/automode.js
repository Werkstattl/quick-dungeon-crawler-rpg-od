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
let autoModeUnlocked = autoModeBtnVisible;

if ( !autoModeUnlocked ) {
    old = localStorage.getItem("autoMode");
    if ( old !== null ) {
        autoModeUnlocked = true;
    }
}

const AUTO_MODE_PRODUCT_ID = 'automode_unlock_premium';
const AUTO_MODE_PURCHASE_URL = 'https://werkstattl.itch.io/quick-dungeon-crawler-on-demand/purchase';

const closeAutoModeUnlockModal = () => {
    closeDefaultModal();
    if (typeof menuModalElement !== 'undefined' && menuModalElement) {
        menuModalElement.style.display = "flex";
    }
};

const buyPermanentAutoModeUnlock = () => {
    closeAutoModeUnlockModal();
    if (isCordova() && typeof buyAutoModeUnlock === 'function') {
        buyAutoModeUnlock();
        return;
    }

    if (/Android/i.test(navigator.userAgent)) {
        ratingSystem.openGooglePlayForRating();
    } else {
        openExternal(AUTO_MODE_PURCHASE_URL);
    }
};

const buyAutoModeMembershipUnlock = () => {
    closeAutoModeUnlockModal();
    if (isCordova() && typeof buyForgeMembership === 'function') {
        buyForgeMembership();
        return;
    }

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
                    <p class="forge-unlock-price" data-i18n="auto-mode-permanent-unlock-price">One-time purchase</p>
                    <ul class="forge-membership-benefits">
                        <li data-i18n="forge-permanent-unlock-keep-forever">Keep forever</li>
                    </ul>
                    <button id="auto-mode-buy-permanent" type="button" data-i18n="buy-permanently">Buy Permanently</button>
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
                    <p class="forge-membership-terms" data-i18n="forge-membership-auto-renewing">Auto-renewing subscription</p>
                    <p class="forge-membership-terms" data-i18n="forge-membership-cancel-google-play">Cancel anytime through Google Play.</p>
                    <button id="auto-mode-buy-membership" type="button" data-i18n="forge-membership-subscribe">Subscribe</button>
                </section>
            </div>
        </div>`;
    applyTranslations(defaultModalElement);

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

function unlockAutoMode(openSettings = true) {
    let old = autoModeUnlocked;
    autoModeUnlocked = true;
    updateAutoModeBtnVisibility();
    if (openSettings && typeof window.renderAutoModeSettingsModal === 'function') {
        if (!old) {
            window.renderAutoModeSettingsModal();
        }
    }
}

const autoConfirm = () => {
    if (autoMode && autoEngage) {
        // Slight delay to ensure button exists
        setTimeout(() => {
            const btn = document.querySelector('#choice1');
            if (btn) btn.click();
        }, 100);
    }
};

const autoDecline = () => {
    if (autoMode && autoEngage) {
        setTimeout(() => {
            const btn = document.querySelector('#choice2');
            if (btn) btn.click();
        }, 100);
    }
};

const autoClaim = () => {
    if (autoMode && autoEngage) {
        setTimeout(() => {
            const btn = document.querySelector('#battleButton');
            if (btn) btn.click();
        }, 100);
    }
};

const autoModeBtn = document.querySelector("#auto-mode-btn");

const updateAutoModeBtn = () => {
    if (autoMode) {
        autoModeBtn.classList.add("active");
    } else {
        autoModeBtn.classList.remove("active");
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

autoModeBtn.addEventListener('click', function () {
    if (autoMode) {
        sfxUnpause.play();
    } else {
        sfxPause.play();
    }
    autoMode = !autoMode;
    updateAutoModeBtn();
    localStorage.setItem("autoMode", autoMode);
    if (autoMode && typeof window !== 'undefined' && typeof window.maybeAutoAttack === 'function') {
        window.maybeAutoAttack();
    }
    if (autoMode && dungeon.status.paused) {
        dungeonStartPause();
    }
});

updateAutoModeBtnVisibility();
updateAutoModeBtn();
