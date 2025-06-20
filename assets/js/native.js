document.addEventListener('DOMContentLoaded', async () => {
  const waitForCapacitor = () => {
    const maxAttempts = 100;
    let attempts = 0;
    return new Promise((resolve, reject) => {
      const checkCapacitor = () => {
        console.log('Checking for Capacitor...');
        if (window.Capacitor) {
          resolve();
        } else if (++attempts >= maxAttempts) {
          resolve();
        } else {
          setTimeout(checkCapacitor, 150);
        }
      };
      checkCapacitor();
    });
  };
  await waitForCapacitor();
  if (window.Capacitor && window.Capacitor.isNativePlatform()) {
    await new Promise(resolve => setTimeout(resolve, 100));
    if (window.Capacitor.Plugins && window.Capacitor.Plugins.SplashScreen) {
      await window.Capacitor.Plugins.SplashScreen.hide();
    }
  } else {
    return;
  }
  if (CdvPurchase && CdvPurchase.store) {  
    initializePurchases();
  }
});

function initializePurchases() {
  // CdvPurchase.store.register([{
  //     type: CdvPurchase.ProductType.NON_CONSUMABLE,
  //     id: 'test-non-consumable',
  //     platform: CdvPurchase.Platform.TEST,
  // }]);
  CdvPurchase.store.register([{
      type: CdvPurchase.ProductType.NON_CONSUMABLE,
      id: FORGE_PRODUCT_ID,
      platform: CdvPurchase.Platform.GOOGLE_PLAY,
  }]);
  CdvPurchase.store.when()
    .approved(transaction => {
      defaultModalElement.style.display = "none";
      defaultModalElement.innerHTML = "";
      player.forgeUnlocked = true;
      transaction.finish();
    });
  // CdvPurchase.store.initialize([
  //   CdvPurchase.Platform.TEST,
  // ]);
  CdvPurchase.store.initialize([
    CdvPurchase.Platform.GOOGLE_PLAY,
  ]);
}

function buyForgeUnlock() {
  // CdvPurchase.store.get('test-non-consumable').getOffer().order();
  CdvPurchase.store.get(FORGE_PRODUCT_ID).getOffer().order();
}
