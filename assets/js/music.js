// Volume settings
let volume;
if (JSON.parse(localStorage.getItem("volumeData")) == undefined) {
    volume = {
        master: 1,
        bgm: 0.4,
        sfx: 1
    }
} else {
    volume = JSON.parse(localStorage.getItem("volumeData"));
}

// Helper: create a SFX Howl that auto-unloads after playing to free memory
const createSfx = (src) => {
    const howl = new Howl({
        src: [src],
        volume: volume.sfx * volume.master,
        preload: false,
        onend: () => {
            // Auto-unload after sound finishes to free RAM
            howl.unload();
        }
    });
    return howl;
};

// ===== BGM: single-player approach — only one BGM track in RAM at a time =====
let currentBgm = null;      // { howl: Howl, key: string }
let lastBgmKey = null;      // remembers which track was playing before tab hide

const playBgm = (bgmHowl, key) => {
    // If same track already playing, do nothing
    if (currentBgm && currentBgm.key === key && currentBgm.howl.playing()) {
        return;
    }
    // Stop and unload the previous BGM to free RAM
    if (currentBgm) {
        currentBgm.howl.stop();
        currentBgm.howl.unload();
        currentBgm = null;
    }
    currentBgm = { howl: bgmHowl, key };
    bgmHowl.play();
};

const stopBgm = () => {
    if (currentBgm) {
        currentBgm.howl.stop();
        currentBgm.howl.unload();
        currentBgm = null;
    }
};

// Create BGM Howls lazily (preload: false — only load when played)
let bgmDungeon = new Howl({
    src: ['./assets/bgm/dungeon.webm'],
    volume: volume.bgm * volume.master,
    loop: true,
    preload: false
});

let bgmBattleMain = new Howl({
    src: ['./assets/bgm/battle_main.webm'],
    volume: volume.bgm * volume.master,
    loop: true,
    preload: false
});

let bgmBattleBoss = new Howl({
    src: ['./assets/bgm/battle_boss.webm'],
    volume: volume.bgm * volume.master,
    loop: true,
    preload: false
});

// SFX
let sfxEncounter;
let sfxEnemyDeath;
let sfxCombatEnd;
let sfxAttack;
let sfxLvlUp;
let sfxConfirm;
let sfxDecline;
let sfxDeny;
let sfxEquip;
let sfxUnequip;
let sfxOpen;
let sfxPause;
let sfxUnpause;
let sfxSell;
let sfxItem;
let sfxBuff;

// Font size & family settings
const DEFAULT_FONT_KEY = 'germania';
const FONT_FAMILY_OPTIONS = [
    { key: 'germania', label: 'Germania One', stack: '"Germania One", Georgia, "Times New Roman", serif' },
    { key: 'futura', label: 'Futura', stack: 'Futura, Trebuchet MS, Arial, sans-serif' },
];

const FONT_FAMILY_MAP = FONT_FAMILY_OPTIONS.reduce((map, option) => {
    map[option.key] = option.stack;
    return map;
}, {});

// expose options for other scripts (settings modal)
window.fontFamilyOptions = FONT_FAMILY_OPTIONS;
window.defaultFontFamilyKey = DEFAULT_FONT_KEY;

let fontSize = JSON.parse(localStorage.getItem("fontSizeData"));
if (!fontSize || typeof fontSize !== 'object') {
    fontSize = {
        scale: 1.0,
        family: DEFAULT_FONT_KEY
    };
} else {
    if (typeof fontSize.scale !== 'number') {
        fontSize.scale = 1.0;
    }
    if (!fontSize.family || !FONT_FAMILY_MAP[fontSize.family]) {
        fontSize.family = DEFAULT_FONT_KEY;
    }
}

// Apply font size settings on load
const applyFontSize = () => {
    const selectedStack = FONT_FAMILY_MAP[fontSize.family] || FONT_FAMILY_MAP[DEFAULT_FONT_KEY];
    document.documentElement.style.setProperty('--font-scale', fontSize.scale);
    document.documentElement.style.setProperty('--font-family-base', selectedStack);
    if (fontSize.family && fontSize.family !== DEFAULT_FONT_KEY) {
        document.body.style.fontFamily = selectedStack;
    } else {
        document.body.style.removeProperty('font-family');
    }
};

const setVolume = () => {
    // Update BGM volumes (instances already exist)
    bgmDungeon.volume(volume.bgm * volume.master);
    bgmBattleMain.volume(volume.bgm * volume.master);
    bgmBattleBoss.volume(volume.bgm * volume.master);

    // SFX (auto-unload after playing to free RAM)
    sfxEncounter = createSfx('./assets/sfx/encounter.webm');
    sfxCombatEnd = createSfx('./assets/sfx/combat_end.webm');
    sfxAttack = createSfx('./assets/sfx/attack.webm');
    sfxLvlUp = createSfx('./assets/sfx/level_up.webm');
    sfxConfirm = createSfx('./assets/sfx/confirm.webm');
    sfxDecline = createSfx('./assets/sfx/decline.webm');
    sfxDeny = createSfx('./assets/sfx/denied.webm');
    sfxEquip = createSfx('./assets/sfx/equip.webm');
    sfxUnequip = createSfx('./assets/sfx/unequip.webm');
    sfxOpen = createSfx('./assets/sfx/hover.webm');
    sfxPause = createSfx('./assets/sfx/pause.webm');
    sfxUnpause = createSfx('./assets/sfx/unpause.webm');
    sfxSell = createSfx('./assets/sfx/sell.webm');
    sfxItem = createSfx('./assets/sfx/item_use.webm');
    sfxBuff = createSfx('./assets/sfx/buff.webm');
}

// Expose playBgm / stopBgm globally for dungeon.js, combat.js, main.js
window.playBgm = playBgm;
window.stopBgm = stopBgm;

document.querySelector("#title-screen").addEventListener("click", function () {
    setVolume();
    sfxOpen.play();
});

document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
        // Remember which BGM was playing, then unload it to free RAM
        if (currentBgm) {
            lastBgmKey = currentBgm.key;
            stopBgm();
        }
        Howler.mute(true);
    } else {
        Howler.mute(false);
        // Reload the BGM that was playing before tab hide
        if (lastBgmKey) {
            if (lastBgmKey === 'dungeon') playBgm(bgmDungeon, 'dungeon');
            else if (lastBgmKey === 'battleMain') playBgm(bgmBattleMain, 'battleMain');
            else if (lastBgmKey === 'battleBoss') playBgm(bgmBattleBoss, 'battleBoss');
        }
    }
});
