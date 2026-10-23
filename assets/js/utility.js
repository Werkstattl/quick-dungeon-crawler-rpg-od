// Format elapsed time with total hours, including durations beyond 24 hours.
const formatRunDuration = (seconds) => {
    const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    const parts = [hrs, mins, secs].map(part => String(part).padStart(2, "0"));
    return parts.join(":");
};

// Format large numbers
// Safe storage: write to temp key, verify, then swap to real key.
// This protects against corrupt saves if the app is killed mid-write.

const STORAGE_KEYS = {
    player: 'playerData',
    playerBackup: 'playerData_backup',
    playerTemp: 'playerData_temp',
    dungeon: 'dungeonData',
    dungeonBackup: 'dungeonData_backup',
    dungeonTemp: 'dungeonData_temp',
    enemy: 'enemyData',
    enemyBackup: 'enemyData_backup',
    enemyTemp: 'enemyData_temp',
};

const FORGE_MEMBERSHIP_PRODUCT_ID = 'the_forge_membership';
const FORGE_MEMBERSHIP_STORAGE_KEY = 'forgeMembershipActive';
const FORGE_LIFETIME_MEMBERSHIP_PRODUCT_ID = 'the_forge_membership_lifetime';
const FORGE_LIFETIME_MEMBERSHIP_STORAGE_KEY = 'forgeLifetimeMembershipActive';

function isForgeSubscriptionActive() {
    return localStorage.getItem(FORGE_MEMBERSHIP_STORAGE_KEY) === 'true';
}

function isForgeLifetimeMembershipActive() {
    return localStorage.getItem(FORGE_LIFETIME_MEMBERSHIP_STORAGE_KEY) === 'true';
}

function isForgeMembershipActive() {
    return isForgeSubscriptionActive() || isForgeLifetimeMembershipActive();
}

function applyForgeMembershipGoldBonus(amount) {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
        return 0;
    }
    return isForgeMembershipActive() ? Math.round(value * 1.1) : Math.round(value);
}

function applyForgeMembershipRestingRecoveryBonus(amount) {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
        return 0;
    }
    return isForgeMembershipActive() ? Math.round(value * 2) : Math.round(value);
}

function getForgeMemberTitle() {
    if (typeof t !== 'function') {
        return 'Forge Member';
    }
    const translated = t('forge-member-title');
    return translated && translated !== 'forge-member-title' ? translated : 'Forge Member';
}

function getPlayerTitleHTML() {
    if (typeof getSelectedPlayerTitle === 'function') {
        const title = getSelectedPlayerTitle();
        if (!title) return '';
        const key = title.id === 'forge-member' ? 'forge-member-title' : `title-${title.id}`;
        return `<span class="player-title ${getPlayerTitleClass(title)}" data-i18n="${key}">${escapeTitleHTML(getPlayerTitleName(title))}</span>`;
    }
    if (!isForgeMembershipActive()) {
        return '';
    }
    return `<span class="player-forge-title">${getForgeMemberTitle()}</span>`;
}

// Kept for integrations that used the original membership-only helper.
function getPlayerForgeTitleHTML() {
    return getPlayerTitleHTML();
}

function getPlayerDisplayName(name) {
    const baseName = typeof name === 'string' && name.trim() ? name.trim() : '';
    if (typeof getSelectedPlayerTitle === 'function') {
        const title = getSelectedPlayerTitle();
        return title ? `${baseName} [${getPlayerTitleName(title)}]` : baseName;
    }
    if (!isForgeMembershipActive()) {
        return baseName;
    }
    return `${baseName} [${getForgeMemberTitle()}]`;
}

const safeSave = (key, data, backupKey, tempKey) => {
    try {
        const json = JSON.stringify(data);
        // Write to temp key first
        localStorage.setItem(tempKey, json);
        // Verify it can be read back
        const verify = JSON.parse(localStorage.getItem(tempKey));
        if (verify === null || verify === undefined) {
            console.error(`safeSave: verification failed for ${key}`);
            return false;
        }
        // Swap: copy current real key to backup, then move temp to real
        const currentData = localStorage.getItem(key);
        if (currentData !== null) {
            localStorage.setItem(backupKey, currentData);
        }
        localStorage.setItem(key, json);
        return true;
    } catch (err) {
        console.error(`safeSave failed for ${key}:`, err);
        return false;
    }
};

const safeLoad = (key, backupKey) => {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed;
    } catch (err) {
        console.warn(`safeLoad: primary key ${key} corrupt, trying backup.`, err);
        try {
            const backupRaw = localStorage.getItem(backupKey);
            if (backupRaw) {
                const backupParsed = JSON.parse(backupRaw);
                // Restore backup to primary key
                localStorage.setItem(key, backupRaw);
                console.log(`safeLoad: restored ${key} from backup.`);
                return backupParsed;
            }
        } catch (backupErr) {
            console.error(`safeLoad: backup also corrupt for ${key}`, backupErr);
        }
        return null;
    }
};

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

const getBaseEnemyName = (enemyId, fallbackName) => {
    try {
        if (typeof getBestiaryDisplayName === 'function') {
            const displayName = getBestiaryDisplayName(enemyId);
            if (displayName) return displayName;
        }
    } catch (e) {}
    if (typeof fallbackName === 'string' && fallbackName.trim()) {
        return fallbackName.trim();
    }
    try {
        if (typeof getEnemyTranslatedName === 'function') {
            return getEnemyTranslatedName(enemyId);
        }
    } catch (e) {}
    return String(enemyId || 'Unknown');
};

// Callers store the base name on enemy.name and feed it back here, so the prefix is added
// at display time only and never compounds into "Enraged Enraged Goblin".
const getDisplayEnemyName = (enemyId, fallbackName) => {
    const baseName = getBaseEnemyName(enemyId, fallbackName);
    try {
        if (typeof enemy !== 'undefined' && enemy && enemy.id === enemyId
            && typeof formatAffixedEnemyName === 'function') {
            return formatAffixedEnemyName(baseName, enemy.affixes);
        }
    } catch (e) {}
    return baseName;
};

// Rating system - prompts user to rate the app after certain conditions
const ratingSystem = {
    requestInFlight: false,
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
            const cooldownDays = isNativePurchasePlatform() ? 120 : 7;
            if (daysSinceLastPrompt < cooldownDays) {
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
    
    openAppStoreForRating() {
        openExternal('https://apps.apple.com/app/id6812062363?action=write-review');
    },

    openItchioForRating() {
        openExternal('https://werkstattl.itch.io/quick-dungeon-crawler-on-demand/rate?source=game');
    },

    openRating() {
        if (isApplePurchasePlatform()) {
            this.openAppStoreForRating();
        } else if (isNativePurchasePlatform()) {
            // Store destination depends on the platform, including for members.
            this.openGooglePlayForRating();
        } else if ( isPremium() ) {
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
    
    canPromptNow() {
        if (document.hidden || dungeon.status.event) return false;
        if (typeof autoMode !== 'undefined' && autoMode
            && typeof autoStopLevelUp !== 'undefined' && !autoStopLevelUp) return false;
        // Never cover combat, another choice, or an open menu with a review.
        return !Array.from(document.querySelectorAll('.modal-container')).some(
            modal => window.getComputedStyle(modal).display !== 'none'
        );
    },

    async checkAndPrompt() {
        if (this.requestInFlight || !this.shouldPrompt() || !this.canPromptNow()) return;
        if (!isNativePurchasePlatform()) {
            this.showPrompt();
            return;
        }

        this.requestInFlight = true;
        try {
            const reviewApi = await loadNativeReviewApi();
            // Loading the bridge can take time; the player may have moved on.
            if (!this.shouldPrompt() || !this.canPromptNow()) return;
            this.config.lastPromptDate = new Date().toISOString();
            this.saveConfig();
            // This records an attempt only. Neither store reports whether the
            // dialog appeared or a rating was submitted. Preserve prior opt-outs.
            await reviewApi.requestReview();
        } catch (error) {
            // Suppressed/unavailable native prompts must not open a custom
            // dialog or redirect the player to a store automatically.
            console.warn('Native review request unavailable:', error);
        } finally {
            this.requestInFlight = false;
        }
    }
};

function closeDefaultModal() {
    const defaultModal = document.getElementById('defaultModal');
    if (!defaultModal) return;

    defaultModal.style.display = "none";
    defaultModal.innerHTML = "";
    defaultModal.style.zIndex = "1"; // Reset z-index when closing
    defaultModal.classList.remove('equipment-confirmation-backdrop');
    delete defaultModal.dataset.modalType;
}

const STATS_HELP_SEEN_KEY = 'statsHelpSeen';

function initStatsHelpHint() {
    const link = document.getElementById('stats-help-link');
    if (!link) return;
    if (!localStorage.getItem(STATS_HELP_SEEN_KEY)) {
        link.classList.add('hint-unseen');
    }
}

window.addEventListener('DOMContentLoaded', initStatsHelpHint);

function openStatsModal() {
    const statsModal = document.getElementById('statsModal');
    if (!statsModal) return;
    localStorage.setItem(STATS_HELP_SEEN_KEY, 'true');
    const statsHelpLink = document.getElementById('stats-help-link');
    if (statsHelpLink) statsHelpLink.classList.remove('hint-unseen');
    if (typeof sfxOpen !== 'undefined' && sfxOpen && typeof sfxOpen.play === 'function') {
        sfxOpen.play();
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
