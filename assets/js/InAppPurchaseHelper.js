// InAppPurchaseHelper.js
// Helper for handling in-app purchases using cordova-plugin-purchase

(function() {
    const FORGE_PRODUCT_ID = 'forge_unlock_premium';
    function registerForgeUnlock(onUnlock, onError) {
        if (window.cordova && window.InAppPurchase2) {
            document.addEventListener('deviceready', () => {
                InAppPurchase2.register({
                    id: FORGE_PRODUCT_ID,
                    type: InAppPurchase2.NON_CONSUMABLE
                });

                InAppPurchase2.when(FORGE_PRODUCT_ID).approved(() => {
                    InAppPurchase2(FORGE_PRODUCT_ID).finish();
                    onUnlock();
                });

                InAppPurchase2.when(FORGE_PRODUCT_ID).error((err) => {
                    if (onError) onError(err);
                });

                InAppPurchase2.refresh();
            });
        }
    }
    function buyForgeUnlock() {
        if (window.cordova && window.InAppPurchase2) {
            InAppPurchase2.order(FORGE_PRODUCT_ID);
        }
    }
    window.registerForgeUnlock = registerForgeUnlock;
    window.buyForgeUnlock = buyForgeUnlock;
})();
