let purchaseApi = null;
let purchaseApiLoading = null;
let purchasePlatform = null;
let pendingPurchaseProductId = null;
let purchasesReady = false;
let purchasesInitializing = false;

function isPremium() {
  let premium = Boolean(window.__TAURI__ || window.electronAPI);
  if (!premium && isForgeMembershipActive()) {
    premium = true;
  }
  return premium;
}

function isCordova() {
  return typeof window.cordova !== 'undefined';
}

function isDesktopPremiumBuild() {
  return Boolean(window.__TAURI__ || window.electronAPI);
}

function isNativePurchasePlatform() {
  const capacitor = window.Capacitor;
  return Boolean(capacitor && typeof capacitor.isNativePlatform === 'function' &&
    typeof capacitor.getPlatform === 'function' && capacitor.isNativePlatform() &&
    ['ios', 'android'].includes(capacitor.getPlatform()));
}

async function loadPurchaseApi() {
  if (purchaseApi && purchaseApi.store) return purchaseApi;
  if (!purchaseApiLoading) {
    purchaseApiLoading = import('./purchase-plugin.js').then(async ({ CdvPurchase }) => {
      // The plugin defers store creation when a Cordova compatibility bridge exists.
      if (!CdvPurchase.store) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      purchaseApi = CdvPurchase;
      return purchaseApi;
    }).catch(error => {
      purchaseApiLoading = null;
      throw error;
    });
  }
  return purchaseApiLoading;
}

function getPurchasePlatform() {
  if (purchasePlatform) return purchasePlatform;
  if (!isNativePurchasePlatform()) return null;

  purchasePlatform = window.Capacitor.getPlatform() === 'ios'
    ? 'ios-appstore'
    : 'android-playstore';
  return purchasePlatform;
}

function isApplePurchasePlatform() {
  return getPurchasePlatform() === 'ios-appstore';
}

async function nativeInit() {
  // Apply cached lifetime access before contacting the store, including offline.
  if (isForgeLifetimeMembershipActive()) {
    setForgeLifetimeMembershipActive(true);
  }
  if (isDesktopPremiumBuild()) {
    unlockForge('desktop');
    unlockAutoMode(false, 'desktop');
    if (typeof unlockEnemyCustomization === 'function') {
      unlockEnemyCustomization(false);
    }
    return;
  }

  if (!isNativePurchasePlatform()) return;
  try {
    await initializePurchases();
  } catch (error) {
    console.error('Error initializing purchases:', error);
    showPurchaseStatus('iap-status-unavailable', true);
  }
}

async function initializePurchases() {
  if (purchasesInitializing || purchasesReady) return;

  const platform = getPurchasePlatform();
  if (!platform) {
    console.warn('Purchases are not supported on this platform.');
    return;
  }
  purchasesInitializing = true;
  try {
    await loadPurchaseApi();
    await configurePurchaseStore(platform);
  } finally {
    purchasesInitializing = false;
  }
}

async function configurePurchaseStore(platform) {
  const store = purchaseApi.store;
  const validatorUrl = typeof window.IAP_VALIDATOR_URL === 'string'
    ? window.IAP_VALIDATOR_URL.trim()
    : '';
  if (validatorUrl) {
    store.validator = validatorUrl;
  }

  store.register([
    {
      type: purchaseApi.ProductType.NON_CONSUMABLE,
      id: FORGE_PRODUCT_ID,
      platform,
    },
    {
      type: purchaseApi.ProductType.NON_CONSUMABLE,
      id: AUTO_MODE_PRODUCT_ID,
      platform,
    },
    {
      type: purchaseApi.ProductType.NON_CONSUMABLE,
      id: ENEMY_CUSTOMIZATION_PRODUCT_ID,
      platform,
    },
    {
      type: purchaseApi.ProductType.PAID_SUBSCRIPTION,
      id: FORGE_MEMBERSHIP_PRODUCT_ID,
      platform,
    },
    {
      type: purchaseApi.ProductType.NON_CONSUMABLE,
      id: FORGE_LIFETIME_MEMBERSHIP_PRODUCT_ID,
      platform,
    },
  ]);

  store.error(error => {
    if (error && error.code === purchaseApi.ErrorCode.PAYMENT_CANCELLED) return;
    console.error('Purchase error:', error);
    showPurchaseStatus('iap-status-error', true);
  });

  store.when()
    .productUpdated(() => refreshPurchaseUI())
    .receiptUpdated(() => syncPurchaseEntitlements())
    .receiptsReady(() => {
      purchasesReady = true;
      syncPurchaseEntitlements();
      refreshPurchaseUI();
    })
    .approved(transaction => {
      // A configured validator is authoritative for subscriptions and refunds.
      // Without one, the plugin's local StoreKit/Play receipt is used.
      if (store.validator) {
        transaction.verify();
      } else {
        grantApprovedProducts(transaction);
        transaction.finish();
      }
    })
    .verified(receipt => {
      receipt.finish();
      syncPurchaseEntitlements();
    })
    .unverified(receipt => {
      console.error('Purchase receipt validation failed:', receipt);
      showPurchaseStatus('iap-status-verification-failed', true);
    });

  const errors = await store.initialize([platform]);
  if (Array.isArray(errors) && errors.length) {
    console.error('Purchase initialization errors:', errors);
    showPurchaseStatus('iap-status-unavailable', true);
  }
}

function grantApprovedProducts(transaction) {
  // StoreKit 2 also approves existing entitlements at launch and on restore.
  // Reapply the boolean unlocks, but only show purchase UI for a user order.
  const requestedPurchase = transaction.products.some(
    product => product.id === pendingPurchaseProductId
  );
  if (requestedPurchase) pendingPurchaseProductId = null;
  transaction.products.forEach(product => {
    if (product.id === FORGE_PRODUCT_ID) {
      unlockForge('purchase');
    } else if (product.id === AUTO_MODE_PRODUCT_ID) {
      unlockAutoMode(requestedPurchase, 'purchase');
    } else if (product.id === ENEMY_CUSTOMIZATION_PRODUCT_ID) {
      if (typeof unlockEnemyCustomization === 'function') {
        unlockEnemyCustomization(true);
      }
    } else if (product.id === FORGE_MEMBERSHIP_PRODUCT_ID) {
      setForgeMembershipActive(true);
    } else if (product.id === FORGE_LIFETIME_MEMBERSHIP_PRODUCT_ID) {
      setForgeLifetimeMembershipActive(true);
    }
  });
  if (requestedPurchase) showPurchaseStatus('iap-status-purchased');
  refreshPurchaseUI();
}

function syncPurchaseEntitlements() {
  if (!purchasesReady || !purchaseApi) return;
  const store = purchaseApi.store;
  const platform = getPurchasePlatform();
  if (!platform) return;

  if (store.owned({ id: FORGE_PRODUCT_ID, platform })) {
    unlockForge('purchase');
  }
  if (store.owned({ id: AUTO_MODE_PRODUCT_ID, platform })) {
    unlockAutoMode(false, 'purchase');
  }
  if (store.owned({ id: ENEMY_CUSTOMIZATION_PRODUCT_ID, platform })) {
    unlockEnemyCustomization(true);
  }

  // Keep the sources separate so subscription expiry cannot remove lifetime
  // benefits. Current receipts also revoke a refunded lifetime purchase.
  setForgeLifetimeMembershipActive(
    store.owned({ id: FORGE_LIFETIME_MEMBERSHIP_PRODUCT_ID, platform })
  );
  setForgeMembershipActive(
    store.owned({ id: FORGE_MEMBERSHIP_PRODUCT_ID, platform })
  );
}

async function orderProduct(productId) {
  if (!purchasesReady) {
    showPurchaseStatus('iap-status-loading', true);
    return;
  }

  const product = purchaseApi.store.get(productId, getPurchasePlatform());
  const offer = product && product.getOffer();
  if (!offer) {
    showPurchaseStatus('iap-status-unavailable', true);
    return;
  }

  pendingPurchaseProductId = productId;
  showPurchaseStatus('iap-status-processing');
  try {
    const error = await offer.order();
    if (error) pendingPurchaseProductId = null;
    if (error && error.code !== purchaseApi.ErrorCode.PAYMENT_CANCELLED) {
      console.error('Purchase failed:', error);
      showPurchaseStatus('iap-status-error', true);
    } else if (error) {
      showPurchaseStatus('iap-status-cancelled');
    }
  } catch (error) {
    pendingPurchaseProductId = null;
    console.error('Purchase failed:', error);
    showPurchaseStatus('iap-status-error', true);
  }
}

function buyForgeUnlock() {
  return orderProduct(FORGE_PRODUCT_ID);
}

function buyAutoModeUnlock() {
  return orderProduct(AUTO_MODE_PRODUCT_ID);
}

function buyEnemyCustomizationUnlock() {
  return orderProduct(ENEMY_CUSTOMIZATION_PRODUCT_ID);
}

function buyForgeMembership() {
  return orderProduct(FORGE_MEMBERSHIP_PRODUCT_ID);
}

function buyForgeLifetimeMembership() {
  if (isForgeLifetimeMembershipActive()) return;
  if (!isNativePurchasePlatform()) {
    if (/Android/i.test(navigator.userAgent)) {
      ratingSystem.openGooglePlayForRating();
    } else {
      openExternal(FORGE_PURCHASE_URL);
    }
    return;
  }
  return orderProduct(FORGE_LIFETIME_MEMBERSHIP_PRODUCT_ID);
}

async function restoreNativePurchases() {
  if (!purchasesReady) {
    showPurchaseStatus('iap-status-loading', true);
    return;
  }
  showPurchaseStatus('iap-status-restoring');
  try {
    const error = await purchaseApi.store.restorePurchases();
    if (error) {
      console.error('Restore purchases failed:', error);
      showPurchaseStatus('iap-status-restore-error', true);
      return;
    }
    syncPurchaseEntitlements();
    refreshPurchaseUI();
    showPurchaseStatus('iap-status-restored');
  } catch (error) {
    console.error('Restore purchases failed:', error);
    showPurchaseStatus('iap-status-restore-error', true);
  }
}

async function manageNativeSubscriptions() {
  if (!purchasesReady) {
    showPurchaseStatus('iap-status-loading', true);
    return;
  }
  const error = await purchaseApi.store.manageSubscriptions(getPurchasePlatform());
  if (error) {
    console.error('Manage subscriptions failed:', error);
    showPurchaseStatus('iap-status-error', true);
  }
}

function showPurchaseStatus(key, isError = false) {
  document.querySelectorAll('[data-iap-status]').forEach(element => {
    element.textContent = typeof t === 'function' ? t(key) : key;
    element.classList.toggle('iap-status-error', isError);
  });
}

function refreshPurchaseUI(root = document) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  const platform = getPurchasePlatform();

  root.querySelectorAll('[data-iap-product]').forEach(element => {
    const productId = element.dataset.iapProduct;
    if (!platform) {
      const fallbackKey = productId === FORGE_MEMBERSHIP_PRODUCT_ID
        ? 'forge-membership-price'
        : productId === FORGE_LIFETIME_MEMBERSHIP_PRODUCT_ID
        ? 'forge-membership-lifetime-price'
        : 'forge-permanent-unlock-price';
      element.textContent = typeof t === 'function' ? t(fallbackKey) : fallbackKey;
      return;
    }
    if (!purchasesReady) return;
    const product = purchaseApi.store.get(productId, platform);
    const price = product && product.pricing && product.pricing.price;
    if (!price) {
      element.textContent = typeof t === 'function' ? t('iap-status-unavailable') : 'iap-status-unavailable';
      return;
    }
    const key = productId === FORGE_MEMBERSHIP_PRODUCT_ID
      ? 'iap-price-per-month'
      : 'iap-price-one-time';
    element.textContent = typeof t === 'function' ? t(key, { price }) : price;
  });

  root.querySelectorAll('[data-iap-store-terms]').forEach(element => {
    const key = isApplePurchasePlatform()
      ? 'forge-membership-cancel-app-store'
      : 'forge-membership-cancel-google-play';
    element.setAttribute('data-i18n', key);
    element.textContent = typeof t === 'function' ? t(key) : key;
  });

  root.querySelectorAll('[data-iap-restore]').forEach(button => {
    button.onclick = restoreNativePurchases;
    button.hidden = !platform;
    button.disabled = Boolean(platform) && !purchasesReady;
  });
  root.querySelectorAll('[data-iap-manage-subscriptions]').forEach(button => {
    button.onclick = manageNativeSubscriptions;
    button.hidden = !platform || !isForgeSubscriptionActive();
    button.disabled = Boolean(platform) && !purchasesReady;
  });
  root.querySelectorAll('[data-iap-apple-only]').forEach(element => {
    element.hidden = !isApplePurchasePlatform();
  });
  root.querySelectorAll('[data-iap-subscribe]').forEach(button => {
    const active = isForgeMembershipActive();
    const key = isForgeLifetimeMembershipActive() ? 'forge-membership-lifetime-owned'
      : active ? 'forge-membership-subscribed' : 'forge-membership-subscribe';
    button.disabled = active || (Boolean(platform) && !purchasesReady);
    button.setAttribute('data-i18n', key);
    button.textContent = typeof t === 'function' ? t(key) : key;
  });
  root.querySelectorAll('[data-iap-lifetime]').forEach(button => {
    const owned = isForgeLifetimeMembershipActive();
    const product = platform && purchasesReady && purchaseApi.store.get(FORGE_LIFETIME_MEMBERSHIP_PRODUCT_ID, platform);
    const key = owned ? 'forge-membership-lifetime-owned' : 'forge-membership-buy-lifetime';
    button.disabled = owned || (Boolean(platform) && (!product || !product.getOffer()));
    button.setAttribute('data-i18n', key);
    button.textContent = typeof t === 'function' ? t(key) : key;
    button.onclick = buyForgeLifetimeMembership;
  });
  root.querySelectorAll('[data-iap-lifetime-subscription-note]').forEach(element => {
    element.hidden = !isForgeSubscriptionActive() || isForgeLifetimeMembershipActive();
  });
  root.querySelectorAll('[data-iap-legal-url]').forEach(link => {
    link.onclick = event => {
      event.preventDefault();
      openExternal(link.dataset.iapLegalUrl);
    };
  });
}

function getForgeLifetimeMembershipMarkup() {
  return `<section class="forge-unlock-option">
    <h4 data-i18n="forge-membership-lifetime">Lifetime Membership</h4>
    <p class="forge-unlock-price" data-iap-product="${FORGE_LIFETIME_MEMBERSHIP_PRODUCT_ID}" data-i18n="iap-price-loading">Price shown at checkout</p>
    <ul class="forge-membership-benefits">
      <li data-i18n="forge-membership-benefit-premium">Access to all premium features</li>
      <li data-i18n="forge-membership-benefit-inventory">Expanded inventory (+50 slots)</li>
      <li data-i18n="forge-membership-benefit-resting">Enhanced resting recovery</li>
      <li data-i18n="forge-membership-benefit-gold">10% gold found</li>
      <li data-i18n="forge-membership-benefit-title">Exclusive Forge Member title</li>
    </ul>
    <p class="forge-membership-terms" data-i18n="forge-membership-lifetime-terms">All membership benefits forever. Pay once, no renewal.</p>
    <p class="forge-membership-terms" data-iap-lifetime-subscription-note hidden data-i18n="forge-membership-lifetime-subscription-note">Buying lifetime does not cancel your monthly subscription. Manage it through your store.</p>
    <button type="button" data-iap-lifetime data-i18n="forge-membership-buy-lifetime">Buy Lifetime</button>
  </section>`;
}

function preparePurchaseUI(root = document) {
  refreshPurchaseUI(root);
}

function openExternal(url) {
  if (window.__TAURI__ && window.__TAURI__.opener && window.__TAURI__.opener.openUrl) {
    window.__TAURI__.opener.openUrl(url);
  } else if (window.electronAPI && typeof window.electronAPI.openExternal === 'function') {
    window.electronAPI.openExternal(url);
  } else {
    window.open(url, '_system');
  }
}
