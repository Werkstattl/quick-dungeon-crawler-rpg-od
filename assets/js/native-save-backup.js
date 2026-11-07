// Two alternating, validated snapshots keep the last good file intact during writes.
const createNativeSaveBackup = ({ loadFiles, readLocal, hasLocalSave, restoreLocal, now = () => Date.now() }) => {
    const paths = ['save-backups/slot-0.json', 'save-backups/slot-1.json'];
    const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    const validPlayer = value => isObject(value) && typeof value.name === 'string'
        && isObject(value.stats) && isObject(value.baseStats) && isObject(value.exp)
        && isObject(value.inventory) && Array.isArray(value.inventory.equipment)
        && Array.isArray(value.inventory.consumables) && Array.isArray(value.equipped);
    const validDungeon = value => isObject(value) && isObject(value.progress)
        && Number.isFinite(value.progress.floor) && value.progress.floor >= 1
        && Number.isFinite(value.progress.room) && value.progress.room >= 1
        && isObject(value.settings) && isObject(value.statistics) && Array.isArray(value.backlog);
    const validCompanions = value => Array.isArray(value) && value.every(companion =>
        isObject(companion) && Number.isInteger(companion.id) && companion.id > 0
        && Number.isInteger(companion.level) && companion.level >= 1
        && (companion.experience === undefined
            || (Number.isFinite(companion.experience) && companion.experience >= 0)));
    const validData = value => isObject(value) && validPlayer(value.player)
        && validDungeon(value.dungeon) && isObject(value.enemy)
        && validCompanions(value.companions);
    // Shared by local player writes and native captures; never compare level or wall time.
    const getRevision = player => player && Number.isSafeInteger(player._saveRevision)
        && player._saveRevision > 0 ? player._saveRevision : 0;
    let revision = 0;
    const nextRevision = () => ++revision;
    const checksum = text => {
        let hash = 2166136261;
        for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
        return (hash >>> 0).toString(16);
    };
    const decode = raw => {
        const snapshot = JSON.parse(raw);
        if (isObject(snapshot) && Number.isInteger(snapshot.version) && snapshot.version > 1) {
            const error = new Error('Save backup requires a newer game version');
            error.code = 'UNSUPPORTED_SAVE_VERSION';
            throw error;
        }
        if (!isObject(snapshot) || snapshot.version !== 1
            || !Number.isSafeInteger(snapshot.sequence) || snapshot.sequence < 1
            || !Number.isFinite(snapshot.savedAt)
            || !validData(snapshot.data)
            || snapshot.checksum !== checksum(JSON.stringify(snapshot.data))) {
            throw new Error('Invalid save backup');
        }
        return snapshot;
    };
    let files = null;
    let ready = false;
    let initialization = null;
    let latest = null;
    let latestSlot = -1;
    let lastWrite = -Infinity;
    let pending = null;
    let writing = null;

    const localSaveUsable = () => {
        const savedPlayer = readLocal('playerData', validPlayer);
        return savedPlayer && !savedPlayer._saveIncomplete && (!savedPlayer.allocated || (readLocal('dungeonData', validDungeon)
            && readLocal('playerCompanions', validCompanions)));
    };

    // Without a native snapshot (including the first launch after an update),
    // only a genuinely new installation may proceed without a readable player.
    const assertLocalSaveOrFreshInstall = localPlayer => {
        if (!localPlayer) {
            if (hasLocalSave()) throw new Error('Saved player could not be recovered');
            return;
        }
        if (localPlayer._saveIncomplete) throw new Error('Incomplete local save could not be recovered');
        if (localPlayer.allocated) {
            if (!readLocal('dungeonData', validDungeon)) throw new Error('Saved dungeon could not be recovered');
            if (!readLocal('playerCompanions', validCompanions)) throw new Error('Saved companions could not be recovered');
        }
    };

    const initialize = () => {
        if (initialization) return initialization;
        initialization = (async () => {
            try {
                const localPlayer = readLocal('playerData', validPlayer);
                revision = Math.max(revision, getRevision(localPlayer));
                files = await loadFiles();
                if (!files) {
                    assertLocalSaveOrFreshInstall(localPlayer);
                    return; // Browser and desktop do not write native snapshots.
                }
                let readError = null;
                let storageUnavailable = false;
                for (let slot = 0; slot < paths.length; slot++) {
                    let raw;
                    try {
                        raw = await files.read(paths[slot]);
                    } catch (error) {
                        readError = error;
                        storageUnavailable = true;
                        continue;
                    }
                    try {
                        if (raw === null) continue;
                        const snapshot = decode(raw);
                        revision = Math.max(revision, getRevision(snapshot.data.player));
                        if (!latest || snapshot.sequence > latest.sequence) {
                            latest = snapshot;
                            latestSlot = slot;
                        }
                    } catch (error) {
                        if (error.code === 'UNSUPPORTED_SAVE_VERSION') throw error;
                        readError = error;
                        console.warn('Native save backup could not be read:', error);
                    }
                }
                if (!localSaveUsable() || (latest && getRevision(latest.data.player) > getRevision(localPlayer))) {
                    if (latest) {
                        restoreLocal({
                            playerData: latest.data.player,
                            dungeonData: latest.data.dungeon,
                            enemyData: latest.data.enemy,
                            playerCompanions: latest.data.companions,
                        });
                    } else if (readError) {
                        throw readError; // Do not replace an inaccessible save with a new character.
                    } else {
                        assertLocalSaveOrFreshInstall(localPlayer);
                    }
                }
                // Preserve files we could not inspect; retry on the next app launch.
                ready = !storageUnavailable;
            } catch (error) {
                files = null;
                if (!localSaveUsable()) throw error;
                // A usable local save can still be played if the native plugin is unavailable.
                console.warn('Native save backups unavailable:', error);
            }
        })().catch(error => {
            initialization = null;
            throw error;
        });
        return initialization;
    };

    const drain = async () => {
        while (pending) {
            const data = pending;
            pending = null;
            try {
                const sequence = latest ? latest.sequence + 1 : 1;
                const snapshot = { version: 1, sequence, savedAt: now(), data,
                    checksum: checksum(JSON.stringify(data)) };
                const raw = JSON.stringify(snapshot);
                const slot = latestSlot === 0 ? 1 : 0;
                const temp = `${paths[slot]}.tmp`;
                await files.write(temp, raw);
                const written = await files.read(temp);
                if (written !== raw) throw new Error('Save backup verification failed');
                decode(written);
                await files.rename(temp, paths[slot]);
                latest = snapshot;
                latestSlot = slot;
                lastWrite = now();
            } catch (error) {
                console.error('Native save backup failed:', error);
            }
        }
    };

    const save = (data, { force = false } = {}) => {
        if (!ready || !files || !validData(data)) return Promise.resolve(false);
        if (!force && (writing || now() - lastWrite < 30000)) return writing || Promise.resolve(false);
        try {
            // Detach before the first await: subsequent gameplay must not change this snapshot.
            pending = JSON.parse(JSON.stringify(data));
            pending.player._saveRevision = nextRevision();
        } catch (error) {
            console.error('Native save backup serialization failed:', error);
            return Promise.resolve(false);
        }
        if (!writing) writing = drain().finally(() => { writing = null; });
        return writing;
    };

    // Include unfinished writes and invalid JSON verbatim for support diagnostics.
    const recoveryPaths = paths.flatMap(path => [path, `${path}.tmp`]);
    const exportRaw = async () => {
        const result = { files: {}, errors: {} };
        try {
            const storage = await loadFiles();
            if (!storage) return result;
            for (const path of recoveryPaths) {
                try { result.files[path] = await storage.read(path); }
                catch (error) { result.errors[path] = String(error.message || error); }
            }
        } catch (error) {
            result.errors.storage = String(error.message || error);
        }
        return result;
    };

    const clear = async () => {
        // Stop lifecycle checkpoints and finish any in-flight write before deleting.
        ready = false;
        pending = null;
        if (writing) await writing;
        const storage = await loadFiles();
        if (storage) {
            for (const path of recoveryPaths) await storage.remove(path);
        }
        latest = null;
        latestSlot = -1;
    };

    return { initialize, save, validPlayer, validDungeon, validCompanions, nextRevision, exportRaw, clear,
        get hasNativeStorage() { return files !== null; } };
};

const nativeSaveBackup = createNativeSaveBackup({
    loadFiles: async () => {
        const cap = window.Capacitor;
        if (!cap || typeof cap.isNativePlatform !== 'function' || typeof cap.getPlatform !== 'function'
            || !cap.isNativePlatform() || !['android', 'ios'].includes(cap.getPlatform())) return null;
        return import('./filesystem-plugin.js');
    },
    readLocal: (key, validate) => safeLoad(key, `${key}_backup`, validate),
    // Inspect presence, not parsed validity: even empty, corrupt or temporary
    // entries are evidence of a save. Read failures must also block a new game.
    hasLocalSave: () => ['playerData', 'dungeonData', 'enemyData', 'playerCompanions'].some(key =>
        ['', '_backup', '_temp'].some(suffix => readSaveStorage(key + suffix) !== null)),
    restoreLocal: entries => {
        // Keep an in-memory copy too, so recovery works even when localStorage is full.
        for (const [key, value] of Object.entries(entries)) {
            recoveredSaveData.set(key, JSON.stringify(value));
        }
        try {
            // A partial repair must never look like a complete, current local save.
            localStorage.setItem('playerData', JSON.stringify({ ...entries.playerData, _saveIncomplete: true }));
            for (const [key, value] of Object.entries(entries)) {
                if (key !== 'playerData') localStorage.setItem(key, JSON.stringify(value));
            }
            localStorage.setItem('playerData', JSON.stringify(entries.playerData));
        } catch (error) {
            console.warn('Could not restore complete save to localStorage:', error);
        }
    },
});

const saveNativeBackup = ({ force = false, forceDungeon = false } = {}) => {
    try {
        if (!player) return;
        const useLiveDungeon = dungeon.initialized || forceDungeon;
        const savedDungeon = useLiveDungeon ? dungeon : safeLoad(STORAGE_KEYS.dungeon, STORAGE_KEYS.dungeonBackup);
        const savedEnemy = useLiveDungeon ? enemy : safeLoad(STORAGE_KEYS.enemy, STORAGE_KEYS.enemyBackup);
        const companions = companionsInitialized ? playerCompanions : JSON.parse(readSaveStorage('playerCompanions') || '[]');
        return nativeSaveBackup.save({ player, dungeon: savedDungeon, enemy: savedEnemy || {}, companions }, { force });
    } catch (error) {
        console.warn('Could not capture native save backup:', error);
    }
};

// Best effort before suspension; regular checkpoints also cover force-closing the app.
document.addEventListener('visibilitychange', () => {
    if (document.hidden) saveNativeBackup({ force: true });
});
document.addEventListener('pause', () => saveNativeBackup({ force: true }));
window.addEventListener('pagehide', () => saveNativeBackup({ force: true }));
