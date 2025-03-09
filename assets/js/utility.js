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
            console.log(`Days since last prompt: ${daysSinceLastPrompt}`);
            if (daysSinceLastPrompt < 7) {
                return false;
            }
        }
        // Check if player has played enough
        if (player.playtime < 600) {
            return false;
        }
        // Check if player has progressed far enough
        if (dungeon.progress.floor < 5) {
            return false;
        }
        return true;
    },
    
    // Show the rating prompt
    showPrompt() {
        this.config.lastPromptDate = new Date().toISOString();
        
        // Create modal content for rating request
        const modalContent = `
            <div class="content">
                <div class="content-head">
                    <h3>Enjoying the game?</h3>
                    <p onclick="closeDefaultModal()"><i class="fa fa-xmark"></i></p>
                </div>
                <div class="modal-body">
                    <p>Would you like to rate our game?</p>
                    <div class="decision-panel">
                        <button id="rate-now-btn">Rate Now</button>
                        <button id="rate-later-btn">Later</button>
                        <button id="rate-never-btn">No Thanks</button>
                    </div>
                </div>
            </div>
        `;
        
        // Show the modal
        const defaultModal = document.getElementById('defaultModal');
        defaultModal.innerHTML = modalContent;
        defaultModal.style.display = "flex";
        
        // Add event listeners
        document.getElementById('rate-now-btn').addEventListener('click', () => {
            this.openStoreForRating();
            this.config.hasRated = true;
            this.saveConfig();
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
    
    // Open the app store for rating
    openStoreForRating() {
        // Check if we're on Android
        const isAndroid = /Android/i.test(navigator.userAgent);
        
        if (isAndroid) {
            const packageName = "com.thomaspeissl.quick_dungeon_crawler_od.twa";
            window.open(`market://details?id=${packageName}`, '_system');
            // Fallback in case market:// URL doesn't work
            setTimeout(() => {
                window.open(`https://play.google.com/store/apps/details?id=${packageName}`, '_system');
            }, 500);
        } else {
            window.open(`https://github.com/Werkstattl/quick-dungeon-crawler-rpg-od`, '_system');
        }
    },
    
    // Save the current config to localStorage
    saveConfig() {
        localStorage.setItem('ratingConfig', JSON.stringify(this.config));
    },
    
    // Check conditions and show prompt if appropriate
    checkAndPrompt() {
        console.log("Checking rating conditions...");
        if (this.shouldPrompt()) {
            this.showPrompt();
        }
    }
};

// Function to close the default modal
function closeDefaultModal() {
    const defaultModal = document.getElementById('defaultModal');
    defaultModal.style.display = "none";
}
