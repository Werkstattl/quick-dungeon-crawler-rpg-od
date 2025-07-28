// Bestiary system
// Structure: { [id]: { encounters: Number, kills: Number } }
let bestiary = {};

// Mapping of enemy IDs to sprite file names
const bestiarySprites = {};
for (const id in enemyData) {
    const spriteInfo = enemyData[id].sprite;
    bestiarySprites[id] = Array.isArray(spriteInfo) ? spriteInfo[0] : spriteInfo;
}

function loadBestiary() {
    const stored = localStorage.getItem('playerBestiary');
    if (stored) {
        try {
            bestiary = JSON.parse(stored);
            if (Array.isArray(bestiary)) {
                const converted = {};
                bestiary.forEach(n => { converted[n] = { encounters: 1, kills: 0 }; });
                bestiary = converted;
            } else {
                const converted = {};
                for (const key in bestiary) {
                    if (/^\d+$/.test(key)) {
                        converted[key] = bestiary[key];
                    } else {
                        const id = Object.keys(enemyIdMap).find(i => enemyIdMap[i] === key);
                        if (id) {
                            converted[id] = bestiary[key];
                        }
                    }
                }
                bestiary = converted;
            }
        } catch (e) {
            bestiary = {};
        }
    }
}

function saveBestiary() {
    localStorage.setItem('playerBestiary', JSON.stringify(bestiary));
}

function addToBestiary(id) {
    const key = String(id);
    if (!bestiary[key]) {
        bestiary[key] = { encounters: 0, kills: 0 };
    }
    bestiary[key].encounters++;
    saveBestiary();
}

function recordBestiaryKill(id) {
    const key = String(id);
    if (!bestiary[key]) {
        bestiary[key] = { encounters: 0, kills: 0 };
    }
    bestiary[key].kills++;
    saveBestiary();
}

function openBestiaryModal() {
    sfxOpen.play();
    menuModalElement.style.display = 'none';
    defaultModalElement.style.display = 'flex';
    const listItems = Object.keys(bestiary).sort((a,b) => a - b).map(id => {
        const img = bestiarySprites[id];
        const stats = bestiary[id];
        const name = enemyIdMap[id] || id;
        const imgTag = img ? `<img src="./assets/sprites/${img}.webp" alt="${name}">` : '';
        const statTag = `<span class="stats">E:${stats.encounters} K:${stats.kills}</span>`;
        return `<li>${imgTag}<span>${name}</span>${statTag}</li>`;
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
