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


// BGM
let bgmDungeon;
let bgmBattleMain;
let bgmBattleBoss;

// SFX
let sfxEncounter;
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

// Keep long tracks out of Web Audio's fully decoded PCM cache. Load each
// HTML5 stream only when it is first played, including on mobile WebViews.
const createBackgroundMusic = (file) => {
    const music = new Howl({
        src: [`./assets/bgm/${file}.webm`],
        // These files contain Opus. Howler's generic WebM check tests Vorbis,
        // which can reject playable Opus streams in Safari/WKWebView.
        format: ['opus'],
        volume: volume.bgm * volume.master,
        loop: true,
        html5: true,
        preload: false,
        pool: 1,
        // HTML5 play() is asynchronous. Reapply changes made while its promise
        // was pending, when Howler can update the playing element immediately.
        onplay: () => music.volume(volume.bgm * volume.master)
    });
    const play = music.play;
    let soundId;
    music.play = function (...args) {
        // Howler 2.2.4 queues play() on an unloaded Howl but does not load it.
        if (music.state() === 'unloaded') {
            soundId = undefined;
            music.load();
            music.volume(volume.bgm * volume.master);
        }
        // A background track has one voice. Howler's no-argument play() starts
        // another voice if one is already playing or several were paused.
        // Keep its ID so combat always resumes the same stream and position.
        const id = play.apply(music, args.length || soundId === undefined ? args : [soundId]);
        if (typeof id === 'number') soundId = id;
        return id;
    };
    return music;
};

const setVolume = () => {
    // Startup, title clicks and settings all use the same audio objects.
    // Howler retains every Howl until unload(), so recreating them leaks them.
    if (!bgmDungeon) {
        bgmDungeon = createBackgroundMusic('dungeon');
        bgmBattleMain = createBackgroundMusic('battle_main');
        bgmBattleBoss = createBackgroundMusic('battle_boss');

        const effect = file => new Howl({
            src: [`./assets/sfx/${file}.webm`],
            format: ['opus'],
            volume: volume.sfx * volume.master
        });
        sfxEncounter = effect('encounter');
        sfxCombatEnd = effect('combat_end');
        sfxAttack = effect('attack');
        sfxLvlUp = effect('level_up');
        sfxConfirm = effect('confirm');
        sfxDecline = effect('decline');
        sfxDeny = effect('denied');
        sfxEquip = effect('equip');
        sfxUnequip = effect('unequip');
        sfxOpen = effect('hover');
        sfxPause = effect('pause');
        sfxUnpause = effect('unpause');
        sfxSell = effect('sell');
        sfxItem = effect('item_use');
        sfxBuff = effect('buff');
    }

    [bgmDungeon, bgmBattleMain, bgmBattleBoss].forEach(sound => {
        // Unused tracks pick up the latest volume on first play. Avoid queuing
        // a volume command for every settings change before they are loaded.
        if (sound.state() !== 'unloaded') sound.volume(volume.bgm * volume.master);
    });
    [sfxEncounter, sfxCombatEnd, sfxAttack, sfxLvlUp, sfxConfirm,
        sfxDecline, sfxDeny, sfxEquip, sfxUnequip, sfxOpen,
        sfxPause, sfxUnpause, sfxSell, sfxItem, sfxBuff].forEach(sound => {
        sound.volume(volume.sfx * volume.master);
    });
};

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
