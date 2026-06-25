// Thin abstraction over an HTML5 game-portal SDK (CrazyGames-shaped), with a no-op
// fallback so the game runs IDENTICALLY with or without a portal. Today there is no
// SDK wired, so every call is a safe no-op; publishing to a portal is then just:
//   1. add the portal's SDK <script> to index.html, and
//   2. fill in the adapter inside init() below (one block, marked TODO).
// Nothing else in the game needs to change — main.js already calls these at the right
// lifecycle points (loading bracket, gameplay start/stop, ad breaks).

const AD_MIN_INTERVAL = 60; // courtesy minimum seconds between ad breaks
const AD_MAX_MS = 45000; // safety cap: never stay paused longer than this for one ad

function nowSec() {
  return typeof performance !== "undefined" ? performance.now() / 1000 : 0;
}

class Portal {
  constructor() {
    this.sdk = null; // live SDK adapter, or null = no portal (no-op everywhere)
    this.ready = false;
    this.inGameplay = false;
    this._lastAd = -Infinity;
    this.onSettingsMute = null; // main.js sets this to apply the portal player's mute
  }

  // Only use the CrazyGames SDK on CrazyGames' own domains (their hosting + QA), on
  // localhost (dev / their QA tool), or with ?cgsdk. Everywhere else — GitHub Pages,
  // itch, your own site — the SDK stays OFF so the game runs clean (it just isn't
  // monetized there). This is the multi-host-friendly alternative to hard Sitelock.
  _sdkAllowed() {
    try {
      const host = location.hostname;
      const parts = host.split(".");
      const i = parts.indexOf("crazygames");
      const onCG = i !== -1 && i >= parts.length - 3; // *.crazygames.com / crazygames.fr / ...
      const dev = host === "localhost" || host === "127.0.0.1" || host === "";
      return onCG || dev || new URLSearchParams(location.search).has("cgsdk");
    } catch {
      return false;
    }
  }

  async init() {
    // CrazyGames SDK v3 (script is in index.html). Degrades to no-op if the SDK is
    // absent (other hosts), blocked, gated off, or init fails — the game runs unchanged.
    try {
      if (this._sdkAllowed() && window.CrazyGames && window.CrazyGames.SDK) {
        await window.CrazyGames.SDK.init();
        this.sdk = window.CrazyGames.SDK;
        // Respect the player's portal mute setting now and whenever it changes.
        const applyMute = () => {
          try {
            if (this.onSettingsMute) this.onSettingsMute(!!this.sdk.game.settings.muteAudio);
          } catch (e) {}
        };
        try {
          this.sdk.game.addSettingsChangeListener(applyMute);
        } catch (e) {}
        applyMute();
      }
    } catch (e) {
      this.sdk = null;
    }
    this.ready = true;
  }

  // Bracket the initial load so the portal knows when the game is interactive.
  loadingStart() {
    try {
      this.sdk?.game?.loadingStart?.();
    } catch (e) {}
  }
  loadingStop() {
    try {
      this.sdk?.game?.loadingStop?.();
    } catch (e) {}
  }

  // Signal active play vs menus/ads/paused. Guarded so calls are safely idempotent.
  gameplayStart() {
    if (this.inGameplay) return;
    this.inGameplay = true;
    try {
      this.sdk?.game?.gameplayStart?.();
    } catch (e) {}
  }
  gameplayStop() {
    if (!this.inGameplay) return;
    this.inGameplay = false;
    try {
      this.sdk?.game?.gameplayStop?.();
    } catch (e) {}
  }

  // Request a midgame ad at a natural break. `onStart` should pause + mute the game,
  // `onFinish` resume it; they fire ONLY when an ad is actually shown. With no SDK (or
  // within the courtesy interval) it skips cleanly and the game just continues.
  adBreak(cb = {}) {
    const onStart = cb.onStart || (() => {});
    const onFinish = cb.onFinish || (() => {});
    if (!this.sdk || nowSec() - this._lastAd < AD_MIN_INTERVAL) return false;
    this._lastAd = nowSec();
    let done = false;
    let watchdog = null;
    const end = () => {
      if (done) return;
      done = true;
      if (watchdog) clearTimeout(watchdog);
      onFinish();
    };
    onStart();
    // Safety net: if the SDK never fires adFinished/adError (no-fill swallowed by an
    // adblocker, network drop, SDK bug) the game would stay paused forever — force-end.
    watchdog = setTimeout(end, AD_MAX_MS);
    try {
      this.sdk.ad.requestAd("midgame", { adStarted: () => {}, adFinished: end, adError: end });
    } catch (e) {
      end();
    }
    return true;
  }
}

export const portal = new Portal();
