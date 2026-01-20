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

function unlockAutoMode() {
    let old = autoModeUnlocked;
    autoModeUnlocked = true;
    updateAutoModeBtnVisibility();
    if (typeof window.renderAutoModeSettingsModal === 'function') {
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
