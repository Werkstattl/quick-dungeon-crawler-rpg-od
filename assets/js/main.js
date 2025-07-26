// Use DOMContentLoaded so interactions are available as soon as the DOM is ready
// rather than waiting for all assets to finish loading
window.addEventListener("DOMContentLoaded", function () {
    // Apply saved font size on page load
    
    if (player === null) {
        showCharacterCreation();
    } else {
        let target = document.querySelector("#title-screen");
        target.style.display = "flex";
    }

    // Title Screen Validation
    document.querySelector("#title-screen").addEventListener("click", function () {
        const player = JSON.parse(localStorage.getItem("playerData"));
        if (player.allocated) {
            enterDungeon();
        } else {
            allocationPopup();
        }
    });

    // Prevent double-click zooming on mobile devices
    document.ondblclick = function (e) {
        e.preventDefault();
    }

    // Submit Name
    document.querySelector("#name-submit").addEventListener("submit", function (e) {
        e.preventDefault();
        let playerName = document.querySelector("#name-input").value;
        let hardcore = document.querySelector("#hardcore-checkbox").checked;
        let wasHardcore = player ? player.hardcore : false;

        var format = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+/;
        if (format.test(playerName)) {
            document.querySelector("#alert").innerHTML = "Your name cannot contain special characters!";
        } else {
            if (playerName.length < 3 || playerName.length > 15) {
                document.querySelector("#alert").innerHTML = "Name should be between 3-15 characters!";
            } else {
			    if (player === null) {
                player = {
                    name: playerName,
                    lvl: 1,
                    stats: {
                        hp: null,
                        hpMax: null,
                        atk: null,
                        def: null,
                        pen: null,
                        atkSpd: null,
                        vamp: null,
                        critRate: null,
                        critDmg: null,
                        dodge: null
                    },
                    baseStats: {
                        hp: 500,
                        atk: 100,
                        def: 50,
                        pen: 0,
                        atkSpd: 0.6,
                        vamp: 0,
                        critRate: 0,
                        critDmg: 50,
                        dodge: 0
                    },
                    equippedStats: {
                        hp: 0,
                        atk: 0,
                        def: 0,
                        pen: 0,
                        atkSpd: 0,
                        vamp: 0,
                        critRate: 0,
                        critDmg: 0,
                        dodge: 0,
                        hpPct: 0,
                        atkPct: 0,
                        defPct: 0,
                        penPct: 0,
                    },
                    bonusStats: {
                        hp: 0,
                        atk: 0,
                        def: 0,
                        atkSpd: 0,
                        vamp: 0,
                        critRate: 0,
                        critDmg: 0,
                        dodge: 0
                    },
                    exp: {
                        expCurr: 0,
                        expMax: 100,
                        expCurrLvl: 0,
                        expMaxLvl: 100,
                        lvlGained: 0
                    },
                    inventory: {
                        consumables: [],
                        equipment: []
                    },
                    equipped: [],
                    gold: 0,
                    playtime: 0,
                    kills: 0,
                    deaths: 0,
                    inCombat: false,
                    allocationChoices: {
                        hp: 10,
                        atk: 10,
                        def: 10,
                        atkSpd: 10
                    },
                    hardcore: hardcore,
                    selectedPassive: "Remnant Razor"
                };
                }
                player.name = playerName;
                if (hardcore && !wasHardcore) {
                    if ((player.inventory && (player.inventory.consumables.length > 0 || player.inventory.equipment.length > 0)) ||
                        (player.equipped && player.equipped.length > 0) || player.gold > 0) {
                        player.inventory = {
                            consumables: [],
                            equipment: []
                        };
                        player.equipped = [];
                        player.equippedStats = {
                            hp: 0,
                            atk: 0,
                            def: 0,
                            pen: 0,
                            atkSpd: 0,
                            vamp: 0,
                            critRate: 0,
                            critDmg: 0,
                            dodge: 0,
                            hpPct: 0,
                            atkPct: 0,
                            defPct: 0,
                            penPct: 0,
                        };
                        player.gold = 0;
                    }
                }
                player.hardcore = hardcore;
                calculateStats();
                player.stats.hp = player.stats.hpMax;
                saveData();
                document.querySelector("#character-creation").style.display = "none";
                runLoad("title-screen", "flex");
            }
        }
    });

    // Warn about hardcore mode enabling if player already has items or gold
    const hcCheckbox = document.querySelector("#hardcore-checkbox");
    hcCheckbox.addEventListener("change", function (e) {
        if (e.target.checked && player && !player.hardcore &&
            ((player.inventory && (player.inventory.consumables.length > 0 || player.inventory.equipment.length > 0)) || player.gold > 0)) {
            sfxOpen.play();
            let dimTarget = document.querySelector('#character-creation');
            dimTarget.style.filter = "brightness(50%)";
            defaultModalElement.style.display = "flex";
            defaultModalElement.innerHTML = `
            <div class="content">
                <p>Enabling <b>hardcore</b> will permanently delete all of your current <b>items</b> and <b>gold</b>. Use the <b>Export/Import Data</b> option to back up your save before continuing.</p>
                <div class="button-container">
                    <button id="hc-enable">Enable</button>
                    <button id="hc-cancel">Cancel</button>
                </div>
            </div>`;
            let confirm = document.querySelector('#hc-enable');
            let cancel = document.querySelector('#hc-cancel');
            confirm.onclick = function () {
                sfxConfirm.play();
                defaultModalElement.style.display = "none";
                defaultModalElement.innerHTML = "";
                dimTarget.style.filter = "brightness(100%)";
                hcCheckbox.checked = true;
            };
            cancel.onclick = function () {
                sfxDecline.play();
                defaultModalElement.style.display = "none";
                defaultModalElement.innerHTML = "";
                dimTarget.style.filter = "brightness(100%)";
                hcCheckbox.checked = false;
            };
        }
    });

    nativeInit();

    // Unequip all items
    document.querySelector("#unequip-all").addEventListener("click", function () {
        sfxOpen.play();

        dungeon.status.exploring = false;
        let dimTarget = document.querySelector('#inventory');
        dimTarget.style.filter = "brightness(50%)";
        defaultModalElement.style.display = "flex";
        defaultModalElement.innerHTML = `
        <div class="content">
            <p>Unequip all your items?</p>
            <div class="button-container">
                <button id="unequip-confirm">Unequip</button>
                <button id="unequip-cancel">Cancel</button>
            </div>
        </div>`;
        let confirm = document.querySelector('#unequip-confirm');
        let cancel = document.querySelector('#unequip-cancel');
        confirm.onclick = function () {
            sfxUnequip.play();
            unequipAll();
            continueExploring();
            defaultModalElement.style.display = "none";
            defaultModalElement.innerHTML = "";
            dimTarget.style.filter = "brightness(100%)";
        };
        cancel.onclick = function () {
            sfxDecline.play();
            continueExploring();
            defaultModalElement.style.display = "none";
            defaultModalElement.innerHTML = "";
            dimTarget.style.filter = "brightness(100%)";
        };
    });
    
    ["#menu-btn", "#title-menu-btn"].forEach(id => {
        const btn = document.querySelector(id);
        if (btn) btn.addEventListener("click", function(e) {
            if (id === "#title-menu-btn") e.stopPropagation();
            openMenu(id === "#title-menu-btn");
        });
    });
    applyFontSize();
    setVolume();
    loadBestiary();
    ratingSystem.init();
});

function openMenu(isTitle = false) {
    closeInventory();

    dungeon.status.exploring = false;
    let dimDungeon = document.querySelector('#dungeon-main');
    let dimTitle = document.querySelector('#title-screen');
    if (dimDungeon && window.getComputedStyle(dimDungeon).display !== 'none') {
        dimDungeon.style.filter = "brightness(50%)";
    }
    if (dimTitle && window.getComputedStyle(dimTitle).display !== 'none') {
        dimTitle.style.filter = "brightness(50%)";
    }
    menuModalElement.style.display = "flex";

    // Menu tab
    menuModalElement.innerHTML = `
        <div class="content">
            <div class="content-head">
                <h3>Menu</h3>
                <p id="close-menu"><i class="fa fa-xmark"></i></p>
            </div>
            <button id="player-menu"><i class="fas fa-user"></i>${player.name}</button>
            ${isTitle ? '' : '<button id="stats">Current Run</button>'}
            <button id="bestiary-menu">Bestiary</button>
            <button id="volume-btn">Settings</button>
            <button id="export-import">Export/Import Data</button>
            ${isTitle ? '<button id="hero-return">Hero Creation</button>' : '<button id="quit-run">Abandon</button>'}
            <button id="rate-game"><i class="fas fa-star"></i> Rate Game</button>
            <button id="reddit-link" style="background:#ff4500;color:#fff;"><i class="fab fa-reddit"></i> Subreddit</button>
        </div>`;

    let close = document.querySelector('#close-menu');
    let playerMenu = document.querySelector('#player-menu');
    let runMenu = document.querySelector('#stats');
    let quitRun = document.querySelector('#quit-run');
    let heroReturn = document.querySelector('#hero-return');
    let exportImport = document.querySelector('#export-import');
    let bestiaryMenu = document.querySelector('#bestiary-menu');
    let volumeSettings = document.querySelector('#volume-btn');
    let redditLink = document.querySelector('#reddit-link');
    let rateGameBtn = document.querySelector('#rate-game');
    // Reddit button click function
    redditLink.onclick = function () {
        window.open('https://www.reddit.com/r/QuickDungeonCrawler/', '_blank');
    }

    // Rate game button click function
    rateGameBtn.onclick = function () {
        ratingSystem.openGooglePlayForRating(); // disable for itch.io
        // ratingSystem.openItchioForRating();
        ratingSystem.config.hasRated = true;
        ratingSystem.saveConfig();
    }

    // Player profile click function
    playerMenu.onclick = function () {
        sfxOpen.play();
        let playTime = new Date(player.playtime * 1000).toISOString().slice(11, 19);
        menuModalElement.style.display = "none";
        defaultModalElement.style.display = "flex";
        defaultModalElement.innerHTML = `
            <div class="content" id="profile-tab">
                <div class="content-head">
                    <h3>Statistics</h3>
                    <p id="profile-close"><i class="fa fa-xmark"></i></p>
                </div>
                <p>${player.name} Lv.${player.lvl}</p>
                <p>Hardcore: ${player.hardcore ? 'Enabled' : 'Disabled'}</p>
                <p>Kills: ${nFormatter(player.kills)}</p>
                <p>Deaths: ${nFormatter(player.deaths)}</p>
                <p>Playtime: ${playTime}</p>
            </div>`;
        let profileTab = document.querySelector('#profile-tab');
        profileTab.style.width = "15rem";
        let profileClose = document.querySelector('#profile-close');
        profileClose.onclick = function () {
            sfxDecline.play();
            defaultModalElement.style.display = "none";
            defaultModalElement.innerHTML = "";
            menuModalElement.style.display = "flex";
        };
    };

    // Dungeon run click function
    if (runMenu) {
        runMenu.onclick = function () {
            sfxOpen.play();
            let runTime = new Date(dungeon.statistics.runtime * 1000).toISOString().slice(11, 19);
            menuModalElement.style.display = "none";
            defaultModalElement.style.display = "flex";
            defaultModalElement.innerHTML = `
                <div class="content" id="run-tab">
                    <div class="content-head">
                        <h3>Current Run</h3>
                        <p id="run-close"><i class="fa fa-xmark"></i></p>
                    </div>
                    <p>${player.name} Lv.${player.lvl} (${player.skills})</p>
                    <p>Blessing Lvl.${player.blessing}</p>
                    <p>Curse Lvl.${Math.round((dungeon.settings.enemyScaling - 1) * 10)}</p>
                    <p>Kills: ${nFormatter(dungeon.statistics.kills)}</p>
                    <p>Runtime: ${runTime}</p>
                </div>`;
            let runTab = document.querySelector('#run-tab');
            runTab.style.width = "15rem";
            let runClose = document.querySelector('#run-close');
            runClose.onclick = function () {
                sfxDecline.play();
                defaultModalElement.style.display = "none";
                defaultModalElement.innerHTML = "";
                menuModalElement.style.display = "flex";
            };
        };
    }

    // Quit the current run
    if (quitRun) {
        quitRun.onclick = function () {
            sfxOpen.play();
            menuModalElement.style.display = "none";
            defaultModalElement.style.display = "flex";
            defaultModalElement.innerHTML = `
                <div class="content">
                    <p>Do you want to abandon this run?</p>
                    <div class="button-container">
                        <button id="quit-run">Abandon</button>
                        <button id="cancel-quit">Cancel</button>
                    </div>
                </div>`;
            let quit = document.querySelector('#quit-run');
            let cancel = document.querySelector('#cancel-quit');
            quit.onclick = function () {
                sfxConfirm.play();
                // Clear out everything, send the player back to meny and clear progress.
                bgmDungeon.stop();
                let dimDungeon = document.querySelector('#dungeon-main');
                dimDungeon.style.filter = "brightness(100%)";
                dimDungeon.style.display = "none";
                menuModalElement.style.display = "none";
                menuModalElement.innerHTML = "";
                defaultModalElement.style.display = "none";
                defaultModalElement.innerHTML = "";
                runLoad("title-screen", "flex");
                clearInterval(dungeonTimer);
                clearInterval(playTimer);
                progressReset();
            };
            cancel.onclick = function () {
                sfxDecline.play();
                defaultModalElement.style.display = "none";
                defaultModalElement.innerHTML = "";
                menuModalElement.style.display = "flex";
            };
        };
    }

    // Opens the volume settings
    volumeSettings.onclick = function () {
        sfxOpen.play();

        let master = volume.master * 100;
        let bgm = (volume.bgm * 100) * 2;
        let sfx = volume.sfx * 100;
        let fontScale = Math.round(fontSize.scale * 100);
        menuModalElement.style.display = "none";
        defaultModalElement.style.display = "flex";
        defaultModalElement.innerHTML = `
            <div class="content" id="volume-tab">
                <div class="content-head">
                    <h3>Settings</h3>
                    <p id="volume-close"><i class="fa fa-xmark"></i></p>
                </div>
                <label id="master-label" for="master-volume">Master (${master}%)</label>
                <input type="range" id="master-volume" min="0" max="100" value="${master}">
                <label id="bgm-label" for="bgm-volume">BGM (${bgm}%)</label>
                <input type="range" id="bgm-volume" min="0" max="100" value="${bgm}">
                <label id="sfx-label" for="sfx-volume">SFX (${sfx}%)</label>
                <input type="range" id="sfx-volume" min="0" max="100" value="${sfx}">
                <label id="font-label" for="font-size">Font Size (${fontScale}%)</label>
                <input type="range" id="font-size" min="75" max="150" value="${fontScale}">
                <button id="apply-volume">Apply</button>
            </div>`;
        let masterVol = document.querySelector('#master-volume');
        let bgmVol = document.querySelector('#bgm-volume');
        let sfxVol = document.querySelector('#sfx-volume');
        let fontSizeSlider = document.querySelector('#font-size');
        let applyVol = document.querySelector('#apply-volume');
        let volumeTab = document.querySelector('#volume-tab');
        volumeTab.style.width = "15rem";
        let volumeClose = document.querySelector('#volume-close');
        volumeClose.onclick = function () {
            sfxDecline.play();
            defaultModalElement.style.display = "none";
            defaultModalElement.innerHTML = "";
            menuModalElement.style.display = "flex";
        };

        // Volume Control
        masterVol.oninput = function () {
            master = this.value;
            document.querySelector('#master-label').innerHTML = `Master (${master}%)`;
        };

        bgmVol.oninput = function () {
            bgm = this.value;
            document.querySelector('#bgm-label').innerHTML = `BGM (${bgm}%)`;
        };

        sfxVol.oninput = function () {
            sfx = this.value;
            document.querySelector('#sfx-label').innerHTML = `SFX (${sfx}%)`;
        };

        fontSizeSlider.oninput = function () {
            let fontScale = this.value;
            document.querySelector('#font-label').innerHTML = `Font Size (${fontScale}%)`;
        };

        applyVol.onclick = function () {
            volume.master = master / 100;
            volume.bgm = (bgm / 100) / 2;
            volume.sfx = sfx / 100;
            fontSize.scale = fontSizeSlider.value / 100;
            bgmDungeon.stop();
            setVolume();
            applyFontSize();
            bgmDungeon.play();
            saveData();
            localStorage.setItem("fontSizeData", JSON.stringify(fontSize));
        };
    };

    // Export/Import Save Data
    exportImport.onclick = function () {
        sfxOpen.play();
        let exportedData = exportData();
        menuModalElement.style.display = "none";
        defaultModalElement.style.display = "flex";
        defaultModalElement.innerHTML = `
            <div class="content content-ei" id="ei-tab">
                <div class="content-head">
                    <h3>Export/Import Data</h3>
                    <p id="ei-close"><i class="fa fa-xmark"></i></p>
                </div>
                <h4>Export Data</h4>
                <input type="text" id="export-input" autocomplete="off" value="${exportedData}" readonly>
                <button id="copy-export">Copy</button>
                <br>
                <h4>Import Data</h4>
                <input type="text" id="import-input" autocomplete="off">
                <button id="data-import">Import</button>
            </div>`;
        let eiTab = document.querySelector('#ei-tab');
        eiTab.style.width = "17rem";
        let eiClose = document.querySelector('#ei-close');
        let copyExport = document.querySelector('#copy-export');
        let dataImport = document.querySelector('#data-import');
        let importInput = document.querySelector('#import-input');
        const copyToClipboard = (selector, btn) => {
            let copyText = document.querySelector(selector);
            copyText.select();
            copyText.setSelectionRange(0, 99999);
            navigator.clipboard.writeText(copyText.value);
            btn.innerHTML = "Copied!";
        }
        copyExport.onclick = function () {
            sfxConfirm.play();
            copyToClipboard('#export-input', copyExport);
        }
        dataImport.onclick = function () {
            importData(importInput.value);
        };
        eiClose.onclick = function () {
            sfxDecline.play();
            defaultModalElement.style.display = "none";
            defaultModalElement.innerHTML = "";
            menuModalElement.style.display = "flex";
        };
    };

    // Switch back to character creation from title screen
    if (heroReturn) {
        heroReturn.onclick = function () {
            sfxConfirm.play();
            menuModalElement.style.display = "none";
            menuModalElement.innerHTML = "";
            let dimTitle = document.querySelector('#title-screen');
            if (dimTitle) {
                dimTitle.style.filter = "brightness(100%)";
                dimTitle.style.display = "none";
            }
            showCharacterCreation();
        };
    }

    // Open bestiary modal
    bestiaryMenu.onclick = function () {
        openBestiaryModal();
    };

    // Close menu
    close.onclick = function () {
        sfxDecline.play();
        continueExploring();
        menuModalElement.style.display = "none";
        menuModalElement.innerHTML = "";
        if (dimDungeon && window.getComputedStyle(dimDungeon).display !== 'none') {
            dimDungeon.style.filter = "brightness(100%)";
        }
        if (dimTitle && window.getComputedStyle(dimTitle).display !== 'none') {
            dimTitle.style.filter = "brightness(100%)";
        }
    };
}

// Loading Screen
const runLoad = (id, display) => {
    let loader = document.querySelector("#loading");
    loader.style.display = "flex";
    setTimeout(async () => {
        loader.style.display = "none";
        document.querySelector(`#${id}`).style.display = `${display}`;
    }, 100);
}

// Display character creation screen and keep hardcore status in sync
const showCharacterCreation = () => {
    const checkbox = document.querySelector("#hardcore-checkbox");
    if (checkbox) {
        checkbox.checked = !!(player && player.hardcore);
    }
    const nameInput = document.querySelector("#name-input");
    if (nameInput && player && player.name) {
        nameInput.value = player.name;
    }
    runLoad("character-creation", "flex");
}

// Start the game
const enterDungeon = () => {
    sfxConfirm.play();
    document.querySelector("#title-screen").style.display = "none";
    runLoad("dungeon-main", "flex");
    initCompanions();
    if (player.inCombat) {
        enemy = JSON.parse(localStorage.getItem("enemyData"));
        showCombatInfo();
        startCombat(bgmBattleMain);
    } else {
        bgmDungeon.play();
    }
    if (player.stats.hp == 0) {
        progressReset(true);
    }
    initialDungeonLoad();
    playerLoadStats();
}

// Save all the data into local storage
let isSaving = false;
const saveData = () => {
    if (isSaving) return; // Prevent overlapping saves
    isSaving = true;
    try {
        let playerData, dungeonData, enemyData, volumeData;
        try {
            playerData = JSON.stringify(player);
            dungeonData = JSON.stringify(dungeon);
            enemyData = JSON.stringify(enemy);
            volumeData = JSON.stringify(volume);
        } catch (jsonErr) {
            console.error("Failed to stringify data for saving:", jsonErr);
            isSaving = false;
            return;
        }
        // Only save if all data is valid JSON
        localStorage.setItem("playerData", playerData);
        localStorage.setItem("dungeonData", dungeonData);
        localStorage.setItem("enemyData", enemyData);
        localStorage.setItem("volumeData", volumeData);
    } finally {
        isSaving = false;
    }
}

// Calculate every player stat
const calculateStats = () => {
    let equipmentAtkSpd = player.baseStats.atkSpd * (player.equippedStats.atkSpd / 100);
    let playerHpBase = player.baseStats.hp;
    let playerAtkBase = player.baseStats.atk;
    let playerDefBase = player.baseStats.def;
    let playerAtkSpdBase = player.baseStats.atkSpd;
    let playerVampBase = player.baseStats.vamp;
    let playerCRateBase = player.baseStats.critRate;
    let playerCDmgBase = player.baseStats.critDmg;
    let playerDodgeBase = player.baseStats.dodge;

    // Initialize floor buffs if they don't exist
    if (dungeon.floorBuffs == undefined) {
        dungeon.floorBuffs = {
            atk: 0,
            def: 0,
            atkSpd: 0,
            currentFloor: dungeon.progress.floor,
        };
    }

    player.stats.hpMax = Math.round((playerHpBase + playerHpBase * (player.bonusStats.hp / 100)) + player.equippedStats.hp);
    player.stats.atk = Math.round(((playerAtkBase + playerAtkBase * (player.bonusStats.atk / 100)) + player.equippedStats.atk) * (1 + (dungeon.floorBuffs.atk / 100)));
    player.stats.def = Math.round(((playerDefBase + playerDefBase * (player.bonusStats.def / 100)) + player.equippedStats.def) * (1 + (dungeon.floorBuffs.def / 100)));
    player.stats.atkSpd = (playerAtkSpdBase + playerAtkSpdBase * (player.bonusStats.atkSpd / 100) + playerAtkSpdBase * (dungeon.floorBuffs.atkSpd / 100)) + equipmentAtkSpd + (equipmentAtkSpd * (player.equippedStats.atkSpd / 100));
    player.stats.vamp = playerVampBase + player.bonusStats.vamp + player.equippedStats.vamp;
    player.stats.critRate = playerCRateBase + player.bonusStats.critRate + player.equippedStats.critRate;
    if (player.stats.critRate > 100) {
        player.stats.critRate = 100;
    }
    player.stats.critDmg = playerCDmgBase + player.bonusStats.critDmg + player.equippedStats.critDmg;
    player.stats.dodge = playerDodgeBase + player.bonusStats.dodge + player.equippedStats.dodge;
    if (player.stats.dodge > 75) {
        player.stats.dodge = 75;
    }
    if (player.stats.atkSpd > 2.5) {
        player.stats.atkSpd = 2.5;
    }
}

// Resets the progress back to start. If `fromDeath` is true and hardcore mode
// is enabled, inventory, equipped items and gold are wiped.
const progressReset = (fromDeath = false) => {
    if (fromDeath && player.hardcore) {
        player.inventory = {
            consumables: [],
            equipment: []
        };
        player.equipped = [];
        player.equippedStats = {
            hp: 0,
            atk: 0,
            def: 0,
            pen: 0,
            atkSpd: 0,
            vamp: 0,
            critRate: 0,
            critDmg: 0,
            hpPct: 0,
            atkPct: 0,
            defPct: 0,
            penPct: 0,
        };
        player.gold = 0;
        calculateStats();
    }
    player.stats.hp = player.stats.hpMax;
    player.lvl = 1;
    player.blessing = 1;
    player.exp = {
        expCurr: 0,
        expMax: 100,
        expCurrLvl: 0,
        expMaxLvl: 100,
        lvlGained: 0
    };
    player.bonusStats = {
        hp: 0,
        atk: 0,
        def: 0,
        atkSpd: 0,
        vamp: 0,
        critRate: 0,
        critDmg: 0,
        dodge: 0
    };
    player.inCombat = false;
    dungeon.progress.floor = 1;
    dungeon.progress.room = 1;
    dungeon.statistics.kills = 0;
    dungeon.status = {
        exploring: false,
        paused: true,
        event: false,
    };
    dungeon.settings = {
        enemyBaseLvl: 1,
        enemyLvlGap: 5,
        enemyBaseStats: 1,
        enemyScaling: 1.1,
    };
    dungeon.floorBuffs = {
        atk: 0,
        def: 0,
        atkSpd: 0,
        currentFloor: 1,
    };
    delete dungeon.enemyMultipliers;
    delete player.allocated;
    dungeon.backlog.length = 0;
    dungeon.action = 0;
    dungeon.statistics.runtime = 0;
    combatBacklog.length = 0;
    playerCompanions = [];
    activeCompanion = null;
    saveCompanions();
    saveData();
}

// Export and Import Save Data
const exportData = () => {
    const exportedData = btoa(JSON.stringify(player));
    return exportedData;
}

const importData = (importedData) => {
    try {
        let playerImport = JSON.parse(atob(importedData));
        if (playerImport.inventory !== undefined) {
            sfxOpen.play();
            defaultModalElement.style.display = "none";
            confirmationModalElement.style.display = "flex";
            confirmationModalElement.innerHTML = `
            <div class="content">
                <p>Are you sure you want to import this data? This will erase the current data and reset your dungeon progress.</p>
                <div class="button-container">
                    <button id="import-btn">Import</button>
                    <button id="cancel-btn">Cancel</button>
                </div>
            </div>`;
            let confirm = document.querySelector("#import-btn");
            let cancel = document.querySelector("#cancel-btn");
            confirm.onclick = function () {
                sfxConfirm.play();
                if (typeof playerImport.playtime !== 'number' || !Number.isFinite(playerImport.playtime)) {
                    playerImport.playtime = 0;
                }
                player = playerImport;
                saveData();
                bgmDungeon.stop();
                let dimDungeon = document.querySelector('#dungeon-main');
                dimDungeon.style.filter = "brightness(100%)";
                dimDungeon.style.display = "none";
                let titleScreen = document.querySelector('#title-screen');
                if (titleScreen) {
                    titleScreen.style.filter = "brightness(100%)";
                }
                menuModalElement.style.display = "none";
                menuModalElement.innerHTML = "";
                confirmationModalElement.style.display = "none";
                confirmationModalElement.innerHTML = "";
                defaultModalElement.style.display = "none";
                defaultModalElement.innerHTML = "";
                runLoad("title-screen", "flex");
                clearInterval(dungeonTimer);
                clearInterval(playTimer);
                progressReset();
            }
            cancel.onclick = function () {
                sfxDecline.play();
                confirmationModalElement.style.display = "none";
                confirmationModalElement.innerHTML = "";
                defaultModalElement.style.display = "flex";
            }
        } else {
            sfxDeny.play();
        }
    } catch (err) {
        sfxDeny.play();
    }
}

// Player Stat Allocation
const allocationPopup = () => {
    let allocation = player.allocationChoices ? { ...player.allocationChoices } : {
        hp: 10,
        atk: 10,
        def: 10,
        atkSpd: 10
    };
    let stats;
    const updateStats = () => {
        stats = {
            hp: 50 * allocation.hp,
            atk: 10 * allocation.atk,
            def: 10 * allocation.def,
            atkSpd: 0.4 + (0.02 * allocation.atkSpd)
        }
    }
    updateStats();
    let points = 40 - (allocation.hp + allocation.atk + allocation.def + allocation.atkSpd);
    if (points < 0) { points = 0; }
    const loadContent = function () {
        defaultModalElement.innerHTML = `
        <div class="content" id="allocate-stats">
            <div class="content-head">
                <h3>Allocate Stats</h3>
                <p id="allocate-close"><i class="fa fa-xmark"></i></p>
            </div>
            <div class="row">
                <p><i class="fas fa-heart"></i><span id="hpDisplay">HP: ${stats.hp}</span></p>
                <div class="row">
                    <button id="hpMin">-</button>
                    <span id="hpAllo">${allocation.hp}</span>
                    <button id="hpAdd">+</button>
                </div>
            </div>
            <div class="row">
                <p><i class="ra ra-sword"></i><span id="atkDisplay">ATK: ${stats.atk}</span></p>
                <div class="row">
                    <button id="atkMin">-</button>
                    <span id="atkAllo">${allocation.atk}</span>
                    <button id="atkAdd">+</button>
                </div>
            </div>
            <div class="row">
                <p><i class="ra ra-round-shield"></i><span id="defDisplay">DEF: ${stats.def}</span></p>
                <div class="row">
                    <button id="defMin">-</button>
                    <span id="defAllo">${allocation.def}</span>
                    <button id="defAdd">+</button>
                </div>
            </div>
            <div class="row">
                <p><i class="ra ra-plain-dagger"></i><span id="atkSpdDisplay">ATK.SPD: ${stats.atkSpd.toFixed(2)}</span></p>
                <div class="row">
                    <button id="atkSpdMin">-</button>
                    <span id="atkSpdAllo">${allocation.atkSpd}</span>
                    <button id="atkSpdAdd">+</button>
                </div>
            </div>
            <div class="row">
                <p id="alloPts">Stat Points: ${points}/20</p>
                <button id="allocate-reset">Reset</button>
            </div>
            <div class="row">
                <p>Passive</p>
                <select id="select-skill">
                    <option value="Remnant Razor">Remnant Razor</option>
                    <option value="Titan's Will">Titan's Will</option>
                    <option value="Devastator">Devastator</option>
                    <option value="Blade Dance">Blade Dance</option>
                    <option value="Paladin's Heart">Paladin's Heart</option>
                    <option value="Aegis Thorns">Aegis Thorns</option>
                </select>
            </div>
            <div class="row primary-panel pad">
                <p id="skill-desc">Attacks deal extra 8% of enemies' current health on hit.</p>
            </div>
            <div class="row" id="forge-button-row" style="margin-top: 15px;display:none">
                <button id="open-forge-btn" style="width: 100%; margin-bottom: 10px;"><i class="ra ra-anvil"></i> The Forge</button>
            </div>
            <button id="allocate-confirm">Confirm</button>
        </div>`;
    }
    defaultModalElement.style.display = "flex";
    document.querySelector("#title-screen").style.filter = "brightness(50%)";
    loadContent();

    // Show forge button if player has any equipment or inventory items
    if (player.inventory.equipment.length > 0 || player.equipped.length > 0) {
        const forgeRow = document.querySelector("#forge-button-row");
        if (forgeRow) {
            forgeRow.style.display = "flex";
        }
    }

    // Stat Allocation
    const handleStatButtons = (e) => {
        let rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
        if (e.includes("Add")) {
            let stat = e.split("Add")[0];
            if (points > 0) {
                sfxConfirm.play();
                allocation[stat]++;
                points--;
                updateStats();
                document.querySelector(`#${stat}Display`).innerHTML = `${stat.replace(/([A-Z])/g, ' $1').trim().replace(/ /g, '.').toUpperCase()}: ${stats[stat].toFixed(2).replace(rx, "$1")}`;
                document.querySelector(`#${stat}Allo`).innerHTML = allocation[stat];
                document.querySelector(`#alloPts`).innerHTML = `Stat Points: ${points}/20`;
            } else {
                sfxDeny.play();
            }
        } else if (e.includes("Min")) {
            let stat = e.split("Min")[0];
            if (allocation[stat] > 5) {
                sfxConfirm.play();
                allocation[stat]--;
                points++;
                updateStats();
                document.querySelector(`#${stat}Display`).innerHTML = `${stat.replace(/([A-Z])/g, ' $1').trim().replace(/ /g, '.').toUpperCase()}: ${stats[stat].toFixed(2).replace(rx, "$1")}`;
                document.querySelector(`#${stat}Allo`).innerHTML = allocation[stat];
                document.querySelector(`#alloPts`).innerHTML = `Stat Points: ${points}/20`;
            } else {
                sfxDeny.play();
            }
        }
    }
    document.querySelector("#hpAdd").onclick = function () {
        handleStatButtons("hpAdd")
    };
    document.querySelector("#hpMin").onclick = function () {
        handleStatButtons("hpMin")
    };
    document.querySelector("#atkAdd").onclick = function () {
        handleStatButtons("atkAdd")
    };
    document.querySelector("#atkMin").onclick = function () {
        handleStatButtons("atkMin")
    };
    document.querySelector("#defAdd").onclick = function () {
        handleStatButtons("defAdd")
    };
    document.querySelector("#defMin").onclick = function () {
        handleStatButtons("defMin")
    };
    document.querySelector("#atkSpdAdd").onclick = function () {
        handleStatButtons("atkSpdAdd")
    };
    document.querySelector("#atkSpdMin").onclick = function () {
        handleStatButtons("atkSpdMin")
    };

    // Passive skills
    let selectSkill = document.querySelector("#select-skill");
    let skillDesc = document.querySelector("#skill-desc");
    selectSkill.value = player.selectedPassive || "Remnant Razor";
    selectSkill.onclick = function () {
        sfxConfirm.play();
    }
    selectSkill.onchange = function () {
        if (selectSkill.value == "Remnant Razor") {
            skillDesc.innerHTML = "Attacks deal extra 8% of enemies' current health on hit.";
        }
        if (selectSkill.value == "Titan's Will") {
            skillDesc.innerHTML = "Attacks deal extra 4% of your maximum health on hit.";
        }
        if (selectSkill.value == "Devastator") {
            skillDesc.innerHTML = "Deal 30% more damage but you lose 30% base attack speed.";
        }
        if (selectSkill.value == "Rampager") {
            skillDesc.innerHTML = "Increase attack by 5 after each hit. Stack resets after battle.";
        }
        if (selectSkill.value == "Blade Dance") {
            skillDesc.innerHTML = "Gain increased attack speed after each hit. Stack resets after battle.";
        }
        if (selectSkill.value == "Paladin's Heart") {
            skillDesc.innerHTML = "You receive 25% less damage permanently.";
        }
        if (selectSkill.value == "Aegis Thorns") {
            skillDesc.innerHTML = "Enemies receive 15% of the damage they dealt.";
        }
    }
    selectSkill.onchange();

    // Operation Buttons
    let confirm = document.querySelector("#allocate-confirm");
    let reset = document.querySelector("#allocate-reset");
    let close = document.querySelector("#allocate-close");
    let forgeBtn = document.querySelector("#open-forge-btn");
    
    // The Forge button click function (only if forge button exists)
    if (forgeBtn) {
        forgeBtn.onclick = function () {
            openForgeModal();
        };
    }
    confirm.onclick = function () {
        if (points > 0) {
            sfxDeny.play();
            return;
        }
        // Set allocated stats to player base stats
        player.baseStats = {
            hp: stats.hp,
            atk: stats.atk,
            def: stats.def,
            pen: 0,
            atkSpd: stats.atkSpd,
            vamp: 0,
            critRate: 0,
            critDmg: 50
        }

        // Save allocation choices
        player.allocationChoices = { ...allocation };
        player.selectedPassive = selectSkill.value;

        // Set player skill
        objectValidation();
        player.skills = [selectSkill.value];
        if (selectSkill.value == "Devastator") {
            player.baseStats.atkSpd = player.baseStats.atkSpd - ((30 * player.baseStats.atkSpd) / 100);
        }

        // Proceed to dungeon
        player.allocated = true;
        enterDungeon();
        player.stats.hp = player.stats.hpMax;
        playerLoadStats();
        saveData();
        defaultModalElement.style.display = "none";
        defaultModalElement.innerHTML = "";
        document.querySelector("#title-screen").style.filter = "brightness(100%)";
    }
    reset.onclick = function () {
        sfxDecline.play();
        allocation = {
            hp: 5,
            atk: 5,
            def: 5,
            atkSpd: 5
        };
        points = 20;
        updateStats();

        // Display Reset
        document.querySelector(`#hpDisplay`).innerHTML = `HP: ${stats.hp}`;
        document.querySelector(`#atkDisplay`).innerHTML = `ATK: ${stats.atk}`;
        document.querySelector(`#defDisplay`).innerHTML = `DEF: ${stats.def}`;
        document.querySelector(`#atkSpdDisplay`).innerHTML = `ATK.SPD: ${stats.atkSpd}`;
        document.querySelector(`#hpAllo`).innerHTML = allocation.hp;
        document.querySelector(`#atkAllo`).innerHTML = allocation.atk;
        document.querySelector(`#defAllo`).innerHTML = allocation.def;
        document.querySelector(`#atkSpdAllo`).innerHTML = allocation.atkSpd;
        document.querySelector(`#alloPts`).innerHTML = `Stat Points: ${points}/20`;
    }
    close.onclick = function () {
        sfxDecline.play();
        defaultModalElement.style.display = "none";
        defaultModalElement.innerHTML = "";
        document.querySelector("#title-screen").style.filter = "brightness(100%)";
    }
    initializeForge();
}

const objectValidation = () => {
    if (player.skills == undefined) {
        player.skills = [];
    }
    if (player.allocationChoices == undefined) {
        player.allocationChoices = { hp: 10, atk: 10, def: 10, atkSpd: 10 };
    }
    if (player.selectedPassive == undefined) {
        player.selectedPassive = "Remnant Razor";
    }
    if (player.tempStats == undefined) {
        player.tempStats = {};
        player.tempStats.atk = 0;
        player.tempStats.atkSpd = 0;
    }
    if (player.baseStats && player.baseStats.dodge === undefined) {
        player.baseStats.dodge = 0;
    }
    if (player.stats && player.stats.dodge === undefined) {
        player.stats.dodge = 0;
    }
    if (player.bonusStats && player.bonusStats.dodge === undefined) {
        player.bonusStats.dodge = 0;
    }
    if (player.equippedStats && player.equippedStats.dodge === undefined) {
        player.equippedStats.dodge = 0;
    }
    saveData();
}
