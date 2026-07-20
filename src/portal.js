// Thin abstraction over an HTML5 game-portal SDK (CrazyGames-shaped), with a no-op
// fallback so the game runs IDENTICALLY with or without a portal. Today there is no
// SDK wired, so every call is a safe no-op; publishing to a portal is then just:
//   1. add the portal's SDK <script> to index.html, and
//   2. fill in the adapter inside init() below (one block, marked TODO).
// Nothing else in the game needs to change — main.js already calls these at the right
// lifecycle points (loading bracket, gameplay start/stop, ad breaks).

const AD_MIN_INTERVAL = 180; // CrazyGames caps midgame ads at 1 per 3 min (SDK also ignores early requests)
const AD_MAX_MS = 45000; // safety cap: never stay paused longer than this for one ad

// --- Leaderboard (CrazyGames) ---------------------------------------------
// TO ACTIVATE: (1) in the CrazyGames dashboard → your game → Leaderboards, create a
// board (e.g. "Deepest Depth", highest-wins) and copy its Encryption Key; (2) paste
// that 32-byte base64 key here. CrazyGames then renders the leaderboard on the game
// page automatically — the client only submits scores.
// Until the key is set, submitScore() no-ops everywhere (so the game runs unchanged
// off-portal and on-portal before a board exists). The key is client-side by design —
// CrazyGames' encryption is anti-tamper ("make it harder"), not secret-key security.
const LEADERBOARD_KEY = ""; // ← paste your CrazyGames Leaderboard Encryption Key

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
    this.onAuthChange = null; // main.js sets this; fired when the CrazyGames user logs in/out
    this._userId = null; // identity behind the Data Module, to detect real auth CHANGES
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
        // NOTE: everything below runs strictly AFTER init() resolves — calling any SDK
        // module earlier logs "CrazySDK is not initialized yet" and fails (QA report).
        this.loadingStart(); // open the loading bracket now that the SDK can hear it
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
        // Track the signed-in identity so login/logout can be detected. The Data Module
        // is scoped per identity, so an auth change means "different save store" —
        // main.js reacts via onAuthChange (getUser rejects for guests on some
        // platforms; treat that as "no user").
        try {
          const u = await this.sdk.user.getUser();
          this._userId = (u && (u.userId || u.username)) || null;
        } catch (e) {
          this._userId = null;
        }
        try {
          this.sdk.user.addAuthListener((u) => {
            const id = (u && (u.userId || u.username)) || null;
            if (id !== this._userId) {
              this._userId = id;
              if (this.onAuthChange) this.onAuthChange();
            }
          });
        } catch (e) {}
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
    const arm = (ms) => {
      if (watchdog) clearTimeout(watchdog);
      watchdog = setTimeout(end, ms);
    };
    const end = () => {
      if (done) return;
      done = true;
      if (watchdog) clearTimeout(watchdog);
      onFinish();
    };
    onStart();
    // Safety net: if the SDK never fires adFinished/adError (no-fill swallowed by an
    // adblocker, network drop, SDK bug) the game would stay paused forever — force-end.
    arm(AD_MAX_MS);
    try {
      // Extend the window once the ad is actually playing so a long spot isn't cut short.
      this.sdk.ad.requestAd("midgame", { adStarted: () => arm(AD_MAX_MS * 2), adFinished: end, adError: end });
    } catch (e) {
      end();
    }
    return true;
  }

  // Request a REWARDED video ad. `onStart` pauses+mutes, `onFinish` resumes; `onReward`
  // fires ONLY when the ad actually completes (adFinished). On adError (unfilled / adblock)
  // the game resumes with NO reward — the player just doesn't get the optional bonus (no
  // penalty: the game stays fully playable).
  //
  // Returns TRUE when a real SDK ad was initiated (reward resolves asynchronously), FALSE
  // when it resolved synchronously (no live SDK) — callers use this to give feedback.
  rewarded(cb = {}) {
    const onStart = cb.onStart || (() => {});
    const onFinish = cb.onFinish || (() => {});
    const onReward = cb.onReward || (() => {});
    if (!this.sdk) {
      // No live SDK. Off-portal / dev (this host was never allowed an SDK) → grant so the
      // optional bonus still works. But on a real portal host where the SDK is merely
      // BLOCKED or failed to load (adblock, network) `_sdkAllowed()` is still true — do NOT
      // grant there, or a player could block the SDK to farm free revives / doubled loot.
      // `!this.sdk` alone can't tell those apart, so consult `_sdkAllowed()`. onStart was
      // never called, so there is nothing to resume.
      if (!this._sdkAllowed()) onReward();
      return false;
    }
    let done = false;
    let watchdog = null;
    const arm = (ms) => {
      if (watchdog) clearTimeout(watchdog);
      watchdog = setTimeout(() => end(false), ms);
    };
    const end = (rewarded) => {
      if (done) return;
      done = true;
      if (watchdog) clearTimeout(watchdog);
      onFinish();
      if (rewarded) onReward();
    };
    onStart();
    arm(AD_MAX_MS); // pre-start net: force-end if the ad never even begins (no-fill / hang)
    try {
      this.sdk.ad.requestAd("rewarded", {
        // Once the ad is actually playing, extend the safety window so a long creative
        // isn't force-ended at AD_MAX_MS (which would swallow the earned reward via the
        // `done` guard). Only a pathologically long ad past this backstop is cut off.
        adStarted: () => arm(AD_MAX_MS * 2),
        adFinished: () => end(true),
        adError: () => end(false),
      });
    } catch (e) {
      end(false);
    }
    return true;
  }

  // In-game banner (CrazyGames v3): fills the DOM container `id` with a responsive banner.
  // Show ONLY on non-gameplay screens (menu / pause / game-over) — never over active play.
  // No-ops without an SDK; the SDK rate-limits refreshes (min 30s) and we swallow its errors.
  showBanner(id = "banner-container") {
    const el = document.getElementById(id);
    if (el) el.style.display = "flex";
    if (!this.sdk || !this.sdk.banner) return;
    try {
      const r = this.sdk.banner.requestResponsiveBanner(id);
      if (r && typeof r.catch === "function") r.catch(() => {});
    } catch (e) {}
  }
  clearBanner(id = "banner-container") {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
    try {
      this.sdk?.banner?.clearBanner?.(id);
    } catch (e) {}
  }

  // AES-GCM encrypt a score exactly as CrazyGames' client-leaderboard spec requires
  // (12-byte IV + ciphertext, base64). Verbatim from docs.crazygames.com/sdk/leaderboards-client.
  async _encryptScore(score, key) {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const algorithm = { name: "AES-GCM", iv };
    const keyBytes = new Uint8Array(
      atob(key)
        .split("")
        .map((c) => c.charCodeAt(0))
    );
    const cryptoKey = await window.crypto.subtle.importKey("raw", keyBytes, algorithm, false, ["encrypt"]);
    const dataBuffer = new TextEncoder().encode(score.toString());
    const encryptedBuffer = await window.crypto.subtle.encrypt(algorithm, cryptoKey, dataBuffer);
    const combined = new Uint8Array(iv.length + encryptedBuffer.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encryptedBuffer), iv.length);
    return btoa(String.fromCharCode(...combined));
  }

  // Submit a leaderboard score (e.g. deepest depth reached). No-ops without an SDK,
  // without a configured LEADERBOARD_KEY, or if the user module/WebCrypto is missing —
  // fire-and-forget and never throws, so callers can ignore the result.
  async submitScore(score) {
    try {
      if (!this.sdk || !LEADERBOARD_KEY) return false;
      if (!this.sdk.user || typeof this.sdk.user.submitScore !== "function") return false;
      if (!(window.crypto && window.crypto.subtle && typeof btoa === "function")) return false;
      const encryptedScore = await this._encryptScore(Math.round(score), LEADERBOARD_KEY);
      await this.sdk.user.submitScore({ encryptedScore, score: Math.round(score) });
      return true;
    } catch (e) {
      return false;
    }
  }
}

export const portal = new Portal();
