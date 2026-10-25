// Only active gameplay owns a screen lock; menus and resting use the normal timeout.
const setScreenWakeLockActive = (() => {
    let playing = false;
    let appPaused = false;
    let pageHidden = false;
    let lock = null;
    let updating = Promise.resolve();
    let nativeApi = null;

    const shouldStayAwake = () => playing && !document.hidden && !appPaused && !pageHidden;

    const acquire = async () => {
        const capacitor = window.Capacitor;
        if (capacitor && capacitor.isNativePlatform && capacitor.isNativePlatform()
            && ['android', 'ios'].includes(capacitor.getPlatform())) {
            if (!nativeApi) nativeApi = await import('./keep-awake-plugin.js');
            await nativeApi.keepAwake();
            return { release: () => nativeApi.allowSleep() };
        }
        if (typeof navigator === 'undefined' || !navigator.wakeLock) return null;
        return navigator.wakeLock.request('screen');
    };

    const reconcile = async () => {
        // Serialize requests: pausing while acquisition is pending must still release it.
        while (true) {
            if (!shouldStayAwake()) {
                if (lock) {
                    const previous = lock;
                    await previous.release();
                    if (lock === previous) lock = null;
                }
                if (!shouldStayAwake()) return;
            }
            if (lock && !lock.released) return;
            const acquired = await acquire();
            if (!acquired) return;
            lock = acquired;
            if (typeof acquired.addEventListener === 'function') {
                acquired.addEventListener('release', () => {
                    if (lock === acquired) lock = null;
                });
            }
            if (shouldStayAwake()) return;
        }
    };

    const sync = () => {
        updating = updating.then(reconcile).catch(() => {
            // Unsupported browsers, power saving and denied requests must not interrupt play.
        });
        return updating;
    };

    document.addEventListener('visibilitychange', sync);
    document.addEventListener('pause', () => { appPaused = true; sync(); });
    document.addEventListener('resume', () => { appPaused = false; sync(); });
    window.addEventListener('pagehide', () => { pageHidden = true; sync(); });
    window.addEventListener('pageshow', () => { pageHidden = false; sync(); });
    // Retry a rejected or system-released lock on the next player interaction.
    document.addEventListener('pointerdown', sync);

    return (active) => {
        playing = Boolean(active);
        return sync();
    };
})();
