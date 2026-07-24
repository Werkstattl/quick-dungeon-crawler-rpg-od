const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const progressionSource = fs.readFileSync(path.join(root, 'assets/js/progression.js'), 'utf8');

const getNextUnlock = (state) => {
    const context = vm.createContext({ state });
    vm.runInContext(progressionSource, context);
    return vm.runInContext('getNextCurseUnlockLevel(state)', context);
};

const futureState = (overrides = {}) => ({
    maxUnlockedCurseLevel: 10,
    selectedCurseLevel: 10,
    floor: 20,
    trigger: 'floor',
    maxCurseLevel: 15,
    ...overrides,
});

test('Curse 1 through 10 keep the Floor 10 unlock rule', () => {
    assert.equal(getNextUnlock(futureState({
        maxUnlockedCurseLevel: 9,
        selectedCurseLevel: 9,
        floor: 9,
    })), null);
    assert.equal(getNextUnlock(futureState({
        maxUnlockedCurseLevel: 9,
        selectedCurseLevel: 9,
        floor: 10,
    })), 10);
    assert.equal(getNextUnlock(futureState({
        maxUnlockedCurseLevel: 9,
        selectedCurseLevel: 9,
        trigger: 'monarch',
    })), null);
});

test('reaching Floor 10 or higher cannot unlock Curse 11 and above', () => {
    assert.equal(getNextUnlock(futureState({ floor: 10 })), null);
    assert.equal(getNextUnlock(futureState({ floor: 100 })), null);
    assert.equal(getNextUnlock(futureState({
        maxUnlockedCurseLevel: 11,
        selectedCurseLevel: 11,
        floor: 100,
    })), null);
});

test('a Monarch victory unlocks exactly one level from Curse 10 onward', () => {
    assert.equal(getNextUnlock(futureState({ trigger: 'monarch' })), 11);
    assert.equal(getNextUnlock(futureState({
        maxUnlockedCurseLevel: 11,
        selectedCurseLevel: 11,
        trigger: 'monarch',
    })), 12);
});

test('Monarch victories only count on the highest unlocked Curse Level', () => {
    assert.equal(getNextUnlock(futureState({
        maxUnlockedCurseLevel: 11,
        selectedCurseLevel: 10,
        trigger: 'monarch',
    })), null);
    assert.equal(getNextUnlock(futureState({
        maxUnlockedCurseLevel: 15,
        selectedCurseLevel: 15,
        trigger: 'monarch',
    })), null);
});

test('the active Curse 10 cap remains unchanged until the expansion package', () => {
    assert.equal(getNextUnlock({
        maxUnlockedCurseLevel: 10,
        selectedCurseLevel: 10,
        floor: 20,
        trigger: 'monarch',
    }), null);
});

test('the Monarch unlock runs before the victory summary is created', () => {
    const combatSource = fs.readFileSync(path.join(root, 'assets/js/combat.js'), 'utf8');
    const handlerStart = combatSource.indexOf('const handleSpecialBossVictory');
    const unlockCall = combatSource.indexOf('maybeUnlockNextCurseLevel(CURSE_UNLOCK_TRIGGER_MONARCH)', handlerStart);
    const summaryCall = combatSource.indexOf("createRunSummary('victory')", handlerStart);

    assert.ok(handlerStart >= 0);
    assert.ok(unlockCall > handlerStart);
    assert.ok(summaryCall > unlockCall);
});
