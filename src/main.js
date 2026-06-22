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
import { rollShopStock, rollDropTemplate, rollItem, makeItem, makeSealedRelic, decodeRelic, RARITIES, SLOTS, CLASS_NAMES } from "./items.js";
import { MetaUI } from "./metaui.js";
import { MenuScreen } from "./menu.js";
import { Fx } from "./fx.js";
import { drawProjectiles, drawAmbient, drawLowHpVignette, drawSpawners, drawChainTarget, drawDamageIndicator, drawCombo, drawPortals, drawPickups, drawPrompt, drawEntranceTooltip, drawBossBar, drawRoomMap, drawToasts, drawItemPickups, drawWaypoints, drawBanner, drawHud, drawGameOver, drawVictory, drawRecall } from "./hud.js";
import { metaBonuses, addShards, getShards, shardsForRun, resetMeta, getChar, hasChar, setActive, getActive, saveChar, hasWon, markWon, noteDepth, getDeepest } from "./meta.js";
import { BIOMES } from "./biomes.js";
import { sfx, resumeAudio, toggleMute, isMuted } from "./sfx.js";
import { dist, angleDiff, clamp } from "./utils.js";

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
// Particles / shake / hit-stop live on the `fx` instance (fx.js). Ambient motes,
// spawn telegraphs, the combo counter, and footstep timing stay here.
let ambient, ambientTimer, fxClock, prevHp;
let spawners, footTimer;
let combo = 0;
let comboTimer = 0;
let wasAttacking = false;
let wasDashing = false;

// Start/resume audio on the first user gesture (autoplay policy).
window.addEventListener("pointerdown", resumeAudio);
window.addEventListener("keydown", resumeAudio);

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

// Mobile: collapse the browser chrome by entering fullscreen on the first touch.
// Android/Chrome honour this; iOS Safari has no element-fullscreen API, so there the
// PWA "Add to Home Screen" route (see index.html meta tags) is the way to true fullscreen.
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

function viewSize() {
  return { w: canvas.width / dpr, h: canvas.height / dpr };
}

// Build a fresh world + player for a class (loading `profile` if returning).
function buildGameFor(cls, profile) {
  world = new World(WORLD_W, WORLD_H);
  player = new Player(WORLD_W / 2, WORLD_H / 2, cls, profile);
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
  ui.close();
  metaUi.close();
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
}

// Save and return to the title screen.
function returnToTitle() {
  saveActiveChar();
  scene = "menu";
  ui.close();
  metaUi.close();
  input.wheelY = 0; // don't carry a gameplay scroll into the menu
  menu.mode = "main";
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
        player.coins += p.amount;
        addToast(`+${p.amount} coins`, "#ffd166");
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
      const tgt = friendly ? nearestEnemy(p.x, p.y) : player.dead ? null : player;
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
        if (dist(p.x, p.y, e.x, e.y) > p.r + e.r) continue;
        const crit = Math.random() < Math.min(0.95, player.stats.critChance);
        const dmg = crit ? Math.round(p.damage * 2) : p.damage;
        const a = Math.atan2(p.vy, p.vx);
        const dealt = e.takeHit(dmg, a, (p.knockback || 80) * (crit ? 1.4 : 1));
        if (player.stats.lifesteal > 0) player.hp = Math.min(player.maxHp, player.hp + dealt * player.stats.lifesteal);
        if (p.chill && !e.dead) e.applyChill(p.chill);
        spawnHitFx([{ x: e.x, y: e.y, r: e.r, color: e.color, damage: dealt, crit, killed: e.dead, dashStrike: false, frost: !!p.chill, blocked: dealt < dmg }]);
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
  if (!keepReturn) {
    // Fresh dive from the overworld = the start of a new run.
    returnPos = { x: player.x, y: player.y };
    onRun = true;
    runDeepest = depth;
    player.coins += metaBonuses().startCoins; // Reserves upgrade
    runSnapshot = { uids: new Set(player.inventory.map((i) => i.uid)), coins: player.coins };
  } else {
    // Descending deeper continues the same run.
    runDeepest = Math.max(runDeepest, depth);
  }
  noteDepth(runDeepest); // record the goal-tracker's deepest-ever (account-wide)
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
  banner = { text: `${dungeon.biome.name} — Depth ${dungeon.depth}`, t: 2.8, safe: false };
  sfx.enterDungeon();
  // Don't persist mid-run: at-risk loot must NOT be banked by a reload. The
  // pre-dive loadout was already saved at camp; extraction/death save the result.
  if (!onRun) saveActiveChar();
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
    lastRunResult = { extracted: true, depth, shards: gained };
    addToast(`Extracted from Depth ${depth} — loot secured  ·  +${gained} ✦`, "#7fd2ff");
  }
  onRun = false;
  runSnapshot = null;
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
  saveActiveChar();
}

// Lose the run: dropped in a dungeon. Forfeit all loot picked up this run (and
// run coins), but keep a consolation of shards. Respawn back at camp.
function loseRun() {
  const depth = runDeepest;
  const gained = onRun ? shardsForRun(depth, false) : 0;
  if (onRun) addShards(gained);
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
  respawnAtCamp();
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
  saveActiveChar();
}

// Dismiss the win screen: bank the run (you won, so loot is kept) and return to
// camp as Champion. Like exitDungeon's banking, but shards were already awarded.
function finishVictory() {
  victory = false;
  onRun = false;
  runSnapshot = null;
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
  const coins = reward.coins[0] + Math.floor(Math.random() * (reward.coins[1] - reward.coins[0] + 1));
  player.coins += coins;
  addToast(`Dungeon cleared!  +${coins} coins`, "#ffd166");
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
    for (const id of ["glacier_edge", "aurora_mantle", "heart_of_winter"]) {
      const it = makeItem(id);
      player.inventory.push(it);
      player.equip(it);
    }
    addToast("Equipped legendaries", "#ef9f27");
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

// Boot at the title screen. Build a placeholder world/player so nothing is null,
// but the player isn't committed until they pick a character.
buildGameFor(getActive() || "drifter", getActive() ? getChar(getActive()) : null);
scene = "menu";

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
  get projectiles() { return projectiles; },
  get fx() { return { parts: fx.parts, floaters: fx.floaters, rings: fx.rings, shake: fx.shake, hitStop: fx.hitStop, ambient, spawners, combo, comboTimer }; },
  get run() { return { onRun, runDeepest, runSnapshot, lastRunResult, shards: getShards() }; },
  ui,
  metaUi,
  menu,
  debug,
  debugApi,
  input,
  touch,
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
  requestAnimationFrame(frame);
}

function update(dt) {
  const { w, h } = viewSize();

  // Title screen — the menu handles its own input during render().
  if (scene === "menu") {
    menu.t += dt;
    return;
  }

  const level = scene === "dungeon" ? dungeon : world;

  // Debug menu (backtick) — pauses everything while open.
  if (input.consumePress("`")) {
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
    if (ui.isOpen()) ui.close();
    else ui.openInventory();
  }
  if (input.consumePress("escape")) {
    if (ui.isOpen() || metaUi.isOpen()) {
      ui.close();
      metaUi.close();
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
    nearTownShop = null;
    for (const t of world.towns) {
      if (!player.dead && dist(player.x, player.y, t.shop.x, t.shop.y) < 78) {
        nearTownShop = t;
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
  } else {
    nearShop = nearElder = nearQuartermaster = false;
    nearTownShop = null;
    nearDungeon = hoverDungeon = null;
    // Dungeon interactables — chest in a treasure room, fountain in a heal room.
    const droom = dungeon.currentRoom;
    const dit = dungeon.interior;
    nearChest = droom.type === "treasure" && !droom.looted && !player.dead && dist(player.x, player.y, dit.cx, dit.cy) < 80;
    nearFountain = droom.type === "heal" && !droom.drained && !player.dead && dist(player.x, player.y, dit.cx, dit.cy) < 80;
  }

  // Is there anything E would act on right now? Drives the touch E button's visibility.
  const nearPortal = scene === "dungeon" && !player.dead && portals.some((pp) => pp.room === dungeon.currentRoom && dist(player.x, player.y, pp.x, pp.y) < player.r + pp.r);
  input.canInteract = !!(nearChest || nearFountain || nearPortal || nearElder || nearShop || nearTownShop || nearQuartermaster || nearDungeon);
  // Recall-to-camp is an overworld convenience (not from a dungeon dive) and pointless
  // when you're already in the camp safe zone — gates the touch CAMP button.
  input.canRecall = scene === "overworld" && !player.dead && !world.inZone(world.safeZone, player.x, player.y);

  // Context action (E): shop / elder / quartermaster / enter dungeon / portals.
  if (input.consumePress("e")) {
    if (metaUi.isOpen()) metaUi.close();
    else if (ui.isOpen() && ui.mode === "shop") ui.close();
    else if (scene === "dungeon") {
      const p = portals.find((pp) => pp.room === dungeon.currentRoom && dist(player.x, player.y, pp.x, pp.y) < player.r + pp.r);
      if (p) {
        if (p.label === "Descend") descendDungeon();
        else exitDungeon();
      } else if (nearChest) openChest();
      else if (nearFountain) useFountain();
    } else if (nearElder) decodeRelics();
    else if (nearShop) ui.openShop(shopStock, "Camp shop");
    else if (nearTownShop) ui.openShop(nearTownShop.stock, `${nearTownShop.name} — tier ${nearTownShop.tier} shop`);
    else if (nearQuartermaster) metaUi.openMeta();
    else if (nearDungeon) enterDungeon(nearDungeon.tierIndex + 1);
  }

  if (ui.isOpen() || metaUi.isOpen()) {
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
  if (victory) {
    if (victoryHold > 0) victoryHold -= dt;
    else if (input.consumeClick() || input.isDown("r", "enter", " ", "e")) finishVictory();
    return;
  }

  if (player.dead) {
    recallTimer = 0; // don't leak a recall bar onto the death screen
    if (input.consumeClick() || input.isDown("r", "enter", " ")) {
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
    const pr = makeProjectile(player.x, player.y, s.angle, s.speed, s.damage, s.magic ? "#9fd8ff" : "#ffe2a8", s.homing, s.r, "player");
    pr.chill = s.chill || 0;
    pr.knockback = s.knockback || 80;
    projectiles.push(pr);
    player.pendingShot = null;
  }

  // Melee + contact-dash hits -> shared juice (ranged hits route the same way
  // from updateProjectiles).
  const hits = player.resolveAttack(enemies);
  if (player.contactHits.length) hits.push(...player.contactHits);
  spawnHitFx(hits);

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
  addToast("The chest yields its treasure!", "#ffd166");
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
  input.touchUi = scene === "menu" || ui.isOpen() || metaUi.isOpen() || debug.isOpen() || (player && player.dead) || victory;

  // Title screen replaces the whole frame.
  const hintEl = document.getElementById("hint");
  if (scene === "menu") {
    if (hintEl) hintEl.style.display = "none";
    menu.render(ctx, w, h, input, menuApi);
    return;
  }
  if (hintEl) hintEl.style.display = "";

  // Per-frame state bundle for the HUD/overlay draws (hud.js).
  const view = { ctx, w, h, player, scene, dungeon, world, camera, touch, pickups, projectiles, portals, kills, mapMode, banner, toasts, itemPickups, combo, comboTimer, spawners, ambient, input, onRun, runDeepest, fxClock, victory, recallTimer, recallHold: RECALL_HOLD };

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

  drawHud(view);
  drawBanner(view);
  drawToasts(view);
  drawItemPickups(view);
  drawDamageIndicator(view);
  drawCombo(view);

  if (scene === "dungeon") {
    drawBossBar(view);
    drawRoomMap(view);
    const onPortal = portals.some((p) => p.room === dungeon.currentRoom && dist(player.x, player.y, p.x, p.y) < player.r + p.r);
    if (onPortal && !ui.isOpen()) drawPrompt(view, "Press E to leave", "#bff0ff");
    else if (nearChest && !ui.isOpen()) drawPrompt(view, "Press E to open the chest", "#ffd166");
    else if (nearFountain && !ui.isOpen()) drawPrompt(view, "Press E to drink — heal up", "#7CFC9B");
  } else {
    drawWaypoints(view); // touch wayfinder arrows to camp + towns (gated to touch devices)
    if (!ui.isOpen() && !metaUi.isOpen()) {
      if (nearElder) drawPrompt(view, "Press E — talk to the Elder", "#cdd5e2");
      else if (nearShop) drawPrompt(view, "Press E to shop", "#ffd166");
      else if (nearTownShop) drawPrompt(view, `Press E — shop at ${nearTownShop.name} (tier ${nearTownShop.tier})`, depthColor(nearTownShop.tier + 1));
      else if (nearQuartermaster) drawPrompt(view, "Press E — spend shards on upgrades", "#7fd2ff");
      else if (nearDungeon) drawPrompt(view, `Press E to enter — ${BIOMES[nearDungeon.biome].name} (Depth ${nearDungeon.tierIndex + 1})`, depthColor(nearDungeon.tierIndex + 1));
      if (hoverDungeon) drawEntranceTooltip(view, hoverDungeon);
      if (recallTimer > 0) drawRecall(view);
      if (mapMode !== "off") drawMap(ctx, mapMode, { world, player, enemies, camera, viewW: w, viewH: h });
    }
  }

  touch.draw(ctx, w, h); // on-screen sticks/buttons (self-gates: touch only, hidden under overlays)

  if (player.dead) drawGameOver(view);
  if (victory) drawVictory(view);
  if (ui.isOpen()) ui.render(ctx, w, h, player, input);
  if (metaUi.isOpen()) metaUi.render(ctx, w, h, player, input);
  if (debug.isOpen()) debug.render(ctx, w, h, player, input, debugApi);
}


requestAnimationFrame(frame);
