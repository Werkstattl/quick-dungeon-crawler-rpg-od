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
let autoModeUnlocked = autoModeBtnVisible;

if ( !autoModeUnlocked ) {
    old = localStorage.getItem("autoMode");
    if ( old !== null ) {
        autoModeUnlocked = true;
    }
}

const AUTO_MODE_PRODUCT_ID = 'automode_unlock_premium';
const AUTO_MODE_PURCHASE_URL = 'https://werkstattl.itch.io/quick-dungeon-crawler-on-demand/purchase';

const buyPermanentAutoModeUnlock = () => {
    closeDefaultModal();
    if (typeof menuModalElement !== 'undefined' && menuModalElement) {
        menuModalElement.style.display = "flex";
    }
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
