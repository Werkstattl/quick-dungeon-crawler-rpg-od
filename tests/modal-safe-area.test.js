const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const styleSource = fs.readFileSync(path.join(root, 'assets/css/style.css'), 'utf8');

function ruleFor(selector) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = styleSource.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
    assert.ok(match, `missing CSS rule for ${selector}`);
    return match[1];
}

function ruleAfter(marker, selector) {
    const markerIndex = styleSource.indexOf(marker);
    assert.notEqual(markerIndex, -1, `missing CSS marker ${marker}`);
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = styleSource.slice(markerIndex).match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
    assert.ok(match, `missing CSS rule for ${selector} after ${marker}`);
    return match[1];
}

test('modal overlay stays inside every Android safe-area inset', () => {
    const rule = ruleFor('.modal-container');
    const safeAreaRule = ruleAfter('/* Safe-area-capable modal placement */', '.modal-container');

    for (const edge of ['top', 'right', 'bottom', 'left']) {
        assert.match(rule, new RegExp(`${edge}:\\s*0`));
    }
    assert.doesNotMatch(rule, /env\(/);
    assert.match(safeAreaRule, /top:\s*var\(--safe-area-inset-top,\s*env\(safe-area-inset-top,\s*0px\)\)/);
    assert.match(safeAreaRule, /right:\s*var\(--safe-area-inset-right,\s*env\(safe-area-inset-right,\s*0px\)\)/);
    assert.match(safeAreaRule, /bottom:\s*var\(--safe-area-inset-bottom,\s*env\(safe-area-inset-bottom,\s*0px\)\)/);
    assert.match(safeAreaRule, /left:\s*var\(--safe-area-inset-left,\s*env\(safe-area-inset-left,\s*0px\)\)/);
    assert.match(rule, /width:\s*auto/);
    assert.match(rule, /height:\s*auto/);
});

test('legacy browsers keep oversized modal content scrollable from the safe top edge', () => {
    const containerRule = ruleFor('.modal-container');
    const contentRule = ruleFor('.modal-container .content');

    assert.match(containerRule, /justify-content:\s*flex-start/);
    assert.match(containerRule, /overflow-y:\s*auto/);
    assert.match(containerRule, /padding:\s*0\.5rem\s+0/);
    assert.match(contentRule, /margin:\s*auto\s+0\.5rem/);
});

test('dynamic viewport units only override the legacy fallback when supported', () => {
    assert.match(
        styleSource,
        /--modal-safe-max-height:\s*calc\(100vh\s*-\s*1rem\);[\s\S]*@supports\s*\(padding-top:\s*env\(safe-area-inset-top\)\)[\s\S]*--modal-safe-max-height:[^;]*100vh[^;]*env\(safe-area-inset-top,[^;]*env\(safe-area-inset-bottom,[^;]*;[\s\S]*@supports\s*\(height:\s*100dvh\)[\s\S]*--modal-safe-max-height:[^;]*100dvh/,
    );
});

test('full-height modal content is capped to the safe viewport', () => {
    assert.match(styleSource, /--modal-safe-max-height:\s*calc\(/);

    for (const selector of [
        '#equipmentInfo .content.equipment-info-content--with-compare',
        '#inventory .content',
        '#menuModal .content',
    ]) {
        assert.match(
            ruleFor(selector),
            /max-height:[^;]*var\(--modal-safe-max-height\)/,
            `${selector} must stay above system bars`,
        );
    }

    assert.match(
        ruleAfter('/* Safe-area height fallback for WebViews without min() */', '#defaultModal .content'),
        /max-height:\s*var\(--modal-safe-max-height\)/,
        '#defaultModal .content must stay above system bars',
    );
});

test('every modal content variant preserves the shared safe-height cap', () => {
    assert.match(
        ruleFor('.modal-container .content'),
        /max-height:[^;]*var\(--modal-safe-max-height\)/,
        '.modal-container .content must retain the shared safe-height cap',
    );

    const selectors = [
        '#endgameModal .content',
        '.modal-container .content-ei',
        '#combatPanel .content',
        '#forgeModal .content',
    ];

    for (const selector of selectors) {
        assert.match(
            ruleAfter('/* Safe-area height fallback for WebViews without min() */', selector),
            /max-height:[^;]*var\(--modal-safe-max-height\)/,
            `${selector} must retain the shared safe-height cap`,
        );
    }
});

test('existing smaller modal caps remain as old-WebView fallbacks', () => {
    const legacyCaps = new Map([
        ['#endgameModal .content', '90vh'],
        ['.modal-container .content-ei', '85vh'],
        ['#combatPanel .content', '43rem'],
        ['#defaultModal .content', 'calc(100vh - 3rem)'],
        ['#forgeModal .content', '80vh'],
    ]);

    for (const [selector, legacyCap] of legacyCaps) {
        const escapedCap = legacyCap.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        assert.match(
            ruleFor(selector),
            new RegExp(`max-height:\\s*${escapedCap}`),
            `${selector} must preserve its previous cap for old WebViews`,
        );
    }
});

test('env-capable WebViews without min use the safe-area cap', () => {
    const fallbackMarker = '/* Safe-area height fallback for WebViews without min() */';
    const enhancementMarker = '/* Preserve smaller modal caps when min() is supported */';
    const fallbackIndex = styleSource.indexOf(fallbackMarker);
    const enhancementIndex = styleSource.indexOf(enhancementMarker);

    assert.notEqual(fallbackIndex, -1, 'missing intermediate-WebView safe-area fallback');
    assert.notEqual(enhancementIndex, -1, 'missing min() enhancement block');
    assert.ok(fallbackIndex < enhancementIndex, 'min() enhancements must follow the safe fallback');

    for (const selector of [
        '#endgameModal .content',
        '.modal-container .content-ei',
        '#combatPanel .content',
        '#defaultModal .content',
        '#forgeModal .content',
    ]) {
        assert.match(
            ruleAfter(fallbackMarker, selector),
            /max-height:\s*var\(--modal-safe-max-height\)/,
            `${selector} must use the safe cap when env() is supported`,
        );
        assert.match(
            ruleAfter(enhancementMarker, selector),
            /max-height:\s*min\([^;]*var\(--modal-safe-max-height\)\)/,
            `${selector} must preserve its smaller cap when min() is supported`,
        );
    }
});
