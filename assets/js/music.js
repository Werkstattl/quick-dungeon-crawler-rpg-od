// Volume settings
let volume;
if (JSON.parse(localStorage.getItem("volumeData")) == undefined) {
    volume = {
        master: 100 / 100,
        bgm: (80 / 100) / 2,
        sfx: 100 / 100
    }
} else {
    volume = JSON.parse(localStorage.getItem("volumeData"));
}

// Font size settings
let fontSize;
if (JSON.parse(localStorage.getItem("fontSizeData")) == undefined) {
    fontSize = {
        scale: 1.0
    }
} else {
    fontSize = JSON.parse(localStorage.getItem("fontSizeData"));
}

// Apply font size on load
const applyFontSize = () => {
    document.documentElement.style.setProperty('--font-scale', fontSize.scale);
}


// BGM
let bgmDungeon;
let bgmBattleMain;
let bgmBattleBoss;
let bgmBattleGuardian;

// SFX
let sfxEncounter;
let sfxEnemyDeath;
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

    bgmBattleGuardian = new Howl({
        src: ['./assets/bgm/battle_guardian.webm'],
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
    if (bgmDungeon != undefined) {
        bgmDungeon.stop();
    }
    if (bgmBattleMain != undefined) {
        bgmBattleMain.stop();
    }
    if (bgmBattleBoss != undefined) {
        bgmBattleBoss.stop();
    }
    if (bgmBattleGuardian != undefined) {
        bgmBattleGuardian.stop();
    }
});
