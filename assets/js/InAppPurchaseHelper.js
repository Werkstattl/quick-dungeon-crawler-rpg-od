// InAppPurchaseHelper.js
// Helper for handling in-app purchases using cordova-plugin-purchase

import { InAppPurchase2 } from '@awesome-cordova-plugins/in-app-purchase-2';

const FORGE_PRODUCT_ID = 'forge_unlock_premium'; // Set this to your real product ID from Google Play

export const registerForgeUnlock = (onUnlock, onError) => {
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
};

export const buyForgeUnlock = () => {
    InAppPurchase2.order(FORGE_PRODUCT_ID);
};
