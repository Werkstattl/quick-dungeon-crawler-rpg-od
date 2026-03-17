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
}


// BGM - lazy loaded on demand with preload: false
let bgmDungeon;
let bgmBattleMain;
let bgmBattleBoss;

// SFX - lazy loaded on demand with preload: false  
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

const setVolume = () => {
    // ===== BGM =====
    // preload: false means audio won't load until actually played
    // This significantly reduces initial memory usage on older devices
    bgmDungeon = new Howl({
        src: ['./assets/bgm/dungeon.webm'],
        volume: volume.bgm * volume.master,
        loop: true,
        preload: false
    });

    bgmBattleMain = new Howl({
        src: ['./assets/bgm/battle_main.webm'],
        volume: volume.bgm * volume.master,
        loop: true,
        preload: false
    });

    bgmBattleBoss = new Howl({
        src: ['./assets/bgm/battle_boss.webm'],
        volume: volume.bgm * volume.master,
        loop: true,
        preload: false
    });

    // ===== SFX =====
    // SFX are one-shot sounds, preload: false saves memory
    // They will load on first play() call
    sfxEncounter = new Howl({
        src: ['./assets/sfx/encounter.webm'],
        volume: volume.sfx * volume.master,
        preload: false
    });

    sfxCombatEnd = new Howl({
        src: ['./assets/sfx/combat_end.webm'],
        volume: volume.sfx * volume.master,
        preload: false
    });

    sfxAttack = new Howl({
        src: ['./assets/sfx/attack.webm'],
        volume: volume.sfx * volume.master,
        preload: false
    });

    sfxLvlUp = new Howl({
        src: ['./assets/sfx/level_up.webm'],
        volume: volume.sfx * volume.master,
        preload: false
    });

    sfxConfirm = new Howl({
        src: ['./assets/sfx/confirm.webm'],
        volume: volume.sfx * volume.master,
        preload: false
    });

    sfxDecline = new Howl({
        src: ['./assets/sfx/decline.webm'],
        volume: volume.sfx * volume.master,
        preload: false
    });

    sfxDeny = new Howl({
        src: ['./assets/sfx/denied.webm'],
        volume: volume.sfx * volume.master,
        preload: false
    });

    sfxEquip = new Howl({
        src: ['./assets/sfx/equip.webm'],
        volume: volume.sfx * volume.master,
        preload: false
    });

    sfxUnequip = new Howl({
        src: ['./assets/sfx/unequip.webm'],
        volume: volume.sfx * volume.master,
        preload: false
    });

    sfxOpen = new Howl({
        src: ['./assets/sfx/hover.webm'],
        volume: volume.sfx * volume.master,
        preload: false
    });

    sfxPause = new Howl({
        src: ['./assets/sfx/pause.webm'],
        volume: volume.sfx * volume.master,
        preload: false
    });

    sfxUnpause = new Howl({
        src: ['./assets/sfx/unpause.webm'],
        volume: volume.sfx * volume.master,
        preload: false
    });

    sfxSell = new Howl({
        src: ['./assets/sfx/sell.webm'],
        volume: volume.sfx * volume.master,
        preload: false
    });

    sfxItem = new Howl({
        src: ['./assets/sfx/item_use.webm'],
        volume: volume.sfx * volume.master,
        preload: false
    });

    sfxBuff = new Howl({
        src: ['./assets/sfx/buff.webm'],
        volume: volume.sfx * volume.master,
        preload: false
    });
}

document.querySelector("#title-screen").addEventListener("click", function () {
    setVolume();
    sfxOpen.play();
});

document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
        Howler.mute(true);
    } else {
        Howler.mute(false);
    }
});
