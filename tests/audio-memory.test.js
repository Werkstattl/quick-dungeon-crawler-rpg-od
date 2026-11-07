const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('assets/js/music.js', 'utf8');
const musicNames = ['bgmDungeon', 'bgmBattleMain', 'bgmBattleBoss'];

function setup() {
    const howls = [];
    const clicks = [];
    const visibility = [];
    const muted = [];
    class Howl {
        constructor(options) {
            this.options = options;
            this.status = options.preload === false ? 'unloaded' : 'loaded';
            this.level = options.volume;
            this.calls = [];
            howls.push(this);
        }
        state() { return this.status; }
        load() { this.calls.push('load'); this.status = 'loaded'; return this; }
        play(...args) { this.calls.push(['play', ...args]); return 42; }
        volume(value) { if (value !== undefined) this.level = value; return this.level; }
    }
    const context = vm.createContext({
        Howl, Howler: { mute: value => muted.push(value) },
        localStorage: { getItem: () => null }, window: {},
        document: {
            hidden: false,
            body: { style: { removeProperty() {} } },
            documentElement: { style: { setProperty() {} } },
            querySelector: () => ({ addEventListener: (_, fn) => clicks.push(fn) }),
            addEventListener: (_, fn) => visibility.push(fn),
        },
    });
    vm.runInContext(source, context);
    const run = code => vm.runInContext(code, context);
    return { context, run, howls, clicks, visibility, muted };
}

test('startup, repeated settings updates and title clicks retain exactly one audio set', () => {
    const game = setup();
    game.run('setVolume()');
    assert.equal(game.howls.length, 18);
    const initial = game.howls.slice();
    for (let i = 0; i < 100; i++) {
        game.run('setVolume()');
        game.clicks[0]();
    }
    assert.deepEqual(game.howls, initial);
    assert.equal(game.run('bgmDungeon'), initial[0]);
    assert.equal(game.run('bgmBattleMain'), initial[1]);
    assert.equal(game.run('bgmBattleBoss'), initial[2]);
});

test('long music streams are unloaded until first playback; effects keep low latency', () => {
    const game = setup();
    game.run('setVolume()');
    for (const name of musicNames) {
        const music = game.run(name);
        assert.equal(music.options.html5, true);
        assert.equal(music.options.preload, false);
        assert.equal(music.options.loop, true);
        assert.equal(music.options.pool, 1);
        assert.deepEqual([...music.options.format], ['opus']);
        assert.equal(music.state(), 'unloaded');
    }
    for (const effect of game.howls.slice(3)) {
        assert.equal(effect.options.html5, undefined);
        assert.deepEqual([...effect.options.format], ['opus']);
        assert.equal(effect.state(), 'loaded');
    }
});

test('first play explicitly loads only its own stream and preserves Howler sound IDs', () => {
    const game = setup();
    game.run('setVolume()');
    assert.equal(game.run('bgmBattleMain.play()'), 42);
    assert.deepEqual(game.howls[1].calls, ['load', ['play']]);
    assert.equal(game.run('bgmBattleMain.play(42)'), 42);
    assert.deepEqual(game.howls[1].calls, ['load', ['play'], ['play', 42]]);
    assert.equal(game.howls[0].state(), 'unloaded');
    assert.equal(game.howls[2].state(), 'unloaded');
});

test('volume changes update active battle music and effects in place, including mute', () => {
    const game = setup();
    game.run('setVolume(); bgmBattleBoss.play(); sfxAttack.play()');
    const calls = game.howls.map(howl => howl.calls.slice());
    game.run('volume.master = 0.5; volume.bgm = 0.3; volume.sfx = 0.8; setVolume()');
    assert.equal(game.howls[2].level, 0.15);
    for (const effect of game.howls.slice(3)) assert.equal(effect.level, 0.4);
    assert.deepEqual(game.howls.map(howl => howl.calls), calls, 'volume changes must not restart playback');
    game.run('volume.master = 0; setVolume()');
    assert.ok(game.howls.slice(2).every(howl => howl.level === 0));
    game.run('volume.master = 1; setVolume()');
    assert.equal(game.howls[2].level, 0.3);
    game.run('bgmBattleMain.play()');
    assert.equal(game.howls[1].level, 0.3, 'unused music picks up the latest volume before playing');
});

test('background visibility still mutes both streamed music and sound effects', () => {
    const game = setup();
    game.context.document.hidden = true;
    game.visibility[0]();
    game.context.document.hidden = false;
    game.visibility[0]();
    assert.deepEqual(game.muted, [true, false]);
});

test('a stream starting asynchronously applies the latest settings when playback begins', () => {
    const game = setup();
    game.run('setVolume(); bgmDungeon.play(); volume.master = 0.25');
    game.howls[0].options.onplay();
    assert.equal(game.howls[0].level, 0.1);
    game.run('volume.master = 0');
    game.howls[0].options.onplay();
    assert.equal(game.howls[0].level, 0);
});
