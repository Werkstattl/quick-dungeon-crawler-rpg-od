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
    if (fontSize.family && fontSize.family !== DEFAULT_FONT_KEY) {
        document.body.style.fontFamily = selectedStack;
    } else {
        document.body.style.removeProperty('font-family');
    }
}


// BGM
let bgmDungeon;
let bgmBattleMain;
let bgmBattleBoss;

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

const setVolume = () => {
    // ===== BGM =====
    bgmDungeon = new Howl({
        src: ['./assets/bgm/dungeon.webm'],
        volume: volume.bgm * volume.master,
        loop: true
    });

    bgmBattleMain = new Howl({
        src: ['./assets/bgm/battle_main.webm'],
        volume: volume.bgm * volume.master,
        loop: true
    });

    bgmBattleBoss = new Howl({
        src: ['./assets/bgm/battle_boss.webm'],
        volume: volume.bgm * volume.master,
        loop: true
    });

    // ===== SFX =====
    sfxEncounter = new Howl({
        src: ['./assets/sfx/encounter.webm'],
        volume: volume.sfx * volume.master
    });

    sfxCombatEnd = new Howl({
        src: ['./assets/sfx/combat_end.webm'],
        volume: volume.sfx * volume.master
    });

    sfxAttack = new Howl({
        src: ['./assets/sfx/attack.webm'],
        volume: volume.sfx * volume.master
    });

    sfxLvlUp = new Howl({
        src: ['./assets/sfx/level_up.webm'],
        volume: volume.sfx * volume.master
    });

    sfxConfirm = new Howl({
        src: ['./assets/sfx/confirm.webm'],
        volume: volume.sfx * volume.master
    });

    sfxDecline = new Howl({
        src: ['./assets/sfx/decline.webm'],
        volume: volume.sfx * volume.master
    });

    sfxDeny = new Howl({
        src: ['./assets/sfx/denied.webm'],
        volume: volume.sfx * volume.master
    });

    sfxEquip = new Howl({
        src: ['./assets/sfx/equip.webm'],
        volume: volume.sfx * volume.master
    });

    sfxUnequip = new Howl({
        src: ['./assets/sfx/unequip.webm'],
        volume: volume.sfx * volume.master
    });

    sfxOpen = new Howl({
        src: ['./assets/sfx/hover.webm'],
        volume: volume.sfx * volume.master
    });

    sfxPause = new Howl({
        src: ['./assets/sfx/pause.webm'],
        volume: volume.sfx * volume.master
    });

    sfxUnpause = new Howl({
        src: ['./assets/sfx/unpause.webm'],
        volume: volume.sfx * volume.master
    });

    sfxSell = new Howl({
        src: ['./assets/sfx/sell.webm'],
        volume: volume.sfx * volume.master
    });

    sfxItem = new Howl({
        src: ['./assets/sfx/item_use.webm'],
        volume: volume.sfx * volume.master
    });

    sfxBuff = new Howl({
        src: ['./assets/sfx/buff.webm'],
        volume: volume.sfx * volume.master
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
