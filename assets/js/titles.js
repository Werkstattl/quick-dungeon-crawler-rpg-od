// Cosmetic accomplishments live in the player save and survive normal run resets.
// Unlock bits are permanent save identifiers: never renumber or reuse them.
const PLAYER_TITLES = [
    { id: 'dungeon-delver', bit: 1, name: 'Dungeon Delver', rarity: 'Common', group: 'depth', metric: 'highestFloor', target: 5 },
    { id: 'depthwalker', bit: 2, name: 'Depthwalker', rarity: 'Uncommon', group: 'depth', metric: 'highestFloor', target: 20 },
    { id: 'abyss-strider', bit: 4, name: 'Abyss Strider', rarity: 'Rare', group: 'depth', metric: 'highestFloor', target: 40 },
    { id: 'cursebound', bit: 8, name: 'Cursebound', rarity: 'Rare', group: 'curse', metric: 'curse', target: 5 },
    { id: 'hexbreaker', bit: 16, name: 'Hexbreaker', rarity: 'Epic', group: 'curse', metric: 'curse', target: 10 },
    { id: 'curseforged', bit: 32, name: 'Curseforged', rarity: 'Legendary', group: 'curse', metric: 'curse', target: 15 },
    { id: 'crownbreaker', bit: 64, name: 'Crownbreaker', rarity: 'Rare', group: 'monarch', metric: 'highestMonarchCurse', target: 1 },
    { id: 'kingsbane', bit: 128, name: 'Kingsbane', rarity: 'Epic', group: 'monarch', metric: 'highestMonarchCurse', target: 10 },
    { id: 'sovereign-of-ruin', bit: 256, name: 'Sovereign of Ruin', rarity: 'Heirloom', group: 'monarch', metric: 'highestMonarchCurse', target: 15 },
    { id: 'deep-crowned', bit: 512, name: 'Deep-Crowned', rarity: 'Legendary', group: 'challenges', metric: 'deepMonarchFloor', target: 45 },
    { id: 'forge-member', name: 'Forge Member', rarity: null, group: 'membership', metric: 'membership', target: 1 },
];

// Membership is checked against purchase entitlements and has no unlock bit.
const PLAYER_TITLE_UNLOCK_MASK = PLAYER_TITLES.reduce((mask, title) => mask | (title.bit || 0), 0);
const PLAYER_TITLE_GROUPS = ['depth', 'curse', 'monarch', 'challenges', 'membership'];

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
    const normalized = {
        unlocked: Number.isSafeInteger(old.unlocked) && old.unlocked >= 0
            ? old.unlocked & PLAYER_TITLE_UNLOCK_MASK : 0,
    };
    for (const field of ['highestFloor', 'highestMonarchCurse', 'deepMonarchFloor']) {
        const number = Number(old[field]);
        normalized[field] = Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
    }
    normalized.highestMonarchCurse = Math.min(MAX_CURSE_LEVEL, normalized.highestMonarchCurse);
    // An absent choice preserves the existing automatic Forge Member display.
    // Explicitly choosing None or an earned title always takes precedence.
    if (Object.prototype.hasOwnProperty.call(old, 'selected')) {
        normalized.selected = getPlayerTitleDefinition(old.selected) ? old.selected : null;
    }
    playerData.titles = normalized;
    return normalized;
}

function getPlayerTitleProgress(title, playerData = player) {
    if (!playerData) return 0;
    if (title.metric === 'membership') return isForgeMembershipActive() ? 1 : 0;
    if (title.metric === 'curse') return clampCurseLevel(playerData.maxUnlockedCurseLevel);
    return playerData.titles ? Number(playerData.titles[title.metric]) || 0 : 0;
}

function isPlayerTitleUnlocked(id, playerData = player) {
    const title = getPlayerTitleDefinition(id);
    if (!title || !playerData) return false;
    if (id === 'forge-member') return isForgeMembershipActive();
    return Boolean(playerData.titles && (playerData.titles.unlocked & title.bit));
}

function getSelectedPlayerTitle(playerData = player) {
    if (!playerData) return null;
    const state = playerData.titles;
    const id = state && Object.prototype.hasOwnProperty.call(state, 'selected')
        ? state.selected : 'forge-member';
    return isPlayerTitleUnlocked(id, playerData) ? getPlayerTitleDefinition(id) : null;
}

function persistPlayerTitles() {
    if (player) safeSave(STORAGE_KEYS.player, player, STORAGE_KEYS.playerBackup, STORAGE_KEYS.playerTemp);
}

function syncPlayerTitleUnlocks({ announce = false, dungeonData = dungeon, log = null, persist = true } = {}) {
    if (!player) return [];
    const before = persist ? JSON.stringify(player.titles) : null;
    const state = normalizePlayerTitles(player);
    const curse = clampCurseLevel(player.maxUnlockedCurseLevel);
    // Old saves prove Floor 10 via Curse 2+, and Monarch victories via Curse 11+.
    // Unlocking Curse 15 proves a Curse 14 victory, not a Curse 15 victory.
    const savedFloor = dungeonData && dungeonData.progress ? Number(dungeonData.progress.floor) : 0;
    state.highestFloor = Math.max(state.highestFloor, curse > 1 ? 10 : 0,
        curse > MAX_STANDARD_CURSE_LEVEL ? 20 : 0,
        Number.isFinite(savedFloor) ? Math.max(0, Math.floor(savedFloor)) : 0);
    if (curse > MAX_STANDARD_CURSE_LEVEL) {
        state.highestMonarchCurse = Math.max(state.highestMonarchCurse, curse - 1);
    }
    if (typeof bestiary !== 'undefined' && typeof enemyPools !== 'undefined') {
        const hasMonarchKill = Object.values(enemyPools).some(pool =>
            pool.sboss.some(id => {
                const kills = Number(bestiary[id] && bestiary[id].k);
                return Number.isFinite(kills) && kills >= 1;
            }));
        if (hasMonarchKill) {
            // Monarch kills prove Floor 20 and a victory, but not its difficulty or mode.
            state.highestFloor = Math.max(state.highestFloor, 20);
            state.highestMonarchCurse = Math.max(state.highestMonarchCurse, 1);
        }
    }
    const unlocked = PLAYER_TITLES.filter(title => title.bit
        && !(state.unlocked & title.bit) && getPlayerTitleProgress(title) >= title.target);
    const autoSelectFirstTitle = state.unlocked === 0
        && !Object.prototype.hasOwnProperty.call(state, 'selected')
        && !getSelectedPlayerTitle()
        && unlocked.some(title => title.id === 'dungeon-delver');
    unlocked.forEach(title => { state.unlocked |= title.bit; });
    if (autoSelectFirstTitle) state.selected = 'dungeon-delver';
    if (persist && JSON.stringify(state) !== before) persistPlayerTitles();
    if (autoSelectFirstTitle && typeof playerLoadStats === 'function') playerLoadStats();
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

function recordPlayerMonarchVictory({ persist = true } = {}) {
    if (!player || !dungeon) return;
    const before = persist ? JSON.stringify(player.titles) : null;
    const state = normalizePlayerTitles(player);
    const curse = getCurseLevelFromEnemyScaling(dungeon.settings.enemyScaling);
    const floor = Number(dungeon.progress.floor) || 1;
    state.highestMonarchCurse = Math.max(state.highestMonarchCurse, curse);
    if (curse >= 10) {
        state.deepMonarchFloor = Math.max(state.deepMonarchFloor, floor);
    }
    syncPlayerTitleUnlocks({ announce: true, log: typeof addCombatLog === 'function' ? addCombatLog : null, persist: false });
    // Save improved progress even without a new title, unless the caller saves the whole victory.
    if (persist && JSON.stringify(player.titles) !== before) persistPlayerTitles();
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
        deepMonarchFloor: ['title-requirement-deep-monarch', 'Defeat the Dungeon Monarch on Floor {target} or deeper at Curse Level 10 or higher.'],
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
        : title.metric === 'highestMonarchCurse'
            ? progress > 0
                ? titleText('title-progress-monarch', 'Best victory: Curse {current}', { current: progress })
                : titleText('title-no-monarch-victory', 'No victories yet')
        : title.metric === 'membership'
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
    const achievementTitles = PLAYER_TITLES.filter(title => title.metric !== 'membership');
    const count = achievementTitles.filter(title => isPlayerTitleUnlocked(title.id)).length;
    const groupNames = { depth: 'Dungeon Depth', curse: 'Curse Mastery', monarch: 'Monarch Slayer', challenges: 'Challenges', membership: 'Forge Membership' };
    modal.innerHTML = `<div class="content titles-modal">
        <div class="content-head"><h3 data-i18n="titles">${escapeTitleHTML(titleText('titles', 'Titles'))}</h3><button type="button" id="titles-close" class="title-close" aria-label="${escapeTitleHTML(titleText('title-back', 'Back to profile'))}"><i class="fa fa-arrow-left" aria-hidden="true"></i></button></div>
        <p class="titles-description" data-i18n="titles-description">${escapeTitleHTML(titleText('titles-description', 'Choose a title to display beneath your name.'))}</p>
        <p class="titles-count">${escapeTitleHTML(titleText('titles-count', '{current}/{total} titles unlocked', { current: count, total: achievementTitles.length }))}</p>
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
