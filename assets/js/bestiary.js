// Bestiary system
let bestiary = [];

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
    const listItems = bestiary.slice().sort().map(n => `<li>${n}</li>`).join('');
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
