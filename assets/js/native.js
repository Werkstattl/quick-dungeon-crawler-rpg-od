document.addEventListener('DOMContentLoaded', async () => {
  const waitForCapacitor = () => {
    const maxAttempts = 100;
    let attempts = 0;
    return new Promise((resolve, reject) => {
      const checkCapacitor = () => {
        if (window.Capacitor) {
          resolve();
        } else if (++attempts >= maxAttempts) {
          resolve();
        } else {
          setTimeout(checkCapacitor, 300);
        }
      };
      checkCapacitor();
    });
  };
  await waitForCapacitor();
  if (window.Capacitor && window.Capacitor.isNativePlatform()) {
    await new Promise(resolve => setTimeout(resolve, 200));
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
      unlockForge();
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
  defaultModalElement.style.display = "none";
  defaultModalElement.innerHTML = "";
  document.querySelector("#title-screen").style.filter = "brightness(100%)";
  // CdvPurchase.store.get('test-non-consumable').getOffer().order();
  CdvPurchase.store.get(FORGE_PRODUCT_ID).getOffer().order();
}
