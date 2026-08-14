const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const mainSource = fs.readFileSync(path.join(root, 'assets/js/main.js'), 'utf8');

const DISCORD_INVITE_URL = 'https://discord.gg/U4DvQT3qfQ';

test('menu renders an external Discord community button', () => {
    assert.match(mainSource, /<button id="discord-link"[^>]*>/);
    assert.match(mainSource, /id="discord-link"[^>]*>[\s\S]*?fa-discord[\s\S]*?Discord[\s\S]*?external-link-icon[\s\S]*?<\/button>/);
});

test('Discord menu button opens the official invite externally', () => {
    assert.match(mainSource, /document\.querySelector\('#discord-link'\)/);
    assert.match(
        mainSource,
        new RegExp(`discordLink\\.onclick\\s*=\\s*function\\s*\\(\\)\\s*\\{[\\s\\S]*?openExternal\\('${DISCORD_INVITE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'\\);[\\s\\S]*?\\}`),
    );
});
