async function nativeInit() {
  if (typeof CdvPurchase !== 'undefined' && CdvPurchase && CdvPurchase.store) {  
    setTimeout(() => {
      try {
        initializePurchases();
      } catch (err) {
        console.error('Error initializing purchases:', err);
      }
    }, 1500);
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
