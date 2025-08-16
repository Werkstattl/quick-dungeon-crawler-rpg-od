let autoMode = localStorage.getItem("autoMode") === "true";
let autoModeBtnVisible = localStorage.getItem("autoModeBtnVisible") === "true";
let autoBlessings = localStorage.getItem("autoBlessings") === "true";
let autoHeal = localStorage.getItem("autoHeal") === "true";

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
    if (autoModeBtnVisible) {
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
    autoMode = !autoMode;
    updateAutoModeBtn();
    localStorage.setItem("autoMode", autoMode);
    if (autoMode && dungeon.status.paused) {
        dungeonStartPause();
    }
});

updateAutoModeBtnVisibility();
updateAutoModeBtn();