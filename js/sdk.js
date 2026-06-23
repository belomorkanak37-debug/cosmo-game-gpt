/*
  Звёздный Старатель — безопасный слой SDK Яндекс Игр.
  Файл намеренно не зависит от игрового ядра: если SDK недоступен, игра
  продолжает работать на localStorage без ошибок.
*/
(function (global) {
  'use strict';

  const BRIDGE = {
    ysdk: null,
    player: null,
    payments: null,
    catalog: [],
    purchases: [],
    flags: {},
    lang: 'ru',
    ready: false,
    authorized: false,
    sdkAvailable: false,
    paymentsAvailable: false,
    adsBlocked: false,
    gameplayActive: false,
    mutedByAd: false,
    leaderboardCache: [],
    lastLeaderboardSetAt: 0,
    lastFullscreenAt: 0
  };

  function safeLog() {
    try { console.log.apply(console, arguments); } catch (_) {}
  }

  function readLocal(key) {
    try {
      const raw = global.localStorage && global.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      safeLog('[SDK] localStorage read failed', e);
      return null;
    }
  }

  function writeLocal(key, value) {
    try {
      if (global.localStorage) global.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      safeLog('[SDK] localStorage write failed', e);
      return false;
    }
  }

  function clone(value) {
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; }
  }

  function getPayingStatus() {
    try {
      if (BRIDGE.player && typeof BRIDGE.player.getPayingStatus === 'function') {
        return BRIDGE.player.getPayingStatus();
      }
    } catch (_) {}
    return 'unknown';
  }

  async function init(defaultFlags) {
    defaultFlags = defaultFlags || {};
    BRIDGE.flags = Object.assign({}, defaultFlags);
    try {
      if (!global.YaGames || typeof global.YaGames.init !== 'function') {
        BRIDGE.ready = true;
        return BRIDGE;
      }
      BRIDGE.ysdk = await global.YaGames.init();
      BRIDGE.sdkAvailable = true;
      BRIDGE.lang = ((BRIDGE.ysdk.environment || {}).i18n || {}).lang || 'ru';
      try {
        BRIDGE.player = await BRIDGE.ysdk.getPlayer();
        BRIDGE.authorized = !!(BRIDGE.player && typeof BRIDGE.player.isAuthorized === 'function' && BRIDGE.player.isAuthorized());
      } catch (e) {
        safeLog('[SDK] getPlayer failed', e);
        BRIDGE.player = null;
        BRIDGE.authorized = false;
      }
      try {
        const clientFeatures = [];
        const payingStatus = getPayingStatus();
        if (payingStatus) clientFeatures.push({ name: 'payingStatus', value: payingStatus });
        if (BRIDGE.ysdk && typeof BRIDGE.ysdk.getFlags === 'function') {
          BRIDGE.flags = await BRIDGE.ysdk.getFlags({ defaultFlags, clientFeatures });
        }
      } catch (e) {
        safeLog('[SDK] getFlags failed', e);
        BRIDGE.flags = Object.assign({}, defaultFlags);
      }
      try {
        if (typeof BRIDGE.ysdk.getPayments === 'function') {
          BRIDGE.payments = await BRIDGE.ysdk.getPayments();
        } else if (BRIDGE.ysdk.payments) {
          BRIDGE.payments = BRIDGE.ysdk.payments;
        }
        BRIDGE.paymentsAvailable = !!BRIDGE.payments;
        if (BRIDGE.payments && typeof BRIDGE.payments.getCatalog === 'function') {
          BRIDGE.catalog = await BRIDGE.payments.getCatalog();
        }
      } catch (e) {
        safeLog('[SDK] payments unavailable', e);
        BRIDGE.payments = null;
        BRIDGE.paymentsAvailable = false;
        BRIDGE.catalog = [];
      }
      BRIDGE.ready = true;
      return BRIDGE;
    } catch (e) {
      safeLog('[SDK] YaGames.init failed', e);
      BRIDGE.ready = true;
      BRIDGE.sdkAvailable = false;
      return BRIDGE;
    }
  }

  async function loadSave(localKey, migrate) {
    const local = readLocal(localKey);
    let best = local;
    if (BRIDGE.player && BRIDGE.authorized && typeof BRIDGE.player.getData === 'function') {
      try {
        const data = await BRIDGE.player.getData(['save']);
        if (data && data.save) {
          const cloud = data.save;
          const localTime = local && local.lastSaveTime ? local.lastSaveTime : 0;
          const cloudTime = cloud && cloud.lastSaveTime ? cloud.lastSaveTime : 0;
          best = cloudTime >= localTime ? cloud : local;
        }
      } catch (e) {
        safeLog('[SDK] cloud load failed', e);
      }
    }
    if (typeof migrate === 'function') return migrate(best);
    return best;
  }

  async function save(localKey, state, stats, flush) {
    const snapshot = clone(state);
    writeLocal(localKey, snapshot);
    if (!BRIDGE.player || !BRIDGE.authorized) return false;
    try {
      if (typeof BRIDGE.player.setData === 'function') {
        await BRIDGE.player.setData({ save: snapshot }, !!flush);
      }
      if (stats && typeof BRIDGE.player.setStats === 'function') {
        await BRIDGE.player.setStats(stats);
      }
      return true;
    } catch (e) {
      safeLog('[SDK] cloud save failed', e);
      return false;
    }
  }

  function loadingReady() {
    try { BRIDGE.ysdk && BRIDGE.ysdk.features && BRIDGE.ysdk.features.LoadingAPI && BRIDGE.ysdk.features.LoadingAPI.ready(); } catch (e) { safeLog('[SDK] LoadingAPI.ready failed', e); }
  }

  function gameplayStart() {
    if (BRIDGE.gameplayActive) return;
    BRIDGE.gameplayActive = true;
    try { BRIDGE.ysdk && BRIDGE.ysdk.features && BRIDGE.ysdk.features.GameplayAPI && BRIDGE.ysdk.features.GameplayAPI.start(); } catch (e) { safeLog('[SDK] GameplayAPI.start failed', e); }
  }

  function gameplayStop() {
    if (!BRIDGE.gameplayActive) return;
    BRIDGE.gameplayActive = false;
    try { BRIDGE.ysdk && BRIDGE.ysdk.features && BRIDGE.ysdk.features.GameplayAPI && BRIDGE.ysdk.features.GameplayAPI.stop(); } catch (e) { safeLog('[SDK] GameplayAPI.stop failed', e); }
  }

  function showRewarded(onRewarded, onDone, onError) {
    if (!BRIDGE.ysdk || !BRIDGE.ysdk.adv || typeof BRIDGE.ysdk.adv.showRewardedVideo !== 'function') {
      if (onError) onError(new Error('Rewarded video unavailable'));
      if (onDone) onDone(false);
      return false;
    }
    let rewarded = false;
    gameplayStop();
    try {
      BRIDGE.ysdk.adv.showRewardedVideo({
        callbacks: {
          onOpen: function () {},
          onRewarded: function () { rewarded = true; if (onRewarded) onRewarded(); },
          onClose: function (wasShown) { gameplayStart(); if (onDone) onDone(!!wasShown && rewarded); },
          onError: function (error) { gameplayStart(); if (onError) onError(error); if (onDone) onDone(false); }
        }
      });
      return true;
    } catch (e) {
      gameplayStart();
      if (onError) onError(e);
      if (onDone) onDone(false);
      return false;
    }
  }

  function showFullscreen(options) {
    options = options || {};
    const now = Date.now();
    const cooldownMs = options.cooldownMs || 180000;
    if (options.noAds || BRIDGE.adsBlocked) return false;
    if (now - BRIDGE.lastFullscreenAt < cooldownMs) return false;
    if (!BRIDGE.ysdk || !BRIDGE.ysdk.adv || typeof BRIDGE.ysdk.adv.showFullscreenAdv !== 'function') return false;
    BRIDGE.lastFullscreenAt = now;
    gameplayStop();
    try {
      BRIDGE.ysdk.adv.showFullscreenAdv({
        callbacks: {
          onOpen: function () {},
          onClose: function () { gameplayStart(); if (options.onClose) options.onClose(); },
          onError: function (error) { gameplayStart(); if (options.onError) options.onError(error); }
        }
      });
      return true;
    } catch (e) {
      gameplayStart();
      if (options.onError) options.onError(e);
      return false;
    }
  }

  async function syncBanner(show, noAds) {
    if (noAds) BRIDGE.adsBlocked = true;
    if (!BRIDGE.ysdk || !BRIDGE.ysdk.adv) return false;
    try {
      if (noAds || !show) {
        if (typeof BRIDGE.ysdk.adv.hideBannerAdv === 'function') await BRIDGE.ysdk.adv.hideBannerAdv();
        return false;
      }
      if (typeof BRIDGE.ysdk.adv.getBannerAdvStatus === 'function') {
        const status = await BRIDGE.ysdk.adv.getBannerAdvStatus();
        if (status && status.stickyAdvIsShowing) return true;
        if (status && status.reason) return false;
      }
      if (typeof BRIDGE.ysdk.adv.showBannerAdv === 'function') {
        const result = await BRIDGE.ysdk.adv.showBannerAdv();
        return !!(result && result.stickyAdvIsShowing);
      }
    } catch (e) { safeLog('[SDK] banner failed', e); }
    return false;
  }

  async function refreshPurchases() {
    if (!BRIDGE.payments || typeof BRIDGE.payments.getPurchases !== 'function') return [];
    try {
      const purchases = await BRIDGE.payments.getPurchases();
      BRIDGE.purchases = Array.isArray(purchases) ? purchases : [];
      return BRIDGE.purchases;
    } catch (e) { safeLog('[SDK] getPurchases failed', e); return []; }
  }

  async function purchase(productId) {
    if (!BRIDGE.payments || typeof BRIDGE.payments.purchase !== 'function') throw new Error('Payments unavailable');
    return BRIDGE.payments.purchase({ id: productId });
  }

  async function consumePurchase(purchaseToken) {
    if (!purchaseToken || !BRIDGE.payments || typeof BRIDGE.payments.consumePurchase !== 'function') return false;
    try { await BRIDGE.payments.consumePurchase(purchaseToken); return true; } catch (e) { safeLog('[SDK] consumePurchase failed', e); return false; }
  }

  async function submitLeaderboard(name, score, extraData) {
    if (!BRIDGE.ysdk || !BRIDGE.ysdk.leaderboards || !name) return false;
    const now = Date.now();
    if (now - BRIDGE.lastLeaderboardSetAt < 1200) return false;
    try {
      if (typeof BRIDGE.ysdk.isAvailableMethod === 'function') {
        const ok = await BRIDGE.ysdk.isAvailableMethod('leaderboards.setScore');
        if (!ok) return false;
      }
      await BRIDGE.ysdk.leaderboards.setScore(name, Math.max(0, Math.floor(score || 0)), extraData || '');
      BRIDGE.lastLeaderboardSetAt = now;
      return true;
    } catch (e) { safeLog('[SDK] setScore failed', e); return false; }
  }

  async function getLeaderboard(name) {
    if (!BRIDGE.ysdk || !BRIDGE.ysdk.leaderboards || !name) return [];
    try {
      const result = await BRIDGE.ysdk.leaderboards.getEntries(name, { quantityTop: 10, includeUser: true, quantityAround: 3 });
      BRIDGE.leaderboardCache = (result && result.entries ? result.entries : []).map(function (entry) {
        return { rank: entry.rank, score: entry.score, name: entry.player && (entry.player.publicName || entry.player.uniqueID) || 'Player' };
      });
      return BRIDGE.leaderboardCache;
    } catch (e) { safeLog('[SDK] getEntries failed', e); return []; }
  }

  async function requestReview() {
    if (!BRIDGE.ysdk || !BRIDGE.ysdk.feedback) return false;
    try {
      if (typeof BRIDGE.ysdk.feedback.canReview !== 'function' || typeof BRIDGE.ysdk.feedback.requestReview !== 'function') return false;
      const check = await BRIDGE.ysdk.feedback.canReview();
      if (check && check.value) { await BRIDGE.ysdk.feedback.requestReview(); return true; }
    } catch (e) { safeLog('[SDK] review request failed', e); }
    return false;
  }

  global.StarMinerSDK = {
    state: BRIDGE,
    init,
    loadSave,
    save,
    loadingReady,
    gameplayStart,
    gameplayStop,
    showRewarded,
    showFullscreen,
    syncBanner,
    refreshPurchases,
    purchase,
    consumePurchase,
    submitLeaderboard,
    getLeaderboard,
    requestReview,
    readLocal,
    writeLocal
  };
})(window);
