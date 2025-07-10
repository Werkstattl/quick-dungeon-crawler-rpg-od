// Bestiary system
let bestiary = [];

// Mapping of enemy names to sprite file names
const bestiarySprites = {
    'Goblin': 'goblin',
    'Goblin Rogue': 'goblin_rogue',
    'Goblin Archer': 'goblin_archer',
    'Goblin Mage': 'goblin_mage',
    'Wolf': 'wolf',
    'Black Wolf': 'wolf_black',
    'Winter Wolf': 'wolf_winter',
    'Slime': 'slime',
    'Angel Slime': 'slime_angel',
    'Knight Slime': 'slime_knight',
    'Crusader Slime': 'slime_crusader',
    'Orc Swordsmaster': 'orc_swordsmaster',
    'Orc Axe': 'orc_axe',
    'Orc Archer': 'orc_archer',
    'Orc Mage': 'orc_mage',
    'Spider': 'spider',
    'Red Spider': 'spider_red',
    'Green Spider': 'spider_green',
    'Skeleton Archer': 'skeleton_archer',
    'Skeleton Swordsmaster': 'skeleton_swordsmaster',
    'Skeleton Knight': 'skeleton_knight',
    'Skeleton Mage': 'skeleton_mage1',
    'Skeleton Pirate': 'skeleton_pirate',
    'Skeleton Samurai': 'skeleton_samurai',
    'Skeleton Warrior': 'skeleton_warrior',
    'Mimic': 'mimic',
    'Door Mimic': 'mimic_door',
    'Zaart, the Dominator Goblin': 'goblin_boss',
    'Banshee, Skeleton Lord': 'skeleton_boss',
    'Molten Spider': 'spider_fire',
    'Cerberus Ptolemaios': 'cerberus_ptolemaios',
    'Hellhound Inferni': 'hellhound',
    'Berthelot, the Undead King': 'berthelot',
    'Slime King': 'slime_boss',
    'Zodiac Cancer': 'zodiac_cancer',
    'Alfadriel, the Light Titan': 'alfadriel',
    'Tiamat, the Dragon Knight': 'tiamat',
    'Nameless Fallen King': 'fallen_king',
    'Zodiac Aries': 'zodiac_aries',
    'Clockwork Spider': 'spider_boss',
    'Llyrrad, the Ant Queen': 'ant_queen',
    'Aragorn, the Lethal Wolf': 'wolf_boss',
    'Naizicher, the Spider Dragon': 'spider_dragon',
    'Ulliot, the Deathlord': 'skeleton_dragon',
    'Ifrit': 'firelord',
    'Shiva': 'icemaiden',
    'Behemoth': 'behemoth',
    'Blood Manipulation Feral': 'bm-feral',
    'Thanatos': 'thanatos',
    'Darkness Angel Reaper': 'da-reaper',
    'Zalaras, the Dragon Emperor': 'zalaras'
};

function loadBestiary() {
    const stored = localStorage.getItem('playerBestiary');
    if (stored) {
        try {
            bestiary = JSON.parse(stored);
        } catch (e) {
            bestiary = [];
        }
    }
}

function saveBestiary() {
    localStorage.setItem('playerBestiary', JSON.stringify(bestiary));
}

function addToBestiary(name) {
    if (!bestiary.includes(name)) {
        bestiary.push(name);
        saveBestiary();
    }
}

function openBestiaryModal() {
    sfxOpen.play();
    menuModalElement.style.display = 'none';
    defaultModalElement.style.display = 'flex';
    const listItems = bestiary.slice().sort().map(n => {
        const img = bestiarySprites[n];
        const imgTag = img ? `<img src="./assets/sprites/${img}.webp" alt="${n}">` : '';
        return `<li>${imgTag}<span>${n}</span></li>`;
    }).join('');
    defaultModalElement.innerHTML = `
        <div class="content" id="bestiary-modal">
            <div class="content-head">
                <h3>Bestiary</h3>
                <p id="bestiary-close"><i class="fa fa-xmark"></i></p>
            </div>
            <ul class="bestiary-list">${listItems}</ul>
        </div>`;
    const closeBtn = document.querySelector('#bestiary-close');
    closeBtn.onclick = function () {
        sfxDecline.play();
        defaultModalElement.style.display = 'none';
        defaultModalElement.innerHTML = '';
        menuModalElement.style.display = 'flex';
    };
}
