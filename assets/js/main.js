// Use DOMContentLoaded so interactions are available as soon as the DOM is ready
// rather than waiting for all assets to finish loading
window.addEventListener("DOMContentLoaded", async function () {
    // Apply saved font size on page load
    const advancedStatsDetails = document.querySelector('#advanced-stats');
    const bonusStatsBox = document.querySelector('#bonus-stats');
    const companionBonus = document.querySelector('#companion-bonus');
    if (advancedStatsDetails && bonusStatsBox) {
        const syncBonusVisibility = () => {
            const showAdvanced = advancedStatsDetails.open;
            if (showAdvanced) {
                bonusStatsBox.removeAttribute('hidden');
            } else {
                bonusStatsBox.setAttribute('hidden', 'true');
            }
            if (companionBonus) {
                if (showAdvanced) {
                    companionBonus.removeAttribute('hidden');
                } else {
                    companionBonus.setAttribute('hidden', 'true');
                }
            }
        };
        advancedStatsDetails.addEventListener('toggle', syncBonusVisibility);
        syncBonusVisibility();
    }

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

    const clearLogButton = document.querySelector('#clear-log-button');
    if (clearLogButton) {
        clearLogButton.addEventListener('click', () => {
            if (typeof clearDungeonLog === 'function') {
                clearDungeonLog();
                sfxConfirm.play();
            }
        });
    }

    const endgameStartButton = document.querySelector('#endgame-start-btn');
    if (endgameStartButton) {
        endgameStartButton.addEventListener('click', () => {
            if (typeof startNewRunAfterDeath === 'function') {
                startNewRunAfterDeath();
            }
        });
    }

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
                        dodge: null,
                        luck: 0,
                        fasterRun: 0
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
                        dodge: 0,
                        fasterRun: 0
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
                        fasterRun: 0,
                        luck: 0,
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
                        dodge: 0,
                        luck: 0,
                        fasterRun: 0
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
                    preferences: {
                        equipBestUseCustom: false,
                        equipBestPriorities: []
                    },
                    allocationChoices: {
                        hp: 10,
                        atk: 10,
                        def: 10,
                        atkSpd: 10
                    },
                    hardcore: hardcore,
                    selectedPassive: "Remnant Razor",
                    selectedClass: "Knight",
                    selectedCurseLevel: 1,
                    maxUnlockedCurseLevel: 1
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
                            fasterRun: 0,
                            luck: 0,
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

    // Keyboard shortcuts for the primary choice buttons
    const isTypingElement = function (element) {
        if (!element) {
            return false;
        }
        const tag = element.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || element.isContentEditable;
    };

    document.addEventListener('keydown', function (event) {
        if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey) {
            return;
        }

        if (isTypingElement(document.activeElement)) {
            return;
        }

        let targetButton = null;
        const isChoice1Key = !event.shiftKey && (event.key === '1' || event.code === 'Digit1' || event.code === 'Numpad1');
        const isChoice2Key = !event.shiftKey && (event.key === '2' || event.code === 'Digit2' || event.code === 'Numpad2');

        if (isChoice1Key) {
            const lvlupPanel = document.querySelector('#lvlupPanel');
            if (lvlupPanel && lvlupPanel.style.display === 'flex') {
                const firstLevelUpOption = lvlupPanel.querySelector('[id^="lvlSlot"]');
                if (firstLevelUpOption) {
                    event.preventDefault();
                    return;
                }
            }
            if (player && player.inCombat && typeof playerAttackReady !== 'undefined' && playerAttackReady && typeof playerAttack === 'function') {
                playerAttack();
                event.preventDefault();
                return;
            }
            targetButton = document.querySelector('#choice1');
            if (!targetButton && combatPanel.style.display === 'flex') {
                targetButton = document.querySelector('#battleButton');
            }
        } else if (isChoice2Key) {
            targetButton = document.querySelector('#choice2');
            if (!targetButton) {
                targetButton = document.querySelector('#special-ability-btn');
            }
        }

        if (targetButton && !targetButton.disabled) {
            targetButton.click();
            event.preventDefault();
        }
    });

    // Unequip all items
    document.querySelector("#unequip-all").addEventListener("click", function () {
        sfxOpen.play();

        dungeon.status.exploring = false;
        let dimTarget = document.querySelector('#inventory');
        dimTarget.style.filter = "brightness(50%)";
        defaultModalElement.style.display = "flex";
        defaultModalElement.innerHTML = `
        <div class="content">
            <p>${t('unequip-all-items')}</p>
            <div class="button-container">
                <button id="unequip-confirm">${t('unequip')}</button>
                <button id="unequip-cancel">${t('close')}</button>
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

    const equipBestBtn = document.querySelector("#equip-best");
    if (equipBestBtn) {
        equipBestBtn.addEventListener("click", function () {
            equipBest();
        });
    }
    const equipBestSettingsBtn = document.querySelector("#equip-best-settings");
    if (equipBestSettingsBtn && typeof openEquipBestSettings === 'function') {
        equipBestSettingsBtn.addEventListener("click", function () {
            openEquipBestSettings();
        });
    }

    ["#menu-btn", "#title-menu-btn"].forEach(id => {
        const btn = document.querySelector(id);
        if (btn) btn.addEventListener("click", function(e) {
            if (id === "#title-menu-btn") e.stopPropagation();
            openMenu(id === "#title-menu-btn");
        });
    });
    applyFontSize();
    setVolume();
    ratingSystem.init();
    loadBestiary();
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
                <h3 data-i18n="menu">Menu</h3>
                <p id="close-menu"><i class="fa fa-xmark"></i></p>
            </div>
            <button id="player-menu"><i class="fas fa-user"></i>${player.name}</button>
            ${isTitle ? '' : '<button id="stats"><i class="fas fa-chart-line"></i> <span data-i18n="current-run">Current Run</span></button>'}
            <button id="bestiary-menu"><i class="fas fa-book"></i> <span data-i18n="bestiary">Bestiary</span></button>
            <button id="volume-btn"><i class="fas fa-cog"></i> <span data-i18n="settings">Settings</span></button>
            <button id="auto-mode-settings"><i class="fas fa-play"></i> <span data-i18n="auto-mode">Auto Mode</span></button>
            <button id="export-import"><i class="fas fa-file-export"></i> <span data-i18n="export-import-data">Export/Import Data</span></button>
            ${isTitle ? '<button id="hero-return"><i class="fas fa-user-circle"></i> <span data-i18n="hero-creation">Hero Creation</span></button>' : '<button id="quit-run"><i class="fas fa-door-open"></i> <span data-i18n="abandon">Abandon</span></button>'}
            <button id="rate-game"><i class="fas fa-star"></i> <span data-i18n="rate-game">Rate Game</span> <i class="fas fa-arrow-up-right-from-square external-link-icon"></i></button>
            <button id="reddit-link" style="background:#ff4500;color:#fff;"><i class="fab fa-reddit"></i> <span data-i18n="subreddit">Subreddit</span> <i class="fas fa-arrow-up-right-from-square external-link-icon"></i></button>
        </div>`;
    applyTranslations();
    let close = document.querySelector('#close-menu');
    let playerMenu = document.querySelector('#player-menu');
    let runMenu = document.querySelector('#stats');
    let quitRun = document.querySelector('#quit-run');
    let heroReturn = document.querySelector('#hero-return');
    let exportImport = document.querySelector('#export-import');
    let bestiaryMenu = document.querySelector('#bestiary-menu');
    let volumeSettings = document.querySelector('#volume-btn');
    let autoModeSettings = document.querySelector('#auto-mode-settings');
    let redditLink = document.querySelector('#reddit-link');
    let rateGameBtn = document.querySelector('#rate-game');
    // Reddit button click function
    redditLink.onclick = function () {
        openExternal('https://www.reddit.com/r/QuickDungeonCrawler/');
    }

    // Rate game button click function
    rateGameBtn.onclick = function () {
        ratingSystem.openRating();
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
                    <h3 data-i18n="statistics">Statistics</h3>
                    <p id="profile-close"><i class="fa fa-xmark"></i></p>
                </div>
                <p>${player.name}</p>
                <p><span data-i18n="hardcore">Hardcore</span>: ${player.hardcore ? '<span data-i18n="yes">Yes</span>' : '<span data-i18n="no">No</span>'}</p>
                <p><span data-i18n="kills">Kills</span>: ${nFormatter(player.kills)}</p>
                <p><span data-i18n="deaths">Deaths</span>: ${nFormatter(player.deaths)}</p>
                <p><span data-i18n="playtime">Playtime</span>: ${playTime}</p>
            </div>`;
        applyTranslations(defaultModalElement);
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
                        <h3 data-i18n="current-run">Current Run</h3>
                        <p id="run-close"><i class="fa fa-xmark"></i></p>
                    </div>
                    <p>${player.selectedClass} Lv.${player.lvl} (${player.skills})</p>
                    <p>${t('blessings')}: Lvl.${player.blessing}</p>
                    <p>${t('curse')}: Lvl.${Math.round((dungeon.settings.enemyScaling - 1) * 10)}</p>
                    <p>${t('kills')}: ${nFormatter(dungeon.statistics.kills)}</p>
                    <p>${t('runtime')}: ${runTime}</p>
                </div>`;
            applyTranslations(defaultModalElement);
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
                    <p data-i18n="abandon-run-question">${t('abandon-run-question')}</p>
                    <div class="button-container">
                        <button id="quit-run" data-i18n="abandon">${t('abandon')}</button>
                        <button id="cancel-quit" data-i18n="cancel">${t('cancel')}</button>
                    </div>
                </div>`;
            applyTranslations(defaultModalElement);
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

    // Opens the volume/settings modal
    volumeSettings.onclick = function () {
        sfxOpen.play();

        let master = volume.master * 100;
        let bgm = (volume.bgm * 100) * 2;
        let sfx = volume.sfx * 100;
        let fontScale = Math.round(fontSize.scale * 100);
        const fontOptions = Array.isArray(window.fontFamilyOptions) ? window.fontFamilyOptions : [];
        const defaultFontKey = window.defaultFontFamilyKey || 'futura';
        const currentFontKey = fontOptions.some(option => option.key === fontSize.family) ? fontSize.family : defaultFontKey;
        if (fontOptions.length && fontSize.family !== currentFontKey) {
            fontSize.family = currentFontKey;
        }
        const fontFamilyOptionsMarkup = fontOptions.map(option => {
            const selected = option.key === currentFontKey ? 'selected' : '';
            return `<option value="${option.key}" ${selected} data-i18n="font-family-${option.key}">${option.label}</option>`;
        }).join('');
        const availableLanguages = (Array.isArray(window.languageOptions) && window.languageOptions.length)
            ? window.languageOptions
            : (Array.isArray(window.supportedLanguages) && window.supportedLanguages.length
                ? window.supportedLanguages.map(code => ({ code, label: code }))
                : [{ code: 'en', label: 'English' }]);
        const languageOptionsMarkup = availableLanguages.map(({ code, label }) => {
            return `<option value="${code}">${label}</option>`;
        }).join('');
        // Log flow setting
        let logFlow = (localStorage.getItem('logFlow') || 'bottom');
        // Only allow changing logFlow while resting with no open choices
        const hasOpenChoices = !!(document.querySelector('#choice1') || document.querySelector('#choice2'));
        const dimTitle = document.querySelector('#title-screen');
        const onTitleScreen = !!(dimTitle && window.getComputedStyle(dimTitle).display !== 'none');
        const canChangeLogFlow = onTitleScreen || (typeof dungeon !== 'undefined' && dungeon.status && dungeon.status.paused && !dungeon.status.event && !hasOpenChoices);
        menuModalElement.style.display = "none";
        defaultModalElement.style.display = "flex";
        defaultModalElement.innerHTML = `
            <div class="content" id="volume-tab">
                <div class="content-head">
                    <h3 data-i18n="settings">Settings</h3>
                    <p id="volume-close"><i class="fa fa-xmark"></i></p>
                </div>
                <label id="master-label" for="master-volume">Master (${master}%)</label>
                <input type="range" id="master-volume" min="0" max="100" value="${master}">
                <label id="bgm-label" for="bgm-volume">BGM (${bgm}%)</label>
                <input type="range" id="bgm-volume" min="0" max="100" value="${bgm}">
                <label id="sfx-label" for="sfx-volume">SFX (${sfx}%)</label>
                <input type="range" id="sfx-volume" min="0" max="100" value="${sfx}">
                <label id="font-label" for="font-size"><span data-i18n="font-size">Font Size</span> (${fontScale}%)</label>
                <input type="range" id="font-size" min="75" max="150" value="${fontScale}">
                ${fontOptions.length ? `
                <label id="font-family-label" for="font-family-select" data-i18n="font-family">Font Family</label>
                <select id="font-family-select">
                    ${fontFamilyOptionsMarkup}
                </select>` : ''}
                <label id="logflow-label" for="logflow-select" data-i18n="log-flow">Log Flow</label>
                <select id="logflow-select" ${!canChangeLogFlow ? 'disabled' : ''}>
                    <option value="bottom" ${logFlow === 'bottom' ? 'selected' : ''} data-i18n="log-flow-bottom-to-top">Bottom to top (newest last)</option>
                    <option value="top" ${logFlow === 'top' ? 'selected' : ''} data-i18n="log-flow-top-to-bottom">Top to bottom (newest first)</option>
                </select>
                <label id="language-label" for="language-select" data-i18n="language">Language</label>
                <select id="language-select">
                    ${languageOptionsMarkup}
                </select>
                <br><button id="apply-volume" data-i18n="apply">Apply</button>
            </div>`;
        applyTranslations();
        let masterVol = document.querySelector('#master-volume');
        let bgmVol = document.querySelector('#bgm-volume');
        let sfxVol = document.querySelector('#sfx-volume');
        let fontSizeSlider = document.querySelector('#font-size');
        let languageSelect = document.querySelector('#language-select');
        let fontFamilySelect = document.querySelector('#font-family-select');
        let logFlowSelect = document.querySelector('#logflow-select');
        let selectedLang = localStorage.getItem('lang') || 'en';
        languageSelect.value = selectedLang;
        languageSelect.onchange = function () {
            selectedLang = this.value;
        };
        logFlowSelect.onchange = function () {
            // Guard: only allow change if resting and no choices are open
            const hasOpenChoices = !!(document.querySelector('#choice1') || document.querySelector('#choice2'));
            const dimTitle = document.querySelector('#title-screen');
            const onTitleScreen = !!(dimTitle && window.getComputedStyle(dimTitle).display !== 'none');
            const canChange = onTitleScreen || (typeof dungeon !== 'undefined' && dungeon.status && dungeon.status.paused && !dungeon.status.event && !hasOpenChoices);
            if (!canChange) {
                // Revert UI selection to the stored value
                this.value = (localStorage.getItem('logFlow') || 'bottom');
                return;
            }
            logFlow = this.value;
        };
        let applyVol = document.querySelector('#apply-volume');
        let volumeTab = document.querySelector('#volume-tab');
        volumeTab.style.width = "15rem";
        let volumeClose = document.querySelector('#volume-close');
        const closeSettingsModal = () => {
            defaultModalElement.style.display = "none";
            defaultModalElement.innerHTML = "";
            menuModalElement.style.display = "flex";
        };
        volumeClose.onclick = function () {
            sfxDecline.play();
            closeSettingsModal();
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
            if (fontFamilySelect) {
                fontSize.family = fontFamilySelect.value;
            }
            let wasPlaying = bgmDungeon && bgmDungeon.playing();
            if (wasPlaying) {
                bgmDungeon.stop();
            }
            setVolume();
            applyFontSize();
            if (wasPlaying) {
                bgmDungeon.play();
            }
            localStorage.setItem("volumeData", JSON.stringify(volume));
            localStorage.setItem("fontSizeData", JSON.stringify(fontSize));
            // Apply log flow if allowed and valid
            if ((logFlow === 'top' || logFlow === 'bottom')) {
                const hasOpenChoices = !!(document.querySelector('#choice1') || document.querySelector('#choice2'));
                const dimTitle = document.querySelector('#title-screen');
                const onTitleScreen = !!(dimTitle && window.getComputedStyle(dimTitle).display !== 'none');
                const canChange = onTitleScreen || (typeof dungeon !== 'undefined' && dungeon.status && dungeon.status.paused && !dungeon.status.event && !hasOpenChoices);
                if (canChange) {
                    localStorage.setItem('logFlow', logFlow);
                    if (typeof updateDungeonLog === 'function') {
                        // Refresh the current log rendering to reflect flow setting
                        try { updateDungeonLog(); } catch {}
                    }
                }
            }
            const languageResult = setLanguage(selectedLang);
            if (languageResult && typeof languageResult.then === 'function') {
                languageResult.then(closeSettingsModal).catch(closeSettingsModal);
            } else {
                closeSettingsModal();
            }
        };
    };

    // Function to render the auto mode settings modal
    window.renderAutoModeSettingsModal = function () {
        sfxOpen.play();
        const autoSellLevelOptions = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
        const autoSellBelowLevelSelected = Number.isNaN(autoSellBelowLevel)
            ? 0
            : Math.max(0, Math.min(90, Math.floor(autoSellBelowLevel / 10) * 10));
        const autoSellLevelOptionsMarkup = autoSellLevelOptions.map((value) => (
            `<option value="${value}" ${autoSellBelowLevelSelected === value ? 'selected' : ''}>${value}</option>`
        )).join('');

        menuModalElement.style.display = "none";
        defaultModalElement.style.display = "flex";
        defaultModalElement.innerHTML = `
            <div class="content" id="auto-tab">
                <div class="content-head">
                    <h3 data-i18n="auto-mode">Auto Mode</h3>
                    <p id="auto-close"><i class="fa fa-xmark"></i></p>
                </div>
                <p data-i18n="auto-mode-description">Automatically engage enemies, claim loot and open doors.</p>
                ${!autoModeUnlocked ? '<button id="unlock-auto" data-i18n="auto-mode-unlock">Unlock Auto Mode (Premium)</button>' : ''}
                <label id="auto-label"><input type="checkbox" id="auto-mode-toggle" ${autoModeBtnVisible && autoModeUnlocked ? 'checked' : ''} ${!autoModeUnlocked ? 'disabled' : ''}> <span data-i18n="auto-mode-show-button">Show Auto Button</span></label>
                <label id="auto-engage-label"><input type="checkbox" id="auto-engage-toggle" ${autoEngage ? 'checked' : ''}> <span data-i18n="engage">Engage</span></label>
                <label id="auto-bless-label"><input type="checkbox" id="auto-bless-toggle" ${autoBlessings ? 'checked' : ''}> <span data-i18n="blessings">Blessings</span></label>
                <label id="auto-heal-label"><input type="checkbox" id="auto-heal-toggle" ${autoHeal ? 'checked' : ''}> <span data-i18n="heal">Heal</span></label>
                <label id="auto-special-label"><input type="checkbox" id="auto-special-toggle" ${autoSpecialAbility ? 'checked' : ''}> <span data-i18n="auto-special-ability">Special Ability</span></label>
                <label id="auto-bossdoor-label"><input type="checkbox" id="auto-bossdoor-toggle" ${autoBossDoors ? 'checked' : ''}> <span data-i18n="boss-doors">Boss Doors</span></label>
                <label id="auto-sell-rarity-label"><span data-i18n="auto-sell-rarity">"Auto-sell below rarity"</span> <select id="auto-sell-rarity-select">
                    <option value="none" ${autoSellRarity === 'none' ? 'selected' : ''} data-i18n="auto-sell-off">Off</option>
                    <option value="Uncommon" ${autoSellRarity === 'Uncommon' ? 'selected' : ''} data-i18n="uncommon">Uncommon</option>
                    <option value="Rare" ${autoSellRarity === 'Rare' ? 'selected' : ''} data-i18n="rare">Rare</option>
                    <option value="Epic" ${autoSellRarity === 'Epic' ? 'selected' : ''} data-i18n="epic">Epic</option>
                    <option value="Legendary" ${autoSellRarity === 'Legendary' ? 'selected' : ''} data-i18n="legendary">Legendary</option>
                    <option value="Heirloom" ${autoSellRarity === 'Heirloom' ? 'selected' : ''} data-i18n="heirloom">Heirloom</option>
                </select></label>
                <label id="auto-sell-level-label"><span data-i18n="auto-sell-level">Auto-sell below level</span> <select id="auto-sell-level-input">${autoSellLevelOptionsMarkup}</select></label>
                <label id="auto-doorignore-label"><span data-i18n="ignore-doors">Doors to Ignore per Room</span> <select id="auto-doorignore-select">
                    <option value="0" ${autoIgnoreDoors === 0 ? 'selected' : ''}>0</option>
                    <option value="1" ${autoIgnoreDoors === 1 ? 'selected' : ''}>1</option>
                    <option value="2" ${autoIgnoreDoors === 2 ? 'selected' : ''}>2</option>
                    <option value="3" ${autoIgnoreDoors === 3 ? 'selected' : ''}>3</option>
                    <option value="4" ${autoIgnoreDoors === 4 ? 'selected' : ''}>4</option>
                    <option value="5" ${autoIgnoreDoors === 5 ? 'selected' : ''}>5</option>
                    <option value="6" ${autoIgnoreDoors === 6 ? 'selected' : ''}>6</option>
                    <option value="7" ${autoIgnoreDoors === 7 ? 'selected' : ''}>7</option>
                    <option value="8" ${autoIgnoreDoors === 8 ? 'selected' : ''}>8</option>
                    <option value="9" ${autoIgnoreDoors === 9 ? 'selected' : ''}>9</option>
                </select></label>
                <br><button id="apply-auto" data-i18n="apply">Apply</button>
            </div>`;
        applyTranslations(defaultModalElement);
        let autoToggle = document.querySelector('#auto-mode-toggle');
        let autoEngageToggle = document.querySelector('#auto-engage-toggle');
        let autoBlessToggle = document.querySelector('#auto-bless-toggle');
        let autoHealToggle = document.querySelector('#auto-heal-toggle');
        let autoSpecialToggle = document.querySelector('#auto-special-toggle');
        let autoBossDoorToggle = document.querySelector('#auto-bossdoor-toggle');
        let autoSellRaritySelect = document.querySelector('#auto-sell-rarity-select');
        let autoSellLevelSelect = document.querySelector('#auto-sell-level-input');
        let autoDoorIgnoreSelect = document.querySelector('#auto-doorignore-select');
        let applyAuto = document.querySelector('#apply-auto');
        let autoTab = document.querySelector('#auto-tab');
        autoTab.style.width = "15rem";
        let autoClose = document.querySelector('#auto-close');
        const closeAutoModeModal = () => {
            defaultModalElement.style.display = "none";
            defaultModalElement.innerHTML = "";
            menuModalElement.style.display = "flex";
        };
        autoClose.onclick = function () {
            sfxDecline.play();
            closeAutoModeModal();
        };

        if (!autoModeUnlocked) {
            let unlockAuto = document.querySelector('#unlock-auto');
            unlockAuto.onclick = function () {
                const isAndroid = /Android/i.test(navigator.userAgent);
                if (isCordova()) {
                    buyAutoModeUnlock();
                } else {
                    if (isAndroid) {
                        ratingSystem.openGooglePlayForRating();
                    } else {
                        openExternal('https://werkstattl.itch.io/quick-dungeon-crawler-on-demand/purchase');
                    }
                }
            };
        }

        applyAuto.onclick = function () {
            sfxConfirm.play();
            autoModeBtnVisible = autoModeUnlocked && autoToggle.checked;
            if (!autoModeBtnVisible) {
                autoMode = false;
            }
            autoEngage = autoEngageToggle.checked;
            autoBlessings = autoBlessToggle.checked;
            autoHeal = autoHealToggle.checked;
            autoSpecialAbility = autoSpecialToggle.checked;
            autoBossDoors = autoBossDoorToggle.checked;
            autoSellRarity = autoSellRaritySelect.value;
            autoSellBelowLevel = parseInt(autoSellLevelSelect.value, 10);
            if (Number.isNaN(autoSellBelowLevel) || autoSellBelowLevel < 0) {
                autoSellBelowLevel = 0;
            }
            autoIgnoreDoors = parseInt(autoDoorIgnoreSelect.value, 10);
            if ( autoModeUnlocked ) {
                localStorage.setItem("autoMode", autoMode);
            }
            localStorage.setItem("autoModeBtnVisible", autoModeBtnVisible);
            localStorage.setItem("autoEngage", autoEngage);
            localStorage.setItem("autoBlessings", autoBlessings);
            localStorage.setItem("autoHeal", autoHeal);
            localStorage.setItem("autoSpecialAbility", autoSpecialAbility);
            localStorage.setItem("autoBossDoors", autoBossDoors);
            localStorage.setItem("autoSellRarity", autoSellRarity);
            localStorage.setItem("autoSellBelowLevel", autoSellBelowLevel);
            localStorage.setItem("autoIgnoreDoors", autoIgnoreDoors);
            updateAutoModeBtnVisibility();
            updateAutoModeBtn();
            closeAutoModeModal();
        };
    };

    // Opens auto mode settings
    autoModeSettings.onclick = window.renderAutoModeSettingsModal;

    // Export/Import Save Data
    exportImport.onclick = function () {
        sfxOpen.play();
        let exportedData = exportData();
        menuModalElement.style.display = "none";
        defaultModalElement.style.display = "flex";
        defaultModalElement.innerHTML = `
            <div class="content content-ei" id="ei-tab">
                <div class="content-head">
                    <h3 data-i18n="export-import-data">Export/Import Data</h3>
                    <p id="ei-close"><i class="fa fa-xmark"></i></p>
                </div>
                <h4 data-i18n="export-data">Export Data</h4>
                <input type="text" id="export-input" autocomplete="off" value="${exportedData}" readonly>
                <button id="copy-export" data-i18n="copy">Copy</button>
                <br>
                <h4 data-i18n="import-data">Import Data</h4>
                <input type="text" id="import-input" autocomplete="off">
                <button id="data-import" data-i18n="import">Import</button>
            </div>`;
        applyTranslations(defaultModalElement);
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
            btn.innerHTML = t('copied');
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
    if (!localStorage.getItem('introHintShown')) {
        addDungeonLog(t('summon-explore-hint'));
    }
}

// Save all the data into local storage
let isSaving = false;
let lastSaveTime = Date.now();
const saveData = () => {
    if (isSaving) return; // Prevent overlapping saves
    isSaving = true;
    try {
        let playerData, dungeonData, enemyData;
        try {
            playerData = JSON.stringify(player);
            dungeonData = JSON.stringify(dungeon);
            enemyData = JSON.stringify(enemy);
        } catch (jsonErr) {
            console.error("Failed to stringify data for saving:", jsonErr);
            isSaving = false;
            return;
        }
        // Only save if all data is valid JSON
        localStorage.setItem("playerData", playerData);
        const existingDungeonData = localStorage.getItem("dungeonData");
        const canPersistDungeon = dungeon && (dungeon.initialized || existingDungeonData === null);
        if (canPersistDungeon) {
            localStorage.setItem("dungeonData", dungeonData);
        }
        localStorage.setItem("enemyData", enemyData);
        lastSaveTime = Date.now();
    } finally {
        isSaving = false;
    }
}

const clampCurseLevel = (value) => {
    let level = Number(value);
    if (!Number.isFinite(level)) {
        level = 1;
    }
    level = Math.round(level);
    if (level < 1) {
        level = 1;
    }
    if (level > 10) {
        level = 10;
    }
    return level;
};

const maybeUnlockNextCurseLevel = () => {
    if (!player || !dungeon || !dungeon.progress || !dungeon.settings) {
        return;
    }
    if (typeof player.maxUnlockedCurseLevel !== "number") {
        player.maxUnlockedCurseLevel = 1;
    }
    player.maxUnlockedCurseLevel = clampCurseLevel(player.maxUnlockedCurseLevel);
    const maxUnlocked = player.maxUnlockedCurseLevel;
    if (maxUnlocked >= 10) {
        return;
    }
    const selectedLevel = clampCurseLevel(player.selectedCurseLevel || 1);
    if (selectedLevel !== maxUnlocked) {
        return;
    }
    if (dungeon.progress.floor >= 10) {
        const newMax = clampCurseLevel(maxUnlocked + 1);
        if (newMax > player.maxUnlockedCurseLevel) {
            player.maxUnlockedCurseLevel = newMax;
            if (typeof ensureRunStatisticsShape === 'function') {
                ensureRunStatisticsShape();
            }
            if (dungeon && dungeon.statistics) {
                dungeon.statistics.latestCurseUnlock = newMax;
            }
            if (typeof addDungeonLog === 'function') {
                const unlockMessage = t('curse-level-unlocked', { level: newMax });
                addDungeonLog(`<span class="CurseUnlock">${unlockMessage}</span>`);
            }
            saveData();
        }
    }
};

if (typeof window !== 'undefined') {
    window.maybeUnlockNextCurseLevel = maybeUnlockNextCurseLevel;
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
    let playerFasterRunBase = player.baseStats.fasterRun || 0;

    // Initialize floor buffs if they don't exist
    if (dungeon.floorBuffs == undefined) {
        dungeon.floorBuffs = {
            atk: 0,
            def: 0,
            atkSpd: 0,
            currentFloor: dungeon.progress.floor,
        };
    }

    const emptyCompanionBonuses = {
        hp: 0,
        atk: 0,
        def: 0,
        atkSpd: 0,
        vamp: 0,
        critRate: 0,
        critDmg: 0,
        dodge: 0,
        luck: 0,
    };

    const companionBonuses = (typeof getActiveCompanionBonuses === 'function')
        ? getActiveCompanionBonuses()
        : { ...emptyCompanionBonuses };

    const hpBonusPct = (player.bonusStats.hp || 0) + (companionBonuses.hp || 0);
    const atkBonusPct = (player.bonusStats.atk || 0);
    const defBonusPct = (player.bonusStats.def || 0) + (companionBonuses.def || 0);
    const atkSpdBonusPct = (player.bonusStats.atkSpd || 0) + (companionBonuses.atkSpd || 0);
    const companionAtkBonusPct = companionBonuses.atk || 0;

    player.stats.hpMax = Math.round((playerHpBase + playerHpBase * (hpBonusPct / 100)) + player.equippedStats.hp);
    player.stats.atk = Math.round(((playerAtkBase + playerAtkBase * (atkBonusPct / 100)) + player.equippedStats.atk) * (1 + (dungeon.floorBuffs.atk / 100)) * (1 + (companionAtkBonusPct / 100)));
    player.stats.def = Math.round(((playerDefBase + playerDefBase * (defBonusPct / 100)) + player.equippedStats.def) * (1 + (dungeon.floorBuffs.def / 100)));
    player.stats.atkSpd = (playerAtkSpdBase + playerAtkSpdBase * (atkSpdBonusPct / 100) + playerAtkSpdBase * (dungeon.floorBuffs.atkSpd / 100)) + equipmentAtkSpd + (equipmentAtkSpd * (player.equippedStats.atkSpd / 100));
    player.stats.vamp = playerVampBase + player.bonusStats.vamp + player.equippedStats.vamp + (companionBonuses.vamp || 0);
    const equipmentCritRate = player.equippedStats.critRate;
    const hasEagleEye = (typeof PASSIVE_EAGLE_EYE !== 'undefined') && ((Array.isArray(player.skills) && player.skills.includes(PASSIVE_EAGLE_EYE)) || player.selectedPassive === PASSIVE_EAGLE_EYE);
    const eagleEyeBonus = hasEagleEye ? equipmentCritRate * 0.25 : 0;
    player.stats.critRate = playerCRateBase + player.bonusStats.critRate + equipmentCritRate + eagleEyeBonus + (companionBonuses.critRate || 0);
    if (player.stats.critRate > 100) {
        player.stats.critRate = 100;
    }
    player.stats.critDmg = playerCDmgBase + player.bonusStats.critDmg + player.equippedStats.critDmg + (companionBonuses.critDmg || 0);
    player.stats.dodge = playerDodgeBase + player.bonusStats.dodge + player.equippedStats.dodge + (companionBonuses.dodge || 0);
    player.stats.fasterRun = playerFasterRunBase + (player.bonusStats.fasterRun || 0) + (player.equippedStats.fasterRun || 0);
    // Luck from bonus (level-ups), equipment, and companion bonds
    player.stats.luck = (player.bonusStats.luck || 0) + (player.equippedStats.luck || 0) + (companionBonuses.luck || 0);
    if (player.stats.luck > 140) {
        player.stats.luck = 140;
    }
    if (player.stats.dodge > 75) {
        player.stats.dodge = 75;
    }
    const atkSpdCap = getPlayerAtkSpdCap();
    if (player.stats.atkSpd > atkSpdCap) {
        player.stats.atkSpd = atkSpdCap;
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
            dodge: 0,
            fasterRun: 0,
            luck: 0,
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
        dodge: 0,
        luck: 0,
        fasterRun: 0
    };
    player.inCombat = false;
    if (typeof resetActiveCompanionBonuses === 'function') {
        resetActiveCompanionBonuses();
    }
    dungeon.progress.floor = 1;
    dungeon.progress.room = 1;
    if (typeof resetRunStatistics === 'function') {
        resetRunStatistics();
    } else {
        dungeon.statistics = {
            kills: 0,
            bossesDefeated: 0,
            runtime: 0,
            damageDealt: 0,
            damageTaken: 0,
            goldEarned: 0,
            lootDrops: { total: 0, highestRarity: null, rarityCounts: {} },
            latestCurseUnlock: null,
        };
    }
    dungeon.status = {
        exploring: false,
        paused: true,
        event: false,
    };
    if (typeof lastDungeonEventTimestamp !== 'undefined') {
        lastDungeonEventTimestamp = Date.now();
    }
    let storedCurseLevel = 1;
    if (player && typeof player.selectedCurseLevel === "number" && Number.isFinite(player.selectedCurseLevel)) {
        storedCurseLevel = Math.round(player.selectedCurseLevel);
    }
    if (!player || typeof player.maxUnlockedCurseLevel !== "number") {
        player.maxUnlockedCurseLevel = 1;
    }
    player.maxUnlockedCurseLevel = clampCurseLevel(player.maxUnlockedCurseLevel);
    storedCurseLevel = clampCurseLevel(storedCurseLevel);
    if (storedCurseLevel > player.maxUnlockedCurseLevel) {
        storedCurseLevel = player.maxUnlockedCurseLevel;
    }
    player.selectedCurseLevel = storedCurseLevel;
    dungeon.settings = {
        enemyBaseLvl: 1,
        enemyLvlGap: 5,
        enemyBaseStats: 1,
        enemyScaling: 1 + (storedCurseLevel / 10),
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
    dungeon.nothingBias = 0;
    combatBacklog.length = 0;
    playerCompanions = [];
    activeCompanion = null;
    saveCompanions();
    saveData();
}

const formatRunDuration = (seconds) => {
    const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    const parts = [hrs, mins, secs].map(part => String(part).padStart(2, "0"));
    return parts.join(":");
};

const hideEndgameScreen = () => {
    const modal = document.querySelector("#endgameModal");
    if (!modal) {
        return;
    }
    modal.style.display = "none";
    const dungeonMain = document.querySelector("#dungeon-main");
    if (dungeonMain) {
        dungeonMain.style.filter = "brightness(100%)";
    }
};

const PASSIVE_TRANSLATION_MAP = new Map([
    ["remnant razor", "remnant-razor"],
    ["titan's will", "titans-will"],
    ["devastator", "devastator"],
    ["limit breaker", "limit-breaker"],
    ["eagle eye", "eagle-eye"],
    ["paladin's heart", "paladins-heart"],
    ["aegis thorns", "aegis-thorns"],
    ["companion's insight", "companions-insight"],
    ["open wounds", "open-wounds"],
]);

const translatePassiveValue = (value) => {
    if (typeof value !== "string") {
        return null;
    }
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
        return null;
    }
    const translationKey = PASSIVE_TRANSLATION_MAP.get(normalized);
    if (!translationKey || typeof t !== "function") {
        return null;
    }
    const translated = t(translationKey);
    return typeof translated === "string" && translated.trim() ? translated : null;
};

const showEndgameScreen = (summary) => {
    const modal = document.querySelector("#endgameModal");
    if (!modal) {
        return;
    }

    const safeSummary = summary || {};
    const playerNameElement = modal.querySelector("#endgame-player-name");
    if (playerNameElement) {
        playerNameElement.textContent = safeSummary.playerName || "";
    }

    const modeElement = modal.querySelector("#endgame-player-mode");
    if (modeElement) {
        if (safeSummary.hardcore) {
            modeElement.textContent = typeof t === "function" ? t("hardcore") : "Hardcore";
            modeElement.classList.add("hardcore");
            modeElement.hidden = false;
        } else {
            modeElement.textContent = "";
            modeElement.classList.remove("hardcore");
            modeElement.hidden = true;
        }
    }

    const statsList = modal.querySelector("#endgame-stats");
    if (statsList) {
        const formatNumberStat = (value) => {
            const numericValue = Number(value);
            if (!Number.isFinite(numericValue) || numericValue <= 0) {
                return "0";
            }
            return nFormatter(Math.max(0, Math.round(numericValue)));
        };
        const lootStats = (safeSummary.lootDrops && typeof safeSummary.lootDrops === "object")
            ? safeSummary.lootDrops
            : { total: 0, highestRarity: null, rarityCounts: {} };
        if (!lootStats.rarityCounts || typeof lootStats.rarityCounts !== "object") {
            lootStats.rarityCounts = {};
        }
        const formatLootDrops = () => formatNumberStat(lootStats.total);
        const formatBestLoot = () => {
            if (!lootStats.highestRarity) {
                return typeof t === "function" ? t("none") : "None";
            }
            const rarityKey = lootStats.highestRarity.toLowerCase();
            const rarityLabel = typeof t === "function" ? t(rarityKey) : lootStats.highestRarity;
            const count = lootStats.rarityCounts[lootStats.highestRarity];
            if (Number.isFinite(count) && count > 1) {
                return `${rarityLabel} x${count}`;
            }
            return rarityLabel;
        };
        const stats = [
            { key: "level", value: safeSummary.level ?? 1 },
            { key: "runtime", value: formatRunDuration(safeSummary.runtime) },
            { key: "floor", value: safeSummary.floor ?? 1 },
            { key: "room", value: safeSummary.room ?? 1 },
            { key: "kills", value: safeSummary.kills ?? 0 },
            { key: "bosses-defeated", value: safeSummary.bossesDefeated ?? 0 },
            { key: "damage-dealt", value: formatNumberStat(safeSummary.damageDealt) },
            { key: "damage-taken", value: formatNumberStat(safeSummary.damageTaken) },
            { key: "gold-earned", value: formatNumberStat(safeSummary.goldEarned) },
            { key: "loot-drops", value: formatLootDrops() },
            { key: "best-loot", value: formatBestLoot() },
        ];
        statsList.innerHTML = stats.map(({ key, value }) => {
            const label = typeof t === "function" ? t(key) : key;
            return `<li><span class="label" data-i18n="${key}">${label}</span><span class="value">${value}</span></li>`;
        }).join("");
        if (typeof applyTranslations === "function") {
            applyTranslations(statsList);
        }
    }

    const metaList = modal.querySelector("#endgame-meta");
    if (metaList) {
        const unknownLabel = typeof t === "function" ? t("unknown") : "Unknown";
        const formatMetaValue = (key, value) => {
            if (value === null || value === undefined) {
                return unknownLabel;
            }
            let stringValue = String(value).trim();
            if (!stringValue) {
                return unknownLabel;
            }

            if (key === "class") {
                const normalized = stringValue.toLowerCase();
                const classTranslationKeys = new Set(["knight", "paladin", "beastmaster", "scout", "rogue"]);
                if (classTranslationKeys.has(normalized) && typeof t === "function") {
                    const translatedValue = t(normalized);
                    if (translatedValue && typeof translatedValue === "string") {
                        stringValue = translatedValue;
                    }
                }
            }

            if (key === "passive") {
                const translatedPassive = translatePassiveValue(stringValue);
                if (translatedPassive) {
                    stringValue = translatedPassive;
                }
            }

            return stringValue;
        };
        const metaEntries = [
            { key: "class", value: safeSummary.playerClass },
            { key: "passive", value: safeSummary.playerPassive },
            { key: "curse-level", value: Number.isFinite(safeSummary.curseLevel) ? safeSummary.curseLevel : null },
        ];
        metaList.innerHTML = metaEntries.map(({ key, value }) => {
            const label = typeof t === "function" ? t(key) : key;
            return `<li><span class="label" data-i18n="${key}">${label}</span><span class="value">${formatMetaValue(key, value)}</span></li>`;
        }).join("");
        if (typeof applyTranslations === "function") {
            applyTranslations(metaList);
        }
    }

    const unlocksContainer = modal.querySelector("#endgame-unlocks");
    if (unlocksContainer) {
        const unlockedLevel = Number.isFinite(safeSummary.curseLevelUnlocked)
            ? clampCurseLevel(safeSummary.curseLevelUnlocked)
            : null;
        if (unlockedLevel) {
            const unlockMessage = typeof t === "function"
                ? t("curse-level-unlocked", { level: unlockedLevel })
                : `New curse level unlocked! (Lv.${unlockedLevel})`;
            unlocksContainer.textContent = unlockMessage;
            unlocksContainer.classList.add("visible");
            unlocksContainer.hidden = false;
        } else {
            unlocksContainer.textContent = "";
            unlocksContainer.classList.remove("visible");
            unlocksContainer.hidden = true;
        }
    }

    modal.style.display = "flex";
    const dungeonMain = document.querySelector("#dungeon-main");
    if (dungeonMain) {
        dungeonMain.style.filter = "brightness(35%)";
    }

    const startButton = modal.querySelector("#endgame-start-btn");
    if (startButton && typeof startButton.focus === "function") {
        try {
            startButton.focus({ preventScroll: true });
        } catch (err) {
            startButton.focus();
        }
    }
};

const startNewRunAfterDeath = () => {
    if (typeof sfxConfirm !== "undefined" && sfxConfirm && typeof sfxConfirm.play === "function") {
        sfxConfirm.play();
    }
    playerDead = false;
    hideEndgameScreen();

    const dimDungeon = document.querySelector("#dungeon-main");
    if (dimDungeon) {
        dimDungeon.style.filter = "brightness(100%)";
        dimDungeon.style.display = "none";
    }

    if (typeof combatPanel !== "undefined" && combatPanel) {
        combatPanel.style.display = "none";
    }

    runLoad("title-screen", "flex");

    if (typeof dungeonTimer !== "undefined" && dungeonTimer) {
        clearInterval(dungeonTimer);
        dungeonTimer = null;
    }
    if (typeof playTimer !== "undefined" && playTimer) {
        clearInterval(playTimer);
        playTimer = null;
    }

    progressReset(true);
};

if (typeof window !== "undefined") {
    window.showEndgameScreen = showEndgameScreen;
    window.startNewRunAfterDeath = startNewRunAfterDeath;
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

    const classBaseStats = {
        "Knight": { hp: 0, atk: 20, def: 0, atkSpd: 0 },
        "Paladin": { hp: 100, atk: 0, def: 20, atkSpd: 0 },
        "Beastmaster": { hp: 0, atk: 0, def: 0, atkSpd: 0 },
        "Scout": { hp: -50, atk: 10, def: -10, atkSpd: 0.02 },
        "Rogue": { hp: -100, atk: 20, def: -10, atkSpd: 0.04 }
    };

    let currentClass = player.selectedClass || "Knight";
    let stats;
    const updateStats = () => {
        const bonus = classBaseStats[currentClass] || { hp: 0, atk: 0, def: 0, atkSpd: 0 };
        stats = {
            hp: 50 * allocation.hp + bonus.hp,
            atk: 10 * allocation.atk + bonus.atk,
            def: 10 * allocation.def + bonus.def,
            atkSpd: 0.4 + (0.02 * allocation.atkSpd) + bonus.atkSpd
        }
    }
    updateStats();
    const maxUnlockedCurse = clampCurseLevel(player && typeof player.maxUnlockedCurseLevel === "number" ? player.maxUnlockedCurseLevel : 1);
    if (player) {
        player.maxUnlockedCurseLevel = maxUnlockedCurse;
        const sanitizedSelected = clampCurseLevel(player.selectedCurseLevel || 1);
        player.selectedCurseLevel = sanitizedSelected > maxUnlockedCurse ? maxUnlockedCurse : sanitizedSelected;
    }
    let points = 40 - (allocation.hp + allocation.atk + allocation.def + allocation.atkSpd);
    if (points < 0) { points = 0; }
    const loadContent = function () {
        defaultModalElement.innerHTML = `
        <div class="content" id="allocate-stats">
            <div class="content-head">
                <h3 data-i18n="allocate-stats">Allocate Stats</h3>
                <p id="allocate-close"><i class="fa fa-xmark"></i></p>
            </div>
            <div class="row">
                <p data-i18n="class">Class</p>
                <select id="select-class">
                    <option value="Knight" data-i18n="knight">Knight</option>
                    <option value="Paladin" data-i18n="paladin">Paladin</option>
                    <option value="Beastmaster" data-i18n="beastmaster">Beastmaster</option>
                    <option value="Scout" data-i18n="scout">Scout</option>
                    <option value="Rogue" data-i18n="rogue">Rogue</option>
                </select>
            </div>
            <div class="row primary-panel pad">
                <p id="class-desc" data-i18n="knight-class-description">Special ability to deal 1.5x ATK damage.</p>
            </div>
            <div class="row">
                <p><i class="fas fa-heart"></i><span data-i18n="hp">HP:</span> <span id="hpDisplay">${stats.hp}</span></p>
                <div class="row">
                    <button id="hpMin">-</button>
                    <span id="hpAllo">${allocation.hp}</span>
                    <button id="hpAdd">+</button>
                </div>
            </div>
            <div class="row">
                <p><i class="ra ra-sword"></i><span data-i18n="atk">ATK:</span> <span id="atkDisplay">${stats.atk}</span></p>
                <div class="row">
                    <button id="atkMin">-</button>
                    <span id="atkAllo">${allocation.atk}</span>
                    <button id="atkAdd">+</button>
                </div>
            </div>
            <div class="row">
                <p><i class="ra ra-round-shield"></i><span data-i18n="def">DEF:</span> <span id="defDisplay">${stats.def}</span></p>
                <div class="row">
                    <button id="defMin">-</button>
                    <span id="defAllo">${allocation.def}</span>
                    <button id="defAdd">+</button>
                </div>
            </div>
            <div class="row">
                <p><i class="ra ra-plain-dagger"></i><span data-i18n="aps">APS:</span> <span id="atkSpdDisplay">${stats.atkSpd.toFixed(2)}</span></p>
                <div class="row">
                    <button id="atkSpdMin">-</button>
                    <span id="atkSpdAllo">${allocation.atkSpd}</span>
                    <button id="atkSpdAdd">+</button>
                </div>
            </div>
            <div class="row">
                <p id="alloPts"><span data-i18n="stat-points">Stat Points:</span> <span id="ptsLeft">${points}/20</span></p>
                <button id="allocate-reset" data-i18n="reset">Reset</button>
                <button id="allocate-auto" data-i18n="auto">Auto</button>
            </div>
            <div class="row">
                <p data-i18n="passive">Passive</p>
                <select id="select-skill">
                    <option value="Remnant Razor" data-i18n="remnant-razor">Remnant Razor</option>
                    <option value="Titan's Will" data-i18n="titans-will">Titan's Will</option>
                    <option value="Devastator" data-i18n="devastator">Devastator</option>
                    <option value="Limit Breaker" data-i18n="limit-breaker">Limit Breaker</option>
                    <option value="Eagle Eye" data-i18n="eagle-eye">Eagle Eye</option>
                    <option value="Paladin's Heart" data-i18n="paladins-heart">Paladin's Heart</option>
                    <option value="Aegis Thorns" data-i18n="aegis-thorns">Aegis Thorns</option>
                    <option value="${PASSIVE_COMPANION_INSIGHT}" data-i18n="companions-insight">${PASSIVE_COMPANION_INSIGHT}</option>
                    <option value="${PASSIVE_OPEN_WOUNDS}" data-i18n="open-wounds">${PASSIVE_OPEN_WOUNDS}</option>
                </select>
            </div>
            <div class="row primary-panel pad">
                <p id="skill-desc" data-i18n="remnant-razor-desc">Attacks deal extra 9% of enemies' current health on hit.</p>
            </div>
            <div class="row">
                <p data-i18n="curse">Curse</p>
                <select id="select-curse">
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                    <option value="6">6</option>
                    <option value="7">7</option>
                    <option value="8">8</option>
                    <option value="9">9</option>
                    <option value="10">10</option>
                </select>
            </div>
            <div class="row" id="forge-button-row" style="margin-top: 15px">
                <button id="open-forge-btn" style="width: 100%; margin-bottom: 10px;"><i class="ra ra-anvil"></i> <span data-i18n="the-forge">The Forge</span></button>
            </div>
            <button id="allocate-confirm" data-i18n="confirm">Confirm</button>
        </div>`;
    }
    defaultModalElement.style.display = "flex";
    document.querySelector("#title-screen").style.filter = "brightness(50%)";
    loadContent();
    applyTranslations(defaultModalElement);

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
                document.querySelector(`#${stat}Display`).textContent = `${stats[stat].toFixed(2).replace(rx, "$1")}`;
                document.querySelector(`#${stat}Allo`).innerHTML = allocation[stat];
                document.querySelector(`#ptsLeft`).textContent = `${points}/20`;
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
                document.querySelector(`#${stat}Display`).textContent = `${stats[stat].toFixed(2).replace(rx, "$1")}`;
                document.querySelector(`#${stat}Allo`).innerHTML = allocation[stat];
                document.querySelector(`#ptsLeft`).textContent = `${points}/20`;
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
            skillDesc.setAttribute('data-i18n', 'remnant-razor-desc');
        }
        if (selectSkill.value == "Titan's Will") {
            skillDesc.setAttribute('data-i18n', 'titans-will-desc');
        }
        if (selectSkill.value == "Devastator") {
            skillDesc.setAttribute('data-i18n', 'devastator-desc');
        }
        if (selectSkill.value == PASSIVE_LIMIT_BREAKER) {
            skillDesc.setAttribute('data-i18n', 'limit-breaker-desc');
        }
        if (typeof PASSIVE_EAGLE_EYE !== 'undefined' && selectSkill.value == PASSIVE_EAGLE_EYE) {
            skillDesc.setAttribute('data-i18n', 'eagle-eye-desc');
        }
        if (selectSkill.value == "Paladin's Heart") {
            skillDesc.setAttribute('data-i18n', 'paladins-heart-desc');
        }
        if (selectSkill.value == "Aegis Thorns") {
            skillDesc.setAttribute('data-i18n', 'aegis-thorns-desc');
        }
        if (selectSkill.value == PASSIVE_COMPANION_INSIGHT) {
            skillDesc.setAttribute('data-i18n', 'companions-insight-desc');
        }
        if (selectSkill.value == PASSIVE_OPEN_WOUNDS) {
            skillDesc.setAttribute('data-i18n', 'open-wounds-desc');
        }   
        applyTranslations(defaultModalElement);
    }
    selectSkill.onchange();

        // Class selection
        let selectClass = document.querySelector("#select-class");
        let classDesc = document.querySelector("#class-desc");
        selectClass.value = currentClass;
        selectClass.onclick = function () {
            sfxConfirm.play();
        }
        selectClass.onchange = function () {
            currentClass = selectClass.value;
            if (selectClass.value == "Knight") {
                classDesc.setAttribute('data-i18n', 'knight-class-description');
            }
            if (selectClass.value == "Paladin") {
                classDesc.setAttribute('data-i18n', 'paladin-class-description');
            }
            if (selectClass.value == "Beastmaster") {
                classDesc.setAttribute('data-i18n', 'beastmaster-class-description');
            }
            if (selectClass.value == "Scout") {
                classDesc.setAttribute('data-i18n', 'scout-class-description');
            }
            if (selectClass.value == "Rogue") {
                classDesc.setAttribute('data-i18n', 'rogue-class-description');
                if (selectSkill.value !== PASSIVE_OPEN_WOUNDS) {
                    selectSkill.value = PASSIVE_OPEN_WOUNDS;
                    selectSkill.onchange();
                }
            }
            applyTranslations(defaultModalElement);
            updateStats();
            let rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
            document.querySelector(`#hpDisplay`).textContent = `${stats.hp.toFixed(2).replace(rx, "$1")}`;
            document.querySelector(`#atkDisplay`).textContent = `${stats.atk.toFixed(2).replace(rx, "$1")}`;
            document.querySelector(`#defDisplay`).textContent = `${stats.def.toFixed(2).replace(rx, "$1")}`;
            document.querySelector(`#atkSpdDisplay`).textContent = `${stats.atkSpd.toFixed(2).replace(rx, "$1")}`;
        }
        selectClass.onchange();
    
        let selectCurse = document.querySelector("#select-curse");
        let defaultCurseLevel = clampCurseLevel(Math.round((dungeon.settings.enemyScaling - 1) * 10));
        if (player && typeof player.selectedCurseLevel === "number") {
            defaultCurseLevel = clampCurseLevel(player.selectedCurseLevel);
        }
        if (defaultCurseLevel > maxUnlockedCurse) {
            defaultCurseLevel = maxUnlockedCurse;
        }
        selectCurse.value = `${defaultCurseLevel}`;
        if (player) {
            player.selectedCurseLevel = defaultCurseLevel;
        }
        Array.from(selectCurse.options).forEach((option) => {
            const optionValue = clampCurseLevel(option.value);
            if (optionValue > maxUnlockedCurse) {
                option.disabled = true;
            }
        });
        selectCurse.onclick = function () {
            sfxConfirm.play();
        };

    // Operation Buttons
    let confirm = document.querySelector("#allocate-confirm");
    let reset = document.querySelector("#allocate-reset");
    let autoAlloc = document.querySelector("#allocate-auto");
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
		player.selectedClass = selectClass.value;
        let selectedCurseLevel = clampCurseLevel(selectCurse.value);
        if (selectedCurseLevel > maxUnlockedCurse) {
            selectedCurseLevel = maxUnlockedCurse;
        }
        player.selectedCurseLevel = selectedCurseLevel;
        dungeon.settings.enemyScaling = 1 + (selectedCurseLevel / 10);
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
        let rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
        document.querySelector(`#hpDisplay`).textContent = `${stats.hp.toFixed(2).replace(rx, "$1")}`;
        document.querySelector(`#atkDisplay`).textContent = `${stats.atk.toFixed(2).replace(rx, "$1")}`;
        document.querySelector(`#defDisplay`).textContent = `${stats.def.toFixed(2).replace(rx, "$1")}`;
        document.querySelector(`#atkSpdDisplay`).textContent = `${stats.atkSpd.toFixed(2).replace(rx, "$1")}`;
        document.querySelector(`#hpAllo`).innerHTML = allocation.hp;
        document.querySelector(`#atkAllo`).innerHTML = allocation.atk;
        document.querySelector(`#defAllo`).innerHTML = allocation.def;
        document.querySelector(`#atkSpdAllo`).innerHTML = allocation.atkSpd;
        document.querySelector(`#ptsLeft`).textContent = `${points}/20`;
    }
    autoAlloc.onclick = function () {
        if (points > 0) {
            sfxConfirm.play();
            const order = ["hp", "atk", "def", "atkSpd"];
            while (points > 0) {
                for (let stat of order) {
                    if (points === 0) break;
                    allocation[stat]++;
                    points--;
                }
            }
            updateStats();
            let rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
            document.querySelector(`#hpDisplay`).textContent = `${stats.hp.toFixed(2).replace(rx, "$1")}`;
            document.querySelector(`#atkDisplay`).textContent = `${stats.atk.toFixed(2).replace(rx, "$1")}`;
            document.querySelector(`#defDisplay`).textContent = `${stats.def.toFixed(2).replace(rx, "$1")}`;
            document.querySelector(`#atkSpdDisplay`).textContent = `${stats.atkSpd.toFixed(2).replace(rx, "$1")}`;
            document.querySelector(`#hpAllo`).innerHTML = allocation.hp;
            document.querySelector(`#atkAllo`).innerHTML = allocation.atk;
            document.querySelector(`#defAllo`).innerHTML = allocation.def;
            document.querySelector(`#atkSpdAllo`).innerHTML = allocation.atkSpd;
            document.querySelector(`#ptsLeft`).textContent = `${points}/20`;
        } else {
            sfxDeny.play();
        }
    }
    close.onclick = function () {
        sfxDecline.play();
        defaultModalElement.style.display = "none";
        defaultModalElement.innerHTML = "";
        document.querySelector("#title-screen").style.filter = "brightness(100%)";
    }
}

const objectValidation = () => {
    let changed = false;
    if (player.skills == undefined) {
        player.skills = [];
        changed = true;
    }
    if (player.allocationChoices == undefined) {
        player.allocationChoices = { hp: 10, atk: 10, def: 10, atkSpd: 10 };
        changed = true;
    }
    if (player.selectedPassive == undefined) {
        player.selectedPassive = "Remnant Razor";
        changed = true;
    }
    if (player.selectedClass == undefined) {
            player.selectedClass = "Knight";
            changed = true;
    }
    if (player.maxUnlockedCurseLevel == undefined) {
        player.maxUnlockedCurseLevel = 1;
        changed = true;
    }
    player.maxUnlockedCurseLevel = clampCurseLevel(player.maxUnlockedCurseLevel);
    if (player.selectedCurseLevel == undefined) {
        player.selectedCurseLevel = 1;
        changed = true;
    }
    player.selectedCurseLevel = clampCurseLevel(player.selectedCurseLevel);
    if (player.selectedCurseLevel > player.maxUnlockedCurseLevel) {
        player.selectedCurseLevel = player.maxUnlockedCurseLevel;
        changed = true;
    }
    if (dungeon && dungeon.settings) {
        const desiredScaling = 1 + (player.selectedCurseLevel / 10);
        if (!Number.isFinite(dungeon.settings.enemyScaling) || Math.abs(dungeon.settings.enemyScaling - desiredScaling) > 0.0001) {
            dungeon.settings.enemyScaling = desiredScaling;
            changed = true;
        }
    }
    if (player.tempStats == undefined) {
        player.tempStats = {};
        player.tempStats.atk = 0;
        player.tempStats.atkSpd = 0;
        changed = true;
    }
    if (player.baseStats && player.baseStats.dodge === undefined) {
        player.baseStats.dodge = 0;
        changed = true;
    }
    if (player.stats && player.stats.dodge === undefined) {
        player.stats.dodge = 0;
        changed = true;
    }
    if (player.stats && player.stats.luck === undefined) {
        player.stats.luck = 0;
        changed = true;
    }
    if (player.bonusStats && player.bonusStats.dodge === undefined) {
        player.bonusStats.dodge = 0;
        changed = true;
    }
    if (player.bonusStats && player.bonusStats.luck === undefined) {
        player.bonusStats.luck = 0;
        changed = true;
    }
    if (player.equippedStats && player.equippedStats.dodge === undefined) {
        player.equippedStats.dodge = 0;
        changed = true;
    }
    if (player.equippedStats && player.equippedStats.luck === undefined) {
        player.equippedStats.luck = 0;
        changed = true;
    }
    if (enemy.stats && enemy.stats.dodge === undefined) {
        enemy.stats.dodge = 0;
        changed = true;
    }
    if (changed && !player.inCombat) {
        saveData();
    }
}
