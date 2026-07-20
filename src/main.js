import { Input } from "./input.js";
import { TouchControls } from "./touch.js";
import { Camera } from "./camera.js";
import { World } from "./world.js";
import { Player } from "./player.js";
import { Enemy, makeProjectile } from "./enemy.js";
import { Dungeon, dungeonConfig, depthColor, FINAL_DEPTH } from "./dungeon.js";
import { drawMap } from "./minimap.js";
import { InventoryUI } from "./inventory.js";
import { DebugMenu } from "./debug.js";
import { rollShopStock, rollDropTemplate, rollItem, makeItem, makeSealedRelic, decodeRelic, forgeLegendary, temperItem, rerollAffixes, RARITIES, RARITY_ORDER, ITEM_TEMPLATES, SLOTS, CLASS_NAMES } from "./items.js";
import { MetaUI } from "./metaui.js";
import { BoardUI } from "./boardui.js";
import { ForgeUI } from "./forgeui.js";
import { ShrineUI } from "./shrineui.js";
import { POI_TYPES, rollBuffChoices } from "./poi.js";
import { DailyUI } from "./dailyui.js";
import { MenuScreen } from "./menu.js";
import { Tutorial } from "./tutorial.js";
import { Fx } from "./fx.js";
import { drawProjectiles, drawAmbient, drawLowHpVignette, drawSpawners, drawChainTarget, drawDamageIndicator, drawCombo, drawPortals, drawPickups, drawPrompt, drawEntranceTooltip, drawBossBar, drawRoomMap, drawToasts, drawItemPickups, drawWaypoints, drawBanner, drawHud, drawGameOver, drawVictory, drawRecall, drawVideoIcon, drawMenuHint, gameOverButtons } from "./hud.js";
import { metaBonuses, addShards, getShards, shardsForRun, resetMeta, getChar, hasChar, setActive, getActive, saveChar, hasWon, markWon, noteDepth, getDeepest, reloadFromStore, setCloudReady, getCores, addCores, spendCores, getBounties, bountyProgress, claimBounty, rerollBounty, resetBounties, getDaily, getChars, dailyDropClaimable, dailyDropStreak, claimDailyDrop, premiumCrateClaimable, markPremiumCrateClaimed } from "./meta.js";
import { BIOMES } from "./biomes.js";
import { sfx, resumeAudio, toggleMute, isMuted, setAutoMute, setPortalMute } from "./sfx.js";
import { portal } from "./portal.js";
import { dist, angleDiff, clamp, roundRect } from "./utils.js";

// Debug overlay (backtick) is dev-only — off on a real portal/production host so players
// can't open it. Force it anywhere with ?debug in the URL.
const DEBUG_ENABLED = ["localhost", "127.0.0.1", ""].includes(location.hostname) || new URLSearchParams(location.search).has("debug");

const WORLD_W = 10000;
const WORLD_H = 10000;
const MAX_ENEMIES = 12;
const SPAWN_INTERVAL = 2.2;
const MAP_MODES = ["off", "corner", "full"];
const ITEM_DROP_CHANCE = 0.2;
const CAMP_HEAL_RATE = 24;
const RECALL_HOLD = 1.1; // seconds of holding R to recall to camp (overworld only)

// Drifting ambient motes per biome (snow / embers / spores / dust / wisps).
const AMBIENT = {
  tundra: { vx: 0, vy: 32, size: 2.2, color: "rgba(255,255,255,0.7)" },
  cavern: { vx: 9, vy: 7, size: 1.6, color: "rgba(184,164,134,0.4)" },
  ember: { vx: 0, vy: -28, size: 2.0, color: "rgba(255,140,60,0.6)" },
  verdant: { vx: 5, vy: -13, size: 2.1, color: "rgba(160,230,120,0.5)" },
  shadow: { vx: 0, vy: -9, size: 2.4, color: "rgba(170,130,230,0.45)" },
};

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const input = new Input(canvas);
const touch = new TouchControls(canvas, input);
const camera = new Camera();
const ui = new InventoryUI();
const metaUi = new MetaUI();
const boardUi = new BoardUI();
const forgeUi = new ForgeUI();
const shrineUi = new ShrineUI();
const tutorial = new Tutorial();
const dailyUi = new DailyUI(); // the 7-day supply-drop calendar popup
let dailyPopupShown = false; // auto-open at most once per session
let tutorialFoeSpawned = false; // spawn a single practice foe just outside camp for the attack step
let bannerShown = false; // whether the CrazyGames banner is currently displayed
const menu = new MenuScreen();
const debug = new DebugMenu();
const fx = new Fx(); // screen juice: particles, floaters, rings, shake, hit-stop

function makeGrainPattern() {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const img = g.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = (Math.random() * 255) | 0;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 13;
  }
  g.putImageData(img, 0, 0);
  return ctx.createPattern(c, "repeat");
}
const grainPattern = makeGrainPattern();

let world, player, enemies, spawnTimer, kills, dpr;
let pickups, toasts, shopStock, projectiles;
// Gear-acquired cards (a richer popup than coin toasts) — {item, t}.
let itemPickups = [];
let scene = "overworld"; // "overworld" | "dungeon"
let dungeon = null;
let returnPos = null;
let portals = []; // exit/leave portals while in a dungeon
let mapMode = "off";
let banner = null;
let prevSafe = true;
let nearShop = false;
let nearElder = false;
let nearQuartermaster = false;
let nearBoard = false; // standing at the Mission Board
let nearForge = false; // standing at the Forge
let nearSupply = false; // standing at the Daily Supply Drop crate (claimable today)
let nearTownQM = null; // the town whose Upgrades kiosk the player stands at
let nearPoi = null; // overworld point of interest the player can E-interact with
let nearTownShop = null; // the town whose shop the player is standing at
let nearDungeon = null;
let nearChest = false; // standing at an unopened treasure chest
let nearFountain = false; // standing at an unused healing fountain
let recallTimer = 0; // charge while holding R in the overworld; teleports to camp at RECALL_HOLD

// --- Run / extraction state ---
// A "run" is a dungeon dive. Loot picked up during it is "at risk": extract via
// the Exit portal to keep it; die and it's lost (only shards survive).
let onRun = false;
let runDeepest = 0; // deepest depth reached this run (drives shard payout)
let runSnapshot = null; // { uids:Set, coins } captured at run start = the safe baseline
let lastRunResult = null; // { extracted, depth, shards } for the game-over / banner text
let hoverDungeon = null;
let victory = false; // showing the win overlay after slaying the final boss
let victoryHold = 0; // brief input-lockout so mid-combat clicks don't skip the win screen
let revivedThisRun = false; // used the rewarded revive this run (one per run)
let extractSummary = null; // { shards, cores, depth } — post-extract overlay offering a rewarded double
// Roaming-event reward offer (Sky-Drop Cache / Gilded Quarry): a pause-gate overlay
// offering a rewarded ad for bonus spoils. { kind, title, sub, acceptLabel, declineLabel,
// x, y, tier, poi? } — grant runs ONLY inside the ad's onReward.
let adOffer = null;
let fieldKitChoices = null; // the in-dungeon vendor's cached 1-of-3 buff stock (per depth)
// Shop Premium Crate: today's rolled item (in-memory; the once-per-day cap persists in
// meta). Re-rolled when a new local day starts or the class changes.
let premiumStock = null; // { day, cls, item }
// Particles / shake / hit-stop live on the `fx` instance (fx.js). Ambient motes,
// spawn telegraphs, the combo counter, and footstep timing stay here.
let ambient, ambientTimer, fxClock, prevHp;
let spawners, footTimer;
let combo = 0;
let comboTimer = 0;
let wasAttacking = false;
let wasDashStrike = false; // rising-edge detect for the tutorial's dash-strike lesson
let wasDashing = false;

// Start/resume audio on the first user gesture (autoplay policy).
window.addEventListener("pointerdown", resumeAudio);
window.addEventListener("keydown", resumeAudio);
// iOS unlocks the AudioContext most reliably from a touchend gesture (touchstart /
// pointerdown alone sometimes isn't accepted) — without this, mobile sound can stay off.
window.addEventListener("touchend", resumeAudio);

function resize() {
  dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
}
window.addEventListener("resize", resize);
window.addEventListener("orientationchange", resize);
// The visual viewport changes (without a window resize) when a mobile URL bar
// collapses/expands on scroll — keep the canvas matched to the visible area.
if (window.visualViewport) window.visualViewport.addEventListener("resize", resize);
resize();

// Mobile: collapse the browser chrome by entering fullscreen on the first touch — but
// ONLY when running top-level (standalone / itch direct / installed PWA). Inside a portal
// iframe (CrazyGames etc.) custom fullscreen is PROHIBITED — it interferes with the
// portal's own fullscreen + ad system — so the portal handles fullscreen instead.
if (window.self === window.top) {
  window.addEventListener(
    "touchstart",
    () => {
      if ((navigator.maxTouchPoints || 0) === 0) return; // desktop: don't fullscreen the window
      const el = document.documentElement;
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) { try { req.call(el); } catch (e) {} }
    },
    { once: true, passive: true }
  );
}

function viewSize() {
  return { w: canvas.width / dpr, h: canvas.height / dpr };
}

// --- Pause (ad break / tab hidden / window blurred) ---
// REASON-COUNTED: the sim (update() early-returns) and audio stay paused while ANY
// reason is active, so independent sources never clobber each other — e.g. an ad that
// ends while the tab is still hidden doesn't resume the game in the background, and a
// focus event mid-ad doesn't unmute over the ad. Doesn't touch the player's own mute.
const pauseReasons = new Set();
let paused = false;
function applyPaused() {
  const p = pauseReasons.size > 0;
  if (p === paused) return;
  paused = p;
  setAutoMute(p);
  if (!p) resumeAudio(); // browsers auto-suspend the AudioContext while hidden — wake it
  // gameplayStart/Stop is reported once per frame by syncGameplay() (which also accounts
  // for open overlays / menus), so it is intentionally NOT called here.
}

// Report "actively playing" to the portal SDK once per frame (idempotent via
// portal.inGameplay). Gameplay STOPS for ANY interruption: the title/menu, a paused sim
// (ad / tab-hidden), an open overlay (inventory / quartermaster / board / forge / shrine /
// debug), or the game-over / victory / extract screens — and resumes only in live play.
// Deliberately NOT tied to window focus/blur, so alt-tab never toggles the SDK session.
function isActivelyPlaying() {
  return (
    scene !== "menu" && !paused && player && !player.dead && !victory && !extractSummary && !adOffer &&
    !ui.isOpen() && !metaUi.isOpen() && !boardUi.isOpen() && !forgeUi.isOpen() && !shrineUi.isOpen() && !dailyUi.isOpen() && !debug.isOpen()
  );
}
function syncGameplay() {
  if (isActivelyPlaying()) portal.gameplayStart();
  else portal.gameplayStop();
}
function pauseFor(reason) { pauseReasons.add(reason); applyPaused(); }
function resumeFrom(reason) { pauseReasons.delete(reason); applyPaused(); }
// External/debug entry point: true adds a manual pause, false is a hard resume (clears
// every reason) so it can never get wedged.
function setPaused(p) {
  if (p) pauseReasons.add("manual");
  else pauseReasons.clear();
  applyPaused();
}

// Pause the sim + mute when the TAB is hidden (a genuine "away"); resume when it returns.
// We deliberately do NOT pause or report gameplay on window blur/focus — alt-tabbing, or an
// ad iframe stealing focus, must not toggle the SDK's gameplayStart/Stop (per CrazyGames).
document.addEventListener("visibilitychange", () => (document.hidden ? pauseFor("hidden") : resumeFrom("hidden")));

// Request a portal ad at a natural between-runs beat. The "ad" reason holds the pause
// for the WHOLE ad regardless of any focus/visibility churn its iframe causes; a no-op
// (no pause) when no portal SDK is wired or within the interval.
function runAdBreak() {
  portal.adBreak({ onStart: () => pauseFor("ad"), onFinish: () => resumeFrom("ad") });
}

// Rewarded ad — REVIVE on death (once per run). onReward fires only if the ad completes
// (or off-portal, where the feature just works). Pause+mute during the ad like adBreak.
function runReviveAd() {
  let granted = false;
  const started = portal.rewarded({
    onStart: () => pauseFor("ad"),
    onFinish: () => resumeFrom("ad"),
    onReward: () => {
      granted = true;
      revivedThisRun = true;
      player.dead = false;
      player.hp = Math.max(1, Math.round(player.maxHp * (metaBonuses().reviveHeal || 0.5))); // Second Wind
      player.iframe = 1.4; // a grace window so you don't instantly die again
      player.hurtFlash = 0;
      prevHp = player.hp;
      addToast("Revived — back on your feet!", "#7CFC9B");
      addRing(player.x, player.y, player.r * 0.5, player.r * 4, 0.6, "#9bffc0", 5);
      sfx.item();
    },
  });
  // No SDK ad initiated and nothing granted → an ad is unavailable here (e.g. blocked on a
  // portal host). Tell the player so the dead click isn't silent; they can still forfeit.
  if (!started && !granted) addToast("Ad unavailable — use Return to camp", "#ff9a6f");
}

// Rewarded ad — DOUBLE the extract reward (offered on the post-extract summary).
function runDoubleAd() {
  const offer = extractSummary;
  if (!offer) return;
  extractSummary = null; // close the summary (the ad plays over a paused game either way)
  let granted = false;
  const started = portal.rewarded({
    onStart: () => pauseFor("ad"),
    onFinish: () => resumeFrom("ad"),
    onReward: () => {
      granted = true;
      addShards(offer.shards);
      addCores(offer.cores);
      saveActiveChar();
      addToast(`Reward doubled!  +${offer.shards} ✦  +${offer.cores} ✺`, "#ffd166");
    },
  });
  if (!started && !granted) addToast("Ad unavailable — reward not doubled", "#ff9a6f");
}

// --- Roaming-event rewarded offers (Sky-Drop Cache / Gilded Quarry) ----------
// Both grants run at overworld safe beats (drops + meta currency are legal there).
// Roll until an epic-or-better lands (bounded) — the sealed-cache / gilded prize
// must FEEL premium or the ad ask reads as a rip-off.
function rollPremiumItem(tier) {
  const floor = RARITY_ORDER.indexOf("epic");
  let it = null;
  for (let i = 0; i < 60; i++) {
    it = rollItem(rollDropTemplate(Math.random, player.class), tier + 2);
    if (RARITY_ORDER.indexOf(it.rarity) >= floor) return it;
  }
  // Probabilistic misses (~1%) are not acceptable for a "premium" promise — fall back
  // to rolling a directly-picked epic+ template usable by this class.
  const pool = ITEM_TEMPLATES.filter((t) => RARITY_ORDER.indexOf(t.rarity) >= floor && (!t.classes || t.classes.includes(player.class)));
  if (pool.length) return rollItem(pool[Math.floor(Math.random() * pool.length)], tier + 2);
  return it;
}
function grantSkydropSpoils(x, y, tier) {
  pickups.push({ kind: "item", x, y: y - 40, item: rollPremiumItem(tier), t: 0 });
  addCores(2 + (tier >> 1));
  addToast(`The sealed cache opens — rare gear!  +${2 + (tier >> 1)} ✺`, "#8fd0ff");
  spawnBurst(x, y - 10, 24, "#bfe8ff", 260, 3.8, 0.6);
  addRing(x, y - 10, 10, 90, 0.5, "#8fd0ff", 4);
  sfx.item();
}
function grantGildedSpoils(x, y, tier) {
  pickups.push({ kind: "item", x, y: y - 36, item: rollItem(rollDropTemplate(Math.random, player.class), tier + 1), t: 0 });
  pickups.push({ kind: "coin", x: x - 44, y: y + 8, amount: 30 + tier * 14 + Math.floor(Math.random() * 20), t: 0 });
  pickups.push({ kind: "coin", x: x + 44, y: y + 8, amount: 30 + tier * 14 + Math.floor(Math.random() * 20), t: 0 });
  addCores(1 + (tier >> 1));
  spawnBurst(x, y - 8, 26, "#ffd166", 280, 4, 0.6);
  addRing(x, y - 8, 10, 100, 0.55, "#ffe27a", 5);
  sfx.item();
}
// Shop Premium Crate — one high-rarity item per local day, unsealed by a rewarded ad.
// The item preview is rolled fresh per day/class (epic floor, scaled to the player's
// deepest depth so it stays a real upgrade); the claim itself happens via adOffer.
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
function ensurePremiumStock() {
  const day = todayKey();
  if (!premiumStock || premiumStock.day !== day || premiumStock.cls !== player.class) {
    premiumStock = { day, cls: player.class, item: rollPremiumItem(Math.max(1, Math.min(8, getDeepest()))) };
  }
}
const shopApi = {
  // The premium slot shown in the shop's Buy view (null once today's is claimed).
  premium() {
    if (!premiumCrateClaimable()) return null;
    ensurePremiumStock();
    return premiumStock.item;
  },
  // Clicking the slot: close the shop (the adOffer overlay owns input) and offer the ad.
  claimPremium() {
    if (!premiumCrateClaimable() || !premiumStock) return;
    ui.close();
    adOffer = {
      kind: "premium",
      item: premiumStock.item,
      x: player.x,
      y: player.y,
      title: "PREMIUM CRATE",
      sub: `Inside: ${premiumStock.item.name} — ${RARITIES[premiumStock.item.rarity].name} ${premiumStock.item.slot}.`,
      acceptLabel: "Unseal it — watch a video",
      declineLabel: "Not today",
    };
  },
};

// Daily Supply Drop: claim at the camp crate (safe point — grants + save are legal).
// Base rewards land immediately; the adOffer overlay then offers a rewarded double.
function grantSupplyDrop(r, x, y) {
  pickups.push({ kind: "coin", x: x - 34, y: y + 12, amount: Math.ceil(r.coins / 2), t: 0 });
  pickups.push({ kind: "coin", x: x + 34, y: y + 12, amount: Math.floor(r.coins / 2), t: 0 });
  addCores(r.cores);
  addShards(r.shards);
  spawnBurst(x, y - 8, 20, "#ffd166", 240, 3.6, 0.55);
  addRing(x, y - 8, 8, 80, 0.5, "#ffe27a", 4);
  sfx.item();
}
function claimSupplyDrop() {
  const r = claimDailyDrop();
  if (!r) return;
  const { x, y } = world.supply;
  grantSupplyDrop(r, x, y);
  // Every 7th consecutive day is the calendar's MYSTERY slot — a guaranteed
  // epic-floor item on top of the usual haul.
  if (r.mystery) {
    const itx = rollPremiumItem(Math.max(1, Math.min(8, getDeepest())));
    player.addItem(itx);
    itemPickups.push({ item: itx, t: 3.4 });
    addToast(`MYSTERY REWARD — ${itx.name}!`, "#c98fff");
  }
  addToast(`Daily supply claimed — Day ${r.streak} streak!  +${r.coins} ◉  +${r.shards} ✦  +${r.cores} ✺`, "#ffd166");
  saveActiveChar(); // camp = safe save point
  adOffer = {
    kind: "daily",
    base: r,
    x,
    y,
    title: "DAILY SUPPLY DROP",
    sub: `Day ${r.streak} streak — rations secured. Come back tomorrow to keep it going!`,
    acceptLabel: "Double it — watch a video",
    declineLabel: "Take it and go",
  };
}

// Resolve the current adOffer. Accept → rewarded ad; the bonus grants ONLY inside
// onReward (adFinished). Decline (or ad unavailable) keeps the free spoils already
// granted and spends the event.
function resolveAdOffer(accepted) {
  const offer = adOffer;
  if (!offer) return;
  adOffer = null;
  if (offer.poi) finishPoi(offer.poi); // spend the event either way (session re-arms later)
  if (!accepted) return;
  let granted = false;
  const started = portal.rewarded({
    onStart: () => pauseFor("ad"),
    onFinish: () => resumeFrom("ad"),
    onReward: () => {
      granted = true;
      if (offer.kind === "skydrop") grantSkydropSpoils(offer.x, offer.y, offer.tier);
      else if (offer.kind === "gilded") {
        grantGildedSpoils(offer.x, offer.y, offer.tier);
        addToast("The spoils are DOUBLED!", "#ffd166");
      } else if (offer.kind === "daily" && offer.base) {
        grantSupplyDrop(offer.base, offer.x, offer.y);
        addToast("Daily supply DOUBLED!", "#ffd166");
      } else if (offer.kind === "premium" && offer.item) {
        player.addItem(offer.item);
        itemPickups.push({ item: offer.item, t: 3.4 });
        markPremiumCrateClaimed(); // burn the daily cap ONLY on a real reward
        premiumStock = null;
        addToast(`Premium crate unsealed — ${offer.item.name}!`, "#ffd166");
        sfx.item();
        saveActiveChar(); // at the camp shop = safe point
      }
    },
  });
  if (!started && !granted) addToast("Ad unavailable — the spoils stay as they are", "#ff9a6f");
}
function drawAdOffer() {
  if (!adOffer) return;
  const { w, h } = viewSize();
  const narrow = w < 560;
  ctx.fillStyle = "rgba(8,14,26,0.74)";
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = "center";
  ctx.fillStyle = adOffer.kind === "gilded" ? "#ffd166" : "#8fd0ff";
  ctx.font = (narrow ? "700 24px" : "700 36px") + " Fredoka, -apple-system, sans-serif";
  ctx.fillText(adOffer.title, w / 2, h / 2 - 64);
  ctx.fillStyle = "#cdd7ee";
  ctx.font = (narrow ? "600 14px" : "600 18px") + " Fredoka, -apple-system, sans-serif";
  ctx.fillText(adOffer.sub, w / 2, h / 2 - 24);
  const b = extractSummaryButtons(w, h);
  const hov = (r) => input.mouseX >= r.x && input.mouseX <= r.x + r.w && input.mouseY >= r.y && input.mouseY <= r.y + r.h;
  ctx.textBaseline = "middle";
  // Accept (rewarded) — gold, with the camcorder icon.
  ctx.fillStyle = hov(b.double) ? "#e6ac3c" : "#c98f28";
  roundRect(ctx, b.double.x, b.double.y, b.double.w, b.double.h, 10);
  ctx.fill();
  ctx.fillStyle = "#1a1206";
  ctx.font = (narrow ? "800 13px" : "800 14px") + " Fredoka, -apple-system, sans-serif";
  {
    const iconW = 20, gap = 7;
    const cx2 = b.double.x + b.double.w / 2;
    const cy2 = b.double.y + b.double.h / 2 + 1;
    let gw = iconW + gap + ctx.measureText(adOffer.acceptLabel).width;
    if (gw > b.double.w - 14) {
      // Long labels shrink to fit inside the button rather than spilling past it.
      ctx.font = "800 12px Fredoka, -apple-system, sans-serif";
      gw = iconW + gap + ctx.measureText(adOffer.acceptLabel).width;
    }
    const sx = cx2 - gw / 2;
    drawVideoIcon(ctx, sx + iconW / 2, cy2, 11, "#1a1206");
    ctx.textAlign = "left";
    ctx.fillText(adOffer.acceptLabel, sx + iconW + gap, cy2);
    ctx.textAlign = "center";
  }
  // Decline.
  ctx.fillStyle = hov(b.cont) ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.08)";
  roundRect(ctx, b.cont.x, b.cont.y, b.cont.w, b.cont.h, 10);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#dfe7f0";
  ctx.font = "700 15px Fredoka, -apple-system, sans-serif";
  ctx.fillText(adOffer.declineLabel, b.cont.x + b.cont.w / 2, b.cont.y + b.cont.h / 2 + 1);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
}

// Extract-summary overlay button rects (shared by the update hit-test + the draw).
function extractSummaryButtons(w, h) {
  const bw = 240;
  const bh = 50;
  const gap = 16;
  // Side-by-side needs ~500px; on narrower (portrait phone) screens STACK the buttons —
  // otherwise they extend past the screen edge and become untappable.
  if (w < bw * 2 + gap + 40) {
    const cy = h / 2 + 36;
    return {
      double: { x: w / 2 - bw / 2, y: cy, w: bw, h: bh },
      cont: { x: w / 2 - bw / 2, y: cy + bh + 12, w: bw, h: bh },
    };
  }
  const cy = h / 2 + 44;
  return {
    double: { x: w / 2 - bw - gap / 2, y: cy, w: bw, h: bh },
    cont: { x: w / 2 + gap / 2, y: cy, w: bw, h: bh },
  };
}
function drawExtractSummary() {
  if (!extractSummary) return;
  const { w, h } = viewSize();
  const s = extractSummary;
  ctx.fillStyle = "rgba(8,14,26,0.74)";
  ctx.fillRect(0, 0, w, h);
  const narrow = w < 560; // portrait phones — smaller type so nothing clips at the edges
  ctx.textAlign = "center";
  ctx.fillStyle = "#7fd2ff";
  ctx.font = (narrow ? "800 18px" : "800 22px") + " Fredoka, -apple-system, sans-serif";
  ctx.fillText("✦  EXTRACTED  ✦", w / 2, h / 2 - 92);
  ctx.fillStyle = "#ffffff";
  ctx.font = (narrow ? "700 26px" : "700 40px") + " Fredoka, -apple-system, sans-serif";
  ctx.fillText(`Depth ${s.depth} — loot secured`, w / 2, h / 2 - 44);
  ctx.fillStyle = "#cdd7ee";
  ctx.font = (narrow ? "600 16px" : "600 20px") + " Fredoka, -apple-system, sans-serif";
  ctx.fillText(`Banked:  +${s.shards} ✦ shards   ·   +${s.cores} ✺ cores`, w / 2, h / 2 - 4);
  const b = extractSummaryButtons(w, h);
  const hov = (r) => input.mouseX >= r.x && input.mouseX <= r.x + r.w && input.mouseY >= r.y && input.mouseY <= r.y + r.h;
  ctx.textBaseline = "middle";
  // Double (rewarded).
  ctx.fillStyle = hov(b.double) ? "#e6ac3c" : "#c98f28";
  roundRect(ctx, b.double.x, b.double.y, b.double.w, b.double.h, 10);
  ctx.fill();
  ctx.fillStyle = "#1a1206";
  ctx.font = "800 15px Fredoka, -apple-system, sans-serif";
  {
    const dLabel = "Double it — watch a video";
    const dIconW = 22, dGap = 8;
    const dcx = b.double.x + b.double.w / 2;
    const dcy = b.double.y + b.double.h / 2 + 1;
    const dGroup = dIconW + dGap + ctx.measureText(dLabel).width;
    const dSx = dcx - dGroup / 2;
    drawVideoIcon(ctx, dSx + dIconW / 2, dcy, 12, "#1a1206");
    ctx.textAlign = "left";
    ctx.fillText(dLabel, dSx + dIconW + dGap, dcy);
    ctx.textAlign = "center";
  }
  // Continue.
  ctx.fillStyle = hov(b.cont) ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.08)";
  roundRect(ctx, b.cont.x, b.cont.y, b.cont.w, b.cont.h, 10);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#dfe7f0";
  ctx.fillText("Continue", b.cont.x + b.cont.w / 2, b.cont.y + b.cont.h / 2 + 1);
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#8b97ab";
  ctx.font = (narrow ? "500 11px" : "500 13px") + " Fredoka, -apple-system, sans-serif";
  ctx.fillText("Bank it as-is, or watch a short ad to DOUBLE the shards + cores.", w / 2, b.cont.y + b.cont.h + 28);
  ctx.textAlign = "left";
}

// Build a fresh world + player for a class (loading `profile` if returning).
function buildGameFor(cls, profile) {
  world = new World(WORLD_W, WORLD_H);
  player = new Player(WORLD_W / 2, WORLD_H / 2, cls, profile);
  // Re-apply this character's spent overworld POIs (cleared caches/shrines/lairs
  // persist per-character; the world is seed-stable so POI ids match across loads).
  for (const p of world.pois) if (player.clearedPois.has(p.id)) p.cleared = true;
  enemies = [];
  pickups = [];
  toasts = [];
  itemPickups = [];
  projectiles = [];
  shopStock = rollShopStock(6, Math.random, 0); // camp shop (tier 0)
  for (const t of world.towns) t.stock = rollShopStock(6, Math.random, t.tier); // tiered town shops
  spawnTimer = 0.8;
  kills = 0;
  banner = null;
  prevSafe = true;
  scene = "overworld";
  dungeon = null;
  portals = [];
  returnPos = null;
  onRun = false;
  runDeepest = 0;
  runSnapshot = null;
  lastRunResult = null;
  victory = false;
  victoryHold = 0;
  fx.reset();
  ambient = [];
  spawners = [];
  footTimer = 0;
  ambientTimer = 0;
  fxClock = 0;
  prevHp = player.hp;
  combo = 0;
  comboTimer = 0;
  wasAttacking = false;
  wasDashing = false;
  recallTimer = 0;
  nearPoi = null;
  ui.close();
  metaUi.close();
  boardUi.close();
  forgeUi.close();
  shrineUi.close();
}

// Restart the currently-active character (used by death paths + debug).
function reset() {
  const cls = getActive() || "drifter";
  buildGameFor(cls, getChar(cls));
}

// Persist the active character's gear + coins to its profile.
function saveActiveChar() {
  const cls = getActive();
  if (cls && player) saveChar(cls, player.toProfile());
}

// Start playing a class from the title screen — create it if new.
function startCharacter(cls) {
  const existed = hasChar(cls);
  setActive(cls);
  buildGameFor(cls, getChar(cls)); // getChar() is null for a new character
  if (!existed) saveActiveChar(); // persist the fresh starting loadout right away
  banner = hasWon()
    ? { text: `${CLASS_NAMES[cls]}, Champion of the Deep — descend anew`, t: 3, safe: true }
    : { text: `The Heart of Winter stirs below — descend to Depth ${FINAL_DEPTH} and still it`, t: 4.2, safe: true };
  // gameplayStart is reported by the per-frame syncGameplay() once we're in live play.
}

// Save and return to the title screen.
function returnToTitle() {
  saveActiveChar();
  scene = "menu";
  ui.close();
  metaUi.close();
  input.wheelY = 0; // don't carry a gameplay scroll into the menu
  menu.mode = "main";
  // syncGameplay() will report gameplayStop now that scene === "menu".
}

const menuApi = { onPlay: (cls) => startCharacter(cls) };

// --- Juice helpers (thin wrappers over the `fx` instance; see fx.js) ---
function addRing(x, y, r0, r1, life, color, width) {
  fx.ring(x, y, r0, r1, life, color, width);
}
function addShake(mag) {
  fx.kick(mag);
}
function addFloater(x, y, text, color, size) {
  fx.floater(x, y, text, color, size);
}
function spawnBurst(x, y, n, color, speed, size, life) {
  fx.burst(x, y, n, color, speed, size, life);
}
function addBolt(x1, y1, x2, y2, color) {
  fx.bolt(x1, y1, x2, y2, color);
}

// Advance bounties + toast any that just completed. The faucet wrapper keeps the
// reward-on-CLAIM rule (completion only flips a flag; cores/coins are granted at the board).
function notifyBounty(type, amount, tag) {
  for (const b of bountyProgress(type, amount, tag)) {
    addToast(`Bounty complete — ${b.label}!  Claim at the Board`, b.color || "#ffd166");
  }
}

// Camp interactable APIs — keep coin/save/toast side-effects here (where the lifecycle
// rules live), out of the overlay render code.
const boardApi = {
  claim(b) {
    const r = claimBounty(b.bid);
    if (r) {
      player.coins += r.coins;
      saveActiveChar();
      addToast(`Bounty claimed!  +${r.cores} ✺  +${r.coins} ◉`, "#bfe8ff");
    }
  },
  reroll(b) {
    if (rerollBounty(b.bid)) addToast("Bounty rerolled", "#cdd5e2");
  },
};
const forgeApi = {
  forge(wt) {
    if (player.coins < 120 || !spendCores(24)) return false; // coin check first → no refund needed
    player.coins -= 120;
    const it = forgeLegendary(wt, Math.max(6, Math.min(12, getDeepest())));
    if (!it) return false;
    player.addItem(it);
    itemPickups.push({ item: it, t: 3.4 });
    saveActiveChar();
    addToast(`Forged ${it.name}!`, "#ef9f27");
    return true;
  },
  temper(item) {
    if (player.coins < 60 || !spendCores(6)) return false;
    player.coins -= 60;
    temperItem(item);
    player.recomputeStats();
    saveActiveChar();
    addToast(`Tempered ${item.name}`, "#bfe8ff");
    return true;
  },
  reroll(item) {
    if (player.coins < 40 || !spendCores(4)) return false;
    player.coins -= 40;
    rerollAffixes(item);
    player.recomputeStats();
    saveActiveChar();
    addToast(`Rerolled ${item.name}`, "#bfe8ff");
    return true;
  },
};

// --- Overworld points of interest (poi.js registry) ---
// The side-effect surface poi.js onInteract bodies call. Loot drops via the normal
// pickups feed (banks on collect, like wild kills); cores/buffs are overworld-only
// (onRun === false here) so saveActiveChar + addCores are legitimately safe.
const poiApi = {
  addShards,
  addCores,
  notifyBounty,
  sfx,
  toast: (t, c) => addToast(t, c),
  burst: (x, y, n, c, sp, sz, l) => spawnBurst(x, y, n, c, sp, sz, l),
  ring: (x, y, r0, r1, life, c, wdt) => addRing(x, y, r0, r1, life, c, wdt),
  dropItem(x, y, tier) {
    pickups.push({ kind: "item", x, y, item: rollItem(rollDropTemplate(Math.random, player.class), tier), t: 0 });
  },
  dropCoins(x, y, amount) {
    pickups.push({ kind: "coin", x, y, amount, t: 0 });
  },
  // Wake a tier-scaled elite at a mini-boss POI, tagged so its death clears the POI.
  // Tanky (×2.2 hp) but only modestly harder-hitting than a wild charger (×1.2 dmg)
  // — combined with the grace iframe in aggroPoi, its lunge is dangerous, not a
  // guaranteed one-shot on a full-HP passerby.
  spawnElite(p, opts = {}) {
    const ws = wildScale(p.x, p.y);
    // Gilded (event) elites are tankier and gleam gold — the reward beast, not a wall.
    const hpMul = opts.gilded ? 2.8 : 2.2;
    const e = new Enemy(p.x, p.y, "charger", { hp: ws.hp * hpMul, dmg: ws.dmg * 1.2 });
    e.r *= opts.gilded ? 1.5 : 1.4;
    e.isElite = true;
    e.poiRef = p;
    if (opts.gilded) {
      e.gilded = true;
      e.color = "#e8b53a";
    }
    const res = world.resolve(p.x, p.y, e.r);
    e.x = res.x;
    e.y = res.y;
    enemies.push(e);
  },
  // Sky-Drop Cache: the free coin scatter already dropped (poi.js) — now offer the
  // sealed compartment behind a rewarded ad. finishPoi fires when the offer resolves.
  openSkydrop(p) {
    adOffer = {
      kind: "skydrop",
      poi: p,
      tier: p.tier,
      x: p.x,
      y: p.y,
      title: "SUPPLY POD",
      sub: "The hatch gives up some coins — but a SEALED cache sits inside.",
      acceptLabel: "Unseal it — watch a video",
      declineLabel: "Leave it",
    };
  },
  openShrine(p, choices) {
    shrineUi.openShrine(p, choices);
  },
  playerStats: () => player.stats, // lets the shrine drop already-held boolean buffs
};

// Mark a POI spent + persist it (per-character). Overworld is a safe save point.
function finishPoi(p) {
  if (!p || p.cleared) return;
  p.cleared = true;
  p.choices = null; // drop any cached shrine roll
  const def = POI_TYPES[p.kind];
  if (def && def.session) {
    // Roaming EVENT (skydrop/gilded): never persisted — it re-arms a few minutes from
    // now (see the overworld update loop) so each play session keeps meeting fresh,
    // optional rewarded beats. Currency granted by it saves via its own meta paths.
    p.clearedAt = fxClock;
    return;
  }
  if (player) {
    player.clearedPois.add(p.id);
    saveActiveChar();
  }
}

// E-interact a "press" POI (shrine/cache). onInteract returns true if spent NOW
// (cache); a shrine opens the picker and clears later when a blessing is chosen.
function interactPoi(p) {
  if (scene !== "overworld") return; // POIs are overworld-only — never fire mid-dive
  const def = POI_TYPES[p.kind];
  if (!def || p.cleared) return;
  if (def.onInteract(p, poiApi)) finishPoi(p);
}

// Auto-aggro an "aggro" POI (mini-boss) on proximity — no E. The spawned elite
// clears the POI on death (onEnemyDeath sees e.poiRef); a brief grace iframe lets
// the player read the charge telegraph so the spawn-in-range first lunge can't
// cheap-shot them. Re-spawn is gated on live-elite absence (see the proximity loop).
function aggroPoi(p) {
  if (scene !== "overworld") return;
  const def = POI_TYPES[p.kind];
  if (!def || p.cleared) return;
  p.aggroed = true;
  def.onInteract(p, poiApi);
  player.iframe = Math.max(player.iframe || 0, 0.6); // grace to read the wind-up
}

// Shrine picker side-effects (shrineUi calls api.choose with the picked blessing).
// Open the in-dungeon Field Kit vendor: 1-of-3 tier-scaled buffs, each costing at-risk
// run coins. Stock is cached per depth so closing and reopening shows the SAME trio.
function openFieldKit() {
  if (!fieldKitChoices) {
    const cost = 30 + dungeon.depth * 20;
    fieldKitChoices = rollBuffChoices(dungeon.depth, 3, player.stats).map((c) => ({ ...c, cost }));
  }
  shrineUi.openShrine({ fieldKit: true }, fieldKitChoices);
}
const shrineApi = {
  choose(p, blessing) {
    if (p && p.fieldKit) {
      // Field Kit purchase — coins only, mid-run: grant the buff but NEVER save here
      // (the no-save-while-onRun invariant; a death restores the spent coins anyway).
      if (player.coins < (blessing.cost || 0)) {
        addToast("Not enough coins", "#ff9a6f");
        return;
      }
      player.coins -= blessing.cost || 0;
      player.grantDiveBuff(blessing.mods);
      addToast(`Field Kit: ${blessing.label} — ${blessing.text} (until your next dive ends)`, blessing.color);
      spawnBurst(player.x, player.y, 18, blessing.color, 220, 3.2, 0.6);
      sfx.item();
      shrineUi.close();
      fieldKitChoices = null;
      portals = portals.filter((pp) => pp.label !== "Field Kit"); // one purchase per depth
      return;
    }
    player.grantDiveBuff(blessing.mods);
    addToast(`Blessing of ${blessing.label} — ${blessing.text} (until your next dive ends)`, blessing.color);
    spawnBurst(player.x, player.y, 18, blessing.color, 220, 3.2, 0.6);
    addRing(player.x, player.y, player.r * 0.5, player.r * 3.4, 0.5, blessing.color, 4);
    sfx.item();
    shrineUi.close();
    finishPoi(p);
  },
};

// Damage numbers, sparks, combo, frost, shake + hit-stop for a set of hits.
// Shared by melee swings, the Warden contact-dash, AND ranged projectile impacts.
function spawnHitFx(hits) {
  if (!hits || !hits.length) return;
  for (const ht of hits) {
    addFloater(ht.x, ht.y - ht.r, ht.crit ? `${ht.damage}!` : `${ht.damage}`, ht.crit ? "#ffd166" : "#ffffff", ht.crit ? 22 : 15);
    spawnBurst(ht.x, ht.y, ht.crit ? 10 : 6, ht.crit ? "#ffd166" : "#ffe9a8", 240, ht.crit ? 3.5 : 2.6, 0.32);
    if (ht.frost) spawnBurst(ht.x, ht.y, 8, "#bfe8ff", 220, 3, 0.4);
  }
  combo += hits.length;
  comboTimer = 2.6;
  sfx.hit(hits.some((h) => h.crit));
  const big = hits.some((h) => h.dashStrike || h.crit);
  addShake(big ? 7 : 3);
  fx.freeze(big ? 0.06 : 0.03);
}

// Scale a wild enemy by the difficulty tier of its spawn region. Far towns sell
// great gear, but their surrounding enemies hit HARD — no rushing for loot.
function wildScale(x, y) {
  const tier = world.tierAt(x, y);
  return { hp: 1 + tier * 0.45, dmg: 1 + tier * 0.6 };
}

// Wild spawns: telegraph a marker, then spawn the creature after a delay.
function updateSpawners(dt) {
  for (const s of spawners) {
    s.t -= dt;
    if (s.t <= 0) {
      const e = new Enemy(s.x, s.y, s.type, wildScale(s.x, s.y));
      const r = world.resolve(s.x, s.y, e.r);
      e.x = r.x;
      e.y = r.y;
      enemies.push(e);
      s.done = true;
    }
  }
  spawners = spawners.filter((s) => !s.done);
}

function updateAmbient(dt, w, h) {
  const id = scene === "dungeon" ? dungeonBiomeId() : world.biomeAt(player.x, player.y);
  const cfg = AMBIENT[id] || AMBIENT.tundra;
  ambientTimer -= dt;
  if (ambientTimer <= 0 && ambient.length < 90) {
    ambientTimer = 0.06;
    // Spawn just inside the viewport.
    const x = camera.x - 40 + Math.random() * (w + 80);
    const y = camera.y - 40 + Math.random() * (h + 80);
    ambient.push({ x, y, vx: cfg.vx + (Math.random() - 0.5) * 12, vy: cfg.vy + (Math.random() - 0.5) * 10, size: cfg.size * (0.6 + Math.random() * 0.8), life: 3 + Math.random() * 2, maxLife: 5, color: cfg.color, sway: Math.random() * 6 });
  }
  for (const p of ambient) {
    p.x += (p.vx + Math.sin((fxClock + p.sway) * 1.5) * 6) * dt;
    p.y += p.vy * dt;
    p.life -= dt;
  }
  ambient = ambient.filter((p) => p.life > 0 && p.x > camera.x - 80 && p.x < camera.x + w + 80 && p.y > camera.y - 80 && p.y < camera.y + h + 80);
}
function dungeonBiomeId() {
  for (const id of Object.keys(BIOMES)) if (BIOMES[id] === dungeon.biome) return id;
  return "tundra";
}

function addToast(text, color) {
  toasts.push({ text, color, t: 2.4 });
}
function updateToasts(dt) {
  for (const t of toasts) t.t -= dt;
  toasts = toasts.filter((t) => t.t > 0);
  for (const ip of itemPickups) ip.t -= dt;
  if (itemPickups.some((ip) => ip.t <= 0)) itemPickups = itemPickups.filter((ip) => ip.t > 0);
}

// --- Loot (overworld kills) ---
function dropLoot(x, y) {
  pickups.push({ kind: "coin", x, y, amount: 2 + Math.floor(Math.random() * 4), t: 0 });
  if (Math.random() < ITEM_DROP_CHANCE + metaBonuses().dropChance) {
    const item = rollItem(rollDropTemplate(Math.random, player.class), world.tierAt(x, y) + 1);
    pickups.push({ kind: "item", x: x + (Math.random() - 0.5) * 24, y: y + (Math.random() - 0.5) * 24, item, t: 0 });
  }
}

function updatePickups(dt) {
  for (const p of pickups) {
    p.t += dt;
    // Magnet: drift toward the player when close.
    const d = dist(p.x, p.y, player.x, player.y);
    if (d < 110 && d > 1) {
      const pull = (1 - d / 110) * 360;
      p.x += ((player.x - p.x) / d) * pull * dt;
      p.y += ((player.y - p.y) / d) * pull * dt;
    }
    if (dist(p.x, p.y, player.x, player.y) < player.r + 16) {
      if (p.kind === "coin") {
        const boosted = Math.round(p.amount * (metaBonuses().coinMult || 1)); // Greed upgrade
        player.coins += boosted;
        addToast(`+${boosted} coins`, "#ffd166");
        sfx.coin();
      } else {
        player.addItem(p.item);
        // Gear gets a dedicated "acquired" card (drawItemPickups) — not a coin-style toast.
        itemPickups.push({ item: p.item, t: 3.4 });
        sfx.item();
      }
      p.collected = true;
    }
  }
  pickups = pickups.filter((p) => !p.collected);
}

// --- Projectiles (enemy + friendly bow/staff shots, split by `owner`) ---
function nearestEnemy(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const e of enemies) {
    if (e.dead) continue;
    const d = dist(x, y, e.x, e.y);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

function updateProjectiles(dt, level) {
  for (const p of projectiles) {
    const friendly = p.owner === "player";
    // Homing seeks the player (enemy shots) or the nearest enemy (friendly shots).
    if (p.homing) {
      // A chained bolt locks onto its chosen next foe (p.target); others seek the nearest.
      const tgt = friendly ? (p.target && !p.target.dead ? p.target : nearestEnemy(p.x, p.y)) : player.dead ? null : player;
      if (tgt) {
        const want = Math.atan2(tgt.y - p.y, tgt.x - p.x);
        const cur = Math.atan2(p.vy, p.vx);
        const sp = Math.hypot(p.vx, p.vy);
        const na = cur + clamp(angleDiff(want, cur), -2.6 * dt, 2.6 * dt);
        p.vx = Math.cos(na) * sp;
        p.vy = Math.sin(na) * sp;
      }
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;

    if (friendly) {
      // Friendly shot: collide with enemies, route hits through the shared FX.
      for (const e of enemies) {
        if (e.dead) continue;
        if (p.pierced && p.pierced.has(e)) continue; // Pierce: never re-hit a foe passed through
        if (dist(p.x, p.y, e.x, e.y) > p.r + e.r) continue;
        const crit = Math.random() < Math.min(0.95, player.stats.critChance);
        const dmg = crit ? Math.round(p.damage * 2) : p.damage;
        const a = Math.atan2(p.vy, p.vx);
        const dealt = e.takeHit(dmg, a, (p.knockback || 80) * (crit ? 1.4 : 1));
        if (player.stats.lifesteal > 0) player.hp = Math.min(player.maxHp, player.hp + dealt * player.stats.lifesteal);
        if (p.chill && !e.dead) e.applyChill(p.chill);
        spawnHitFx([{ x: e.x, y: e.y, r: e.r, color: e.color, damage: dealt, crit, killed: e.dead, dashStrike: false, frost: !!p.chill, blocked: dealt < dmg }]);
        // Chain (staff trait): lightning leaps INSTANTLY foe-to-foe, jagged arc + weaker
        // each jump. Not a traveling bullet — it reads as chain lightning.
        if (p.chain > 0) {
          let from = e;
          let chainDmg = p.damage;
          let jumps = p.chain;
          const zapped = new Set([e]);
          while (jumps > 0) {
            let best = null;
            let bd = 300;
            for (const o of enemies) {
              if (o.dead || zapped.has(o)) continue;
              const dd = dist(from.x, from.y, o.x, o.y);
              if (dd < bd) { bd = dd; best = o; }
            }
            if (!best) break;
            chainDmg = Math.max(1, Math.round(chainDmg * 0.8));
            const a = Math.atan2(best.y - from.y, best.x - from.x);
            const dealt = best.takeHit(chainDmg, a, (p.knockback || 80) * 0.35);
            if (player.stats.lifesteal > 0) player.hp = Math.min(player.maxHp, player.hp + dealt * player.stats.lifesteal);
            if (p.chill && !best.dead) best.applyChill(p.chill);
            addBolt(from.x, from.y, best.x, best.y, "#bfe8ff");
            spawnHitFx([{ x: best.x, y: best.y, r: best.r, color: best.color, damage: dealt, crit: false, killed: best.dead, dashStrike: false, frost: !!p.chill, blocked: dealt < chainDmg }]);
            zapped.add(best);
            from = best;
            jumps--;
          }
        }
        // NOVA (staff trait): the impact flowers into a chilling frost burst.
        if (p.nova) {
          const novaR = 80;
          const novaDmg = Math.max(1, Math.round(p.damage * 0.45));
          for (const o of enemies) {
            if (o.dead || o === e) continue;
            if (dist(e.x, e.y, o.x, o.y) > novaR + o.r) continue;
            const na = Math.atan2(o.y - e.y, o.x - e.x);
            const nd = o.takeHit(novaDmg, na, 120);
            o.applyChill(1.6);
            spawnHitFx([{ x: o.x, y: o.y, r: o.r, color: o.color, damage: nd, crit: false, killed: o.dead, dashStrike: false, frost: true, blocked: nd < novaDmg }]);
          }
          addRing(e.x, e.y, 12, novaR, 0.4, "#bfe8ff", 4);
        }
        // PIERCE (bow trait): punch through — weaker each foe, capped at 4 targets.
        if (p.pierce) {
          (p.pierced || (p.pierced = new Set())).add(e);
          p.damage = Math.max(1, Math.round(p.damage * 0.75));
          if (p.pierced.size >= 4) p.dead = true;
          break; // one foe per frame; the shot keeps flying next frame
        }
        p.dead = true;
        break;
      }
      if (p.dead) continue;
    } else if (!player.dead && dist(p.x, p.y, player.x, player.y) < p.r + player.r) {
      player.takeDamage(p.damage, p.x, p.y);
      p.dead = true;
      continue;
    }

    const res = level.resolve(p.x, p.y, p.r);
    if (Math.abs(res.x - p.x) > 0.01 || Math.abs(res.y - p.y) > 0.01) p.dead = true;
    if (p.x < 0 || p.y < 0 || p.x > level.width || p.y > level.height || p.life <= 0) p.dead = true;
  }
  projectiles = projectiles.filter((p) => !p.dead);
}

function spawnEnemy() {
  for (let tries = 0; tries < 24; tries++) {
    const ang = Math.random() * Math.PI * 2;
    const d = 360 + Math.random() * 280;
    let x = player.x + Math.cos(ang) * d;
    let y = player.y + Math.sin(ang) * d;
    x = Math.max(60, Math.min(WORLD_W - 60, x));
    y = Math.max(60, Math.min(WORLD_H - 60, y));
    if (world.inSafeZone(x, y, 40)) continue;
    if (dist(x, y, player.x, player.y) < 320) continue;
    // Wilds spawn creatures from the local biome's pool — telegraph, then spawn.
    const pool = BIOMES[world.biomeAt(x, y)].pool;
    spawners.push({ x, y, type: pool[Math.floor(Math.random() * pool.length)], t: 0.6 });
    return;
  }
}

// --- Dungeons (room-by-room; one room centered at a time) ---
// `depth` is an open-ended integer (1, 2, 3, ... no cap). Difficulty/rewards
// scale with depth (see dungeonConfig). Descending keeps your gear + returnPos.
function enterDungeon(depth, keepReturn = false) {
  tutorial.note("dungeon");
  if (!keepReturn) {
    // Fresh dive from the overworld = the start of a new run.
    returnPos = { x: player.x, y: player.y };
    onRun = true;
    runDeepest = depth;
    revivedThisRun = false; // a fresh run resets the once-per-run rewarded revive
    player.coins += metaBonuses().startCoins; // Reserves upgrade
    runSnapshot = { uids: new Set(player.inventory.map((i) => i.uid)), coins: player.coins };
  } else {
    // Descending deeper continues the same run.
    runDeepest = Math.max(runDeepest, depth);
  }
  const prevBest = getDeepest();
  noteDepth(runDeepest); // record the goal-tracker's deepest-ever (account-wide)
  if (getDeepest() > prevBest) portal.submitScore(getDeepest()); // new best → CrazyGames leaderboard (no-op off-portal / until a board is configured)
  notifyBounty("depth", runDeepest); // depth bounties — same safe banking point as noteDepth
  dungeon = new Dungeon(depth);
  scene = "dungeon";
  const s = dungeon.startPos();
  player.x = s.x;
  player.y = s.y;
  player.vx = player.vy = player.ix = player.iy = 0;
  player.dashTime = 0;
  player.attackTimer = 0;
  enemies = [];
  pickups = [];
  projectiles = [];
  const it = dungeon.interior;
  portals = [{ x: it.cx - 210, y: it.cy, r: 26, label: "Leave", room: dungeon.rooms[0] }];
  // Field Kit — the in-run vendor: buy ONE tier-scaled dive buff with at-risk run
  // coins (fresh stock each depth; run-scoped like shrine blessings, no mid-run saves).
  portals.push({ x: it.cx + 210, y: it.cy, r: 26, label: "Field Kit", room: dungeon.rooms[0] });
  fieldKitChoices = null;
  banner = { text: `${dungeon.biome.name} — Depth ${dungeon.depth}`, t: 2.8, safe: false };
  sfx.enterDungeon();
  // Don't persist mid-run: at-risk loot must NOT be banked by a reload. The
  // pre-dive loadout was already saved at camp; extraction/death save the result.
  if (!onRun) saveActiveChar();
  // Midgame ad at the dungeon-entry "level transition" (a CrazyGames-approved beat).
  // Fresh dives only (not descends), and never during onboarding — a brand-new player's
  // first loop stays ad-free. adBreak self-gates on the 3-min interval and pauses/mutes.
  if (!keepReturn && !tutorial.isActive()) runAdBreak();
}

// Dive one level deeper from a cleared dungeon, carrying gear forward.
function descendDungeon() {
  if (!dungeon) return;
  enterDungeon(dungeon.depth + 1, true);
}

// Extract: leave the dungeon SUCCESSFULLY, keeping everything you found and
// banking shards for how deep you got.
function exitDungeon() {
  const depth = runDeepest;
  if (onRun) {
    const gained = shardsForRun(depth, true);
    addShards(gained);
    const exCores = 1 + Math.floor(depth / 3);
    addCores(exCores);
    lastRunResult = { extracted: true, depth, shards: gained };
    notifyBounty("extract", 1);
    // Post-extract summary overlay — celebrates the extract + offers a REWARDED double.
    extractSummary = { shards: gained, cores: exCores, depth };
  }
  onRun = false;
  runSnapshot = null;
  player.clearDiveBuffs(); // shrine blessings are spent when the dive ends
  scene = "overworld";
  if (returnPos) {
    player.x = returnPos.x;
    player.y = returnPos.y;
  }
  player.vx = player.vy = player.ix = player.iy = 0;
  enemies = [];
  pickups = [];
  projectiles = [];
  dungeon = null;
  portals = [];
  banner = { text: "Back in the wilds", t: 1.8, safe: false };
  tutorial.note("diveEnd"); // onboarding: extract done → guide back to camp
  saveActiveChar();
}

// Lose the run: dropped in a dungeon. Forfeit all loot picked up this run (and
// run coins), but keep a consolation of shards. Respawn back at camp.
function loseRun() {
  const depth = runDeepest;
  const gained = onRun ? shardsForRun(depth, false) : 0;
  if (onRun) {
    addShards(gained);
    addCores(Math.max(1, depth >> 1)); // a consolation of cores for the depth reached
  }
  lastRunResult = { extracted: false, depth, shards: gained };

  if (runSnapshot) {
    // Remove every item that wasn't in the inventory when the run began.
    for (const item of [...player.inventory]) {
      if (!runSnapshot.uids.has(item.uid)) player.removeItem(item);
    }
    // Removing a run-found item that was equipped empties its slot. Re-equip a
    // surviving pre-run item so death never strips the loadout you came in with.
    for (const slot of SLOTS) {
      if (player.equipped[slot]) continue;
      const survivor = player.inventory.find((it) => it.slot === slot && player.canEquip(it));
      if (survivor) player.equip(survivor);
    }
    player.coins = runSnapshot.coins;
  }
  onRun = false;
  runSnapshot = null;
  player.clearDiveBuffs(); // died ON a dive — the shrine blessing is spent
  respawnAtCamp();
  tutorial.note("diveEnd"); // onboarding: the run ended (in death) — advance the arc
  runAdBreak(); // fell in the dungeon — a natural between-runs ad beat
}

// Send the player back to the camp alive, WITHOUT wiping gear/meta (unlike
// reset(), which starts a brand-new game). Used after death.
function respawnAtCamp() {
  scene = "overworld";
  dungeon = null;
  portals = [];
  enemies = [];
  pickups = [];
  projectiles = [];
  player.x = world.safeZone.x + world.safeZone.w / 2;
  player.y = world.safeZone.y + world.safeZone.h / 2;
  player.vx = player.vy = player.ix = player.iy = 0;
  player.dashTime = 0;
  player.attackTimer = 0;
  player.iframe = 0;
  player.hurtFlash = 0;
  player.dead = false;
  player.hp = player.maxHp;
  prevHp = player.hp;
  combo = 0;
  comboTimer = 0;
  // NB: dive blessings are NOT cleared here. respawnAtCamp also handles overworld
  // death (where you never dived) — clearing is done by loseRun/exitDungeon/
  // finishVictory so a blessing survives a death in the wilds for your eventual dive.
  saveActiveChar();
}

// Dismiss the win screen: bank the run (you won, so loot is kept) and return to
// camp as Champion. Like exitDungeon's banking, but shards were already awarded.
function finishVictory() {
  victory = false;
  onRun = false;
  runSnapshot = null;
  player.clearDiveBuffs(); // the dive is over — shrine blessing spent
  scene = "overworld";
  if (returnPos) {
    player.x = returnPos.x;
    player.y = returnPos.y;
  }
  player.vx = player.vy = player.ix = player.iy = 0;
  player.dead = false; // a dying-breath win still returns you alive
  player.hp = player.maxHp;
  prevHp = player.hp;
  player.dashTime = 0;
  player.attackTimer = 0;
  player.iframe = 0;
  enemies = [];
  pickups = [];
  projectiles = [];
  dungeon = null;
  portals = [];
  banner = { text: "Champion of the Deep — the long cold recedes", t: 4.5, safe: true };
  saveActiveChar();
}

function completeDungeon() {
  const reward = dungeon.cfg.reward;
  const coins = Math.round((reward.coins[0] + Math.floor(Math.random() * (reward.coins[1] - reward.coins[0] + 1))) * (metaBonuses().coinMult || 1)); // Greed
  player.coins += coins;
  addToast(`Dungeon cleared!  +${coins} coins`, "#ffd166");
  // Frost Cores for the clear (account-wide, safe to bank mid-run like shards) + bounty.
  const clearCores = 2 + Math.floor(dungeon.depth / 2) + (metaBonuses().bonusCores || 0); // Prospector
  addCores(clearCores);
  addToast(`+${clearCores} ✺ Frost Cores`, "#bfe8ff");
  notifyBounty("clears", 1);
  for (let i = 0; i < (reward.items || 0); i++) {
    const item = rollItem(rollDropTemplate(Math.random, player.class), dungeon.depth);
    player.addItem(item);
    addToast(`+ ${item.name}`, RARITIES[item.rarity].color);
  }
  if (reward.relic) {
    player.addItem(makeSealedRelic(dungeon.depth));
    addToast("+ Sealed Relic — decode at the Elder", "#ef9f27");
  }

  // The final depth's boss is the campaign's last fight — felling it wins.
  if (dungeon.depth >= FINAL_DEPTH) {
    const firstWin = !hasWon();
    markWon();
    const bonus = 60 + dungeon.depth * 8;
    addShards(bonus);
    addCores(25); // a chunk of cores for felling the final boss
    lastRunResult = { extracted: true, depth: dungeon.depth, shards: bonus, victory: true };
    sfx.kill(true);
    if (firstWin) {
      victory = true; // pause + show the win screen; dismissing banks the run + returns to camp
      victoryHold = 0.9;
      return;
    }
    // Already a Champion — let endless runs keep going, just bank the bonus.
    addToast(`The Heart of Winter falls again — Champion!  +${bonus} ✦`, "#bfe3ff");
  }

  const it = dungeon.interior;
  // Two ways out: Exit back to camp, or Descend one level deeper for tougher
  // foes + better loot (no upper bound — the run is as long as you can survive).
  portals.push({ x: it.cx - 70, y: it.cy - 170, r: 30, label: "Exit", room: dungeon.currentRoom });
  portals.push({ x: it.cx + 70, y: it.cy - 170, r: 30, label: "Descend", room: dungeon.currentRoom });
}

function decodeRelics() {
  const relics = player.inventory.filter((it) => it.slot === "relic");
  if (relics.length === 0) {
    addToast('The Elder: "Bring me a sealed relic."', "#cdd5e2");
    return;
  }
  for (const r of relics) {
    player.removeItem(r);
    const legend = decodeRelic(Math.random, player.class, r.srcLevel || 5);
    player.addItem(legend);
    addToast(`Decoded: ${legend.name}!`, "#ef9f27");
    sfx.decode();
  }
}

// --- Debug commands ---
function debugSpawnEnemy(type) {
  const level = scene === "dungeon" ? dungeon : world;
  const ang = Math.random() * Math.PI * 2;
  const d = 130 + Math.random() * 70;
  let x = Math.max(40, Math.min(level.width - 40, player.x + Math.cos(ang) * d));
  let y = Math.max(40, Math.min(level.height - 40, player.y + Math.sin(ang) * d));
  const e = new Enemy(x, y, type, scene === "dungeon" ? { hp: 1, dmg: 1 } : wildScale(x, y));
  const r = level.resolve(x, y, e.r);
  e.x = r.x;
  e.y = r.y;
  enemies.push(e);
}

function debugCompleteDungeon() {
  if (scene !== "dungeon" || dungeon.complete) return;
  enemies.length = 0;
  for (const r of dungeon.rooms) {
    r.spawned = true;
    r.cleared = true;
  }
  dungeon.complete = true;
  dungeon.buildCurrent();
  completeDungeon();
}

const debugApi = {
  giveCoins: (n) => {
    player.coins += n;
    addToast(`+${n} coins`, "#ffd166");
  },
  fullHeal: () => {
    player.hp = player.maxHp;
  },
  toggleGod: () => {
    player.godMode = !player.godMode;
    addToast(`God mode ${player.godMode ? "ON" : "OFF"}`, "#7CFC9B");
  },
  get godMode() {
    return player.godMode;
  },
  toggleMute: () => {
    const m = toggleMute();
    addToast(`Sound ${m ? "muted" : "on"}`, "#cdd5e2");
  },
  get muted() {
    return isMuted();
  },
  giveItem: (tpl) => {
    player.addItem(makeItem(tpl));
    addToast(`+ ${tpl.name}`, RARITIES[tpl.rarity].color);
  },
  giveRelic: () => {
    player.addItem(makeSealedRelic());
    addToast("+ Sealed Relic", "#ef9f27");
  },
  equipLegendaries: () => {
    // All five trait weapons (one per archetype) go to the bag so you can swap to test
    // each identity; the cloak + trinket equip, and the sword is equipped to start.
    for (const id of ["glacier_edge", "glacier_maul", "reapers_kiss", "aurora_longbow", "aurora_scepter"]) {
      player.inventory.push(makeItem(id));
    }
    for (const id of ["aurora_mantle", "heart_of_winter"]) {
      const it = makeItem(id);
      player.inventory.push(it);
      player.equip(it);
    }
    const sword = player.inventory.find((it) => it.id === "glacier_edge");
    if (sword) player.equip(sword);
    addToast("Legendaries in the bag — swap weapons (I) to try each trait", "#ef9f27");
  },
  clearInventory: () => {
    for (const s of SLOTS) player.unequip(s);
    player.inventory.length = 0;
    player.recomputeStats();
    addToast("Inventory cleared", "#ff7a7a");
  },
  killAll: () => {
    for (const e of enemies) {
      e.hp = 0;
      e.dead = true;
    }
  },
  completeDungeon: () => debugCompleteDungeon(),
  spawnEnemy: (type) => debugSpawnEnemy(type),
  enterDungeon: (depth) => enterDungeon(depth),
  giveShards: (n) => {
    addShards(n);
    addToast(`+${n} ✦ shards`, "#7fd2ff");
  },
  giveCores: (n) => {
    addCores(n);
    addToast(`+${n} ✺ Frost Cores`, "#bfe8ff");
  },
  rollBounties: () => {
    resetBounties();
    addToast("Bounties rerolled", "#cdd5e2");
  },
  spawnPoi: (kind = "shrine") => {
    const x = player.x + 120;
    const y = player.y;
    // Same id scheme as real POIs (world.js) so a debug clear round-trips cleanly
    // instead of leaving an orphan string in clearedPois.
    world.pois.push({ id: `${kind}:${Math.round(x)}_${Math.round(y)}`, x, y, r: 34, kind, tier: world.tierAt(x, y), biome: world.biomeAt(x, y), found: true, cleared: false, aggroed: false });
    addToast(`Spawned ${kind} POI`, "#9fd8ff");
  },
  activatePoi: () => {
    const p = world.pois.find((q) => !q.cleared && POI_TYPES[q.kind] && POI_TYPES[q.kind].interact === "press");
    if (p) interactPoi(p);
  },
  get playerClass() {
    return player.class;
  },
  setClass: (id) => {
    // Save the current character, then load/create the target class's own
    // profile (don't stamp this player's gear onto another class's save slot).
    saveActiveChar();
    startCharacter(id);
    addToast(`Class: ${id}`, "#9be29a");
  },
  toTitle: () => returnToTitle(),
  resetMeta: () => {
    resetMeta();
    player.metaBonus = metaBonuses();
    player.recomputeStats();
    addToast("Meta progress reset", "#ff7a7a");
  },
  toCamp: () => {
    onRun = false;
    runSnapshot = null;
    if (scene === "dungeon") exitDungeon();
    player.x = WORLD_W / 2;
    player.y = WORLD_H / 2;
    player.vx = player.vy = player.ix = player.iy = 0;
  },
};

// Land DIRECTLY in gameplay (no menu first), per CrazyGames' launch rules. A FRESH
// player (no saved character) starts as the beginner Drifter and gets the step-by-step
// tutorial; a RETURNING player auto-resumes their last character. The title stays
// reachable in-game (TAB at the home camp) to switch class / manage the stash.
function realProgress(ch) {
  return !!(ch && ((ch.items || []).length > 3 || (ch.coins || 0) > 0 || (ch.pois || []).length > 0));
}
function pickResumeClass() {
  const active = getActive();
  if (active && hasChar(active)) return active;
  const chars = getChars();
  return Object.keys(chars).find((c) => chars[c]) || null;
}
let bootFresh = false; // we tentatively started a fresh char (may be corrected by a late cloud save)
{
  const resume = pickResumeClass();
  if (resume) {
    // RETURNING player: build their character, but open the TITLE MENU first (switch class /
    // transfer items / continue). Landing straight in gameplay is mandatory for FRESH players
    // only (per CrazyGames); returning players get the menu. startCharacter sets the scene to
    // overworld, so override it back to the menu here.
    startCharacter(resume);
    scene = "menu";
  } else {
    // FRESH player: land directly in gameplay with the step-by-step tutorial (no menu).
    startCharacter("drifter");
    tutorial.begin();
    bootFresh = true;
  }
}

window.__game = {
  get player() { return player; },
  get world() { return world; },
  get camera() { return camera; },
  get enemies() { return enemies; },
  get kills() { return kills; },
  get pickups() { return pickups; },
  get shopStock() { return shopStock; },
  get scene() { return scene; },
  get dungeon() { return dungeon; },
  get portals() { return portals; },
  get pois() { return world.pois; },
  get projectiles() { return projectiles; },
  get fx() { return { parts: fx.parts, floaters: fx.floaters, rings: fx.rings, shake: fx.shake, hitStop: fx.hitStop, ambient, spawners, combo, comboTimer }; },
  get run() { return { onRun, runDeepest, runSnapshot, lastRunResult, shards: getShards(), cores: getCores(), bounties: getBounties(), daily: getDaily() }; },
  ui,
  metaUi,
  boardUi,
  forgeUi,
  shrineUi,
  dailyUi,
  menu,
  tutorial,
  // Dev-only cheat surface — exposed ONLY on localhost / ?debug so a player can't call
  // debugApi.giveShards()/toggleGod()/etc. from the console on a real portal host.
  ...(DEBUG_ENABLED ? { debug, debugApi } : {}),
  input,
  touch,
  portal,
  get paused() { return paused; },
  setPaused,
  enterDungeon,
  descendDungeon,
  exitDungeon,
  loseRun,
  respawnAtCamp,
  startCharacter,
  returnToTitle,
  saveActiveChar,
  step: (dt) => update(dt),
  reset,
};

let last = performance.now();
function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05;
  update(dt);
  render();
  syncGameplay(); // report active-play state to the portal SDK (overlay/pause/menu aware)
  requestAnimationFrame(frame);
}

function update(dt) {
  const { w, h } = viewSize();

  // Frozen for an ad / hidden tab / lost focus — render() still paints the last frame.
  if (paused) return;

  // Title screen — the menu handles its own input during render().
  if (scene === "menu") {
    menu.t += dt;
    return;
  }

  const level = scene === "dungeon" ? dungeon : world;

  // Debug menu (backtick) — dev-only (DEBUG_ENABLED); pauses everything while open.
  if (DEBUG_ENABLED && input.consumePress("`")) {
    if (debug.isOpen()) debug.close();
    else {
      ui.close();
      debug.open();
    }
  }
  if (debug.isOpen()) {
    recallTimer = 0;
    camera.follow(player, w, h, level.width, level.height);
    return;
  }

  // Inventory toggle (works in both scenes).
  if (input.consumePress("i")) {
    metaUi.close();
    boardUi.close();
    forgeUi.close();
    shrineUi.close();
    if (ui.isOpen()) ui.close();
    else ui.openInventory();
  }
  // TAB = back / exit (NOT Esc — the browser/portal reserves Esc to leave fullscreen).
  // Closes any open overlay, else returns to the title from the HOME camp.
  if (input.consumePress("tab")) {
    if (ui.isOpen() || metaUi.isOpen() || boardUi.isOpen() || forgeUi.isOpen() || shrineUi.isOpen() || dailyUi.isOpen()) {
      ui.close();
      metaUi.close();
      boardUi.close();
      forgeUi.close();
      shrineUi.close();
      dailyUi.close();
    } else if (scene === "overworld" && world.inZone(world.safeZone, player.x, player.y)) {
      // At the HOME camp with nothing open — back to the title (saves). Towns are
      // outposts, not the quit point.
      returnToTitle();
      return;
    }
  }

  if (scene === "overworld") {
    nearChest = nearFountain = false;
    nearShop = !player.dead && dist(player.x, player.y, world.shop.x, world.shop.y) < 78;
    nearElder = !player.dead && dist(player.x, player.y, world.elder.x, world.elder.y) < 72;
    nearQuartermaster = !player.dead && dist(player.x, player.y, world.quartermaster.x, world.quartermaster.y) < 72;
    nearBoard = !player.dead && dist(player.x, player.y, world.missionBoard.x, world.missionBoard.y) < 72;
    nearForge = !player.dead && dist(player.x, player.y, world.forge.x, world.forge.y) < 72;
    // Daily Supply Drop crate: interactable only while today's drop is unclaimed.
    world.supplyClaimable = dailyDropClaimable();
    nearSupply = !player.dead && world.supplyClaimable && dist(player.x, player.y, world.supply.x, world.supply.y) < 72;
    nearTownShop = null;
    nearTownQM = null;
    for (const t of world.towns) {
      if (!player.dead && dist(player.x, player.y, t.shop.x, t.shop.y) < 78) {
        nearTownShop = t;
        break;
      }
      // Every town also hosts an Upgrades kiosk (towns are safe zones, so spending
      // shards + the purchase save are as legal here as at the camp Quartermaster).
      if (!player.dead && t.qm && dist(player.x, player.y, t.qm.x, t.qm.y) < 72) {
        nearTownQM = t;
        break;
      }
    }
    nearDungeon = null;
    for (const dg of world.dungeons) {
      if (!player.dead && dist(player.x, player.y, dg.x, dg.y) < dg.r + 36) {
        nearDungeon = dg;
        break;
      }
    }
    const wm = camera.toWorld(input.mouseX, input.mouseY);
    hoverDungeon = null;
    for (const dg of world.dungeons) {
      if (dist(wm.x, wm.y, dg.x, dg.y) < dg.r + 22) {
        hoverDungeon = dg;
        break;
      }
    }
    // Points of interest: discover (map/waypoint), auto-aggro mini-bosses, and
    // pick the nearest "press" POI as the E target (first one within reach wins).
    nearPoi = null;
    for (const p of world.pois) {
      if (player.dead) break;
      const def = POI_TYPES[p.kind];
      if (!def) continue;
      // Roaming events (session POIs) re-arm a few minutes after being spent, so a
      // long session keeps meeting fresh optional rewarded beats.
      if (def.session && p.cleared && fxClock - (p.clearedAt || 0) > 300) {
        p.cleared = false;
        p.aggroed = false;
      }
      const d = dist(player.x, player.y, p.x, p.y);
      if (d < def.reveal) p.found = true;
      if (def.interact === "aggro") {
        // Gate re-aggro on the ABSENCE of a live elite (not a one-way flag): if the
        // elite is culled by a scene change without dying, the POI self-heals and
        // re-arms on the next approach instead of latching uncompletable forever.
        if (!p.cleared && d < p.r + 130 && !enemies.some((e) => e.poiRef === p)) aggroPoi(p);
      } else if (def.interact === "contact") {
        if (!p.cleared && d < p.r + player.r) interactPoi(p);
      } else if (!p.cleared && !nearPoi && d < p.r + 36) {
        nearPoi = p; // "press" target
      }
    }
  } else {
    nearShop = nearElder = nearQuartermaster = nearBoard = nearForge = nearSupply = false;
    nearTownQM = null;
    nearTownShop = null;
    nearDungeon = hoverDungeon = null;
    nearPoi = null;
    // Dungeon interactables — chest in a treasure room, fountain in a heal room.
    const droom = dungeon.currentRoom;
    const dit = dungeon.interior;
    nearChest = droom.type === "treasure" && !droom.looted && !player.dead && dist(player.x, player.y, dit.cx, dit.cy) < 80;
    nearFountain = droom.type === "heal" && !droom.drained && !player.dead && dist(player.x, player.y, dit.cx, dit.cy) < 80;
  }

  // Is there anything E would act on right now? Drives the touch E button's visibility.
  const nearPortal = scene === "dungeon" && !player.dead && portals.some((pp) => pp.room === dungeon.currentRoom && dist(player.x, player.y, pp.x, pp.y) < player.r + pp.r);
  input.canInteract = !!(nearChest || nearFountain || nearPortal || nearElder || nearShop || nearTownShop || nearQuartermaster || nearBoard || nearForge || nearSupply || nearTownQM || nearPoi || nearDungeon);
  // Recall-to-camp is an overworld convenience (not from a dungeon dive) and pointless
  // when you're already in the camp safe zone — gates the touch CAMP button.
  input.canRecall = scene === "overworld" && !player.dead && !world.inZone(world.safeZone, player.x, player.y);
  // Resting at the home camp: TAB opens the title menu — surface that (a faint desktop
  // hint + the touch MENU button). Hidden during the tutorial so the card keeps focus.
  input.canMenu = scene === "overworld" && !player.dead && world.inZone(world.safeZone, player.x, player.y) && !tutorial.isActive();
  // Retention popup: surface the daily calendar ONCE per session — only for players past
  // their first dungeon (never during onboarding), only at a calm overworld moment.
  if (!dailyPopupShown && scene === "overworld" && !onRun && dailyDropClaimable() && !tutorial.isActive() && getDeepest() > 0 && !adOffer && !extractSummary && isActivelyPlaying()) {
    dailyPopupShown = true;
    dailyUi.openDaily();
  }

  // Context action (E): shop / elder / quartermaster / enter dungeon / portals.
  if (input.consumePress("e")) {
    if (metaUi.isOpen() || boardUi.isOpen() || forgeUi.isOpen() || shrineUi.isOpen() || dailyUi.isOpen()) {
      metaUi.close();
      boardUi.close();
      forgeUi.close();
      shrineUi.close();
      dailyUi.close();
    } else if (ui.isOpen() && ui.mode === "shop") ui.close();
    else if (scene === "dungeon") {
      const p = portals.find((pp) => pp.room === dungeon.currentRoom && dist(player.x, player.y, pp.x, pp.y) < player.r + pp.r);
      if (p) {
        if (p.label === "Descend") descendDungeon();
        else if (p.label === "Field Kit") openFieldKit();
        else exitDungeon();
      } else if (nearChest) openChest();
      else if (nearFountain) useFountain();
    } else if (nearElder) decodeRelics();
    else if (nearShop) ui.openShop(shopStock, "Camp shop");
    else if (nearTownShop) ui.openShop(nearTownShop.stock, `${nearTownShop.name} — tier ${nearTownShop.tier} shop`);
    else if (nearQuartermaster) metaUi.openMeta();
    else if (nearBoard) boardUi.openBoard();
    else if (nearForge) forgeUi.openForge();
    else if (nearSupply) dailyUi.openDaily();
    else if (nearTownQM) metaUi.openMeta();
    else if (nearPoi) interactPoi(nearPoi);
    else if (nearDungeon) enterDungeon(nearDungeon.tierIndex + 1);
  }

  if (ui.isOpen() || metaUi.isOpen() || boardUi.isOpen() || forgeUi.isOpen() || shrineUi.isOpen() || dailyUi.isOpen()) {
    recallTimer = 0;
    camera.follow(player, w, h, level.width, level.height);
    return;
  }

  // Map (overworld only) — full map pauses.
  if (scene === "overworld") {
    if (input.consumePress("m")) mapMode = MAP_MODES[(MAP_MODES.indexOf(mapMode) + 1) % MAP_MODES.length];
    if (mapMode === "full") {
      recallTimer = 0;
      camera.follow(player, w, h, world.width, world.height);
      return;
    }
  }

  // Won the final fight — pause on the victory screen until dismissed.
  // Post-extract summary overlay — pauses the sim; offers a REWARDED double or continue.
  if (extractSummary) {
    const clicked = input.consumeClick();
    if (clicked) {
      const b = extractSummaryButtons(w, h);
      const inR = (r) => input.mouseX >= r.x && input.mouseX <= r.x + r.w && input.mouseY >= r.y && input.mouseY <= r.y + r.h;
      if (inR(b.double)) {
        runDoubleAd();
        return;
      }
      if (inR(b.cont)) {
        extractSummary = null;
        return;
      }
    }
    if (input.isDown("r", "enter", " ")) extractSummary = null;
    return;
  }

  // Roaming-event reward offer (Sky-Drop / Gilded) — same pause-gate pattern as the
  // extract summary: accept via the button ONLY (keys always decline, so a mid-combat
  // keyboard mash can never trigger an ad).
  if (adOffer) {
    const clicked = input.consumeClick();
    if (clicked) {
      const b = extractSummaryButtons(w, h);
      const inR = (r) => input.mouseX >= r.x && input.mouseX <= r.x + r.w && input.mouseY >= r.y && input.mouseY <= r.y + r.h;
      if (inR(b.double)) {
        resolveAdOffer(true);
        return;
      }
      if (inR(b.cont)) {
        resolveAdOffer(false);
        return;
      }
    }
    if (input.isDown("r", "enter", " ")) resolveAdOffer(false);
    return;
  }

  if (victory) {
    if (victoryHold > 0) victoryHold -= dt;
    else if (input.consumeClick() || input.isDown("r", "enter", " ", "e")) finishVictory();
    return;
  }

  if (player.dead) {
    recallTimer = 0; // don't leak a recall bar onto the death screen
    const canRevive = onRun && !revivedThisRun;
    const clicked = input.consumeClick();
    if (canRevive) {
      // TWO buttons when a revive is offered — Revive (watch ad) and an explicit
      // "Return to camp" decline (essential on touch: no keyboard R, and a stray tap
      // must not forfeit). Geometry comes from hud.js gameOverButtons — the SAME rects
      // drawGameOver renders (side-by-side on short landscape phones, stacked otherwise).
      const b = gameOverButtons(w, h);
      const inRect = (r) => input.mouseX >= r.x && input.mouseX <= r.x + r.w && input.mouseY >= r.y && input.mouseY <= r.y + r.h;
      const inR = clicked && inRect(b.revive);
      const inD = clicked && inRect(b.decline);
      if (inR) {
        runReviveAd();
        return;
      }
      if (inD || input.isDown("r", "enter", " ")) {
        loseRun(); // canRevive implies onRun
        return;
      }
      return; // a stray click elsewhere must NOT forfeit while revive is offered
    }
    if (clicked || input.isDown("r", "enter", " ")) {
      if (onRun) loseRun();
      else respawnAtCamp();
    }
    return;
  }

  // Hold R out in the overworld to recall to camp (a convenience — not from a
  // dungeon dive, where leaving is the Exit portal / extraction).
  if (scene === "overworld" && input.isDown("r") && !world.inZone(world.safeZone, player.x, player.y)) {
    recallTimer += dt;
    if (recallTimer >= RECALL_HOLD) {
      recallTimer = 0;
      player.x = world.safeZone.x + world.safeZone.w / 2;
      player.y = world.safeZone.y + world.safeZone.h / 2;
      player.vx = player.vy = player.ix = player.iy = 0;
      banner = { text: "Recalled to camp", t: 1.8, safe: true };
      addRing(player.x, player.y, player.r * 0.6, player.r * 4, 0.4, "#9fe3ff", 4);
      spawnBurst(player.x, player.y, 14, "#cdeeff", 220, 3, 0.5);
      saveActiveChar();
    }
  } else {
    recallTimer = 0;
  }

  const worldMouse = camera.toWorld(input.mouseX, input.mouseY);
  const gdt = fx.hitStop > 0 ? 0 : dt; // hit-stop freezes the sim for a few frames
  if (fx.hitStop > 0) fx.hitStop -= dt;

  player.update(gdt, input, level, worldMouse, enemies);

  // Attack / dash start -> sounds + a dash whoosh ring + dust.
  if (player.isAttacking && !wasAttacking) (player.isRanged ? sfx.swing() : player.isDashStrike ? sfx.dashStrike() : sfx.swing());
  if (player.isDashing && !wasDashing) {
    if (player.chainDash) sfx.chain();
    else sfx.dash();
    spawnBurst(player.x - player.dashX * player.r, player.y - player.dashY * player.r, 6, "#dfe7f0", 150, 3, 0.35);
    addRing(player.x, player.y, player.r * 0.6, player.r * 2.4, 0.3, player.chainDash ? "#9fe3ff" : "#cfe0f0", 3);
  }
  // Tutorial advances as a fresh player performs each action (note() self-gates).
  if (player.isAttacking && !wasAttacking) tutorial.note("attack");
  if (player.isDashing && !wasDashing) tutorial.note("dash");
  // Dash-strike lesson: fires on the real thing — desktop (attack right after a dash)
  // and the mobile double-tap lunge both end up in isDashStrike.
  if (player.isDashStrike && player.attackTimer > 0 && !wasDashStrike) tutorial.note("lunge");
  wasDashStrike = player.isDashStrike && player.attackTimer > 0;
  if (Math.abs(input.axisX) > 0.2 || Math.abs(input.axisY) > 0.2) tutorial.note("move");
  if (scene === "overworld" && world.inZone(world.safeZone, player.x, player.y)) tutorial.note("camp"); // reached camp after a run
  // Onboarding: the camp is a safe zone with no foes, so for the attack step spawn ONE weak
  // practice creature just south of camp — the red tutorial arrow points the new player to it.
  if (scene === "overworld" && !tutorialFoeSpawned && tutorial.overworldGuide() === "enemy") {
    tutorialFoeSpawned = true;
    const cz = world.safeZone;
    // The 4th arg is a stat SCALE (multiplier on the type's base) — keep it a weak dummy
    // that dies in a couple of hits and barely stings, so a first fight feels good.
    enemies.push(new Enemy(cz.x + cz.w / 2, cz.y + cz.h + 140, "gremlin", { hp: 0.25, dmg: 0.3 }));
  }
  wasAttacking = player.isAttacking;
  wasDashing = player.isDashing;

  // Auralist frost-blink -> a chilly ring at the launch point.
  if (player.blinkFx) {
    addRing(player.x, player.y, player.r * 0.5, player.r * 3.2, 0.34, "#9fd8ff", 4);
    spawnBurst(player.x, player.y, 10, "#cdeeff", 200, 3, 0.45);
    player.blinkFx = false;
  }

  // Player attack: spawn a ranged shot if one is pending (bow/staff).
  if (player.pendingShot) {
    const s = player.pendingShot;
    // Multishot (trait) fans out 2*spread+1 shots — each nudged sideways from the muzzle
    // so the spread reads clearly even point-blank; otherwise a single shot.
    const shots = [{ a: s.angle, o: 0 }];
    const sideMult = s.sideMult || 1;
    for (let i = 1; i <= (s.spread || 0); i++) {
      shots.push({ a: s.angle - i * 0.17, o: -i * 13 }, { a: s.angle + i * 0.17, o: i * 13 });
    }
    const px = Math.cos(s.angle + Math.PI / 2);
    const py = Math.sin(s.angle + Math.PI / 2);
    shots.forEach((sh, i) => {
      // Side shots on an EPIC multishot hit softer than the centre shot (sideMult<1).
      const dmg = i === 0 ? s.damage : Math.max(1, Math.round(s.damage * sideMult));
      const pr = makeProjectile(player.x + px * sh.o, player.y + py * sh.o, sh.a, s.speed, dmg, s.magic ? "#9fd8ff" : "#ffe2a8", s.homing, s.r, "player");
      pr.chill = s.chill || 0;
      pr.knockback = s.knockback || 80;
      pr.chain = s.chain || 0; // Chain (trait) — bounces remaining on hit
      pr.pierce = !!s.pierce; // Pierce (trait) — punches through foes
      pr.nova = !!s.nova; // Nova (trait) — frost burst on every hit
      projectiles.push(pr);
    });
    player.pendingShot = null;
  }

  // Melee + contact-dash hits -> shared juice (ranged hits route the same way
  // from updateProjectiles).
  const hits = player.resolveAttack(enemies);
  if (player.contactHits.length) hits.push(...player.contactHits);
  spawnHitFx(hits);
  // Weapon-trait visuals (cleave crescent / quake shockwave) emitted by resolveAttack.
  for (const t of player.traitFx) {
    if (t.type === "ring") addRing(t.x, t.y, t.r * 0.3, t.r, 0.35, t.color, 5);
    else if (t.type === "arc") {
      addRing(t.x, t.y, 6, 48, 0.28, t.color, 3);
      spawnBurst(t.x, t.y, 9, t.color, 230, 3, 0.3);
    }
  }
  player.traitFx.length = 0;

  for (const e of enemies) e.update(gdt, player, level, projectiles, enemies);
  flushEnemySpawns(level); // summoner minions queued during update
  updateProjectiles(gdt, level);

  // Player damage feedback.
  if (player.hp < prevHp - 0.5 && !player.healing) {
    const dmg = Math.round(prevHp - player.hp);
    addFloater(player.x, player.y - player.r, `-${dmg}`, "#ff6b6b", 16);
    addShake(4 + Math.min(8, dmg * 0.25));
    fx.freeze(0.04);
    spawnBurst(player.x, player.y, 5, "#ff8a8a", 180, 3, 0.3);
    sfx.hurt();
    combo = 0; // taking damage breaks the combo
  }

  if (scene === "dungeon") {
    for (const e of enemies) if (e.dead) onEnemyDeath(e);
    flushEnemySpawns(level); // splitter children queued in onEnemyDeath
    enemies = enemies.filter((e) => !e.dead);
    const roomBefore = dungeon.currentRoom;
    const wasComplete = dungeon.complete;
    dungeon.tick(player, enemies);
    if (dungeon.currentRoom !== roomBefore) {
      projectiles.length = 0;
      pickups.length = 0;
      const rt = dungeon.currentRoom.type;
      if (rt === "treasure") banner = { text: "Treasure room — open the chest", t: 2, safe: true };
      else if (rt === "heal") banner = { text: "A healing spring", t: 2, safe: true };
    }
    if (dungeon.complete && !wasComplete) completeDungeon();
    updatePickups(dt);
    player.healing = false;
  } else {
    let killed = 0;
    for (const e of enemies) {
      if (e.dead) {
        if (!e.gen) dropLoot(e.x, e.y); // summoned/split children (gen>0) drop nothing — no parked-summoner farm
        onEnemyDeath(e);
        killed++;
      }
    }
    flushEnemySpawns(level); // splitter children queued in onEnemyDeath
    enemies = enemies.filter((e) => !e.dead);
    kills += killed;
    updatePickups(dt);

    const safeZone = world.safeZoneAt(player.x, player.y);
    const inSafe = !!safeZone;
    if (inSafe !== prevSafe) {
      banner = inSafe
        ? { text: `${safeZone.name} — safe haven`, t: 2.4, safe: true }
        : { text: "Back in the wilds — creatures ahead", t: 2.4, safe: false };
      prevSafe = inSafe;
      if (inSafe) saveActiveChar(); // back in a safe town — persist wilds loot
    }
    player.healing = false;
    if (inSafe && player.hp < player.maxHp) {
      player.hp = Math.min(player.maxHp, player.hp + CAMP_HEAL_RATE * gdt);
      player.healing = true;
    }
    if (!inSafe) {
      spawnTimer -= gdt;
      if (spawnTimer <= 0 && enemies.length + spawners.length < MAX_ENEMIES) {
        spawnEnemy();
        spawnTimer = SPAWN_INTERVAL;
      }
    }
  }
  prevHp = player.hp;

  if (banner) {
    banner.t -= dt;
    if (banner.t <= 0) banner = null;
  }

  // Combo decay + footstep dust.
  if (comboTimer > 0) {
    comboTimer -= dt;
    if (comboTimer <= 0) combo = 0;
  }
  if (!player.dead && !player.isDashing && Math.hypot(player.vx, player.vy) > player.stats.moveSpeed * 0.45) {
    footTimer -= gdt;
    if (footTimer <= 0) {
      footTimer = 0.16;
      spawnBurst(player.x + (Math.random() - 0.5) * player.r, player.y + player.r * 0.95, 2, "rgba(220,225,232,0.6)", 40, 2.2, 0.4);
    }
  }

  updateSpawners(gdt);
  updateToasts(dt);
  tutorial.update(dt); // info steps auto-advance on real time (pauses with the sim)
  fxClock += dt;
  fx.update(dt);
  updateAmbient(dt, w, h);
  camera.follow(player, w, h, level.width, level.height, dt, Math.cos(player.facing), Math.sin(player.facing));
}

// Open the treasure-room chest (E-interact) — spills the loot it was guarding.
function openChest() {
  const room = dungeon.currentRoom;
  if (room.type !== "treasure" || room.looted) return;
  room.looted = true;
  const it = dungeon.interior;
  pickups.push({ kind: "item", x: it.cx, y: it.cy - 40, item: rollItem(rollDropTemplate(Math.random, player.class), dungeon.depth), t: 0 });
  pickups.push({ kind: "coin", x: it.cx - 46, y: it.cy + 14, amount: 20 + Math.floor(Math.random() * 30), t: 0 });
  pickups.push({ kind: "coin", x: it.cx + 46, y: it.cy + 14, amount: 20 + Math.floor(Math.random() * 30), t: 0 });
  addCores(1); // a Frost Core tucked in the chest
  addToast("The chest yields its treasure!  +1 ✺", "#ffd166");
  spawnBurst(it.cx, it.cy, 18, "#ffd166", 240, 3.5, 0.5);
  addRing(it.cx, it.cy, 8, 76, 0.5, "#ffe27a", 4);
  sfx.item();
}

// Drink from the healing-room fountain (E-interact) — one full heal per dungeon.
function useFountain() {
  const room = dungeon.currentRoom;
  if (room.type !== "heal" || room.drained) return;
  room.drained = true;
  player.hp = player.maxHp;
  prevHp = player.hp;
  addToast("The spring restores you — fully healed", "#7CFC9B");
  const it = dungeon.interior;
  spawnBurst(it.cx, it.cy, 16, "#9bffc0", 200, 3, 0.6);
  addRing(player.x, player.y, player.r * 0.5, player.r * 3.2, 0.5, "#9bffc0", 4);
  sfx.coin();
}

// Build queued child enemies (summoner minions, splitter halves) and add them to
// the live list, resolved out of walls + clamped in-bounds. Drains each enemy's
// `spawns` queue. Collected first, pushed after, so we never mutate mid-iterate.
function flushEnemySpawns(level) {
  // Overworld: keep summoner output under the same soft ceiling as wild spawns so
  // a parked summoner can't flood the field. Dungeons have no MAX_ENEMIES cap (the
  // per-summoner summonCap governs there).
  const cap = scene === "overworld" ? MAX_ENEMIES : Infinity;
  const interior = level.interior; // dungeon exposes interior bounds; world doesn't
  let count = enemies.length;
  let born = null;
  for (const e of enemies) {
    if (!e.spawns || !e.spawns.length) continue;
    for (const sp of e.spawns) {
      if (count >= cap) break;
      const c = new Enemy(sp.x, sp.y, sp.type, { hp: sp.hp || 1, dmg: sp.dmg || 1 });
      if (sp.gen) c.gen = sp.gen;
      if (sp.rMul) c.r *= sp.rMul;
      const rr = level.resolve(c.x, c.y, c.r);
      if (interior) {
        // Keep dungeon children inside the room (full bounds would leave them in the wall band).
        c.x = Math.max(interior.left + c.r, Math.min(interior.right - c.r, rr.x));
        c.y = Math.max(interior.top + c.r, Math.min(interior.bottom - c.r, rr.y));
      } else {
        c.x = Math.max(c.r, Math.min(level.width - c.r, rr.x));
        c.y = Math.max(c.r, Math.min(level.height - c.r, rr.y));
        if (level.keepOutOfSafe) {
          const safe = level.keepOutOfSafe(c.x, c.y, c.r);
          c.x = safe.x;
          c.y = safe.y;
        }
      }
      (born || (born = [])).push(c);
      count++;
    }
    e.spawns.length = 0;
  }
  if (born) enemies.push(...born);
}

function onEnemyDeath(e) {
  // Kill bounties — ONE call site that fires in both scenes (overworld + dungeon).
  notifyBounty("kills", 1);
  notifyBounty("kindKills", 1, e.type);
  // A roaming mini-boss elite was slain — clear (and persist) its overworld POI.
  if (e.poiRef) finishPoi(e.poiRef);
  // Gilded Quarry felled: shower boosted spoils (always — never ad-or-nothing), then
  // offer the rewarded "double the spoils" beat. Overworld-only by construction
  // (gilded elites only spawn from an overworld POI).
  if (e.gilded && scene === "overworld") {
    const tier = e.poiRef ? e.poiRef.tier : world.tierAt(e.x, e.y);
    grantGildedSpoils(e.x, e.y, tier);
    adOffer = {
      kind: "gilded",
      tier,
      x: e.x,
      y: e.y,
      title: "GILDED QUARRY FELLED",
      sub: "Its hoard spills out — gear, coins and cores are yours.",
      acceptLabel: "Double the spoils — watch a video",
      declineLabel: "Take them and go",
    };
  }
  // Bomber bursts on death — whether it fused out or got killed first. AoE +
  // ring; only hurts the player if they're inside the blast.
  if (e.bomber) {
    const R = e.boomR;
    addRing(e.x, e.y, e.r, R, 0.4, "#ff8a3c", 6);
    spawnBurst(e.x, e.y, 22, "#ff7a3a", 360, 4.2, 0.5);
    spawnBurst(e.x, e.y, 10, "#ffe2a8", 300, 3, 0.4);
    addShake(9);
    fx.freeze(0.05);
    sfx.kill(false);
    if (!player.dead && !player.invincible && dist(e.x, e.y, player.x, player.y) < R + player.r) {
      const before = player.hp;
      player.takeDamage(e.boomDmg, e.x, e.y);
      const lost = Math.round(before - player.hp);
      if (lost > 0) {
        addFloater(player.x, player.y - player.r, `-${lost}`, "#ff6b6b", 18);
        sfx.hurt();
        combo = 0;
      }
    }
    // The blast also hurts (and knocks back) nearby enemies — lure packs onto a
    // bomber, or chain one bomber into another.
    for (const o of enemies) {
      if (o === e || o.dead) continue;
      if (dist(e.x, e.y, o.x, o.y) > R + o.r) continue;
      const a = Math.atan2(o.y - e.y, o.x - e.x);
      const dealt = o.takeHit(e.boomDmg, a, 240);
      spawnBurst(o.x, o.y, 5, "#ff9a3a", 200, 2.6, 0.3);
      addFloater(o.x, o.y - o.r, `${dealt}`, "#ffb060", 13);
    }
    return;
  }
  // Splitter cleaves into two smaller, non-splitting copies (flushed right after
  // this death loop, before the dead parent is filtered out).
  if (e.splits && e.gen < 1) {
    for (let i = 0; i < 2; i++) {
      const ang = Math.random() * Math.PI * 2;
      e.spawns.push({ x: e.x + Math.cos(ang) * e.r, y: e.y + Math.sin(ang) * e.r, type: e.type, hp: e.spawnScale.hp * 0.5, dmg: e.spawnScale.dmg * 0.7, gen: e.gen + 1, rMul: 0.62 });
    }
  }
  spawnBurst(e.x, e.y, e.isBoss ? 30 : 10, e.color, e.isBoss ? 360 : 240, e.isBoss ? 5 : 3.4, e.isBoss ? 0.7 : 0.45);
  spawnBurst(e.x, e.y, 6, "#ffffff", 200, 2.4, 0.3);
  addShake(e.isBoss ? 13 : 3);
  fx.freeze(e.isBoss ? 0.12 : 0.03);
  sfx.kill(e.isBoss);
}

function render() {
  const { w, h } = viewSize();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // Touch: route taps to the cursor whenever an overlay is up or no char is in play.
  input.touchUi = scene === "menu" || ui.isOpen() || metaUi.isOpen() || boardUi.isOpen() || forgeUi.isOpen() || shrineUi.isOpen() || dailyUi.isOpen() || debug.isOpen() || (player && player.dead) || victory || !!extractSummary || !!adOffer;

  // CrazyGames banner: show ONLY on non-gameplay screens (menu / game over / victory) —
  // never over active gameplay. Toggle on state change so we don't spam the SDK's refresh limit.
  // Banner ONLY on the victory screen — a rare, lingered-on "you won" screen (>5s). NOT
  // the menu or the game-over screen: both have a quick continue/revive action (<5s), which
  // CrazyGames disallows for banner placement.
  const wantBanner = victory;
  if (wantBanner !== bannerShown) {
    bannerShown = wantBanner;
    if (wantBanner) portal.showBanner();
    else portal.clearBanner();
  }

  // Title screen replaces the whole frame.
  const hintEl = document.getElementById("hint");
  if (scene === "menu") {
    if (hintEl) hintEl.style.display = "none";
    menu.render(ctx, w, h, input, menuApi);
    return;
  }
  if (hintEl) hintEl.style.display = "";

  // Per-frame state bundle for the HUD/overlay draws (hud.js).
  const view = { ctx, w, h, player, scene, dungeon, world, camera, touch, enemies, pickups, projectiles, portals, kills, mapMode, banner, toasts, itemPickups, combo, comboTimer, spawners, ambient, input, onRun, runDeepest, fxClock, victory, recallTimer, recallHold: RECALL_HOLD, reviveAvailable: onRun && !revivedThisRun, tutorialHint: !!tutorial.overworldGuide(), tutorialActive: tutorial.isActive() };

  const shx = fx.shake > 0.2 ? (Math.random() * 2 - 1) * fx.shake : 0;
  const shy = fx.shake > 0.2 ? (Math.random() * 2 - 1) * fx.shake : 0;
  ctx.save();
  ctx.translate(-camera.x + shx, -camera.y + shy);
  if (scene === "dungeon") {
    dungeon.draw(ctx, camera, w, h);
    drawPortals(view);
  } else {
    world.draw(ctx, camera, w, h);
    drawPickups(view);
    drawSpawners(view);
  }
  drawAmbient(view);
  const drawables = [player, ...enemies].sort((a, b) => a.y - b.y);
  for (const d of drawables) d.draw(ctx);
  drawProjectiles(view);
  drawChainTarget(view);
  fx.draw(ctx);
  ctx.restore();

  ctx.fillStyle = grainPattern;
  ctx.fillRect(0, 0, w, h);
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.4, w / 2, h / 2, Math.max(w, h) * 0.75);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, scene === "dungeon" ? "rgba(6,6,12,0.55)" : "rgba(12,10,18,0.3)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);

  drawLowHpVignette(view);

  // While a full-screen overlay owns the view (death / victory / extract), the HUD,
  // banner, toasts and gear cards are NOT drawn — the overlay's headline was overlapping
  // the boss bar / status rows on short screens, and their timers freeze with the sim
  // anyway so nothing is lost.
  const fullOverlay = !!extractSummary || !!adOffer || victory || player.dead;
  if (!fullOverlay) {
    drawHud(view);
    if (!tutorial.isActive()) drawBanner(view); // the tutorial card owns the top-center; don't stack the banner under it
    drawToasts(view);
    drawItemPickups(view);
  }
  drawDamageIndicator(view);
  drawCombo(view);
  // Step-by-step tutorial card (fresh players) — above the HUD, below overlays.
  if (!ui.isOpen() && !metaUi.isOpen() && !boardUi.isOpen() && !forgeUi.isOpen() && !shrineUi.isOpen() && !dailyUi.isOpen() && !player.dead && !victory && !extractSummary && !adOffer) tutorial.draw(view);

  if (scene === "dungeon") {
    if (!fullOverlay) {
      drawBossBar(view);
      drawRoomMap(view);
    }
    const onPortal = portals.find((p) => p.room === dungeon.currentRoom && dist(player.x, player.y, p.x, p.y) < player.r + p.r);
    if (onPortal && !ui.isOpen()) {
      if (onPortal.label === "Descend") drawPrompt(view, `Press E to descend — Depth ${dungeon.depth + 1}`, "#ff9a6f");
      else if (onPortal.label === "Field Kit") drawPrompt(view, `Press E — Field Kit: buy a blessing (◉${30 + dungeon.depth * 20})`, "#d98fff");
      else drawPrompt(view, "Press E to extract — bank your loot", "#7CFC9B");
    }
    else if (nearChest && !ui.isOpen()) drawPrompt(view, "Press E to open the chest", "#ffd166");
    else if (nearFountain && !ui.isOpen()) drawPrompt(view, "Press E to drink — heal up", "#7CFC9B");
  } else {
    if (!fullOverlay) drawWaypoints(view); // touch wayfinder arrows (gated to touch devices)
    if (!fullOverlay && !ui.isOpen() && !metaUi.isOpen() && !boardUi.isOpen() && !forgeUi.isOpen() && !shrineUi.isOpen() && !dailyUi.isOpen()) {
      if (nearElder) drawPrompt(view, "Press E — talk to the Elder", "#cdd5e2");
      else if (nearShop) drawPrompt(view, "Press E to shop", "#ffd166");
      else if (nearTownShop) drawPrompt(view, `Press E — shop at ${nearTownShop.name} (tier ${nearTownShop.tier})`, depthColor(nearTownShop.tier + 1));
      else if (nearQuartermaster) drawPrompt(view, "Press E — spend shards on upgrades", "#7fd2ff");
      else if (nearBoard) drawPrompt(view, "Press E — review bounties", "#ffd166");
      else if (nearForge) drawPrompt(view, "Press E — forge & upgrade gear", "#bfe8ff");
      else if (nearSupply) drawPrompt(view, "Press E — claim today's supply drop", "#ffd166");
      else if (nearTownQM) drawPrompt(view, "Press E — spend shards on upgrades", "#7fd2ff");
      else if (nearPoi) drawPrompt(view, POI_TYPES[nearPoi.kind].label, POI_TYPES[nearPoi.kind].color);
      else if (nearDungeon) drawPrompt(view, `Press E to enter — ${BIOMES[nearDungeon.biome].name} (Depth ${nearDungeon.tierIndex + 1})`, depthColor(nearDungeon.tierIndex + 1));
      if (input.canMenu) drawMenuHint(view); // faint "TAB = menu" reminder while resting at camp (desktop; touch gets a MENU button)
      if (hoverDungeon) drawEntranceTooltip(view, hoverDungeon);
      if (recallTimer > 0) drawRecall(view);
      if (mapMode !== "off") drawMap(ctx, mapMode, { world, player, enemies, camera, viewW: w, viewH: h });
    }
  }

  touch.draw(ctx, w, h); // on-screen sticks/buttons (self-gates: touch only, hidden under overlays)

  if (player.dead) drawGameOver(view);
  if (victory) drawVictory(view);
  drawExtractSummary();
  drawAdOffer();
  if (ui.isOpen()) ui.render(ctx, w, h, player, input, shopApi);
  if (metaUi.isOpen()) metaUi.render(ctx, w, h, player, input);
  if (boardUi.isOpen()) boardUi.render(ctx, w, h, player, input, boardApi);
  if (forgeUi.isOpen()) forgeUi.render(ctx, w, h, player, input, forgeApi);
  if (dailyUi.isOpen()) dailyUi.render(ctx, w, h, player, input, { claim: () => claimSupplyDrop() });
  if (shrineUi.isOpen()) shrineUi.render(ctx, w, h, player, input, shrineApi);
  if (DEBUG_ENABLED && debug.isOpen()) debug.render(ctx, w, h, player, input, debugApi);
}


// Boot: reveal the menu as fast as possible — time-to-play is a conversion lever, so
// the splash must NOT wait on the portal SDK (a slow/blocked SDK used to strand players
// on the splash for up to 8s). Nothing needs preloading (art/audio are procedural), so we
// drop the splash after the first painted frame and run the SDK handshake in the background.
portal.onSettingsMute = (m) => setPortalMute(m); // honor the CrazyGames player's mute toggle
// (loadingStart is reported by portal.init() itself, AFTER SDK.init() resolves — calling
// any SDK function earlier logs "CrazySDK is not initialized yet" per CrazyGames QA.)
// The CrazyGames user logged in or out: the Data Module now fronts a DIFFERENT save store
// (account vs per-guest). A clean reload is the correct reaction — the boot flow re-reads
// the right store and adopts the right character, and the no-save-while-onRun rule means a
// mid-run reload simply reverts to the pre-run save (nothing corrupts, the dive is forfeit).
portal.onAuthChange = () => location.reload();
let splashGone = false;
const hideSplash = () => {
  if (splashGone) return;
  splashGone = true;
  const splash = document.getElementById("splash");
  if (splash) splash.classList.add("hidden");
};
requestAnimationFrame(() => requestAnimationFrame(hideSplash)); // as soon as the menu paints
setTimeout(hideSplash, 600); // fallback so a backgrounded tab (rAF paused) still reveals fast
// In the background: finish SDK init, then pick up any cloud/cross-device save (safe at the
// title — nothing committed yet) and signal loading done. Capped so a hung SDK can't stall
// the cloud-save pickup forever; the menu re-reads char state each frame so late arrivals show.
Promise.race([
  portal.init().catch(() => {}), // degrade to no-op on SDK failure (no unhandled rejection)
  new Promise((r) => setTimeout(r, 8000)),
]).finally(() => {
  // Data Module IO is legal only once SDK.init() has resolved (portal.sdk set) — flip the
  // gate BEFORE reloadFromStore so the cloud save is actually consulted.
  if (portal.sdk) setCloudReady();
  reloadFromStore();
  portal.loadingStop();
  // We auto-started into gameplay before init resolved; now the SDK is ready, so clear the
  // guard and let syncGameplay() re-send the real gameplayStart (the earlier call no-op'd
  // while the SDK wasn't ready). syncGameplay() itself checks the active-play state.
  portal.inGameplay = false;
  syncGameplay();
  // Cross-device / cleared-localStorage: the import-time load() saw only localStorage; the
  // cloud (Data Module) save arrives HERE. Adopt it when it names a different character —
  // OR holds different progress for the one we built (a fresh boot masking a played cloud
  // char, OR a stale local save about to clobber newer cross-device progress). Gated to the
  // safe boot state (overworld, nothing at risk) so we never yank an active dive. We compare
  // a cheap progress signature so an UNCHANGED returning player isn't needlessly rebuilt
  // (which would snap them back to camp spawn).
  if (!onRun && scene === "overworld") {
    const cls = pickResumeClass();
    const ch = cls ? getChar(cls) : null;
    const sig = (coins, nItems, nPois) => `${coins | 0}:${nItems}:${nPois}`;
    const cloudSig = ch ? sig(ch.coins, (ch.items || []).length, (ch.pois || []).length) : "";
    const liveSig = sig(player.coins, player.inventory.length, player.clearedPois ? player.clearedPois.size : 0);
    if (cls && (cls !== player.class || cloudSig !== liveSig)) {
      startCharacter(cls);
      if (realProgress(getChar(cls))) tutorial.stop(); // only kill onboarding for a truly played char
      bootFresh = false;
    }
  }
});
requestAnimationFrame(frame);
