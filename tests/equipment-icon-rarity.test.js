const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const equipmentSource = fs.readFileSync(path.join(root, 'assets/js/equipment.js'), 'utf8');
const styleSource = fs.readFileSync(path.join(root, 'assets/css/style.css'), 'utf8');
const glyphSource = fs.readFileSync(path.join(root, 'assets/css/rpg-awesome.min.css'), 'utf8');

// Icon glyph classes must stay color-agnostic: rarity color comes from the
// parent .Common/.Rare/.Heirloom... wrapper, so the glyph itself must not get
// a hardcoded color rule in style.css (see buckler rendering gray at every rarity).
test('equipmentIcon glyphs are defined and carry no hardcoded color', () => {
    const context = vm.createContext({ console });
    vm.runInContext(equipmentSource, context);

    const categories = ['Sword', 'Axe', 'Hammer', 'Dagger', 'Flail', 'Scythe',
        'Plate', 'Chain', 'Leather', 'Tower', 'Kite', 'Buckler',
        'Great Helm', 'Horned Helm', 'Mask', 'Boots', 'Ring', 'Amulet',
        'Talisman', 'Charm'];

    const coloredRules = new Set(
        [...styleSource.matchAll(/\.([a-z][a-z0-9-]*)\s*\{[^}]*\bcolor\s*:/gi)].map(m => m[1])
    );

    for (const category of categories) {
        const html = vm.runInContext(`equipmentIcon(${JSON.stringify(category)})`, context) || '';
        const classes = [...html.matchAll(/class="([^"]+)"/g)].flatMap(m => m[1].split(/\s+/));
        assert.ok(classes.length >= 1, `${category}: icon markup without class`);
        for (const cls of classes) {
            if (cls.startsWith('ra-')) {
                assert.ok(glyphSource.includes(`.${cls}:before`),
                    `${category}: glyph .${cls} missing from rpg-awesome stylesheet`);
            }
            assert.ok(!coloredRules.has(cls),
                `${category}: icon class .${cls} has a hardcoded color in style.css — it would override the rarity color`);
        }
    }
});
