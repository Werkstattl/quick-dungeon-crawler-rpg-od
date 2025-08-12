const combatPanel = document.querySelector("#combatPanel")
let enemyDead = false;
let playerDead = false;
let currentBattleMusic = false;

let playerAttackTimeout;
let enemyAttackTimeout;
let companionAttackTimeout;
// ========== Validation ==========
const hpValidation = () => {
    const deathMessages = player.hardcore ? [
        "In <b>hardcore</b> mode, death claims all. Your <b>inventory</b> and <b>gold</b> are lost for good.",
        "No mercy in <b>hardcore</b>—your <b>inventory</b> and <b>gold</b> vanish as you fall.",
        "You perish and with you all <b>inventory</b> and <b>gold</b>. Prepare to start anew."
    ] : [
        "But don’t worry, you still have your <b>inventory</b> and <b>gold</b>. Try again!",
        "That’s unfortunate, but not the end. Your <b>inventory</b> and <b>gold</b> are safe with you. Go for another round!",
        "It’s a tough world out there, but you’re tougher. You keep your <b>inventory</b> and <b>gold</b> even after death. Don’t give up!",
        "But death is not the final destination. You retain your <b>inventory</b> and <b>gold</b> as you respawn. Keep exploring!",
        "That’s a setback, but not a failure. Your <b>inventory</b> and <b>gold</b> remain intact. You can do better!"
    ];
    // Prioritizes player death before the enemy
    if (player.stats.hp < 1) {
        player.stats.hp = 0;
        playerDead = true;
        player.deaths++;
        addCombatLog('You died! ' + deathMessages[Math.floor(Math.random() * deathMessages.length)]);
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
        addCombatLog(`${enemy.name} died! (${new Date(combatSeconds * 1000).toISOString().substring(14, 19)})`);
        addCombatLog(`You earned ${nFormatter(enemy.rewards.exp)} exp.`)
        playerExpGain();
        if (activeCompanion && activeCompanion.isActive) {
            activeCompanion.gainExperience(enemy.rewards.exp / 10);
        }
        addCombatLog(`${enemy.name} dropped <i class="fas fa-coins" style="color: #FFD700;"></i>${nFormatter(enemy.rewards.gold)} gold.`)
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
                addDungeonLog("You moved to the next floor.");
            } else if (enemy.condition === "door") {
                addDungeonLog("You moved to the next floor.");
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
        dmgtype = "crit damage";
        damage = Math.round(damage * (1 + (player.stats.critDmg / 100)));
    } else {
        crit = false;
        dmgtype = "damage";
        damage = Math.round(damage);
    }

    // Skill effects
    objectValidation();
    if (player.skills.includes("Remnant Razor")) {
        // Attacks deal extra 8% of enemies' current health on hit
        damage += Math.round((8 * enemy.stats.hp) / 100);
    }
    if (player.skills.includes("Titan's Will")) {
        // Attacks deal extra 4% of your maximum health on hit
        damage += Math.round((4 * player.stats.hpMax) / 100);
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
        addCombatLog(`${enemy.name} dodged the attack!`);
        damage = 0;
        lifesteal = 0;
        dodged = true;
    }

    // Apply the calculations to combat
    enemy.stats.hp -= damage;
    player.stats.hp += lifesteal;
    if (!dodged) {
        addCombatLog(`${player.name} dealt ` + nFormatter(damage) + ` ${dmgtype} to ${enemy.name}.`);
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
        dmgtype = "crit damage";
        damage = Math.round(damage * (1 + (activeCompanion.critDmg / 100)));
    } else {
        crit = false;
        dmgtype = "damage";
        damage = Math.round(damage);
    }

    // Enemy dodge chance
    let dodged = false;
    if (Math.random() < enemy.stats.dodge / 100) {
        addCombatLog(`${enemy.name} dodged ${activeCompanion.name}'s attack!`);
        damage = 0;
        dodged = true;
    }

    // Apply the calculations to combat
    enemy.stats.hp -= damage;
    if (!dodged) {
        addCombatLog(`${activeCompanion.name} dealt ` + nFormatter(damage) + ` ${dmgtype} to ${enemy.name}.`);
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
        dmgtype = "crit damage";
        damage = Math.round(damage * (1 + (enemy.stats.critDmg / 100)));
    } else {
        dmgtype = "damage";
        damage = Math.round(damage);
    }

    // Player dodge chance
    let dodged = false;
    if (Math.random() < player.stats.dodge / 100) {
        addCombatLog(`${player.name} dodged the attack!`);
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
        // Enemies receive 15% of the damage they dealt
        enemy.stats.hp -= Math.round((15 * damage) / 100);
    }
    enemy.stats.hp += lifesteal;
    if (!dodged) {
        addCombatLog(`${enemy.name} dealt ` + nFormatter(damage) + ` ${dmgtype} to ${player.name}.`);
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
    combatLogBox.innerHTML = "";

    for (let message of combatBacklog) {
        let logElement = document.createElement("p");
        logElement.innerHTML = message;
        combatLogBox.appendChild(logElement);
    }

    if (enemyDead) {
        let button = document.createElement("div");
        button.className = "decision-panel";
        button.innerHTML = `<button id="battleButton">Claim</button>`;
        combatLogBox.appendChild(button);
    }

    if (playerDead) {
        let button = document.createElement("div");
        button.className = "decision-panel";
        button.innerHTML = `<button id="battleButton">Start new Run</button>`;
        combatLogBox.appendChild(button);
    }

    combatLogBox.scrollTop = combatLogBox.scrollHeight;
}

// Combat Timer
let combatSeconds = 0;

const startCombat = (battleMusic) => {
    currentBattleMusic = battleMusic;
    bgmDungeon.pause();
    sfxEncounter.play();
	currentBattleMusic.play();
    player.inCombat = true;
    clearTimeout(playerAttackTimeout);
    clearTimeout(enemyAttackTimeout);
    clearTimeout(companionAttackTimeout);

    // Add companion involvement
    if (activeCompanion && activeCompanion.isActive) {
        addCombatLog(`${activeCompanion.name} joins the battle!`);
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
}

const endCombat = () => {
    currentBattleMusic.stop();
    sfxCombatEnd.play();
    player.inCombat = false;
    clearTimeout(playerAttackTimeout);
    clearTimeout(enemyAttackTimeout);
    clearTimeout(companionAttackTimeout);
    // Skill validation

    // Stops every timer in combat
    clearInterval(combatTimer);
    combatSeconds = 0;
}

const combatCounter = () => {
    combatSeconds++;
}

const showCombatInfo = () => {
    document.querySelector('#combatPanel').innerHTML = `
    <div class="content">
        <div class="battle-info-panel center" id="enemyPanel">
            <p>${enemy.name} Lv.${enemy.lvl}</p>
            <div class="battle-bar empty-bar hp bb-hp">
                <div class="battle-bar dmg bb-hp" id="enemy-hp-dmg"></div>
                <div class="battle-bar current bb-hp" id="enemy-hp-battle">
                    &nbsp${nFormatter(enemy.stats.hp)}/${nFormatter(enemy.stats.hpMax)}<br>(${enemy.stats.hpPercent}%)
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
        </div>
        <div class="logBox primary-panel">
            <div id="combatLogBox"></div>
        </div>
    </div>
    `;
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

