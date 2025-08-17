function isPremium() {
  if ( window.__TAURI__ || window.electronAPI ) {
    return true;
  }
  return false;
}

function isCordova() {
  return typeof window.cordova !== 'undefined';
}

  async function nativeInit() {
    if ( isPremium() ) {
      unlockForge();
      unlockAutoMode();
      return;
    }
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
    // CdvPurchase.store.register([
    //     { type: CdvPurchase.ProductType.NON_CONSUMABLE, id: 'test-non-consumable', platform: CdvPurchase.Platform.TEST }
    // ]);
    CdvPurchase.store.register([
        {
            type: CdvPurchase.ProductType.NON_CONSUMABLE,
            id: FORGE_PRODUCT_ID,
            platform: CdvPurchase.Platform.GOOGLE_PLAY,
        },
        {
            type: CdvPurchase.ProductType.NON_CONSUMABLE,
            id: AUTO_MODE_PRODUCT_ID,
            platform: CdvPurchase.Platform.GOOGLE_PLAY,
        }
    ]);
    CdvPurchase.store.when()
      .approved(transaction => {
        if (transaction.productId === FORGE_PRODUCT_ID) {
          unlockForge();
        } else if (transaction.productId === AUTO_MODE_PRODUCT_ID) {
          unlockAutoMode();
        }
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

  function buyAutoModeUnlock() {
    // CdvPurchase.store.get('test-non-consumable').getOffer().order();
    CdvPurchase.store.get(AUTO_MODE_PRODUCT_ID).getOffer().order();
  }

function openExternal(url) {
    if (window.__TAURI__ && window.__TAURI__.opener?.openUrl) {
        window.__TAURI__.opener.openUrl(url);
    } else if (window.electronAPI && typeof window.electronAPI.openExternal === 'function') {
        window.electronAPI.openExternal(url);
    } else {
        window.open(url, '_system');
    }
}
