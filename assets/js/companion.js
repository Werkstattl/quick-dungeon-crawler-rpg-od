class Companion {
    constructor(id, name, rarity, baseHp, baseAtk) {
        this.id = id;
        this.name = name;
        this.rarity = rarity;
        this.level = 1;
        this.experience = 0;
        this.baseHp = baseHp;
        this.baseAtk = baseAtk;
        this.hp = this.calculateHp();
        this.atk = this.calculateAtk();
        this.isActive = false;
        this.atkSpd = 0.3;
        this.critRate = 0.1;
        this.critDmg = 1.5;
    }

    checkEvolution() {
        const current = companionTypes.find(c => c.id === this.id);
        if (current && current.evolvesTo && this.level >= current.evolveLevel) {
            const next = companionTypes.find(c => c.id === current.evolvesTo);
            if (next) {
                const oldName = this.name;
                this.id = next.id;
                this.name = next.name;
                this.rarity = next.rarity;
                this.baseHp = next.baseHp;
                this.baseAtk = next.baseAtk;
                this.hp = this.calculateHp();
                this.atk = this.calculateAtk();
                addCombatLog(`${oldName} evolved into ${this.name}!`);
            }
        }
    }

    calculateHp() {
        return Math.floor(this.baseHp * (1 + (this.level - 1) * 0.1));
    }

    calculateAtk() {
        return Math.floor(this.baseAtk * (1 + (this.level - 1) * 0.1));
    }

    gainExperience(amount) {
        this.experience += amount;
        addCombatLog(`${this.name} gained ${amount} exp.`);
        const expRequired = this.level * 100;
        if (this.experience >= expRequired) {
            this.levelUp();
        }
        saveCompanions();
    }

    levelUp() {
        this.level += 1;
        this.experience = 0;
        this.hp = this.calculateHp();
        this.atk = this.calculateAtk();
        addCombatLog(`${this.name} leveled up! (Lv.${this.level-1} > Lv.${this.level})`);
        this.checkEvolution();
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
        // addDungeonLog(`${this.name} joins the battle!`);
        updateCompanionUI();
    }

    deactivate() {
        this.isActive = false;
        updateCompanionUI();
    }
}

// Available companions list
const companionTypes = [
    {id: 1, name: "Wolf Pup", rarity: "Common", baseHp: 20, baseAtk: 80, evolvesTo: 6, evolveLevel: 10},
    {id: 2, name: "Fairy Helper", rarity: "Uncommon", baseHp: 15, baseAtk: 150, evolvesTo: 7, evolveLevel: 10},
    {id: 3, name: "Mini Dragon", rarity: "Rare", baseHp: 30, baseAtk: 280, evolvesTo: 8, evolveLevel: 10},
    {id: 4, name: "Shadow Cat", rarity: "Epic", baseHp: 40, baseAtk: 450, evolvesTo: 9, evolveLevel: 10},
    {id: 5, name: "Phoenix Chick", rarity: "Legendary", baseHp: 60, baseAtk: 650, evolvesTo: 10, evolveLevel: 10},
    {id: 6, name: "Wolf", rarity: "Uncommon", baseHp: 40, baseAtk: 150, obtainable: false},
    {id: 7, name: "Fairy Guardian", rarity: "Rare", baseHp: 25, baseAtk: 250, obtainable: false},
    {id: 8, name: "Young Dragon", rarity: "Epic", baseHp: 60, baseAtk: 420, obtainable: false},
    {id: 9, name: "Night Panther", rarity: "Legendary", baseHp: 80, baseAtk: 600, obtainable: false},
    {id: 10, name: "Phoenix", rarity: "Legendary", baseHp: 90, baseAtk: 900, obtainable: false},
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
            const comp = new Companion(data.id, data.name, data.rarity, data.baseHp, data.baseAtk);
            comp.level = data.level;
            comp.experience = data.experience;
            comp.hp = comp.calculateHp();
            comp.atk = comp.calculateAtk();
            comp.isActive = data.isActive;
            return comp;
        });
        
        // Find active companion
        activeCompanion = playerCompanions.find(comp => comp.isActive) || null;
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
            template.name,
            template.rarity,
            template.baseHp,
            template.baseAtk
        );
        playerCompanions.push(newCompanion);
        saveCompanions();
        addDungeonLog(`You found a <span class="${newCompanion.rarity}">${newCompanion.name}</span>!`);
        return newCompanion;
    }
    return null;
}

// Update companion UI elements
function updateCompanionUI() {
    const companionPanel = document.getElementById('companion-panel');
    const companionName = document.getElementById('companion-name');
    const companionAtk = document.getElementById('companion-atk');
    const companionAtkSpd = document.getElementById('companion-atkspd');
    const summonBtn = document.getElementById('summon-companion');
    
    if (activeCompanion) {
        companionName.textContent = `${activeCompanion.name} Lv.${activeCompanion.level}`;
        companionName.className = activeCompanion.rarity;
        companionAtk.textContent = activeCompanion.atk;
        companionAtkSpd.textContent = activeCompanion.atkSpd.toFixed(2);
        summonBtn.textContent = "Change";
    } else {
        companionName.textContent = "None";
        companionName.className = "";
        companionAtk.textContent = "0";
        companionAtkSpd.textContent = "0";
        summonBtn.textContent = "Summon";
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
        dismissOption.innerHTML = `<h4>Dismiss Companion</h4><p>Send ${activeCompanion.name} away</p>`;
        dismissOption.onclick = dismissCompanion;
        companionList.appendChild(dismissOption);
    }
    
    // Add each companion as an option
    playerCompanions.forEach(companion => {
        const option = document.createElement('div');
        option.className = `companion-option ${companion.rarity}`;
        option.innerHTML = `
            <h4>${companion.name}</h4>
            <p>Level: ${companion.level}</p>
            <p>ATK: ${companion.atk}</p>
            <p>APS: ${companion.atkSpd.toFixed(2)}</p>
        `;
        option.onclick = () => selectCompanion(companion.id);
        companionList.appendChild(option);
    });
    
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
    // 10% chance to find a companion after combat
    if (Math.random() < 0.1) {
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
