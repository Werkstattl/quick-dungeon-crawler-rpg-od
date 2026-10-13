// Cosmetic accomplishments live in the player save and survive normal run resets.
const PLAYER_TITLE_VERSION = 2;
const PLAYER_TITLES = [
    { id: 'dungeon-delver', name: 'Dungeon Delver', rarity: 'Common', group: 'depth', metric: 'highestFloor', target: 5 },
    { id: 'depthwalker', name: 'Depthwalker', rarity: 'Uncommon', group: 'depth', metric: 'highestFloor', target: 20 },
    { id: 'abyss-strider', name: 'Abyss Strider', rarity: 'Rare', group: 'depth', metric: 'highestFloor', target: 40 },
    { id: 'field-scholar', name: 'Field Scholar', rarity: 'Uncommon', group: 'bestiary', metric: 'bestiaryTypes', target: 10 },
    { id: 'beast-chronicler', name: 'Beast Chronicler', rarity: 'Rare', group: 'bestiary', metric: 'bestiaryTypes', target: 25 },
    { id: 'living-bestiary', name: 'Living Bestiary', rarity: 'Epic', group: 'bestiary', metric: 'bestiaryTypes', target: 40 },
    { id: 'cursebound', name: 'Cursebound', rarity: 'Rare', group: 'curse', metric: 'curse', target: 5 },
    { id: 'hexbreaker', name: 'Hexbreaker', rarity: 'Epic', group: 'curse', metric: 'curse', target: 10 },
    { id: 'curseforged', name: 'Curseforged', rarity: 'Legendary', group: 'curse', metric: 'curse', target: 15 },
    { id: 'crownbreaker', name: 'Crownbreaker', rarity: 'Rare', group: 'monarch', metric: 'highestMonarchCurse', target: 1 },
    { id: 'kingsbane', name: 'Kingsbane', rarity: 'Epic', group: 'monarch', metric: 'highestMonarchCurse', target: 10 },
    { id: 'sovereign-of-ruin', name: 'Sovereign of Ruin', rarity: 'Heirloom', group: 'monarch', metric: 'highestMonarchCurse', target: 15 },
    { id: 'deep-crowned', name: 'Deep-Crowned', rarity: 'Legendary', group: 'challenges', metric: 'deepMonarchFloor', target: 45 },
    { id: 'the-unbroken', name: 'The Unbroken', rarity: 'Legendary', group: 'challenges', metric: 'hardcoreMonarch', target: 1 },
    { id: 'forge-member', name: 'Forge Member', rarity: null, group: 'membership', metric: 'membership', target: 1 },
];

const PLAYER_TITLE_GROUPS = ['depth', 'bestiary', 'curse', 'monarch', 'challenges', 'membership'];

// Match renamed titles to their original achievement, not the reused display name.
const LEGACY_PLAYER_TITLE_IDS = {
    'sovereign-of-ruin': 'curseforged',
    kingsbane: 'crownbreaker',
    crowncrusher: 'kingsbane',
    crownbreaker: 'sovereign-of-ruin',
};

function titleText(key, fallback, params) {
    const translated = typeof t === 'function' ? t(key, params) : key;
    if (typeof translated === 'string' && translated !== key) return translated;
    return fallback.replace(/\{(\w+)\}/g, (match, name) => params && name in params ? String(params[name]) : match);
}

function escapeTitleHTML(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]);
}

function getPlayerTitleDefinition(id) {
    return PLAYER_TITLES.find(title => title.id === id) || null;
}

function getPlayerTitleName(title) {
    if (!title) return '';
    const key = title.id === 'forge-member' ? 'forge-member-title' : `title-${title.id}`;
    return titleText(key, title.name);
}

function getPlayerTitleClass(title) {
    return title.metric === 'membership' ? 'title-membership' : title.rarity;
}

function normalizePlayerTitles(playerData) {
    if (!playerData || typeof playerData !== 'object') return null;
    const old = playerData.titles && typeof playerData.titles === 'object' ? playerData.titles : {};
    const progress = old.progress && typeof old.progress === 'object' ? old.progress : {};
    const migrateId = id => typeof id !== 'string' || Number(old.version) >= PLAYER_TITLE_VERSION
        || !Object.prototype.hasOwnProperty.call(LEGACY_PLAYER_TITLE_IDS, id)
        ? id : LEGACY_PLAYER_TITLE_IDS[id];
    const normalized = {
        version: PLAYER_TITLE_VERSION,
        // Membership is checked against purchase entitlements, never imported unlocks.
        unlocked: Array.isArray(old.unlocked) ? [...new Set(old.unlocked.map(migrateId).filter(id =>
            id !== 'forge-member' && getPlayerTitleDefinition(id)))] : [],
        progress: {},
    };
    for (const field of ['highestFloor', 'highestMonarchCurse', 'bestiaryTypes', 'deepMonarchFloor']) {
        const number = Number(progress[field]);
        normalized.progress[field] = Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
    }
    normalized.progress.highestMonarchCurse = Math.min(MAX_CURSE_LEVEL, normalized.progress.highestMonarchCurse);
    normalized.progress.hardcoreMonarch = progress.hardcoreMonarch === true;
    // An absent choice preserves the existing automatic Forge Member display.
    // Explicitly choosing None or an earned title always takes precedence.
    if (Object.prototype.hasOwnProperty.call(old, 'selected')) {
        const selected = migrateId(old.selected);
        normalized.selected = getPlayerTitleDefinition(selected) ? selected : null;
    }
    playerData.titles = normalized;
    return normalized;
}

function getPlayerTitleProgress(title, playerData = player) {
    if (!playerData) return 0;
    if (title.metric === 'membership') return isForgeMembershipActive() ? 1 : 0;
    if (title.metric === 'curse') return clampCurseLevel(playerData.maxUnlockedCurseLevel);
    const progress = playerData.titles && playerData.titles.progress;
    return progress ? Number(progress[title.metric]) || 0 : 0;
}

function isPlayerTitleUnlocked(id, playerData = player) {
    const title = getPlayerTitleDefinition(id);
    if (!title || !playerData) return false;
    if (id === 'forge-member') return isForgeMembershipActive();
    if (playerData.titles && playerData.titles.version !== PLAYER_TITLE_VERSION) normalizePlayerTitles(playerData);
    return Boolean(playerData.titles && Array.isArray(playerData.titles.unlocked)
        && playerData.titles.unlocked.includes(id));
}

function getSelectedPlayerTitle(playerData = player) {
    if (!playerData) return null;
    if (playerData.titles && playerData.titles.version !== PLAYER_TITLE_VERSION) normalizePlayerTitles(playerData);
    const state = playerData.titles;
    const id = state && Object.prototype.hasOwnProperty.call(state, 'selected')
        ? state.selected : 'forge-member';
    return isPlayerTitleUnlocked(id, playerData) ? getPlayerTitleDefinition(id) : null;
}

function persistPlayerTitles() {
    if (player) safeSave(STORAGE_KEYS.player, player, STORAGE_KEYS.playerBackup, STORAGE_KEYS.playerTemp);
}

function syncPlayerTitleUnlocks({ announce = false, dungeonData = dungeon, log = null } = {}) {
    if (!player) return [];
    const before = JSON.stringify(player.titles);
    const state = normalizePlayerTitles(player);
    const progress = state.progress;
    const curse = clampCurseLevel(player.maxUnlockedCurseLevel);
    // Old saves prove Floor 10 via Curse 2+, and Monarch victories via Curse 11+.
    // Unlocking Curse 15 proves a Curse 14 victory, not a Curse 15 victory.
    const savedFloor = dungeonData && dungeonData.progress ? Number(dungeonData.progress.floor) : 0;
    progress.highestFloor = Math.max(progress.highestFloor, curse > 1 ? 10 : 0,
        curse > MAX_STANDARD_CURSE_LEVEL ? 20 : 0,
        Number.isFinite(savedFloor) ? Math.max(0, Math.floor(savedFloor)) : 0);
    if (curse > MAX_STANDARD_CURSE_LEVEL) {
        progress.highestMonarchCurse = Math.max(progress.highestMonarchCurse, curse - 1);
    }
    if (typeof bestiary !== 'undefined' && typeof enemyData !== 'undefined') {
        const defeatedTypes = Object.keys(enemyData).filter(id => bestiary[id] && Number(bestiary[id].k) > 0).length;
        progress.bestiaryTypes = Math.max(progress.bestiaryTypes, defeatedTypes);
    }
    const unlocked = PLAYER_TITLES.filter(title => title.id !== 'forge-member'
        && !state.unlocked.includes(title.id) && getPlayerTitleProgress(title) >= title.target);
    state.unlocked.push(...unlocked.map(title => title.id));
    if (JSON.stringify(state) !== before) persistPlayerTitles();
    if (announce) {
        const addLog = log || (typeof addDungeonLog === 'function' ? addDungeonLog : null);
        if (addLog) unlocked.forEach(title => {
            const name = `<span class="${title.rarity}">${escapeTitleHTML(getPlayerTitleName(title))}</span>`;
            addLog(titleText('title-unlocked', 'Title unlocked: {title}', { title: name }));
        });
    }
    refreshTitlesModalIfOpen();
    return unlocked;
}

function recordPlayerMonarchVictory() {
    if (!player || !dungeon) return;
    const state = normalizePlayerTitles(player);
    const curse = getCurseLevelFromEnemyScaling(dungeon.settings.enemyScaling);
    const floor = Number(dungeon.progress.floor) || 1;
    state.progress.highestMonarchCurse = Math.max(state.progress.highestMonarchCurse, curse);
    if (curse >= 10) {
        state.progress.deepMonarchFloor = Math.max(state.progress.deepMonarchFloor, floor);
        if (player.hardcore) state.progress.hardcoreMonarch = true;
    }
    syncPlayerTitleUnlocks({ announce: true, log: typeof addCombatLog === 'function' ? addCombatLog : null });
    // The recorded victory must persist even if it awarded no new title.
    persistPlayerTitles();
}

function setPlayerTitle(id) {
    if (!player || (id !== null && !isPlayerTitleUnlocked(id))) return false;
    normalizePlayerTitles(player).selected = id;
    persistPlayerTitles();
    if (typeof playerLoadStats === 'function') playerLoadStats();
    refreshTitlesModalIfOpen();
    return true;
}

function getPlayerTitleRequirement(title) {
    const params = { target: title.target };
    const requirements = {
        highestFloor: ['title-requirement-floor', 'Reach Floor {target}.'],
        curse: ['title-requirement-curse', 'Unlock Curse Level {target}.'],
        highestMonarchCurse: ['title-requirement-monarch', 'Defeat the Dungeon Monarch on Curse Level {target} or higher.'],
        bestiaryTypes: ['title-requirement-bestiary', 'Defeat {target} different enemy types.'],
        deepMonarchFloor: ['title-requirement-deep-monarch', 'Defeat the Dungeon Monarch on Floor {target} or deeper at Curse Level 10 or higher.'],
        hardcoreMonarch: ['title-requirement-hardcore', 'Defeat the Dungeon Monarch in Hardcore at Curse Level 10 or higher.'],
        membership: ['title-requirement-membership', 'Available with an active Forge Membership or Lifetime Membership.'],
    };
    const [key, fallback] = requirements[title.metric];
    return titleText(key, fallback, params);
}

function renderPlayerTitleChoice(title, selectedId) {
    const unlocked = isPlayerTitleUnlocked(title.id);
    const selected = selectedId === title.id;
    const metadata = title.metric === 'membership'
        ? titleText('title-membership-badge', 'Membership badge')
        : `${titleText(title.rarity.toLowerCase(), title.rarity)} · ${titleText('title-source-achievement', 'Achievement')}`;
    const progress = Math.min(title.target, getPlayerTitleProgress(title));
    const status = selected ? titleText('title-equipped', 'Equipped')
        : unlocked ? titleText('title-unlocked-label', 'Unlocked')
        : title.metric === 'membership' || title.metric === 'hardcoreMonarch'
            ? titleText('title-locked', 'Locked')
            : titleText('title-progress', '{current}/{target}', { current: progress, target: title.target });
    return `<button type="button" class="title-choice${selected ? ' title-choice-selected' : ''}" data-title-id="${title.id}" aria-pressed="${selected}" ${unlocked ? '' : 'disabled'}>
        <span class="title-choice-heading"><span class="${getPlayerTitleClass(title)}" data-i18n="${title.id === 'forge-member' ? 'forge-member-title' : `title-${title.id}`}">${escapeTitleHTML(getPlayerTitleName(title))}</span><span class="title-choice-status">${escapeTitleHTML(status)}</span></span>
        <span class="title-choice-meta">${escapeTitleHTML(metadata)}</span>
        <span class="title-choice-requirement">${escapeTitleHTML(getPlayerTitleRequirement(title))}</span>
    </button>`;
}

function renderTitlesModal() {
    const modal = defaultModalElement;
    const previousList = modal.querySelector('#titles-list');
    const scrollTop = previousList ? previousList.scrollTop : 0;
    const selected = getSelectedPlayerTitle();
    const selectedId = selected ? selected.id : null;
    const count = PLAYER_TITLES.filter(title => isPlayerTitleUnlocked(title.id)).length;
    const groupNames = { depth: 'Dungeon Depth', curse: 'Curse Mastery', monarch: 'Monarch Slayer', bestiary: 'Bestiary', challenges: 'Challenges', membership: 'Forge Membership' };
    modal.innerHTML = `<div class="content titles-modal">
        <div class="content-head"><h3 data-i18n="titles">${escapeTitleHTML(titleText('titles', 'Titles'))}</h3><button type="button" id="titles-close" class="title-close" aria-label="${escapeTitleHTML(titleText('title-back', 'Back to profile'))}"><i class="fa fa-arrow-left" aria-hidden="true"></i></button></div>
        <p class="titles-description" data-i18n="titles-description">${escapeTitleHTML(titleText('titles-description', 'Choose a title to display beneath your name. Earned titles stay with you across runs.'))}</p>
        <p class="titles-count">${escapeTitleHTML(titleText('titles-count', '{current}/{total} titles unlocked', { current: count, total: PLAYER_TITLES.length }))}</p>
        <p id="title-selection-status" class="titles-current" aria-live="polite">${escapeTitleHTML(titleText('title-current', 'Current title: {title}', { title: selected ? getPlayerTitleName(selected) : titleText('title-none', 'None') }))}</p>
        <div id="titles-list" class="titles-list">
            <button type="button" class="title-choice${selectedId === null ? ' title-choice-selected' : ''}" data-title-id="" aria-pressed="${selectedId === null}"><span class="title-choice-heading"><span data-i18n="title-none">${escapeTitleHTML(titleText('title-none', 'None'))}</span><span class="title-choice-status">${escapeTitleHTML(selectedId === null ? titleText('title-equipped', 'Equipped') : '')}</span></span><span class="title-choice-requirement" data-i18n="title-none-description">${escapeTitleHTML(titleText('title-none-description', 'Display your name without a title.'))}</span></button>
            ${PLAYER_TITLE_GROUPS.map(group => `<section class="title-group" aria-labelledby="title-group-${group}"><h4 id="title-group-${group}" data-i18n="title-group-${group}">${escapeTitleHTML(titleText(`title-group-${group}`, groupNames[group]))}</h4>${PLAYER_TITLES.filter(title => title.group === group).map(title => renderPlayerTitleChoice(title, selectedId)).join('')}</section>`).join('')}
        </div>
    </div>`;
    modal.querySelector('#titles-list').scrollTop = scrollTop;
    modal.querySelector('#titles-close').onclick = () => openPlayerProfile();
    modal.querySelectorAll('[data-title-id]').forEach(button => {
        button.onclick = () => {
            const id = button.dataset.titleId || null;
            if (setPlayerTitle(id)) {
                sfxConfirm.play();
                const replacement = modal.querySelector(`[data-title-id="${id || ''}"]`);
                if (replacement) replacement.focus({ preventScroll: true });
            }
        };
    });
}

function refreshTitlesModalIfOpen() {
    if (typeof defaultModalElement !== 'undefined' && defaultModalElement
        && defaultModalElement.style.display === 'flex' && defaultModalElement.querySelector('#titles-list')) {
        renderTitlesModal();
    }
}

function openTitlesModal() {
    if (!player) return;
    syncPlayerTitleUnlocks();
    sfxOpen.play();
    defaultModalElement.style.display = 'flex';
    renderTitlesModal();
    defaultModalElement.querySelector('#titles-close').focus();
}
