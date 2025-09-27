let autoMode = localStorage.getItem("autoMode") === "true";
let autoModeBtnVisible = localStorage.getItem("autoModeBtnVisible") === "true";
let autoBlessings = localStorage.getItem("autoBlessings") === "true";
let autoHeal = localStorage.getItem("autoHeal") === "true";
let autoSpecialAbility = localStorage.getItem("autoSpecialAbility") === "true";
let autoBossDoors = localStorage.getItem("autoBossDoors") === "true"; // open boss doors automatically
let autoIgnoreDoors = parseInt(localStorage.getItem("autoIgnoreDoors"), 10);
if (Number.isNaN(autoIgnoreDoors)) autoIgnoreDoors = 0;
let autoCurseTotemsUntil = parseInt(localStorage.getItem("autoCurseTotemsUntil"), 10);
if (Number.isNaN(autoCurseTotemsUntil)) autoCurseTotemsUntil = 1;
let autoModeUnlocked = autoModeBtnVisible;

if ( !autoModeUnlocked ) {
    old = localStorage.getItem("autoMode");
    if ( old !== null ) {
        autoModeUnlocked = true;
    }
}

const AUTO_MODE_PRODUCT_ID = 'automode_unlock_premium';

function unlockAutoMode() {
    autoModeUnlocked = true;
    updateAutoModeBtnVisibility();
    if (typeof window.renderAutoModeSettingsModal === 'function') {
        window.renderAutoModeSettingsModal();
    }
}

const autoConfirm = () => {
    if (autoMode) {
        // Slight delay to ensure button exists
        setTimeout(() => {
            const btn = document.querySelector('#choice1');
            if (btn) btn.click();
        }, 100);
    }
};

const autoDecline = () => {
    if (autoMode) {
        setTimeout(() => {
            const btn = document.querySelector('#choice2');
            if (btn) btn.click();
        }, 100);
    }
};

const autoClaim = () => {
    if (autoMode) {
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
    if (autoMode && dungeon.status.paused) {
        dungeonStartPause();
    }
});

updateAutoModeBtnVisibility();
updateAutoModeBtn();
