const combatPanel = document.querySelector("#combatPanel")
let enemyDead = false;
let playerDead = false;
let currentBattleMusic = false;

let playerAttackTimeout;
let enemyAttackTimeout;
let companionAttackTimeout;
let specialAbilityTimeout;
let specialAbilityCooldown = false;
let autoSpecialAbilityInterval;
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
        });
        autoClaim();
        endCombat();
    }
}

// ========== Attack Functions ==========
const playerAttack = () => {
    if (!player.inCombat) {
        return;
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

    // Attack Timer
    if (player.inCombat) {
        playerAttackTimeout = setTimeout(() => {
            if (player.inCombat) {
                playerAttack();
            }
        }, (1000 / player.stats.atkSpd));
    }
}

// Companion Attack
const companionAttack = () => {
    if (!player.inCombat) {
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
        companionAttackTimeout = setTimeout(() => {
            if (player.inCombat) {
                companionAttack();
            }
        }, (1000 / activeCompanion.atkSpd));
    }
}

const enemyAttack = () => {
    if (!player.inCombat) {
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
        // Enemies receive 20% of the damage they dealt
        enemy.stats.hp -= Math.round((20 * damage) / 100);
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
        enemyAttackTimeout = setTimeout(() => {
            if (player.inCombat) {
                enemyAttack();
            }
        }, (1000 / enemy.stats.atkSpd));
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
    if (player.selectedClass === "Paladin" && player.stats.hp >= player.stats.hpMax) {
        return false;
    }
    return true;
};

const startAutoSpecialAbilityLoop = () => {
    clearInterval(autoSpecialAbilityInterval);
    if (!player || !player.inCombat) {
        return;
    }
    if (!isAutoSpecialFeatureActive()) {
        return;
    }

    if (shouldAutoUseSpecialAbility()) {
        useSpecialAbility();
    }

    autoSpecialAbilityInterval = setInterval(() => {
        if (!player || !player.inCombat) {
            stopAutoSpecialAbilityLoop();
            return;
        }
        if (shouldAutoUseSpecialAbility()) {
            useSpecialAbility();
        }
    }, 750);
};

const stopAutoSpecialAbilityLoop = () => {
    clearInterval(autoSpecialAbilityInterval);
    autoSpecialAbilityInterval = null;
};

const startCombat = (battleMusic) => {
    currentBattleMusic = battleMusic;
    bgmDungeon.pause();
    sfxEncounter.play();
        currentBattleMusic.play();
    player.inCombat = true;
    clearTimeout(playerAttackTimeout);
    clearTimeout(enemyAttackTimeout);
    clearTimeout(companionAttackTimeout);
    clearTimeout(specialAbilityTimeout);
    specialAbilityCooldown = false;

    // Add companion involvement
    if (activeCompanion && activeCompanion.isActive) {
//        addCombatLog(`${activeCompanion.name} joins the battle!`);
        companionAttackTimeout = setTimeout(companionAttack, (1000 / activeCompanion.atkSpd));
    }

    // Starts the timer for player and enemy attacks along with combat timer
    playerAttackTimeout = setTimeout(playerAttack, (1000 / player.stats.atkSpd));
    enemyAttackTimeout = setTimeout(enemyAttack, (1000 / enemy.stats.atkSpd));
    let dimDungeon = document.querySelector('#dungeon-main');
    dimDungeon.style.filter = "brightness(50%)";

    playerLoadStats();
    enemyLoadStats();

    dungeon.status.event = true;
    combatPanel.style.display = "flex";

    combatTimer = setInterval(combatCounter, 1000);
    startAutoSpecialAbilityLoop();
}

const endCombat = () => {
    currentBattleMusic.stop();
    sfxCombatEnd.play();
    player.inCombat = false;
    clearTimeout(playerAttackTimeout);
    clearTimeout(enemyAttackTimeout);
    clearTimeout(companionAttackTimeout);
    clearTimeout(specialAbilityTimeout);
    specialAbilityCooldown = false;
    // Skill validation

    // Stops every timer in combat
    clearInterval(combatTimer);
    combatSeconds = 0;
    stopAutoSpecialAbilityLoop();
}

const combatCounter = () => {
    combatSeconds++;
}

const useSpecialAbility = () => {
    if (!player.inCombat || specialAbilityCooldown) {
        return;
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
            clearTimeout(specialAbilityTimeout);
            specialAbilityCooldown = false;
            const btn = document.querySelector('#special-ability-btn');
            if (btn) {
                btn.disabled = false;
                btn.textContent = t('special-ability');
            }
            return;
        }
    }

    specialAbilityCooldown = true;
    const btn = document.querySelector('#special-ability-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = t('cooling');
    }
    specialAbilityTimeout = setTimeout(() => {
        specialAbilityCooldown = false;
        const btn = document.querySelector('#special-ability-btn');
        if (btn) {
            btn.disabled = false;
            btn.textContent = t('special-ability');
        }
    }, 10000);
}

const showCombatInfo = () => {
    if (!player.inCombat) {
        clearTimeout(specialAbilityTimeout);
        specialAbilityCooldown = false;
    }
    // Re-evaluate enemy name in case language changed after spawn
    // if (typeof getEnemyTranslatedName === 'function' && enemy.id != null) {
        enemy.name = getEnemyTranslatedName(enemy.id);
    // }
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
            <button id="special-ability-btn" ${specialAbilityCooldown ? 'disabled' : ''}>${specialAbilityCooldown ? t('cooling') : t('special-ability')}</button>
        </div>
        <div class="logBox primary-panel">
            <div id="combatLogBox"></div>
        </div>
    </div>
    `;
    document.querySelector('#special-ability-btn').addEventListener('click', useSpecialAbility);
}

// Mute combat sounds when the app loses focus
document.addEventListener("visibilitychange", () => {
    if (!player || !player.inCombat) {
        return;
    }
    if (document.hidden) {
        Howler.mute(true);
    } else {
        Howler.mute(false);
    }
});
