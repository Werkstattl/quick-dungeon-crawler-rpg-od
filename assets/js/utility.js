// Format large numbers
const nFormatter = (num) => {
    let lookup = [
        { value: 1, symbol: "" },
        { value: 1e3, symbol: "k" },
        { value: 1e6, symbol: "M" },
        { value: 1e9, symbol: "B" },
        { value: 1e12, symbol: "T" },
        { value: 1e15, symbol: "P" },
        { value: 1e18, symbol: "E" }
    ];
    let rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
    let item = lookup.slice().reverse().find(function (item) {
        return num >= item.value;
    });
    return item ? (num / item.value).toFixed(2).replace(rx, "$1") + item.symbol : "0";
}

// Get a randomized number between 2 integers
const randomizeNum = (min, max) => {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.round(Math.floor(Math.random() * (max - min + 1)) + min); //The maximum is inclusive and the minimum is inclusive 
}

// Get a randomized decimal between 2 numbers
const randomizeDecimal = (min, max) => {
    return Math.random() * (max - min) + min;
}

// Rating system - prompts user to rate the app after certain conditions
const ratingSystem = {
    // Configuration for when to show rating dialog
    config: {
        lastPromptDate: null,
        hasRated: false
    },
    
    // Initialize rating system
    init() {
        // Load saved state
        const savedConfig = localStorage.getItem('ratingConfig');
        if (savedConfig) {
            this.config = {...this.config, ...JSON.parse(savedConfig)};
        }
    },
    
    // Check if we should show rating prompt
    shouldPrompt() {
        // Don't prompt if user has already rated
        if (this.config.hasRated) { 
            return false;
        }
        // Check if cooldown period has passed
        if (this.config.lastPromptDate) {
            const lastPrompt = new Date(this.config.lastPromptDate);
            const now = new Date();
            const daysSinceLastPrompt = (now - lastPrompt) / (1000 * 60 * 60 * 24);
            if (daysSinceLastPrompt < 7) {
                return false;
            }
        }
        // Check if player has played enough
        if (player.playtime < 1800) {
            return false;
        }
        // Check if player has progressed far enough
        if (dungeon.progress.floor < 10) {
            return false;
        }
        return true;
    },
    
    showPrompt() {
        this.config.lastPromptDate = new Date().toISOString();
        const modalContent = `
            <div class="content">
                <div class="content-head">
                    <h3 data-i18n="rating-prompt.title">${t('rating-prompt.title')}</h3>
                    <p onclick="closeDefaultModal()" data-i18n-attr="aria-label:close" aria-label="${t('close')}"><i class="fa fa-xmark"></i></p>
                </div>
                <div class="modal-body">
                    <p data-i18n="rating-prompt.reward">${t('rating-prompt.reward')}</p>
                    <div class="decision-panel">
                        <button id="rate-btn" type="button" data-i18n="rating-prompt.rate-now">${t('rating-prompt.rate-now')}</button>
                        <button id="rate-later-btn" type="button" data-i18n="rating-prompt.later">${t('rating-prompt.later')}</button>
                        <button id="rate-never-btn" type="button" data-i18n="rating-prompt.no-thanks">${t('rating-prompt.no-thanks')}</button>
                    </div>
                </div>
            </div>
        `;

        const defaultModal = document.getElementById('defaultModal');
        defaultModal.innerHTML = modalContent;
        defaultModal.style.display = "flex";
        applyTranslations(defaultModal);

        document.getElementById('rate-btn').addEventListener('click', () => {
            this.config.hasRated = true;
            this.saveConfig();
            this.openRating();
            grantLevelUpReward();
            closeDefaultModal();
        });
        
        document.getElementById('rate-later-btn').addEventListener('click', () => {
            closeDefaultModal();
            this.saveConfig();
        });
        
        document.getElementById('rate-never-btn').addEventListener('click', () => {
            this.config.hasRated = true;
            this.saveConfig();
            closeDefaultModal();
        });
    },
    
    openGooglePlayForRating() {
        const isAndroid = /Android/i.test(navigator.userAgent);
        const packageName = "com.thomaspeissl.quick_dungeon_crawler_od.twa";
        if (isAndroid) {
            openExternal(`market://details?id=${packageName}`);
        } else {
            openExternal(`https://play.google.com/store/apps/details?id=${packageName}`);
        }
    },
    
    openItchioForRating() {
        openExternal('https://werkstattl.itch.io/quick-dungeon-crawler-on-demand/rate?source=game');
    },

    openRating() {
        if ( isPremium() ) {
            this.openItchioForRating();
        } else if (isCordova()) {
            this.openGooglePlayForRating();
        } else {
            this.openItchioForRating();
        }
    },

    saveConfig() {
        localStorage.setItem('ratingConfig', JSON.stringify(this.config));
    },
    
    checkAndPrompt() {
        if (this.shouldPrompt()) {
            this.showPrompt();
        }
    }
};

function closeDefaultModal() {
    const defaultModal = document.getElementById('defaultModal');
    if (!defaultModal) return;

    defaultModal.style.display = "none";
    defaultModal.innerHTML = "";
    defaultModal.style.zIndex = "1"; // Reset z-index when closing
}

function openStatsModal() {
    const statsModal = document.getElementById('statsModal');
    if (!statsModal) return;
    if (typeof sfxConfirm !== 'undefined' && sfxConfirm && typeof sfxConfirm.play === 'function') {
        sfxConfirm.play();
    }
    statsModal.style.display = "flex";
    const dimDungeon = document.querySelector('#dungeon-main');
    if (dimDungeon && window.getComputedStyle(dimDungeon).display !== 'none') {
        dimDungeon.style.filter = "brightness(50%)";
    }
}

function closeStatsModal() {
    const statsModal = document.getElementById('statsModal');
    if (!statsModal) return;
    if (typeof sfxDecline !== 'undefined' && sfxDecline && typeof sfxDecline.play === 'function') {
        sfxDecline.play();
    }
    statsModal.style.display = "none";
    const dimDungeon = document.querySelector('#dungeon-main');
    if (dimDungeon && window.getComputedStyle(dimDungeon).display !== 'none') {
        dimDungeon.style.filter = "brightness(100%)";
    }
}

// give the player exp equal to one level up
function grantLevelUpReward() {
    const reward = player.exp.expMaxLvl;

    player.exp.expCurr += reward;
    player.exp.expCurrLvl += reward;
    activeCompanion.gainExperience(reward);

    while (player.exp.expCurr >= player.exp.expMax) {
        playerLvlUp();
    }
    playerLoadStats();
    showLevelUpModalIfPending();
}
