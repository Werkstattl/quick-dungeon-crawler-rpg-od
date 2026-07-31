const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const companionSource = fs.readFileSync(path.join(root, 'assets/js/companion.js'), 'utf8');

const harness = `
  globalThis._companionTypes = companionTypes;
  globalThis._getChain = getCompanionEvolutionChain;
`;

const loadCompanions = () => {
    const context = vm.createContext({});
    vm.runInContext(companionSource + harness, context);
    return {
        companionTypes: vm.runInContext('_companionTypes', context),
        getChain: vm.runInContext('_getChain', context),
    };
};

const { companionTypes, getChain } = loadCompanions();
const starterIds = companionTypes.filter(c => c.obtainable !== false).map(c => c.id);
const byId = new Map(companionTypes.map(c => [c.id, c]));

test('every obtainable companion line ends on an equally powerful legendary form', () => {
    for (const starterId of starterIds) {
        const chain = getChain(starterId);
        const finalForm = byId.get(chain.length ? chain[chain.length - 1] : starterId);

        assert.equal(finalForm.rarity, 'Legendary', `line ${starterId} must end on a Legendary form`);
        assert.equal(finalForm.baseAtk, 700, `line ${starterId} must reach the shared ATK ceiling`);
        assert.equal(finalForm.baseHp, 90, `line ${starterId} must reach the shared HP ceiling`);

        for (const passive of finalForm.passives) {
            assert.ok(passive.perLevel >= 0.08, `line ${starterId} passives must keep scaling per level`);
        }
    }
});

test('evolution chains are acyclic and require higher levels at each step', () => {
    for (const starterId of starterIds) {
        const chain = getChain(starterId);
        assert.equal(new Set(chain).size, chain.length, `line ${starterId} must not loop`);

        let previousLevel = 0;
        let current = byId.get(starterId);
        while (current && current.evolvesTo) {
            assert.ok(current.evolveLevel > previousLevel, `line ${starterId} evolution levels must increase`);
            previousLevel = current.evolveLevel;
            current = byId.get(current.evolvesTo);
        }
    }
});

test('every companion stage is reachable from an obtainable starter', () => {
    const reachable = new Set(starterIds);
    starterIds.forEach(id => getChain(id).forEach(stageId => reachable.add(stageId)));

    for (const companion of companionTypes) {
        assert.ok(reachable.has(companion.id), `companion ${companion.id} is unreachable`);
    }
});

test('all companion locale keys exist in every locale file', () => {
    const localeDir = path.join(root, 'assets/locales');
    const requiredKeys = new Set(['companion-evolves-at']);
    companionTypes.forEach(companion => {
        requiredKeys.add(companion.nameKey);
        if (companion.passiveDescriptionKey) {
            requiredKeys.add(companion.passiveDescriptionKey);
        }
    });

    for (const file of fs.readdirSync(localeDir).filter(name => name.endsWith('.json'))) {
        const dictionary = JSON.parse(fs.readFileSync(path.join(localeDir, file), 'utf8'));
        for (const key of requiredKeys) {
            assert.ok(dictionary[key], `${file} is missing "${key}"`);
        }
    }
});
