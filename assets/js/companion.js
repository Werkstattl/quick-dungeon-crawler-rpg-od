const defaultCompanionStats = () => ({
    hp: 0,
    atk: 0,
    def: 0,
    atkSpd: 0,
    vamp: 0,
    critRate: 0,
    critDmg: 0,
    dodge: 0,
    luck: 0,
});

let activeCompanionBonuses = defaultCompanionStats();

function getActiveCompanionBonuses() {
    return { ...activeCompanionBonuses };
}

function resetActiveCompanionBonuses() {
    activeCompanionBonuses = defaultCompanionStats();
}

const getCompanionOptionsFromTemplate = (template = {}) => ({
    passives: template.passives || [],
    passiveDescriptionKey: template.passiveDescriptionKey || null,
    baseCritRate: template.baseCritRate,
    baseCritDmg: template.baseCritDmg,
    atkSpdBase: template.atkSpdBase,
    atkSpdGrowth: template.atkSpdGrowth,
});

const COMPANION_STAT_ORDER = ['atk', 'hp', 'def', 'atkSpd', 'critRate', 'critDmg', 'dodge', 'vamp', 'luck'];
const COMPANION_STAT_CONFIG = {
    atk: { labelKey: 'companion-stat-atk', suffix: '%', precision: 1 },
    hp: { labelKey: 'companion-stat-hp', suffix: '%', precision: 1 },
    def: { labelKey: 'companion-stat-def', suffix: '%', precision: 1 },
    atkSpd: { labelKey: 'companion-stat-atkspd', suffix: '%', precision: 1 },
    critRate: { labelKey: 'companion-stat-critRate', suffix: '%', precision: 1 },
    critDmg: { labelKey: 'companion-stat-critDmg', suffix: '%', precision: 1 },
    dodge: { labelKey: 'companion-stat-dodge', suffix: '%', precision: 1 },
    vamp: { labelKey: 'companion-stat-vamp', suffix: '%', precision: 1 },
    luck: { labelKey: 'companion-stat-luck', suffix: '', precision: 0 },
};

const formatBonusValue = (value, precision = 1) => {
    const fixed = value.toFixed(precision);
    return fixed.replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
};

const buildCompanionBonusList = (companion) => {
    if (!companion) {
        return { html: '', hasBonuses: false };
    }
    const bonuses = companion.calculateBonuses();
    const lines = [];

    COMPANION_STAT_ORDER.forEach(stat => {
        const config = COMPANION_STAT_CONFIG[stat];
        if (!config) return;
        const rawValue = Number(bonuses[stat] || 0);
        if (Math.abs(rawValue) < 0.001) return;
        const precision = config.precision !== undefined ? config.precision : (Math.abs(rawValue) >= 10 ? 0 : 1);
        const valueStr = formatBonusValue(rawValue, precision);
        const suffix = config.suffix || '';
        const label = typeof t === 'function' ? t(config.labelKey) : config.labelKey;
        lines.push(`<li><span class="bonus-value">+${valueStr}${suffix}</span> ${label}</li>`);
    });

    if (!lines.length) {
        return { html: '', hasBonuses: false };
    }

    return {
        html: `<ul class="companion-bonus-list">${lines.join('')}</ul>`,
        hasBonuses: true,
    };
};

function applyActiveCompanionBonuses(companion) {
    if (!player) {
        return;
    }

    const emptyStats = defaultCompanionStats();
    let bonuses = emptyStats;

    if (companion) {
        bonuses = { ...emptyStats, ...companion.calculateBonuses() };
    }

    activeCompanionBonuses = { ...emptyStats, ...bonuses };

    if (typeof calculateStats === 'function') {
        calculateStats();
    }
    if (typeof playerLoadStats === 'function') playerLoadStats();
}

class Companion {
    constructor(id, nameKey, rarity, baseHp, baseAtk, options = {}) {
        this.id = id;
        this.nameKey = nameKey;
        this.rarity = rarity;
        this.level = 1;
        this.experience = 0;
        this.baseHp = baseHp;
        this.baseAtk = baseAtk;
        this.passives = options.passives || [];
        this.passiveDescriptionKey = options.passiveDescriptionKey || null;
        this.baseCritRate = options.baseCritRate ?? 50;
        this.baseCritDmg = options.baseCritDmg ?? 50;
        this.atkSpdBase = options.atkSpdBase ?? 0.4;
        this.atkSpdGrowth = options.atkSpdGrowth ?? 0.02;
        this.hp = this.calculateHp();
        this.atk = this.calculateAtk();
        this.isActive = false;
        this.atkSpd = this.calculateAtkSpd();
        this.critRate = this.baseCritRate;
        this.critDmg = this.baseCritDmg;
    }

    get name() {
        return t(this.nameKey);
    }

    checkEvolution() {
        const current = companionTypes.find(c => c.id === this.id);
        if (current && current.evolvesTo && this.level >= current.evolveLevel) {
            const next = companionTypes.find(c => c.id === current.evolvesTo);
            if (next) {
                const oldName = this.name;
                this.id = next.id;
                this.applyTemplate(next);
                this.hp = this.calculateHp();
                this.atk = this.calculateAtk();
                this.atkSpd = this.calculateAtkSpd();
                if (this.isActive) {
                    applyActiveCompanionBonuses(this);
                }
                addCombatLog(`${oldName} evolved into ${this.name}!`);
            }
        }
    }

    applyTemplate(template) {
        if (!template) {
            return;
        }
        this.nameKey = template.nameKey;
        this.rarity = template.rarity;
        this.baseHp = template.baseHp;
        this.baseAtk = template.baseAtk;
        this.passives = template.passives || this.passives || [];
        this.passiveDescriptionKey = template.passiveDescriptionKey || this.passiveDescriptionKey || null;
        if (template.baseCritRate !== undefined) {
            this.baseCritRate = template.baseCritRate;
            this.critRate = this.baseCritRate;
        }
        if (template.baseCritDmg !== undefined) {
            this.baseCritDmg = template.baseCritDmg;
            this.critDmg = this.baseCritDmg;
        }
        if (template.atkSpdBase !== undefined) {
            this.atkSpdBase = template.atkSpdBase;
        }
        if (template.atkSpdGrowth !== undefined) {
            this.atkSpdGrowth = template.atkSpdGrowth;
        }
    }

    calculateHp() {
        return Math.floor(this.baseHp * (1 + (this.level - 1) * 0.1));
    }

    calculateAtk() {
        return Math.floor(this.baseAtk * (1 + (this.level - 1) * 0.1));
    }

    calculateAtkSpd() {
        // Increase attack speed slightly with each level
        return Math.min(2.5, this.atkSpdBase + (this.level - 1) * this.atkSpdGrowth);
    }

    gainExperience(amount) {
        this.experience += amount;
        let expRequired = this.getExperienceRequired();
        while (this.experience >= expRequired) {
            this.experience -= expRequired;
            this.levelUp();
            expRequired = this.getExperienceRequired();
        }
        saveCompanions();
    }

    getExperienceRequired() {
        return this.level * 100;
    }

    levelUp() {
        this.level += 1;
        this.hp = this.calculateHp();
        this.atk = this.calculateAtk();
        this.atkSpd = this.calculateAtkSpd();
        addCombatLog(`${this.name} leveled up! (Lv.${this.level-1} > Lv.${this.level})`);
        this.checkEvolution();
        if (this.isActive) {
            applyActiveCompanionBonuses(this);
        }
        updateCompanionUI();
    }

    attack(enemy) {
        if (!this.isActive) return 0;
        
        const damage = Math.max(1, Math.floor(this.atk - (enemy.stats.def / 2)));
        enemy.hp -= damage;
        addDungeonLog(`${this.name} attacks for ${damage} damage!`);
        return damage;
    }

    activate() {
        this.isActive = true;
        applyActiveCompanionBonuses(this);
        updateCompanionUI();
    }

    deactivate() {
        this.isActive = false;
        applyActiveCompanionBonuses(null);
        updateCompanionUI();
    }

    calculateBonuses() {
        const totals = defaultCompanionStats();
        this.passives.forEach(passive => {
            if (!passive || !passive.stat) return;
            const perLevel = passive.perLevel || 0;
            const base = passive.base || 0;
            let value = base + perLevel * (this.level - 1);
            if (typeof passive.max === 'number') {
                value = Math.min(value, passive.max);
            }
            const stat = passive.stat;
            totals[stat] = (totals[stat] || 0) + value;
        });
        return totals;
    }
}

// Available companions list
const companionTypes = [
    {
        id: 1,
        nameKey: "companion-wolf-pup",
        rarity: "Common",
        baseHp: 20,
        baseAtk: 80,
        evolvesTo: 6,
        evolveLevel: 10,
        passives: [
            { stat: 'atk', base: 2.5, perLevel: 0.4 },
            { stat: 'critRate', base: 1, perLevel: 0.2 }
        ],
        passiveDescriptionKey: 'companion-passive-wolf-pup',
        baseCritRate: 35,
        baseCritDmg: 60,
        atkSpdBase: 0.55,
        atkSpdGrowth: 0.022,
    },
    {
        id: 2,
        nameKey: "companion-fairy-helper",
        rarity: "Uncommon",
        baseHp: 15,
        baseAtk: 150,
        evolvesTo: 7,
        evolveLevel: 10,
        passives: [
            { stat: 'hp', base: 3.5, perLevel: 0.5 },
            { stat: 'vamp', base: 0.5, perLevel: 0.15 },
        ],
        passiveDescriptionKey: 'companion-passive-fairy-helper',
        baseCritRate: 25,
        baseCritDmg: 50,
        atkSpdBase: 0.48,
        atkSpdGrowth: 0.018,
    },
    {
        id: 3,
        nameKey: "companion-mini-dragon",
        rarity: "Rare",
        baseHp: 30,
        baseAtk: 280,
        evolvesTo: 8,
        evolveLevel: 10,
        passives: [
            { stat: 'atk', base: 3.5, perLevel: 0.45 },
            { stat: 'critDmg', base: 5, perLevel: 0.6 },
        ],
        passiveDescriptionKey: 'companion-passive-mini-dragon',
        baseCritRate: 45,
        baseCritDmg: 65,
        atkSpdBase: 0.5,
        atkSpdGrowth: 0.02,
    },
    {
        id: 4,
        nameKey: "companion-shadow-cat",
        rarity: "Epic",
        baseHp: 40,
        baseAtk: 450,
        evolvesTo: 9,
        evolveLevel: 10,
        passives: [
            { stat: 'atkSpd', base: 2, perLevel: 0.25 },
            { stat: 'dodge', base: 2.5, perLevel: 0.35 },
        ],
        passiveDescriptionKey: 'companion-passive-shadow-cat',
        baseCritRate: 40,
        baseCritDmg: 60,
        atkSpdBase: 0.6,
        atkSpdGrowth: 0.024,
    },
    {
        id: 5,
        nameKey: "companion-phoenix-chick",
        rarity: "Legendary",
        baseHp: 60,
        baseAtk: 650,
        evolvesTo: 10,
        evolveLevel: 10,
        passives: [
            { stat: 'hp', base: 4.5, perLevel: 0.65 },
            { stat: 'luck', base: 5, perLevel: 0.4 },
        ],
        passiveDescriptionKey: 'companion-passive-phoenix-chick',
        baseCritRate: 30,
        baseCritDmg: 70,
        atkSpdBase: 0.46,
        atkSpdGrowth: 0.02,
    },
    {
        id: 6,
        nameKey: "companion-wolf",
        rarity: "Uncommon",
        baseHp: 40,
        baseAtk: 150,
        obtainable: false,
        passives: [
            { stat: 'atk', base: 6, perLevel: 0.6 },
            { stat: 'critRate', base: 2.5, perLevel: 0.25 },
        ],
        passiveDescriptionKey: 'companion-passive-wolf',
        baseCritRate: 40,
        baseCritDmg: 70,
        atkSpdBase: 0.65,
        atkSpdGrowth: 0.026,
    },
    {
        id: 7,
        nameKey: "companion-fairy-guardian",
        rarity: "Rare",
        baseHp: 25,
        baseAtk: 250,
        obtainable: false,
        passives: [
            { stat: 'hp', base: 6, perLevel: 0.55 },
            { stat: 'vamp', base: 1, perLevel: 0.2 },
        ],
        passiveDescriptionKey: 'companion-passive-fairy-guardian',
        baseCritRate: 30,
        baseCritDmg: 55,
        atkSpdBase: 0.52,
        atkSpdGrowth: 0.02,
    },
    {
        id: 8,
        nameKey: "companion-young-dragon",
        rarity: "Epic",
        baseHp: 60,
        baseAtk: 420,
        obtainable: false,
        passives: [
            { stat: 'atk', base: 7, perLevel: 0.7 },
            { stat: 'critDmg', base: 12, perLevel: 0.8 },
        ],
        passiveDescriptionKey: 'companion-passive-young-dragon',
        baseCritRate: 50,
        baseCritDmg: 80,
        atkSpdBase: 0.58,
        atkSpdGrowth: 0.024,
    },
    {
        id: 9,
        nameKey: "companion-night-panther",
        rarity: "Legendary",
        baseHp: 80,
        baseAtk: 600,
        obtainable: false,
        passives: [
            { stat: 'atkSpd', base: 3.5, perLevel: 0.35 },
            { stat: 'dodge', base: 4.5, perLevel: 0.45 },
        ],
        passiveDescriptionKey: 'companion-passive-night-panther',
        baseCritRate: 45,
        baseCritDmg: 75,
        atkSpdBase: 0.7,
        atkSpdGrowth: 0.028,
    },
    {
        id: 10,
        nameKey: "companion-phoenix",
        rarity: "Legendary",
        baseHp: 90,
        baseAtk: 900,
        obtainable: false,
        passives: [
            { stat: 'hp', base: 8, perLevel: 0.8 },
            { stat: 'atk', base: 4, perLevel: 0.5 },
            { stat: 'luck', base: 8, perLevel: 0.45 },
        ],
        passiveDescriptionKey: 'companion-passive-phoenix',
        baseCritRate: 35,
        baseCritDmg: 85,
        atkSpdBase: 0.6,
        atkSpdGrowth: 0.025,
    },
];

// Player's companions
let playerCompanions = [];
let activeCompanion = null;

// Initialize companions from localStorage or create default ones
function initCompanions() {
    const savedCompanions = localStorage.getItem('playerCompanions');
    if (savedCompanions && savedCompanions !== "[]") {
        const parsedCompanions = JSON.parse(savedCompanions);
        playerCompanions = parsedCompanions.map(data => {
            const type = companionTypes.find(c => c.id === data.id) || {};
            const comp = new Companion(
                data.id,
                data.nameKey || type.nameKey,
                data.rarity || type.rarity,
                data.baseHp ?? type.baseHp,
                data.baseAtk ?? type.baseAtk,
                getCompanionOptionsFromTemplate(type)
            );
            comp.level = data.level;
            comp.experience = data.experience;
            comp.hp = comp.calculateHp();
            comp.atk = comp.calculateAtk();
            comp.atkSpd = comp.calculateAtkSpd();
            comp.isActive = data.isActive;
            if (Array.isArray(data.passives) && data.passives.length && !type.passives) {
                comp.passives = data.passives;
            }
            return comp;
        });

        // Find active companion
        activeCompanion = playerCompanions.find(comp => comp.isActive) || null;
        applyActiveCompanionBonuses(activeCompanion);
    } else {
        // Give player a starter companion
        giveCompanion(1);
    }

    updateCompanionUI();
}

// Give a new companion to the player
function giveCompanion(companionId) {
    // Check if player already has this companion
    if (playerCompanions.some(c => c.id === companionId)) {
        return null;
    }

    const template = companionTypes.find(c => c.id === companionId);
    if (template) {
        const newCompanion = new Companion(
            template.id,
            template.nameKey,
            template.rarity,
            template.baseHp,
            template.baseAtk,
            getCompanionOptionsFromTemplate(template)
        );
        playerCompanions.push(newCompanion);
        saveCompanions();
        addDungeonLog(`You found a <span class="${newCompanion.rarity}">${newCompanion.name}</span>!`);
        return newCompanion;
    }
    return null;
}

function updateCompanionUI() {
    const companionName = document.getElementById('companion-name');
    const companionAtk = document.getElementById('companion-atk');
    const companionBonus = document.getElementById('companion-bonus');
    const companionAtkSpd = document.getElementById('companion-atkspd');
    const summonBtn = document.getElementById('summon-companion');

    if (activeCompanion) {
        companionName.textContent = `${activeCompanion.name} Lv.${activeCompanion.level}`;
        companionName.className = activeCompanion.rarity;
        companionAtk.textContent = activeCompanion.atk;
        companionAtkSpd.textContent = activeCompanion.atkSpd.toFixed(2);
        const bonusSummary = buildCompanionBonusList(activeCompanion);
        const passiveKey = activeCompanion.passiveDescriptionKey;
        if (bonusSummary.hasBonuses || passiveKey) {
            const header = `<h4 data-i18n="companion-bond"></h4>`;
            companionBonus.innerHTML = `${header}${bonusSummary.html}`;
            applyTranslations(companionBonus);
        } else {
            companionBonus.innerHTML = '';
        }
        summonBtn.textContent = t('change');
        summonBtn.classList.remove('attention');
    } else {
        companionName.textContent = t('none');
        companionName.className = "";
        companionAtk.textContent = "0";
        companionBonus.innerHTML = '';
        companionAtkSpd.textContent = "0";
        summonBtn.textContent = t('summon');
        summonBtn.classList.add('attention');
    }
    
    summonBtn.classList.remove('hidden');
    summonBtn.onclick = openCompanionModal;
}

// Open companion selection modal
function openCompanionModal() {
    const modal = document.getElementById('companionModal');
    const companionList = document.getElementById('available-companions');
    sfxOpen.play();
    const dimDungeon = document.querySelector('#dungeon-main');
    dimDungeon.style.filter = 'brightness(50%)';
    
    // Clear previous content
    companionList.innerHTML = '';
    
    // Add option to dismiss companion
    if (activeCompanion) {
        const dismissOption = document.createElement('div');
        dismissOption.className = 'companion-option';

        const dismissHeader = document.createElement('h4');
        dismissHeader.setAttribute('data-i18n', 'dismiss-companion');
        dismissHeader.textContent = 'Dismiss Companion';

        const dismissText = document.createElement('p');
        dismissText.setAttribute('data-i18n', 'send-away');
        dismissText.setAttribute('data-i18n-params', JSON.stringify({ name: activeCompanion.name }));
        dismissText.textContent = `Send ${activeCompanion.name} away`;

        dismissOption.appendChild(dismissHeader);
        dismissOption.appendChild(dismissText);
        dismissOption.onclick = dismissCompanion;
        companionList.appendChild(dismissOption);
    }

    // Add each companion as an option
    playerCompanions.forEach(companion => {
        const option = document.createElement('div');
        option.className = `companion-option ${companion.rarity}`;
        const bonusSummary = buildCompanionBonusList(companion);
        const passiveKey = companion.passiveDescriptionKey;
        option.innerHTML = `
            <h4>${companion.name}</h4>
            <p><span data-i18n="level">Level</span>: ${companion.level}</p>
            <p><span data-i18n="atk">ATK:</span> ${companion.atk}</p>
            <p><span data-i18n="aps">APS:</span> ${companion.atkSpd.toFixed(2)}</p>
            ${bonusSummary.html}
            ${passiveKey ? `<p class="companion-passive" data-i18n="${passiveKey}"></p>` : ''}
        `;
        if (companion.isActive) {
            option.classList.add('active-companion');
        }
        option.onclick = () => selectCompanion(companion.id);
        companionList.appendChild(option);
    });

    applyTranslations(companionList);
    modal.style.display = 'flex';
}

// Close companion modal
function closeCompanionModal() {
    sfxDecline.play();
    document.getElementById('companionModal').style.display = 'none';
    const dimDungeon = document.querySelector('#dungeon-main');
    dimDungeon.style.filter = 'brightness(100%)';
}

// Select a companion
function selectCompanion(companionId) {
    // Deactivate current companion
    if (activeCompanion) {
        activeCompanion.deactivate();
    }
    
    // Activate selected companion
    const selected = playerCompanions.find(c => c.id === companionId);
    if (selected) {
        activeCompanion = selected;
        activeCompanion.activate();
        // addDungeonLog(`${activeCompanion.name} is now your active companion!`);
    }
    
    saveCompanions();
    closeCompanionModal();
}

// Dismiss active companion
function dismissCompanion() {
    if (activeCompanion) {
        // addDungeonLog(`You dismissed ${activeCompanion.name}.`);
        activeCompanion.deactivate();
        activeCompanion = null;
        updateCompanionUI();
        saveCompanions();
    }
    closeCompanionModal();
}

// Save companions to localStorage
function saveCompanions() {
    localStorage.setItem('playerCompanions', JSON.stringify(playerCompanions));
}

// Find companion after combat
function findCompanionAfterCombat(enemyLevel) {
    const baseChance = 0.08;
    const luckValue = player && player.stats ? (player.stats.luck || 0) : 0;
    const luckBonus = Math.min(0.12, luckValue / 400);
    const rosterBonus = Math.max(0, (3 - playerCompanions.length) * 0.02);
    const chance = Math.min(0.3, baseChance + luckBonus + rosterBonus);

    if (Math.random() < chance) {
        // Determine rarity based on enemy level
        let rarityPool;
        if (enemyLevel > 70) {
            rarityPool = [3, 4, 5];
        } else if (enemyLevel > 50) {
            rarityPool = [2, 3, 4];
        } else if (enemyLevel > 35) {
            rarityPool = [2, 3];
        } else if (enemyLevel > 25) {
            rarityPool = [1, 2];
        } else {
            rarityPool = [1];
        }
        
        // Create rarity map for lookups
        const rarityMap = {
            "Common": 1,
            "Uncommon": 2,
            "Rare": 3,
            "Epic": 4,
            "Legendary": 5
        };

        // Filter out companions player already has
        // Also exclude base forms if the player owns their evolutions
        const evolvedMap = {1: 6, 2: 7, 3: 8, 4: 9, 5: 10};
        const ownedIds = new Set(playerCompanions.map(pc => pc.id));
        const availableCompanions = companionTypes.filter(c => {
            if (evolvedMap[c.id] && ownedIds.has(evolvedMap[c.id])) return false;
            return (c.obtainable !== false) &&
                   rarityPool.includes(rarityMap[c.rarity]) &&
                   !ownedIds.has(c.id);
        });
        
        if (availableCompanions.length > 0) {
            const selectedType = availableCompanions[Math.floor(Math.random() * availableCompanions.length)];
            giveCompanion(selectedType.id);
        }
    }
}

// Companion combat integration
function companionCombatTurn(enemy) {
    if (activeCompanion && activeCompanion.isActive) {
        return activeCompanion.attack(enemy);
    }
    return 0;
}
