const combatPanel = document.querySelector("#combatPanel")
let enemyDead = false;
let playerDead = false;
let currentBattleMusic = false;

let playerAttackTimeout;
let enemyAttackTimeout;
let companionAttackTimeout;
let specialAbilityTimeout;
let specialAbilityCooldown = false;
let specialAbilityCooldownInterval = null;
let playerAttackReady = false;
let autoAttackDelayTimeout = null;
let combatPaused = false;
let companionSpecialBuffTimeout = null;
let companionSpecialBuffRevert = null;
let scoutDodgeReady = false;

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

let latestCombatLoot = null;
let pendingRunSummary = null;

const SPECIAL_ABILITY_TRANSLATIONS = {
    Knight: 'special-ability-knight',
    Paladin: 'special-ability-paladin',
    Beastmaster: 'special-ability-beastmaster',
    Scout: 'special-ability-scout',
    Rogue: 'special-ability-rogue',
};

// ========== Status Effects ==========
const OPEN_WOUNDS_BLEED_DURATION_SECONDS = 5;
const OPEN_WOUNDS_BLEED_MAX_STACKS = 25;
const OPEN_WOUNDS_BLEED_MAX_HP_PCT_PER_STACK_PER_SECOND = 0.0015; // 0.15%
const ROGUE_SPECIAL_BLEED_BONUS_PER_STACK = 0.05;

const playerHasOpenWounds = () => {
    if (!player) {
        return false;
    }
    const passiveName = (typeof PASSIVE_OPEN_WOUNDS !== 'undefined') ? PASSIVE_OPEN_WOUNDS : 'Open Wounds';
    return (Array.isArray(player.skills) && player.skills.includes(passiveName)) || player.selectedPassive === passiveName;
};

const ensureEnemyBleedState = () => {
    if (!enemy) {
        return null;
    }
    if (!enemy.bleed || typeof enemy.bleed !== 'object') {
        enemy.bleed = { stacks: 0, remainingSeconds: 0 };
    }
    if (!Number.isFinite(enemy.bleed.stacks)) {
        enemy.bleed.stacks = 0;
    }
    if (!Number.isFinite(enemy.bleed.remainingSeconds)) {
        enemy.bleed.remainingSeconds = 0;
    }
    enemy.bleed.stacks = Math.max(0, Math.min(OPEN_WOUNDS_BLEED_MAX_STACKS, Math.round(enemy.bleed.stacks)));
    enemy.bleed.remainingSeconds = Math.max(0, Math.round(enemy.bleed.remainingSeconds));
    return enemy.bleed;
};

const applyOpenWoundsBleedOnHit = () => {
    if (!playerHasOpenWounds()) {
        return;
    }
    const bleed = ensureEnemyBleedState();
    if (!bleed) {
        return;
    }
    bleed.stacks = Math.min(OPEN_WOUNDS_BLEED_MAX_STACKS, bleed.stacks + 1);
    bleed.remainingSeconds = OPEN_WOUNDS_BLEED_DURATION_SECONDS;
};

const tickEnemyBleed = () => {
    if (!player || !player.inCombat || combatPaused || !enemy || !enemy.stats) {
        return;
    }
    if (!enemy.bleed || typeof enemy.bleed !== 'object') {
        return;
    }
    const bleed = ensureEnemyBleedState();
    if (!bleed || bleed.stacks <= 0) {
        return;
    }
    if (bleed.remainingSeconds <= 0) {
        bleed.stacks = 0;
        bleed.remainingSeconds = 0;
        return;
    }
    if (!Number.isFinite(enemy.stats.hp) || enemy.stats.hp <= 0) {
        bleed.remainingSeconds = 0;
        return;
    }

    const hpMax = Math.max(1, Number(enemy.stats.hpMax) || 1);
    const rawDamage = hpMax * OPEN_WOUNDS_BLEED_MAX_HP_PCT_PER_STACK_PER_SECOND * bleed.stacks;
    const damage = Math.max(1, Math.round(rawDamage));
    const applied = Math.min(enemy.stats.hp, damage);
    enemy.stats.hp -= applied;
    if (typeof recordRunDamageDealt === 'function') {
        recordRunDamageDealt(applied);
    }
    bleed.remainingSeconds -= 1;

    enemyLoadStats();
    hpValidation();
};

const nowMs = () => {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
        return performance.now();
    }
    return Date.now();
};

const getPlayerAttackButton = () => document.querySelector('#player-attack-btn');

const ENEMY_FIRST_ATTACK_DELAY = 200;

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

const clearCompanionSpecialBuff = () => {
    if (companionSpecialBuffTimeout) {
        clearTimeout(companionSpecialBuffTimeout);
        companionSpecialBuffTimeout = null;
    }
    if (typeof companionSpecialBuffRevert === 'function') {
        companionSpecialBuffRevert();
        companionSpecialBuffRevert = null;
    }
};

const applyCompanionSpecialBuff = (durationMs = 5000) => {
    if (!activeCompanion || !activeCompanion.isActive) {
        return false;
    }

    clearCompanionSpecialBuff();

    const atkBonus = activeCompanion.atk * 0.5;
    const atkSpdBonus = activeCompanion.atkSpd * 0.5;

    activeCompanion.atk += atkBonus;
    activeCompanion.atkSpd += atkSpdBonus;

    companionSpecialBuffRevert = () => {
        activeCompanion.atk -= atkBonus;
        activeCompanion.atkSpd -= atkSpdBonus;
        companionSpecialBuffRevert = null;
    };

    companionSpecialBuffTimeout = setTimeout(() => {
        clearCompanionSpecialBuff();
    }, durationMs);

    scheduleCompanionAttack();
    return true;
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
    startSpecialAbilityCooldownTicker();
    specialAbilityTimeout = setTimeout(() => {
        specialAbilityTimeout = null;
        specialAbilityDueAt = null;
        if (combatPaused) {
            specialAbilityRemaining = 0;
            stopSpecialAbilityCooldownTicker();
            updateSpecialAbilityCooldownDisplay();
            return;
        }
        specialAbilityCooldown = false;
        updateSpecialAbilityButtonState();
        stopSpecialAbilityCooldownTicker();
        updateSpecialAbilityCooldownDisplay();
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
    stopSpecialAbilityCooldownTicker();
    updateSpecialAbilityCooldownDisplay();
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
        stopSpecialAbilityCooldownTicker();
        updateSpecialAbilityCooldownDisplay();
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

const stopSpecialAbilityCooldownTicker = () => {
    if (specialAbilityCooldownInterval) {
        clearInterval(specialAbilityCooldownInterval);
        specialAbilityCooldownInterval = null;
    }
};

const updateSpecialAbilityCooldownDisplay = () => {
    const btn = document.querySelector('#special-ability-btn');
    if (!btn) {
        return;
    }

    const showDefaultLabel = () => {
        applySpecialAbilityLabel(btn);
    };

    if (!player || !player.inCombat) {
        showDefaultLabel();
        return;
    }

    if (!specialAbilityCooldown) {
        showDefaultLabel();
        return;
    }

    let remainingMs = 0;
    if (specialAbilityDueAt) {
        remainingMs = Math.max(0, specialAbilityDueAt - nowMs());
    } else if (specialAbilityRemaining !== null) {
        remainingMs = Math.max(0, specialAbilityRemaining);
    }

    const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
    const baseLabel = t(getSpecialAbilityTranslationKey());
    btn.textContent = `${baseLabel} (${seconds}s)`;
    btn.removeAttribute('data-i18n');
};

const startSpecialAbilityCooldownTicker = () => {
    stopSpecialAbilityCooldownTicker();
    if (!specialAbilityCooldown) {
        updateSpecialAbilityCooldownDisplay();
        return;
    }
    updateSpecialAbilityCooldownDisplay();
    specialAbilityCooldownInterval = setInterval(() => {
        if (!specialAbilityCooldown) {
            stopSpecialAbilityCooldownTicker();
            updateSpecialAbilityCooldownDisplay();
            return;
        }
        updateSpecialAbilityCooldownDisplay();
    }, 200);
};

const updateSpecialAbilityButtonState = () => {
    const btn = document.querySelector('#special-ability-btn');
    if (!btn) {
        return;
    }

    applySpecialAbilityLabel(btn);
    btn.title = '';

    if (!player || !player.inCombat) {
        btn.disabled = true;
        updateSpecialAbilityCooldownDisplay();
        return;
    }

    if (specialAbilityCooldown || !playerAttackReady) {
        btn.disabled = true;
        btn.title = t('cooling');
        updateSpecialAbilityCooldownDisplay();
        return;
    }

    btn.disabled = false;
    updateSpecialAbilityCooldownDisplay();
};

const getPlayerAttackCooldown = () => {
    const atkSpd = player && player.stats ? player.stats.atkSpd : 1;
    const normalized = Math.max(atkSpd || 0, 0.1);
    return 1000 / normalized;
};

const getSpecialAbilityTranslationKey = () => {
    if (!player || !player.selectedClass) {
        return 'special-ability';
    }
    const key = SPECIAL_ABILITY_TRANSLATIONS[player.selectedClass];
    return key || 'special-ability';
};

const applySpecialAbilityLabel = (btn) => {
    const translationKey = getSpecialAbilityTranslationKey();
    btn.textContent = t(translationKey);
    btn.setAttribute('data-i18n', translationKey);
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
        const runSummary = {
            playerName: player && player.name ? player.name : '',
            level: player && typeof player.lvl === 'number' ? player.lvl : 1,
            hardcore: !!(player && player.hardcore),
            playerClass: player && player.selectedClass ? player.selectedClass : '',
            playerPassive: player && player.selectedPassive ? player.selectedPassive : '',
            curseLevel: (player && Number.isFinite(player.selectedCurseLevel)) ? Math.round(player.selectedCurseLevel) : null,
            runtime: dungeon && dungeon.statistics ? dungeon.statistics.runtime : 0,
            floor: dungeon && dungeon.progress ? dungeon.progress.floor : 1,
            room: dungeon && dungeon.progress ? dungeon.progress.room : 1,
            kills: dungeon && dungeon.statistics ? dungeon.statistics.kills : 0,
            bossesDefeated: (dungeon && dungeon.statistics && Number.isFinite(dungeon.statistics.bossesDefeated))
                ? dungeon.statistics.bossesDefeated
                : 0,
            damageDealt: dungeon && dungeon.statistics ? dungeon.statistics.damageDealt : 0,
            damageTaken: dungeon && dungeon.statistics ? dungeon.statistics.damageTaken : 0,
            goldEarned: dungeon && dungeon.statistics ? dungeon.statistics.goldEarned : 0,
            lootDrops: (dungeon && dungeon.statistics && dungeon.statistics.lootDrops)
                ? JSON.parse(JSON.stringify(dungeon.statistics.lootDrops))
                : null,
            curseLevelUnlocked: (dungeon && dungeon.statistics && Number.isFinite(dungeon.statistics.latestCurseUnlock))
                ? Math.round(dungeon.statistics.latestCurseUnlock)
                : null,
        };
        pendingRunSummary = runSummary;
        if (player.hardcore) {
            addCombatLog(t('you-died-hardcore'));
        } else {
            addCombatLog(t('you-died-softcore'));
        }
        endCombat();
    } else if (enemy.stats.hp < 1) {
        // Gives out all the reward and show the claim button
        enemy.stats.hp = 0;
        enemyDead = true;
        latestCombatLoot = null;
        player.kills++;
        if (typeof recordBestiaryKill === 'function') {
            recordBestiaryKill(enemy.id);
        }
        dungeon.statistics.kills++;
        if (enemy && (enemy.condition === 'guardian' || enemy.condition === 'sboss')) {
            if (typeof recordRunBossDefeat === 'function') {
                recordRunBossDefeat();
            } else if (dungeon && dungeon.statistics) {
                if (!Number.isFinite(dungeon.statistics.bossesDefeated)) {
                    dungeon.statistics.bossesDefeated = 0;
                }
                dungeon.statistics.bossesDefeated += 1;
            }
        }
        const timeStamp = new Date(combatSeconds * 1000).toISOString().substring(14, 19);
        addCombatLog(t('enemy-defeated-reward', { enemy: enemy.name, exp: nFormatter(enemy.rewards.exp), gold: nFormatter(enemy.rewards.gold), time: timeStamp }));
        playerExpGain();
        if (activeCompanion && activeCompanion.isActive) {
            const companionExpReward = (enemy.rewards.exp / 10) * (typeof getCompanionExperienceMultiplier === 'function'
                ? getCompanionExperienceMultiplier()
                : 1);
            activeCompanion.gainExperience(companionExpReward);
        }
        player.gold += enemy.rewards.gold;
        if (typeof recordRunGoldEarned === 'function') {
            recordRunGoldEarned(enemy.rewards.gold);
        }
        playerLoadStats();
        if (enemy.rewards.drop) {
            const lootDetails = createEquipmentPrint("combat");
            if (lootDetails && lootDetails.item) {
                latestCombatLoot = {
                    item: lootDetails.item,
                    placement: lootDetails.placement,
                    index: lootDetails.index,
                    serialized: lootDetails.serialized
                };
                updateCombatLog();
            }
        }

        // Recover 20% of players health
        player.stats.hp += Math.round((player.stats.hpMax * 20) / 100);
        playerLoadStats();

        // Close the battle panel
        bindClaimButton();
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

    if (!dodged) {
        applyOpenWoundsBleedOnHit();
    }

    // Apply the calculations to combat
    enemy.stats.hp -= damage;
    if (typeof recordRunDamageDealt === 'function') {
        recordRunDamageDealt(damage);
    }
    player.stats.hp += lifesteal;
    if (!dodged) {
        const lifestealText = lifesteal > 0 ? t('player-vamp-heal', { value: nFormatter(lifesteal) }) : '';
        addCombatLog(t('player-attack-hit', {
            player: player.name,
            enemy: enemy.name,
            value: nFormatter(damage),
            type: dmgtype,
            lifesteal: lifestealText
        }));
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
    if (typeof recordRunDamageDealt === 'function') {
        recordRunDamageDealt(damage);
    }
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
        dodged = true;
    } else if (scoutDodgeReady) {
        addCombatLog(t('scout-dodged-attack', { player: player.name }));
        dodged = true;
        scoutDodgeReady = false;
    }
    if ( dodged ) {
        damage = 0;
        lifesteal = 0;
    }

    // Skill effects
    if (player.skills.includes("Paladin's Heart")) {
        // You receive 25% less damage
        damage = Math.round(damage - ((25 * damage) / 100));
    }

    // Apply the calculations
    player.stats.hp -= damage;
    if (typeof recordRunDamageTaken === 'function') {
        recordRunDamageTaken(damage);
    }
    // Aegis Thorns skill
    objectValidation();
    if (player.skills.includes("Aegis Thorns")) {
        // Enemies receive 30% of the damage they dealt
        const reflectedDamage = Math.round((30 * damage) / 100);
        enemy.stats.hp -= reflectedDamage;
        if (typeof recordRunDamageDealt === 'function') {
            recordRunDamageDealt(reflectedDamage);
        }
    }
    enemy.stats.hp += lifesteal;
    if (!dodged) {
        const lifestealText = lifesteal > 0 ? t('enemy-vamp-heal', { value: nFormatter(lifesteal) }) : '';
        addCombatLog(t('enemy-attack-hit', {
            enemy: enemy.name,
            player: player.name,
            value: nFormatter(damage),
            type: dmgtype,
            lifesteal: lifestealText
        }));
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

const handleClaimButtonClick = () => {
    sfxConfirm.play();

    if (enemy.condition === "guardian") {
        incrementRoom();
        clearFloorBuffs();
        addDungeonLog(t('moved-to-next-floor'));
    } else if (enemy.condition === "door") {
        addDungeonLog(t('moved-to-next-floor'));
    }

    let dimDungeon = document.querySelector('#dungeon-main');
    dimDungeon.style.filter = "brightness(100%)";
    bgmDungeon.play();

    dungeon.status.event = false;
    combatPanel.style.display = "none";
    enemyDead = false;
    latestCombatLoot = null;
    combatBacklog.length = 0;
    findCompanionAfterCombat(enemy.lvl);
    if (typeof window !== 'undefined' && typeof window.showLevelUpModalIfPending === 'function') {
        window.showLevelUpModalIfPending();
    } else if (typeof showLevelUpModalIfPending === 'function') {
        showLevelUpModalIfPending();
    }
};

const bindClaimButton = () => {
    const battleButton = document.querySelector('#battleButton');
    if (battleButton) {
        battleButton.onclick = handleClaimButtonClick;
    }
};

const handleRunSummaryButtonClick = () => {
    if (typeof showEndgameScreen === 'function') {
        sfxConfirm.play();
        showEndgameScreen(pendingRunSummary);
    }
};

const bindRunSummaryButton = () => {
    const battleButton = document.querySelector('#battleButton');
    if (battleButton) {
        battleButton.onclick = handleRunSummaryButtonClick;
    }
};

const hasSellableCombatLoot = () => {
    return Boolean(latestCombatLoot && latestCombatLoot.item && typeof latestCombatLoot.item.value === 'number');
};

const renderSellLootButton = () => {
    if (!hasSellableCombatLoot()) {
        return '';
    }
    const sellLabel = typeof t === 'function' ? t('sell') : 'Sell';
    const goldValue = nFormatter(Math.max(0, latestCombatLoot.item.value));
    return `<button id="sellLootButton" class="combat-sell-button" aria-label="${sellLabel}"><span data-i18n="sell">${sellLabel}</span><i class="fas fa-coins" style="color: #FFD700;"></i>${goldValue}</button>`;
};

const sellLatestCombatLoot = () => {
    if (!hasSellableCombatLoot()) {
        return;
    }
    const loot = latestCombatLoot;
    let removed = false;
    if (loot.placement === 'inventory' && player && player.inventory && Array.isArray(player.inventory.equipment)) {
        let targetIndex = typeof loot.index === 'number' ? loot.index : -1;
        if (targetIndex >= 0 && player.inventory.equipment[targetIndex] === loot.serialized) {
            player.inventory.equipment.splice(targetIndex, 1);
            removed = true;
        } else {
            const fallbackIndex = player.inventory.equipment.lastIndexOf(loot.serialized);
            if (fallbackIndex >= 0) {
                player.inventory.equipment.splice(fallbackIndex, 1);
                removed = true;
            }
        }
    } else if (loot.placement === 'equipped' && player && Array.isArray(player.equipped)) {
        let targetIndex = typeof loot.index === 'number' ? loot.index : -1;
        if (targetIndex >= 0 && player.equipped[targetIndex] === loot.item) {
            player.equipped.splice(targetIndex, 1);
            removed = true;
        } else {
            const fallbackIndex = player.equipped.indexOf(loot.item);
            if (fallbackIndex >= 0) {
                player.equipped.splice(fallbackIndex, 1);
                removed = true;
            }
        }
    }

    if (!removed) {
        console.warn('Unable to locate latest combat loot for sale.');
        latestCombatLoot = null;
        updateCombatLog();
        return;
    }

    player.gold += loot.item.value;
    if (typeof recordRunGoldEarned === 'function') {
        recordRunGoldEarned(loot.item.value);
    }
    sfxSell.play();
    latestCombatLoot = null;
    const sellLabel = typeof t === 'function' ? t('sell') : 'Sell';
    addCombatLog(`<span class="combat-sell-log"><i class="fas fa-coins" style="color: #FFD700;"></i>${sellLabel}: +${nFormatter(loot.item.value)}</span>`);
    playerLoadStats();
    saveData();
handleClaimButtonClick();
};

const bindSellLootButton = () => {
    if (!hasSellableCombatLoot()) {
        return;
    }
    const sellBtn = document.getElementById('sellLootButton');
    if (sellBtn) {
        sellBtn.onclick = sellLatestCombatLoot;
    }
};

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
        const decisionButtons = [];
        decisionButtons.push(`<button id="battleButton" data-i18n="claim">${t('claim')}</button>`);
        if (hasSellableCombatLoot()) {
            decisionButtons.push(renderSellLootButton());
        }
        appendDecisionPanel(decisionButtons.join(''));
        bindClaimButton();
        bindSellLootButton();
    }

    if (playerDead) {
        appendDecisionPanel(`<button id="battleButton" data-i18n="run-summary">${t('run-summary')}</button>`);
        bindRunSummaryButton();
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
    if (player.selectedClass === "Rogue" && playerHasOpenWounds()) {
        const bleedState = ensureEnemyBleedState();
        if (bleedState.stacks < 4) {
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
    scoutDodgeReady = false;
    clearCompanionSpecialBuff();
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

    // Reset per-enemy status effects
    if (enemy && enemy.bleed) {
        delete enemy.bleed;
    }

    // Add companion involvement
    scheduleCompanionAttack();

    // Starts the timer for player and enemy attacks along with combat timer
    scheduleEnemyAttack(getEnemyAttackDelay() + ENEMY_FIRST_ATTACK_DELAY);
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
    clearCompanionSpecialBuff();
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
    stopSpecialAbilityCooldownTicker();
    updateSpecialAbilityCooldownDisplay();
    setPlayerAttackReady(false);
    clearAutoAttackDelay();
    scoutDodgeReady = false;
    // Skill validation

    // Stops every timer in combat
    if (combatTimer) {
        clearInterval(combatTimer);
        combatTimer = null;
    }
    combatTimerWasRunning = false;

    if (enemy && enemy.bleed) {
        delete enemy.bleed;
    }
    combatSeconds = 0;
}

const combatCounter = () => {
    combatSeconds++;
    tickEnemyBleed();
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
    } else if (player.selectedClass === "Beastmaster") {
        const buffApplied = applyCompanionSpecialBuff();
        if (buffApplied) {
            sfxBuff.play();
            addCombatLog(t('special-ability-companion-boost', { player: player.name, companion: activeCompanion.name }));
        } else {
            sfxDeny.play();
            addCombatLog(t('special-ability-no-companion'));
        }
    } else if (player.selectedClass === "Scout") {
        scoutDodgeReady = true;
        sfxUnpause.play();
        addCombatLog(t('special-ability-scout-dodge', { player: player.name }));
    } else {
        sfxAttack.play();

        let crit;
        let baseAtk = player.stats.atk * 1.5;
        if (player.selectedClass === "Rogue") {
            const bleedStacks = ensureEnemyBleedState()?.stacks || 0;
            const stackMultiplier = 1 + (bleedStacks * ROGUE_SPECIAL_BLEED_BONUS_PER_STACK);
            baseAtk = player.stats.atk * 1.1;
            baseAtk = baseAtk * stackMultiplier;
        }
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

        if (!dodged) {
            applyOpenWoundsBleedOnHit();
        }

        // Apply calculations
        enemy.stats.hp -= damage;
        if (typeof recordRunDamageDealt === 'function') {
            recordRunDamageDealt(damage);
        }
        player.stats.hp += lifesteal;
        if (!dodged) {
            const lifestealText = lifesteal > 0 ? t('player-vamp-heal', { value: nFormatter(lifesteal) }) : '';
            addCombatLog(t('special-ability-attack-hit', {
                player: player.name,
                value: nFormatter(damage),
                type: dmgtype,
                lifesteal: lifestealText
            }));
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
            stopSpecialAbilityCooldownTicker();
            updateSpecialAbilityCooldownDisplay();
            return;
        }
    }

    specialAbilityCooldown = true;
    specialAbilityDueAt = null;
    specialAbilityRemaining = null;
    scheduleSpecialAbilityReset(10000);
    updateSpecialAbilityButtonState();
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
        stopSpecialAbilityCooldownTicker();
        updateSpecialAbilityCooldownDisplay();
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
