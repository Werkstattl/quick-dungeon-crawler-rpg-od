const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const howlerSource = fs.readFileSync('assets/js/howler.min.js', 'utf8');
const musicSource = fs.readFileSync('assets/js/music.js', 'utf8');
const settle = () => new Promise(resolve => setTimeout(resolve, 15));

function setup() {
    // Model a stream that plays normally but restarts when asked to seek.
    // Pausing also allows a tiny clock drift, as actual HTML audio does.
    class Audio extends EventTarget {
        constructor() {
            super();
            this.time = 0;
            this.duration = 90;
            this.readyState = 4;
            this.paused = true;
            this.ended = false;
            this.muted = false;
            this.volume = 1;
            this.oncanplaythrough = null;
            this.seekWrites = [];
        }
        canPlayType() { return 'probably'; }
        get currentTime() { return this.time; }
        set currentTime(value) { this.seekWrites.push(value); this.time = 0; }
        load() { setImmediate(() => this.dispatchEvent(new Event('canplaythrough'))); }
        play() { this.paused = false; return Promise.resolve(); }
        pause() { this.time += 0.00002; this.paused = true; }
    }
    const context = vm.createContext({
        Audio, console, Promise,
        navigator: { userAgent: 'Chrome', appVersion: 'Chrome', platform: 'Linux', vendor: 'Google' },
        location: { protocol: 'https:' },
        localStorage: { getItem: () => null },
        document: {
            addEventListener() {}, removeEventListener() {},
            querySelector: () => ({ addEventListener() {} }),
        },
        setTimeout: (...args) => setTimeout(...args).unref(), clearTimeout,
        setInterval: (...args) => setInterval(...args).unref(), clearInterval,
    });
    context.window = context;
    vm.runInContext(howlerSource, context);
    vm.runInContext(musicSource, context);
    const run = code => vm.runInContext(code, context);
    return { run, context };
}

test('the shipped HTML5 player resumes its paused position without seeking the stream', async () => {
    const game = setup();
    const id = game.run('setVolume(); bgmDungeon.play()');
    await settle();
    const node = game.run('bgmDungeon._sounds[0]._node');
    node.time = 23.5;
    game.run('bgmDungeon.pause()');
    assert.equal(node.paused, true);
    const pausedAt = node.currentTime;
    const resumedId = game.run('bgmDungeon.play()');
    await settle();
    assert.equal(resumedId, id);
    assert.equal(node.paused, false);
    assert.equal(node.currentTime, pausedAt);
    assert.deepEqual(node.seekWrites, [], 'resume must not ask a non-seekable stream to seek');
    game.run('Howler.unload()');
});

test('repeated play requests and combat transitions keep one music voice and position', async () => {
    const game = setup();
    const id = game.run('setVolume(); bgmDungeon.play()');
    await settle();
    const node = game.run('bgmDungeon._sounds[0]._node');
    node.time = 42;
    for (let i = 0; i < 5; i++) {
        assert.equal(game.run('bgmDungeon.play()'), id);
        await settle();
        assert.equal(game.run('bgmDungeon._sounds.length'), 1);
        game.run('bgmDungeon.pause(); bgmBattleMain.play()');
        await settle();
        game.run('bgmBattleMain.stop(); bgmDungeon.play()');
        await settle();
        assert.ok(node.currentTime >= 42);
        assert.equal(game.run('bgmDungeon._sounds.length'), 1);
    }
    game.run('Howler.unload()');
});

test('stop still rewinds, an unloaded track can play again, and short effects can overlap', async () => {
    const game = setup();
    game.run('setVolume(); bgmDungeon.play()');
    await settle();
    const node = game.run('bgmDungeon._sounds[0]._node');
    node.time = 30;
    game.run('bgmDungeon.stop(); bgmDungeon.play()');
    await settle();
    assert.ok(node.currentTime < 0.001);
    assert.ok(node.seekWrites.includes(0), 'stop must still rewind the stream');
    game.run('bgmDungeon.unload(); bgmDungeon.play()');
    await settle();
    assert.equal(game.run('bgmDungeon.playing()'), true);
    assert.equal(game.run('bgmDungeon._sounds.length'), 1);
    game.run('sfxAttack.play(); sfxAttack.play()');
    await settle();
    assert.equal(game.run('sfxAttack._sounds.filter(sound => !sound._paused).length'), 2);
    game.run('Howler.unload()');
});
