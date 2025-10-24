const combatPanel = document.querySelector("#combatPanel")
let enemyDead = false;
let playerDead = false;
let currentBattleMusic = false;

let playerAttackTimeout;
let enemyAttackTimeout;
let companionAttackTimeout;
let specialAbilityTimeout;
let specialAbilityCooldown = false;
let playerAttackReady = false;
let autoAttackDelayTimeout = null;
let combatPaused = false;

let enemyAttackDueAt = null;
let playerAttackDueAt = null;
let companionAttackDueAt = null;
let specialAbilityDueAt = null;

let enemyAttackRemaining = null;
let playerAttackRemaining = null;
let companionAttackRemaining = null;
let specialAbilityRemaining = null;

let combatTimer = null;
let combatTimerWasRunning = false;

const nowMs = () => {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
        return performance.now();
    }
    return Date.now();
};

const getPlayerAttackButton = () => document.querySelector('#player-attack-btn');

const getEnemyAttackDelay = () => {
    const atkSpd = enemy && enemy.stats ? enemy.stats.atkSpd : 1;
    const normalized = Math.max(atkSpd || 0, 0.1);
    return 1000 / normalized;
};

const getCompanionAttackDelay = () => {
    const atkSpd = activeCompanion && activeCompanion.atkSpd ? activeCompanion.atkSpd : 1;
    const normalized = Math.max(atkSpd || 0, 0.1);
    return 1000 / normalized;
};

const clearAutoAttackDelay = () => {
    if (autoAttackDelayTimeout !== null) {
        clearTimeout(autoAttackDelayTimeout);
        autoAttackDelayTimeout = null;
    }
};

const scheduleEnemyAttack = (delayOverride) => {
    if (!player || !player.inCombat) {
        return;
    }
    const baseDelay = typeof delayOverride === "number" ? Math.max(0, delayOverride) : getEnemyAttackDelay();
    enemyAttackDueAt = nowMs() + baseDelay;
    if (enemyAttackTimeout) {
        clearTimeout(enemyAttackTimeout);
    }
    enemyAttackTimeout = setTimeout(() => {
        enemyAttackTimeout = null;
        enemyAttackDueAt = null;
        if (!player || !player.inCombat) {
            return;
        }
        if (combatPaused) {
            enemyAttackRemaining = 0;
            return;
        }
        enemyAttack();
    }, baseDelay);
};

const scheduleCompanionAttack = (delayOverride) => {
    if (!player || !player.inCombat || !activeCompanion || !activeCompanion.isActive) {
        return;
    }
    const baseDelay = typeof delayOverride === "number" ? Math.max(0, delayOverride) : getCompanionAttackDelay();
    companionAttackDueAt = nowMs() + baseDelay;
    if (companionAttackTimeout) {
        clearTimeout(companionAttackTimeout);
    }
    companionAttackTimeout = setTimeout(() => {
        companionAttackTimeout = null;
        companionAttackDueAt = null;
        if (!player || !player.inCombat) {
            return;
        }
        if (combatPaused) {
            companionAttackRemaining = 0;
            return;
        }
        companionAttack();
    }, baseDelay);
};

const scheduleSpecialAbilityReset = (delayOverride = 10000) => {
    const baseDelay = typeof delayOverride === "number" ? Math.max(0, delayOverride) : 10000;
    specialAbilityDueAt = nowMs() + baseDelay;
    if (specialAbilityTimeout) {
        clearTimeout(specialAbilityTimeout);
    }
    specialAbilityTimeout = setTimeout(() => {
        specialAbilityTimeout = null;
        specialAbilityDueAt = null;
        if (combatPaused) {
            specialAbilityRemaining = 0;
            return;
        }
        specialAbilityCooldown = false;
        updateSpecialAbilityButtonState();
    }, baseDelay);
};

const pauseCombatTimers = () => {
    if (combatPaused) {
        return;
    }
    if (!player || !player.inCombat) {
        return;
    }
    combatPaused = true;
    const current = nowMs();

    if (enemyAttackTimeout) {
        enemyAttackRemaining = Math.max(0, (enemyAttackDueAt || current) - current);
        clearTimeout(enemyAttackTimeout);
        enemyAttackTimeout = null;
    } else {
        enemyAttackRemaining = null;
    }
    enemyAttackDueAt = null;

    if (companionAttackTimeout) {
        companionAttackRemaining = Math.max(0, (companionAttackDueAt || current) - current);
        clearTimeout(companionAttackTimeout);
        companionAttackTimeout = null;
    } else {
        companionAttackRemaining = null;
    }
    companionAttackDueAt = null;

    if (playerAttackTimeout && !playerAttackReady) {
        playerAttackRemaining = Math.max(0, (playerAttackDueAt || current) - current);
    } else {
        playerAttackRemaining = null;
    }
    if (playerAttackTimeout) {
        clearTimeout(playerAttackTimeout);
        playerAttackTimeout = null;
    }
    playerAttackDueAt = null;

    if (specialAbilityTimeout && specialAbilityCooldown) {
        specialAbilityRemaining = Math.max(0, (specialAbilityDueAt || current) - current);
    } else {
        specialAbilityRemaining = null;
    }
    if (specialAbilityTimeout) {
        clearTimeout(specialAbilityTimeout);
        specialAbilityTimeout = null;
    }
    specialAbilityDueAt = null;

    if (combatTimer) {
        clearInterval(combatTimer);
        combatTimer = null;
        combatTimerWasRunning = true;
    } else {
        combatTimerWasRunning = false;
    }

    clearAutoAttackDelay();
};

const resumeCombatTimers = () => {
    if (!combatPaused) {
        return;
    }
    if (!player || !player.inCombat) {
        combatPaused = false;
        enemyAttackRemaining = null;
        companionAttackRemaining = null;
        playerAttackRemaining = null;
        specialAbilityRemaining = null;
        return;
    }
    combatPaused = false;

    if (combatTimerWasRunning) {
        combatTimer = setInterval(combatCounter, 1000);
        combatTimerWasRunning = false;
    }

    if (enemyAttackRemaining !== null) {
        scheduleEnemyAttack(enemyAttackRemaining);
    } else if (!enemyAttackTimeout) {
        scheduleEnemyAttack();
    }
    enemyAttackRemaining = null;

    if (activeCompanion && activeCompanion.isActive) {
        if (companionAttackRemaining !== null) {
            scheduleCompanionAttack(companionAttackRemaining);
        } else if (!companionAttackTimeout) {
            scheduleCompanionAttack();
        }
    }
    companionAttackRemaining = null;

    if (!playerAttackReady) {
        if (playerAttackRemaining !== null) {
            schedulePlayerAttackCooldown(playerAttackRemaining);
        } else if (!playerAttackTimeout) {
            schedulePlayerAttackCooldown();
        }
    }
    playerAttackRemaining = null;

    if (specialAbilityCooldown) {
        if (specialAbilityRemaining !== null) {
            scheduleSpecialAbilityReset(specialAbilityRemaining);
        } else if (!specialAbilityTimeout) {
            scheduleSpecialAbilityReset();
        }
    }
    specialAbilityRemaining = null;

    updateAttackButtonState();
    updateSpecialAbilityButtonState();
    if (playerAttackReady) {
        maybeAutoAttack();
    }
};

const updateAttackButtonState = () => {
    const btn = getPlayerAttackButton();
    if (!btn) {
        return;
    }

    if (!player || !player.inCombat) {
        btn.disabled = true;
        btn.textContent = t('attack');
        btn.setAttribute('data-i18n', 'attack');
        return;
    }

    if (playerAttackReady) {
        btn.disabled = false;
        btn.textContent = t('attack');
        btn.setAttribute('data-i18n', 'attack');
    } else {
        btn.disabled = true;
        btn.textContent = t('cooling');
        btn.setAttribute('data-i18n', 'cooling');
    }
};

const updateSpecialAbilityButtonState = () => {
    const btn = document.querySelector('#special-ability-btn');
    if (!btn) {
        return;
    }

    if (!player || !player.inCombat) {
        btn.disabled = true;
        btn.textContent = t('special-ability');
        btn.setAttribute('data-i18n', 'special-ability');
        return;
    }

    if (specialAbilityCooldown || !playerAttackReady) {
        btn.disabled = true;
        btn.textContent = t('cooling');
        btn.setAttribute('data-i18n', 'cooling');
        return;
    }

    btn.disabled = false;
    btn.textContent = t('special-ability');
    btn.setAttribute('data-i18n', 'special-ability');
};

const getPlayerAttackCooldown = () => {
    const atkSpd = player && player.stats ? player.stats.atkSpd : 1;
    const normalized = Math.max(atkSpd || 0, 0.1);
    return 1000 / normalized;
};

const setPlayerAttackReady = (ready) => {
    if (!ready) {
        clearAutoAttackDelay();
    }
    playerAttackReady = !!ready;
    updateAttackButtonState();
    updateSpecialAbilityButtonState();
    if (playerAttackReady) {
        maybeAutoAttack();
    }
};

const schedulePlayerAttackCooldown = (delayOverride) => {
    if (playerAttackTimeout) {
        clearTimeout(playerAttackTimeout);
        playerAttackTimeout = null;
    }
    if (!player || !player.inCombat) {
        setPlayerAttackReady(false);
        return;
    }

    const cooldown = typeof delayOverride === "number" ? Math.max(0, delayOverride) : getPlayerAttackCooldown();
    playerAttackDueAt = nowMs() + cooldown;
    playerAttackTimeout = setTimeout(() => {
        playerAttackTimeout = null;
        playerAttackDueAt = null;
        if (!player || !player.inCombat) {
            setPlayerAttackReady(false);
            return;
        }
        if (combatPaused) {
            playerAttackRemaining = 0;
            return;
        }
        setPlayerAttackReady(true);
    }, cooldown);
};

const maybeAutoAttack = () => {
    if (!playerAttackReady) {
        return;
    }
    if (!player || !player.inCombat) {
        return;
    }
    if (combatPaused) {
        return;
    }

    if (typeof autoMode !== 'undefined' && autoMode) {
        if (!specialAbilityCooldown && shouldAutoUseSpecialAbility()) {
            autoAttackDelayTimeout = setTimeout(() => {
                useSpecialAbility();
                return;
            }, 200);
        }
    }

    const autoAttackEnabled = typeof autoAttack !== 'undefined' ? autoAttack : false;
    if (!autoAttackEnabled) {
        return;
    }
    if (autoAttackDelayTimeout !== null) {
        return;
    }
    autoAttackDelayTimeout = setTimeout(() => {
        autoAttackDelayTimeout = null;
        if (!playerAttackReady) {
            return;
        }
        if (!player || !player.inCombat) {
            return;
        }
        if (combatPaused) {
            return;
        }
        if (typeof autoAttack !== 'undefined' && autoAttack) {
            playerAttack();
        }
    }, 200);
};

if (typeof window !== 'undefined') {
    window.maybeAutoAttack = maybeAutoAttack;
}
// ========== Validation ==========
const hpValidation = () => {
    const deathMessage = player.hardcore
        ? "Hardcore mode: you lose all <b>inventory</b> and <b>gold</b>."
        : "You keep your <b>inventory</b> and <b>gold</b>.";
    // Prioritizes player death before the enemy
    if (player.stats.hp < 1) {
        player.stats.hp = 0;
        playerDead = true;
        player.deaths++;
        if (player.hardcore) {
            addCombatLog(t('you-died-hardcore'));
        } else {
            addCombatLog(t('you-died-softcore'));
        }
        document.querySelector("#battleButton").addEventListener("click", function () {
            sfxConfirm.play();
            playerDead = false;

            // Reset all the necessary stats and return to menu
            let dimDungeon = document.querySelector('#dungeon-main');
            dimDungeon.style.filter = "brightness(100%)";
            dimDungeon.style.display = "none";
            combatPanel.style.display = "none";
            runLoad("title-screen", "flex");
            clearInterval(dungeonTimer);
            clearInterval(playTimer);
            progressReset(true);
        });
        endCombat();
    } else if (enemy.stats.hp < 1) {
        // Gives out all the reward and show the claim button
        enemy.stats.hp = 0;
        enemyDead = true;
        player.kills++;
        if (typeof recordBestiaryKill === 'function') {
            recordBestiaryKill(enemy.id);
        }
        dungeon.statistics.kills++;
        const timeStamp = new Date(combatSeconds * 1000).toISOString().substring(14, 19);
    addCombatLog(t('enemy-defeated-reward', { enemy: enemy.name, exp: nFormatter(enemy.rewards.exp), gold: nFormatter(enemy.rewards.gold), time: timeStamp }));
        playerExpGain();
        if (activeCompanion && activeCompanion.isActive) {
            activeCompanion.gainExperience(enemy.rewards.exp / 10);
        }
        player.gold += enemy.rewards.gold;
        playerLoadStats();
        if (enemy.rewards.drop) {
            createEquipmentPrint("combat");
        }

        // Recover 20% of players health
        player.stats.hp += Math.round((player.stats.hpMax * 20) / 100);
        playerLoadStats();

        // Close the battle panel
        document.querySelector("#battleButton").addEventListener("click", function () {
            sfxConfirm.play();

            if (enemy.condition === "guardian") {
                incrementRoom();
                clearFloorBuffs();
                addDungeonLog(t('moved-to-next-floor'));
            } else if (enemy.condition === "door") {
                addDungeonLog(t('moved-to-next-floor'));
            }

            // Clear combat backlog and transition to dungeon exploration
            let dimDungeon = document.querySelector('#dungeon-main');
            dimDungeon.style.filter = "brightness(100%)";
            bgmDungeon.play();

            dungeon.status.event = false;
            combatPanel.style.display = "none";
            enemyDead = false;
            combatBacklog.length = 0;
            findCompanionAfterCombat(enemy.lvl);
            if (typeof window !== 'undefined' && typeof window.showLevelUpModalIfPending === 'function') {
                window.showLevelUpModalIfPending();
            } else if (typeof showLevelUpModalIfPending === 'function') {
                showLevelUpModalIfPending();
            }
        });
        autoClaim();
        endCombat();
    }
}

// ========== Attack Functions ==========
const playerAttack = () => {
    if (!player.inCombat || !playerAttackReady || combatPaused) {
        return;
    }
    setPlayerAttackReady(false);
    if (playerAttackTimeout) {
        clearTimeout(playerAttackTimeout);
        playerAttackTimeout = null;
        playerAttackDueAt = null;
    }
    if (player.inCombat) {
        sfxAttack.play();
    }

    // Calculates the damage and attacks the enemy
    let crit;
    let damage = player.stats.atk * (player.stats.atk / (player.stats.atk + enemy.stats.def));
    // Randomizes the damage by 90% - 110%
    let dmgRange = 0.9 + Math.random() * 0.2;
    damage = damage * dmgRange;
    // Check if the attack is a critical hit
    if (Math.floor(Math.random() * 100) < player.stats.critRate) {
        crit = true;
        dmgtype = t('crit-damage');
        damage = Math.round(damage * (1 + (player.stats.critDmg / 100)));
    } else {
        crit = false;
        dmgtype = t('damage');
        damage = Math.round(damage);
    }

    // Skill effects
    objectValidation();
    if (player.skills.includes("Remnant Razor")) {
        // Attacks deal extra 9% of enemies' current health on hit
        damage += Math.round((9 * enemy.stats.hp) / 100);
    }
    if (player.skills.includes("Titan's Will")) {
        // Attacks deal extra 4.5% of your maximum health on hit
        damage += Math.round((4.5 * player.stats.hpMax) / 100);
    }
    if (player.skills.includes("Devastator")) {
        // Deal 30% more damage but you lose 30% base attack speed
        damage = Math.round(damage + ((30 * damage) / 100));
    }

    // Lifesteal formula
    let lifesteal = Math.round(damage * (player.stats.vamp / 100));

    // Enemy dodge chance
    let dodged = false;
    if (Math.random() < enemy.stats.dodge / 100) {
        addCombatLog(t('dodged-attack-enemy', { enemy: enemy.name }));
        damage = 0;
        lifesteal = 0;
        dodged = true;
    }

    // Apply the calculations to combat
    enemy.stats.hp -= damage;
    player.stats.hp += lifesteal;
    if (!dodged) {
        addCombatLog(t('player-attack-hit', { player: player.name, enemy: enemy.name, value: nFormatter(damage), type: dmgtype }));
    }
    hpValidation();
    playerLoadStats();
    enemyLoadStats();

    // Damage effect
    let enemySprite = document.querySelector("#enemy-sprite");
    enemySprite.classList.add("animation-shake");
    setTimeout(() => {
        enemySprite.classList.remove("animation-shake");
    }, 200);

    // Damage numbers
    const dmgContainer = document.querySelector("#dmg-container");
    const dmgNumber = document.createElement("p");
    dmgNumber.classList.add("dmg-numbers");
    if (crit) {
        dmgNumber.style.color = "gold";
        dmgNumber.innerHTML = nFormatter(damage) + "!";
    } else {
        dmgNumber.innerHTML = nFormatter(damage);
    }
    dmgContainer.appendChild(dmgNumber);
    setTimeout(() => {
        dmgContainer.removeChild(dmgContainer.lastElementChild);
    }, 370);

    // Attack cooldown timer
    if (player.inCombat) {
        schedulePlayerAttackCooldown();
    }
}

// Companion Attack
const companionAttack = () => {
    if (!player.inCombat || combatPaused) {
        return;
    }
    if (player.inCombat) {
        sfxAttack.play();
    }

    // Calculates the damage and attacks the enemy
    let crit;
    let damage = activeCompanion.atk * (activeCompanion.atk / (activeCompanion.atk + enemy.stats.def));
    // Randomizes the damage by 90% - 110%
    let dmgRange = 0.9 + Math.random() * 0.2;
    damage = damage * dmgRange;
    // Check if the attack is a critical hit
    if (Math.floor(Math.random() * 100) < activeCompanion.critRate) {
        crit = true;
        dmgtype = t('crit-damage');
        damage = Math.round(damage * (1 + (activeCompanion.critDmg / 100)));
    } else {
        crit = false;
        dmgtype = t('damage');
        damage = Math.round(damage);
    }

    // Enemy dodge chance
    let dodged = false;
    if (Math.random() < enemy.stats.dodge / 100) {
        addCombatLog(t('dodged-attack-companion', { enemy: enemy.name, companion: activeCompanion.name }));
        damage = 0;
        dodged = true;
    }

    // Apply the calculations to combat
    enemy.stats.hp -= damage;
    if (!dodged) {
        addCombatLog(t('companion-attack-hit', { companion: activeCompanion.name, enemy: enemy.name, value: nFormatter(damage), type: dmgtype }));
    }
    hpValidation();
    playerLoadStats();
    enemyLoadStats();

    // Damage effect
    let enemySprite = document.querySelector("#enemy-sprite");
    enemySprite.classList.add("animation-shake");
    setTimeout(() => {
        enemySprite.classList.remove("animation-shake");
    }, 200);

    // Damage numbers
    const dmgContainer = document.querySelector("#dmg-container");
    const dmgNumber = document.createElement("p");
    dmgNumber.classList.add("dmg-numbers");
    if (crit) {
        dmgNumber.style.color = "gold";
        dmgNumber.innerHTML = nFormatter(damage) + "!";
    } else {
        dmgNumber.innerHTML = nFormatter(damage);
    }
    dmgContainer.appendChild(dmgNumber);
    setTimeout(() => {
        dmgContainer.removeChild(dmgContainer.lastElementChild);
    }, 370);

    // Attack Timer
    if (player.inCombat) {
        scheduleCompanionAttack();
    }
}

const enemyAttack = () => {
    if (!player.inCombat || combatPaused) {
        return;
    }
    if (player.inCombat) {
        sfxAttack.play();
    }

    // Calculates the damage and attacks the player
    let damage = enemy.stats.atk * (enemy.stats.atk / (enemy.stats.atk + player.stats.def));
    let lifesteal = Math.round(enemy.stats.atk * (enemy.stats.vamp / 100));
    // Randomizes the damage by 90% - 110%
    let dmgRange = 0.9 + Math.random() * 0.2;
    damage = damage * dmgRange;
    // Check if the attack is a critical hit
    if (Math.floor(Math.random() * 100) < enemy.stats.critRate) {
        dmgtype = t('crit-damage');
        damage = Math.round(damage * (1 + (enemy.stats.critDmg / 100)));
    } else {
        dmgtype = t('damage');
        damage = Math.round(damage);
    }

    // Player dodge chance
    let dodged = false;
    if (Math.random() < player.stats.dodge / 100) {
        addCombatLog(t('dodged-attack-player', { player: player.name }));
        damage = 0;
        dodged = true;
    }

    // Skill effects
    if (player.skills.includes("Paladin's Heart")) {
        // You receive 25% less damage
        damage = Math.round(damage - ((25 * damage) / 100));
    }

    // Apply the calculations
    player.stats.hp -= damage;
    // Aegis Thorns skill
    objectValidation();
    if (player.skills.includes("Aegis Thorns")) {
        // Enemies receive 30% of the damage they dealt
        enemy.stats.hp -= Math.round((30 * damage) / 100);
    }
    enemy.stats.hp += lifesteal;
    if (!dodged) {
        addCombatLog(t('enemy-attack-hit', { enemy: enemy.name, player: player.name, value: nFormatter(damage), type: dmgtype }));
    }
    hpValidation();
    playerLoadStats();
    enemyLoadStats();

    // Damage effect
    let playerPanel = document.querySelector('#playerPanel');
    playerPanel.classList.add("animation-shake");
    setTimeout(() => {
        playerPanel.classList.remove("animation-shake");
    }, 200);

    // Attack Timer
    if (player.inCombat) {
        scheduleEnemyAttack();
    }
}

// ========== Combat Backlog ==========
const MAX_COMBAT_LOGS = 50
const combatBacklog = [];

// Add a log to the combat backlog
const addCombatLog = (message) => {
    combatBacklog.push(message)
    if (combatBacklog.length > MAX_COMBAT_LOGS) {
        combatBacklog.shift()
    }
    updateCombatLog()
}

// Displays every combat activity
const updateCombatLog = () => {
    let combatLogBox = document.getElementById("combatLogBox");
    if (!combatLogBox) return;

    combatLogBox.innerHTML = "";

    // Determine log flow direction (default: bottom)
    const logFlow = (localStorage.getItem('logFlow') || 'bottom');
    const messages = (logFlow === 'top') ? [...combatBacklog].reverse() : combatBacklog;

    for (let message of messages) {
        let logElement = document.createElement("p");
        logElement.innerHTML = message;
        combatLogBox.appendChild(logElement);
    }

    // Append decision button according to flow preference
    const appendDecisionPanel = (html) => {
        let panel = document.createElement("div");
        panel.className = "decision-panel";
        panel.innerHTML = html;
        if (logFlow === 'top') {
            // Insert right after the newest log (first child)
            if (combatLogBox.firstChild) {
                combatLogBox.insertBefore(panel, combatLogBox.children[1] || null);
            } else {
                combatLogBox.appendChild(panel);
            }
        } else {
            combatLogBox.appendChild(panel);
        }
    };

    if (enemyDead) {
        appendDecisionPanel(`<button id="battleButton" data-i18n="claim">${t('claim')}</button>`);
    }

    if (playerDead) {
        appendDecisionPanel(`<button id="battleButton" data-i18n="start-new-run">${t('start-new-run')}</button>`);
    }

    // Adjust scroll to match flow
    if (logFlow === 'top') {
        combatLogBox.scrollTop = 0;
    } else {
        combatLogBox.scrollTop = combatLogBox.scrollHeight;
    }
}

// Combat Timer
let combatSeconds = 0;

const isAutoSpecialFeatureActive = () => {
    if (typeof autoMode === 'undefined' || typeof autoSpecialAbility === 'undefined') {
        return false;
    }
    return autoMode && autoSpecialAbility;
};

const shouldAutoUseSpecialAbility = () => {
    if (!player || !player.inCombat) {
        return false;
    }
    if (!isAutoSpecialFeatureActive()) {
        return false;
    }
    if (specialAbilityCooldown) {
        return false;
    }
    if (!playerAttackReady) {
        return false;
    }
    if (player.selectedClass === "Paladin") {
        const hpMax = Math.max(1, player.stats.hpMax || 1);
        const hpRatio = player.stats.hp / hpMax;
        if (hpRatio > 0.4) {
            return false;
        }
    }
    return true;
};

const startCombat = (battleMusic) => {
    currentBattleMusic = battleMusic;
    bgmDungeon.pause();
    sfxEncounter.play();
        currentBattleMusic.play();
    player.inCombat = true;
    combatPaused = false;
    if (playerAttackTimeout) {
        clearTimeout(playerAttackTimeout);
        playerAttackTimeout = null;
    }
    playerAttackDueAt = null;
    playerAttackRemaining = null;
    if (enemyAttackTimeout) {
        clearTimeout(enemyAttackTimeout);
        enemyAttackTimeout = null;
    }
    enemyAttackDueAt = null;
    enemyAttackRemaining = null;
    if (companionAttackTimeout) {
        clearTimeout(companionAttackTimeout);
        companionAttackTimeout = null;
    }
    companionAttackDueAt = null;
    companionAttackRemaining = null;
    if (specialAbilityTimeout) {
        clearTimeout(specialAbilityTimeout);
        specialAbilityTimeout = null;
    }
    specialAbilityCooldown = false;
    specialAbilityDueAt = null;
    specialAbilityRemaining = null;
    combatTimerWasRunning = false;

    // Add companion involvement
    scheduleCompanionAttack();

    // Starts the timer for player and enemy attacks along with combat timer
    scheduleEnemyAttack();
    let dimDungeon = document.querySelector('#dungeon-main');
    dimDungeon.style.filter = "brightness(50%)";

    playerLoadStats();
    enemyLoadStats();

    dungeon.status.event = true;
    combatPanel.style.display = "flex";

    window.setTimeout(() => setPlayerAttackReady(true), 200);
    combatTimer = setInterval(combatCounter, 1000);
}

const endCombat = () => {
    currentBattleMusic.stop();
    sfxCombatEnd.play();
    player.inCombat = false;
    combatPaused = false;
    if (playerAttackTimeout) {
        clearTimeout(playerAttackTimeout);
        playerAttackTimeout = null;
    }
    playerAttackDueAt = null;
    playerAttackRemaining = null;
    if (enemyAttackTimeout) {
        clearTimeout(enemyAttackTimeout);
        enemyAttackTimeout = null;
    }
    enemyAttackDueAt = null;
    enemyAttackRemaining = null;
    if (companionAttackTimeout) {
        clearTimeout(companionAttackTimeout);
        companionAttackTimeout = null;
    }
    companionAttackDueAt = null;
    companionAttackRemaining = null;
    if (specialAbilityTimeout) {
        clearTimeout(specialAbilityTimeout);
        specialAbilityTimeout = null;
    }
    specialAbilityCooldown = false;
    specialAbilityDueAt = null;
    specialAbilityRemaining = null;
    setPlayerAttackReady(false);
    clearAutoAttackDelay();
    // Skill validation

    // Stops every timer in combat
    if (combatTimer) {
        clearInterval(combatTimer);
        combatTimer = null;
    }
    combatTimerWasRunning = false;
    combatSeconds = 0;
}

const combatCounter = () => {
    combatSeconds++;
}

const useSpecialAbility = () => {
    if (!player || !player.inCombat || specialAbilityCooldown || !playerAttackReady || combatPaused) {
        return;
    }
    setPlayerAttackReady(false);
    if (playerAttackTimeout) {
        clearTimeout(playerAttackTimeout);
        playerAttackTimeout = null;
        playerAttackDueAt = null;
        playerAttackRemaining = null;
    }
    if (player.inCombat) {
        schedulePlayerAttackCooldown();
    }
    if (player.selectedClass === "Paladin") {
        sfxBuff.play();
        const healAmount = Math.round(player.stats.hpMax);
        player.stats.hp = Math.min(player.stats.hp + healAmount, player.stats.hpMax);
    addCombatLog(t('special-ability-heal', { player: player.name, hp: nFormatter(healAmount) }));
        hpValidation();
        playerLoadStats();
    } else {
        sfxAttack.play();

        let crit;
        const baseAtk = player.stats.atk * 1.5;
        let damage = baseAtk * (baseAtk / (baseAtk + enemy.stats.def));
        // Randomize the damage by 90% - 110%
        let dmgRange = 0.9 + Math.random() * 0.2;
        damage = damage * dmgRange;

        // Check if the attack is a critical hit
        if (Math.floor(Math.random() * 100) < player.stats.critRate) {
            crit = true;
            dmgtype = t('crit-damage');
            damage = Math.round(damage * (1 + (player.stats.critDmg / 100)));
        } else {
            crit = false;
            dmgtype = t('damage');
            damage = Math.round(damage);
        }

        // Skill effects
        objectValidation();
        if (player.skills.includes("Remnant Razor")) {
            // Attacks deal extra 9% of enemies' current health on hit
            damage += Math.round((9 * enemy.stats.hp) / 100);
        }
        if (player.skills.includes("Titan's Will")) {
            // Attacks deal extra 4.5% of your maximum health on hit
            damage += Math.round((4.5 * player.stats.hpMax) / 100);
        }
        if (player.skills.includes("Devastator")) {
            // Deal 30% more damage but you lose 30% base attack speed
            damage = Math.round(damage + ((30 * damage) / 100));
        }

        // Lifesteal formula
        let lifesteal = Math.round(damage * (player.stats.vamp / 100));

        // Enemy dodge chance
        let dodged = false;
        if (Math.random() < enemy.stats.dodge / 100) {
            addCombatLog(t('dodged-attack-enemy', { enemy: enemy.name }));
            damage = 0;
            lifesteal = 0;
            dodged = true;
        }

        // Apply calculations
        enemy.stats.hp -= damage;
        player.stats.hp += lifesteal;
        if (!dodged) {
            addCombatLog(t('special-ability-attack-hit', { player: player.name, value: nFormatter(damage), type: dmgtype }));
        }
        hpValidation();
        playerLoadStats();
        enemyLoadStats();

        // Damage effect
        let enemySprite = document.querySelector("#enemy-sprite");
        enemySprite.classList.add("animation-shake");
        setTimeout(() => {
            enemySprite.classList.remove("animation-shake");
        }, 200);

        // Damage numbers
        const dmgContainer = document.querySelector("#dmg-container");
        const dmgNumber = document.createElement("p");
        dmgNumber.classList.add("dmg-numbers");
        if (crit) {
            dmgNumber.style.color = "gold";
            dmgNumber.innerHTML = nFormatter(damage) + "!";
        } else {
            dmgNumber.innerHTML = nFormatter(damage);
        }
        dmgContainer.appendChild(dmgNumber);
        setTimeout(() => {
            dmgContainer.removeChild(dmgContainer.lastElementChild);
        }, 370);

        // If the special ability kills the enemy, reset the cooldown immediately
        if (enemy.stats.hp <= 0 || enemyDead) {
            if (specialAbilityTimeout) {
                clearTimeout(specialAbilityTimeout);
                specialAbilityTimeout = null;
            }
            specialAbilityCooldown = false;
            specialAbilityDueAt = null;
            specialAbilityRemaining = null;
            updateSpecialAbilityButtonState();
            return;
        }
    }

    specialAbilityCooldown = true;
    specialAbilityDueAt = null;
    specialAbilityRemaining = null;
    updateSpecialAbilityButtonState();
    scheduleSpecialAbilityReset(10000);
}

const showCombatInfo = () => {
    if (!player.inCombat) {
        if (specialAbilityTimeout) {
            clearTimeout(specialAbilityTimeout);
            specialAbilityTimeout = null;
        }
        specialAbilityCooldown = false;
        specialAbilityDueAt = null;
        specialAbilityRemaining = null;
    }
    // Re-evaluate enemy name in case language changed after spawn
    // if (typeof getEnemyTranslatedName === 'function' && enemy.id != null) {
        enemy.name = getEnemyTranslatedName(enemy.id);
    // }
    const autoAttackEnabled = typeof autoAttack === 'undefined' ? false : autoAttack;
    const autoAttackCheckedAttr = autoAttackEnabled ? 'checked' : '';
    document.querySelector('#combatPanel').innerHTML = `
    <div class="content">
        <div class="battle-info-panel center" id="enemyPanel">
            <p>${enemy.name} Lv.${enemy.lvl}</p>
            <div class="battle-bar empty-bar hp bb-hp">
                <div class="battle-bar dmg bb-hp" id="enemy-hp-dmg"></div>
                <div class="battle-bar current bb-hp" id="enemy-hp-battle">
                    &nbsp${nFormatter(enemy.stats.hp)}/${nFormatter(enemy.stats.hpMax)}(${enemy.stats.hpPercent}%)
                </div>
            </div>
            <div id="dmg-container"></div>
            <img src="./assets/sprites/${enemy.image.name}.webp" alt="${enemy.name}" width="${enemy.image.size}" id="enemy-sprite">
        </div>
        <div class="battle-info-panel primary-panel" id="playerPanel">
            <p id="player-combat-info"></p>
            <div class="battle-bar empty-bar bb-hp">
                <div class="battle-bar dmg bb-hp" id="player-hp-dmg"></div>
                <div class="battle-bar current bb-hp" id="player-hp-battle">
                    &nbsp${nFormatter(player.stats.hp)}/${nFormatter(player.stats.hpMax)}(${player.stats.hpPercent}%)
                </div>
            </div>
            <div class="battle-bar empty-bar bb-xb">
                <div class="battle-bar current bb-xb" id="player-exp-bar">exp</div>
            </div>
            <div class="attack-controls">
                <button id="player-attack-btn" data-i18n="attack">${t('attack')}</button>
                <label class="auto-attack-toggle">
                    <input type="checkbox" id="auto-attack-combat-toggle" ${autoAttackCheckedAttr}>
                    <span data-i18n="auto-attack">${t('auto-attack')}</span>
                </label>
            </div>
            <button id="special-ability-btn" data-i18n="special-ability">${t('special-ability')}</button>
        </div>
        <div class="logBox primary-panel">
            <div id="combatLogBox"></div>
        </div>
    </div>
    `;
    const attackBtn = document.querySelector('#player-attack-btn');
    if (attackBtn) {
        attackBtn.addEventListener('click', () => {
            playerAttack();
        });
    }
    const autoAttackToggle = document.querySelector('#auto-attack-combat-toggle');
    if (autoAttackToggle) {
        autoAttackToggle.addEventListener('change', (event) => {
            const enabled = event.target.checked;
            if (typeof autoAttack !== 'undefined') {
                autoAttack = enabled;
            }
            try {
                localStorage.setItem('autoAttack', enabled);
            } catch (err) {
                console.warn('Failed to persist auto-attack preference', err);
            }
            if (enabled) {
                maybeAutoAttack();
            } else {
                clearAutoAttackDelay();
            }
        });
    }
    document.querySelector('#special-ability-btn').addEventListener('click', useSpecialAbility);
    updateAttackButtonState();
    updateSpecialAbilityButtonState();
}

// Pause combat timers and mute sounds when the app loses focus
document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
        pauseCombatTimers();
        if (typeof Howler !== "undefined" && Howler && typeof Howler.mute === "function") {
            Howler.mute(true);
        }
    } else {
        if (typeof Howler !== "undefined" && Howler && typeof Howler.mute === "function") {
            Howler.mute(false);
        }
        resumeCombatTimers();
    }
});

document.addEventListener("pause", () => {
    pauseCombatTimers();
    if (typeof Howler !== "undefined" && Howler && typeof Howler.mute === "function") {
        Howler.mute(true);
    }
}, false);

document.addEventListener("resume", () => {
    if (typeof Howler !== "undefined" && Howler && typeof Howler.mute === "function") {
        Howler.mute(false);
    }
    resumeCombatTimers();
}, false);

if (typeof window !== "undefined" && window.Capacitor && window.Capacitor.App && typeof window.Capacitor.App.addListener === "function") {
    window.Capacitor.App.addListener("appStateChange", ({ isActive }) => {
        if (isActive) {
            if (typeof Howler !== "undefined" && Howler && typeof Howler.mute === "function") {
                Howler.mute(false);
            }
            resumeCombatTimers();
        } else {
            pauseCombatTimers();
            if (typeof Howler !== "undefined" && Howler && typeof Howler.mute === "function") {
                Howler.mute(true);
            }
        }
    });
}
