const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const scriptDir = path.join(root, 'assets/js');

// The game ships as classic scripts with no build step, so any syntax newer than the
// oldest supported WebView (Android 8 / Chrome 62) is a parse error that kills the whole
// file. Third-party bundles are excluded because they are vendored as-is.
const VENDOR_FILES = new Set(['howler.min.js']);

// Strips comments, strings and regex literals so the syntax scan cannot trip on content.
const stripLiterals = (source) => {
    let out = '';
    let i = 0;
    let prevMeaningful = '';
    while (i < source.length) {
        const char = source[i];
        const next = source[i + 1];

        if (char === '/' && next === '/') {
            while (i < source.length && source[i] !== '\n') i++;
            continue;
        }
        if (char === '/' && next === '*') {
            i += 2;
            while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++;
            i += 2;
            continue;
        }
        if (char === '"' || char === "'" || char === '`') {
            const quote = char;
            i++;
            while (i < source.length && source[i] !== quote) {
                if (source[i] === '\\') i++;
                i++;
            }
            i++;
            out += '""';
            prevMeaningful = '"';
            continue;
        }
        if (char === '/' && !'})]'.includes(prevMeaningful) && !/[\w$]/.test(prevMeaningful)) {
            i++;
            let inClass = false;
            while (i < source.length && (inClass || source[i] !== '/')) {
                if (source[i] === '\\') i++;
                else if (source[i] === '[') inClass = true;
                else if (source[i] === ']') inClass = false;
                else if (source[i] === '\n') break;
                i++;
            }
            i++;
            out += '/re/';
            prevMeaningful = '/';
            continue;
        }

        out += char;
        if (!/\s/.test(char)) prevMeaningful = char;
        i++;
    }
    return out;
};

const BANNED_SYNTAX = [
    { name: 'optional chaining (?.)', pattern: /\?\.[\s\w$[(]/, minChrome: 80 },
    { name: 'nullish coalescing (??)', pattern: /\?\?/, minChrome: 80 },
    { name: 'logical assignment (||= &&= ??=)', pattern: /(\|\||&&|\?\?)=/, minChrome: 85 },
    { name: 'optional catch binding (catch {)', pattern: /\bcatch\s*\{/, minChrome: 66 },
    { name: 'private class members (#name)', pattern: /(^\s*(static\s+)?#[\w$]+|this\.#[\w$]+)/, minChrome: 74 },
];

const scriptFiles = fs
    .readdirSync(scriptDir)
    .filter((file) => file.endsWith('.js') && !VENDOR_FILES.has(file));

test('shipped scripts avoid syntax that older Android WebViews cannot parse', () => {
    assert.ok(scriptFiles.length > 0, 'expected to find game scripts to scan');

    const violations = [];
    for (const file of scriptFiles) {
        const source = stripLiterals(fs.readFileSync(path.join(scriptDir, file), 'utf8'));
        source.split('\n').forEach((line, index) => {
            for (const rule of BANNED_SYNTAX) {
                if (rule.pattern.test(line)) {
                    violations.push(`${file}:${index + 1} uses ${rule.name} (Chrome ${rule.minChrome}+)`);
                }
            }
        });
    }

    assert.deepEqual(violations, [], `Unsupported syntax found:\n${violations.join('\n')}`);
});

test('every script referenced by index.html exists', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const referenced = [...html.matchAll(/<script src="\.\/(assets\/js\/[\w.-]+)"/g)].map((m) => m[1]);

    assert.ok(referenced.includes('assets/js/legacy-support.js'), 'legacy-support.js must be loaded');
    for (const rel of referenced) {
        assert.ok(fs.existsSync(path.join(root, rel)), `${rel} referenced by index.html is missing`);
    }
});
