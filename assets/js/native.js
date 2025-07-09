async function nativeInit() {
  const waitForCapacitor = () => {
    const maxAttempts = 50;
    let attempts = 0;
    return new Promise((resolve, reject) => {
      const checkCapacitor = () => {
        if (window.Capacitor) {
          resolve();
        } else if (++attempts >= maxAttempts) {
          resolve();
        } else {
          setTimeout(checkCapacitor, 100);
        }
      };
      checkCapacitor();
    });
  };
  await waitForCapacitor();
  try {
    if (window.Capacitor && window.Capacitor.isNativePlatform()) {
      if (window.Capacitor.Plugins && window.Capacitor.Plugins.SplashScreen) {
        try {
          await window.Capacitor.Plugins.SplashScreen.hide();
        } catch (err) {
          console.error('Failed to hide splash screen:', err);
        }
      }
    }
  } catch (err) {
    console.error('Error during native initialization:', err);
  }
  if (typeof CdvPurchase !== 'undefined' && CdvPurchase && CdvPurchase.store) {  
    setTimeout(() => {
      try {
        initializePurchases();
      } catch (err) {
        console.error('Error initializing purchases:', err);
      }
    }, 1500);
  } else {
    console.log('CdvPurchase is not defined. In-app purchases will be disabled.');
  }
}

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

function buyForgeUnlock() {;
  // CdvPurchase.store.get('test-non-consumable').getOffer().order();
  CdvPurchase.store.get(FORGE_PRODUCT_ID).getOffer().order();
}
