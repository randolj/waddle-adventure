import { Input } from "./input.js";
import { Camera } from "./camera.js";
import { World } from "./world.js";
import { Player } from "./player.js";
import { Enemy } from "./enemy.js";
import { Dungeon, DUNGEON_TIERS, tierColor } from "./dungeon.js";
import { drawMap } from "./minimap.js";
import { InventoryUI } from "./inventory.js";
import { DebugMenu } from "./debug.js";
import { rollShopStock, rollDropTemplate, makeItem, makeSealedRelic, decodeRelic, RARITIES } from "./items.js";
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
const camera = new Camera();
const ui = new InventoryUI();
const debug = new DebugMenu();

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
let scene = "overworld"; // "overworld" | "dungeon"
let dungeon = null;
let returnPos = null;
let portals = []; // exit/leave portals while in a dungeon
let mapMode = "off";
let banner = null;
let prevSafe = true;
let nearShop = false;
let nearElder = false;
let nearDungeon = null;
let hoverDungeon = null;
// Juice: screen shake, hit-stop, impact particles, damage numbers, ambient motes.
let shake = 0;
let hitStop = 0;
let fxParts, floaters, ambient, ambientTimer, fxClock, prevHp;
let rings, spawners, footTimer;
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
resize();

function viewSize() {
  return { w: canvas.width / dpr, h: canvas.height / dpr };
}

function reset() {
  world = new World(WORLD_W, WORLD_H);
  player = new Player(WORLD_W / 2, WORLD_H / 2);
  enemies = [];
  pickups = [];
  toasts = [];
  projectiles = [];
  shopStock = rollShopStock(6);
  spawnTimer = 0.8;
  kills = 0;
  banner = null;
  prevSafe = true;
  scene = "overworld";
  dungeon = null;
  portals = [];
  returnPos = null;
  shake = 0;
  hitStop = 0;
  fxParts = [];
  floaters = [];
  ambient = [];
  rings = [];
  spawners = [];
  footTimer = 0;
  ambientTimer = 0;
  fxClock = 0;
  prevHp = player.hp;
  combo = 0;
  comboTimer = 0;
  wasAttacking = false;
  wasDashing = false;
  ui.close();
}

function addRing(x, y, r0, r1, life, color, width) {
  rings.push({ x, y, r0, r1, life, maxLife: life, color, width: width || 3 });
}

// --- Juice helpers ---
function addShake(mag) {
  shake = Math.min(16, Math.max(shake, mag));
}
function addFloater(x, y, text, color, size) {
  floaters.push({ x: x + (Math.random() - 0.5) * 14, y, text, color, size, life: 0.8, maxLife: 0.8, vy: -46 });
}
function spawnBurst(x, y, n, color, speed, size, life) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.4 + Math.random() * 0.8);
    fxParts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * (0.6 + Math.random() * 0.6), maxLife: life, size: size * (0.6 + Math.random() * 0.7), color });
  }
}

function updateFx(dt) {
  for (const p of fxParts) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.pow(0.02, dt);
    p.vy *= Math.pow(0.02, dt);
    p.life -= dt;
  }
  fxParts = fxParts.filter((p) => p.life > 0);
  for (const f of floaters) {
    f.y += f.vy * dt;
    f.vy *= Math.pow(0.2, dt);
    f.life -= dt;
  }
  floaters = floaters.filter((f) => f.life > 0);
  for (const r of rings) r.life -= dt;
  rings = rings.filter((r) => r.life > 0);
}

// Wild spawns: telegraph a marker, then spawn the creature after a delay.
function updateSpawners(dt) {
  for (const s of spawners) {
    s.t -= dt;
    if (s.t <= 0) {
      const e = new Enemy(s.x, s.y, s.type);
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
}

// --- Loot (overworld kills) ---
function dropLoot(x, y) {
  pickups.push({ kind: "coin", x, y, amount: 2 + Math.floor(Math.random() * 4), t: 0 });
  if (Math.random() < ITEM_DROP_CHANCE) {
    const item = makeItem(rollDropTemplate());
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
        addToast(`+ ${p.item.name}`, RARITIES[p.item.rarity].color);
        sfx.item();
      }
      p.collected = true;
    }
  }
  pickups = pickups.filter((p) => !p.collected);
}

// --- Enemy projectiles ---
function updateProjectiles(dt, level) {
  for (const p of projectiles) {
    if (p.homing && !player.dead) {
      const want = Math.atan2(player.y - p.y, player.x - p.x);
      const cur = Math.atan2(p.vy, p.vx);
      const sp = Math.hypot(p.vx, p.vy);
      const na = cur + clamp(angleDiff(want, cur), -2.6 * dt, 2.6 * dt);
      p.vx = Math.cos(na) * sp;
      p.vy = Math.sin(na) * sp;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (!player.dead && dist(p.x, p.y, player.x, player.y) < p.r + player.r) {
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
function enterDungeon(tierIndex) {
  returnPos = { x: player.x, y: player.y };
  dungeon = new Dungeon(tierIndex);
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
  banner = { text: `${dungeon.biome.name} — Tier ${dungeon.cfg.tier}`, t: 2.8, safe: false };
  sfx.enterDungeon();
}

function exitDungeon() {
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
}

function completeDungeon() {
  const reward = dungeon.cfg.reward;
  const coins = reward.coins[0] + Math.floor(Math.random() * (reward.coins[1] - reward.coins[0] + 1));
  player.coins += coins;
  addToast(`Dungeon cleared!  +${coins} coins`, "#ffd166");
  for (let i = 0; i < (reward.items || 0); i++) {
    const item = makeItem(rollDropTemplate());
    player.addItem(item);
    addToast(`+ ${item.name}`, RARITIES[item.rarity].color);
  }
  if (reward.relic) {
    player.addItem(makeSealedRelic());
    addToast("+ Sealed Relic — decode at the Elder", "#ef9f27");
  }
  const it = dungeon.interior;
  portals.push({ x: it.cx, y: it.cy - 170, r: 30, label: "Exit", room: dungeon.currentRoom });
}

function decodeRelics() {
  const relics = player.inventory.filter((it) => it.slot === "relic");
  if (relics.length === 0) {
    addToast('The Elder: "Bring me a sealed relic."', "#cdd5e2");
    return;
  }
  for (const r of relics) {
    player.removeItem(r);
    const legend = decodeRelic();
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
  const e = new Enemy(x, y, type);
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
    for (const s of ["weapon", "cloak", "trinket"]) player.unequip(s);
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
  enterDungeon: (i) => enterDungeon(i),
  toCamp: () => {
    if (scene === "dungeon") exitDungeon();
    player.x = WORLD_W / 2;
    player.y = WORLD_H / 2;
    player.vx = player.vy = player.ix = player.iy = 0;
  },
};

reset();

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
  get fx() { return { fxParts, floaters, ambient, rings, spawners, shake, hitStop, combo, comboTimer }; },
  ui,
  debug,
  debugApi,
  input,
  enterDungeon,
  exitDungeon,
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
    camera.follow(player, w, h, level.width, level.height);
    return;
  }

  // Inventory toggle (works in both scenes).
  if (input.consumePress("i")) {
    if (ui.isOpen()) ui.close();
    else ui.openInventory();
  }
  if (input.consumePress("escape")) ui.close();

  if (scene === "overworld") {
    nearShop = !player.dead && dist(player.x, player.y, world.shop.x, world.shop.y) < 78;
    nearElder = !player.dead && dist(player.x, player.y, world.elder.x, world.elder.y) < 72;
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
    nearShop = nearElder = false;
    nearDungeon = hoverDungeon = null;
  }

  // Context action (E): shop / elder / enter dungeon / portals.
  if (input.consumePress("e")) {
    if (ui.isOpen() && ui.mode === "shop") ui.close();
    else if (scene === "dungeon") {
      const p = portals.find((pp) => pp.room === dungeon.currentRoom && dist(player.x, player.y, pp.x, pp.y) < player.r + pp.r);
      if (p) exitDungeon();
    } else if (nearElder) decodeRelics();
    else if (nearShop) ui.openShop(shopStock);
    else if (nearDungeon) enterDungeon(nearDungeon.tierIndex);
  }

  if (ui.isOpen()) {
    camera.follow(player, w, h, level.width, level.height);
    return;
  }

  // Map (overworld only) — full map pauses.
  if (scene === "overworld") {
    if (input.consumePress("m")) mapMode = MAP_MODES[(MAP_MODES.indexOf(mapMode) + 1) % MAP_MODES.length];
    if (mapMode === "full") {
      camera.follow(player, w, h, world.width, world.height);
      return;
    }
  }

  if (player.dead) {
    if (input.consumeClick() || input.isDown("r", "enter", " ")) reset();
    return;
  }

  const worldMouse = camera.toWorld(input.mouseX, input.mouseY);
  const gdt = hitStop > 0 ? 0 : dt; // hit-stop freezes the sim for a few frames
  if (hitStop > 0) hitStop -= dt;

  player.update(gdt, input, level, worldMouse, enemies);

  // Attack / dash start -> sounds + a dash whoosh ring + dust.
  if (player.isAttacking && !wasAttacking) (player.isDashStrike ? sfx.dashStrike() : sfx.swing());
  if (player.isDashing && !wasDashing) {
    if (player.chainDash) sfx.chain();
    else sfx.dash();
    spawnBurst(player.x - player.dashX * player.r, player.y - player.dashY * player.r, 6, "#dfe7f0", 150, 3, 0.35);
    addRing(player.x, player.y, player.r * 0.6, player.r * 2.4, 0.3, player.chainDash ? "#9fe3ff" : "#cfe0f0", 3);
  }
  wasAttacking = player.isAttacking;
  wasDashing = player.isDashing;

  // Attack hits -> damage numbers, sparks, combo, shake, hit-stop.
  const hits = player.resolveAttack(enemies);
  for (const ht of hits) {
    addFloater(ht.x, ht.y - ht.r, ht.crit ? `${ht.damage}!` : `${ht.damage}`, ht.crit ? "#ffd166" : "#ffffff", ht.crit ? 22 : 15);
    spawnBurst(ht.x, ht.y, ht.crit ? 10 : 6, ht.crit ? "#ffd166" : "#ffe9a8", 240, ht.crit ? 3.5 : 2.6, 0.32);
  }
  if (hits.length) {
    combo += hits.length;
    comboTimer = 2.6;
    sfx.hit(hits.some((h) => h.crit));
    // Signature: frost weapons leave an icy burst on hit.
    const wid = player.equipped.weapon && player.equipped.weapon.id;
    if (wid === "frostfang" || wid === "glacier_edge") {
      for (const ht of hits) spawnBurst(ht.x, ht.y, 8, "#bfe8ff", 220, 3, 0.4);
    }
    const big = hits.some((h) => h.dashStrike || h.crit);
    addShake(big ? 7 : 3);
    hitStop = Math.max(hitStop, big ? 0.06 : 0.03);
  }

  for (const e of enemies) e.update(gdt, player, level, projectiles);
  updateProjectiles(gdt, level);

  // Player damage feedback.
  if (player.hp < prevHp - 0.5 && !player.healing) {
    const dmg = Math.round(prevHp - player.hp);
    addFloater(player.x, player.y - player.r, `-${dmg}`, "#ff6b6b", 16);
    addShake(4 + Math.min(8, dmg * 0.25));
    hitStop = Math.max(hitStop, 0.04);
    spawnBurst(player.x, player.y, 5, "#ff8a8a", 180, 3, 0.3);
    sfx.hurt();
    combo = 0; // taking damage breaks the combo
  }

  if (scene === "dungeon") {
    for (const e of enemies) if (e.dead) onEnemyDeath(e);
    enemies = enemies.filter((e) => !e.dead);
    const roomBefore = dungeon.currentRoom;
    const wasComplete = dungeon.complete;
    dungeon.tick(player, enemies);
    if (dungeon.currentRoom !== roomBefore) {
      projectiles.length = 0;
      pickups.length = 0;
    }
    if (dungeon.complete && !wasComplete) completeDungeon();
    handleTreasure();
    updatePickups(dt);
    player.healing = false;
  } else {
    const before = enemies.length;
    for (const e of enemies) {
      if (e.dead) {
        dropLoot(e.x, e.y);
        onEnemyDeath(e);
      }
    }
    enemies = enemies.filter((e) => !e.dead);
    kills += before - enemies.length;
    updatePickups(dt);

    const inSafe = world.inSafeZone(player.x, player.y);
    if (inSafe !== prevSafe) {
      banner = inSafe
        ? { text: "Camp — safe haven", t: 2.4, safe: true }
        : { text: "Leaving camp — creatures ahead", t: 2.4, safe: false };
      prevSafe = inSafe;
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
  shake = Math.max(0, shake - 50 * dt);
  updateFx(dt);
  updateAmbient(dt, w, h);
  camera.follow(player, w, h, level.width, level.height, dt, Math.cos(player.facing), Math.sin(player.facing));
}

function handleTreasure() {
  const room = dungeon.currentRoom;
  if (room.type !== "treasure" || room.looted) return;
  room.looted = true;
  const it = dungeon.interior;
  pickups.push({ kind: "item", x: it.cx, y: it.cy - 30, item: makeItem(rollDropTemplate()), t: 0 });
  pickups.push({ kind: "coin", x: it.cx - 44, y: it.cy + 20, amount: 20 + Math.floor(Math.random() * 30), t: 0 });
  pickups.push({ kind: "coin", x: it.cx + 44, y: it.cy + 20, amount: 20 + Math.floor(Math.random() * 30), t: 0 });
  addToast("Treasure room!", "#ffd166");
}

function onEnemyDeath(e) {
  spawnBurst(e.x, e.y, e.isBoss ? 30 : 10, e.color, e.isBoss ? 360 : 240, e.isBoss ? 5 : 3.4, e.isBoss ? 0.7 : 0.45);
  spawnBurst(e.x, e.y, 6, "#ffffff", 200, 2.4, 0.3);
  addShake(e.isBoss ? 13 : 3);
  hitStop = Math.max(hitStop, e.isBoss ? 0.12 : 0.03);
  sfx.kill(e.isBoss);
}

function render() {
  const { w, h } = viewSize();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const shx = shake > 0.2 ? (Math.random() * 2 - 1) * shake : 0;
  const shy = shake > 0.2 ? (Math.random() * 2 - 1) * shake : 0;
  ctx.save();
  ctx.translate(-camera.x + shx, -camera.y + shy);
  if (scene === "dungeon") {
    dungeon.draw(ctx, camera, w, h);
    drawPortals();
  } else {
    world.draw(ctx, camera, w, h);
    drawPickups();
    drawSpawners();
  }
  drawAmbient();
  const drawables = [player, ...enemies].sort((a, b) => a.y - b.y);
  for (const d of drawables) d.draw(ctx);
  drawProjectiles();
  drawChainTarget();
  drawFx();
  drawRings();
  ctx.restore();

  ctx.fillStyle = grainPattern;
  ctx.fillRect(0, 0, w, h);
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.4, w / 2, h / 2, Math.max(w, h) * 0.75);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, scene === "dungeon" ? "rgba(6,6,12,0.55)" : "rgba(12,10,18,0.3)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);

  drawLowHpVignette(w, h);

  drawHud(w, h);
  drawBanner(w);
  drawToasts(w, h);
  drawDamageIndicator(w, h);
  drawCombo(w, h);

  if (scene === "dungeon") {
    drawBossBar(w);
    drawRoomMap(w);
    const onPortal = portals.some((p) => p.room === dungeon.currentRoom && dist(player.x, player.y, p.x, p.y) < player.r + p.r);
    if (onPortal && !ui.isOpen()) drawPrompt("Press E to leave", w, h, "#bff0ff");
  } else {
    if (!ui.isOpen()) {
      if (nearElder) drawPrompt("Press E — talk to the Elder", w, h, "#cdd5e2");
      else if (nearShop) drawPrompt("Press E to shop", w, h, "#ffd166");
      else if (nearDungeon) drawPrompt(`Press E to enter — ${BIOMES[nearDungeon.biome].name} (T${nearDungeon.tierIndex + 1})`, w, h, tierColor(nearDungeon.tierIndex + 1));
      if (hoverDungeon) drawEntranceTooltip(hoverDungeon, w, h);
      if (mapMode !== "off") drawMap(ctx, mapMode, { world, player, enemies, camera, viewW: w, viewH: h });
    }
  }

  if (player.dead) drawGameOver(w, h);
  if (ui.isOpen()) ui.render(ctx, w, h, player, input);
  if (debug.isOpen()) debug.render(ctx, w, h, player, input, debugApi);
}

function drawProjectiles() {
  for (const p of projectiles) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(0, 0, p.r + 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = p.color;
    ctx.strokeStyle = "#14110e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.beginPath();
    ctx.arc(-p.r * 0.3, -p.r * 0.3, p.r * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawAmbient() {
  for (const p of ambient) {
    const a = Math.min(1, p.life / 1.2) * Math.min(1, (p.maxLife - p.life) / 0.5 + 0.3);
    ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawFx() {
  for (const p of fxParts) {
    const a = Math.min(1, p.life / p.maxLife);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (0.4 + a * 0.6), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const f of floaters) {
    const a = Math.min(1, f.life / 0.4);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = `700 ${f.size}px -apple-system, sans-serif`;
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(10,8,16,0.8)";
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
    ctx.restore();
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

function drawLowHpVignette(w, h) {
  const frac = player.hp / player.maxHp;
  if (player.dead || frac > 0.3) return;
  const intensity = (0.3 - frac) / 0.3; // 0..1
  const pulse = 0.55 + 0.45 * Math.sin(fxClock * 5);
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, `rgba(180,20,30,${0.18 + intensity * 0.4 * pulse})`);
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
}

function drawSpawners() {
  for (const s of spawners) {
    const p = 1 - s.t / 0.6;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.globalAlpha = 0.35 + 0.4 * Math.abs(Math.sin(fxClock * 12));
    ctx.strokeStyle = "#e24b4a";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, 6 + p * 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = "#e24b4a";
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawRings() {
  for (const r of rings) {
    const t = 1 - r.life / r.maxLife;
    const rad = r.r0 + (r.r1 - r.r0) * t;
    ctx.save();
    ctx.globalAlpha = (r.life / r.maxLife) * 0.7;
    ctx.strokeStyle = r.color;
    ctx.lineWidth = r.width * (1 - t * 0.6);
    ctx.beginPath();
    ctx.arc(r.x, r.y, rad, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawChainTarget() {
  if (player.chainWindow <= 0 || !player.chainTarget || player.chainTarget.dead) return;
  const e = player.chainTarget;
  const pulse = 0.6 + 0.4 * Math.sin(fxClock * 10);
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.strokeStyle = `rgba(127,227,255,${0.55 + 0.35 * pulse})`;
  ctx.lineWidth = 2.5;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.arc(0, 0, e.r + 9 + pulse * 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawDamageIndicator(w, h) {
  if (player.hurtTimer <= 0) return;
  const a = Math.min(1, player.hurtTimer) * 0.8;
  const ang = player.hurtDir;
  const rx = Math.min(w, h) * 0.42;
  ctx.save();
  ctx.translate(w / 2 + Math.cos(ang) * rx, h / 2 + Math.sin(ang) * rx);
  ctx.rotate(ang);
  ctx.globalAlpha = a;
  ctx.fillStyle = "#ff4d4d";
  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.lineTo(-10, -14);
  ctx.lineTo(-10, 14);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawCombo(w) {
  if (combo < 2) return;
  const x = w / 2;
  const y = 132;
  const tier = combo >= 15 ? "#ff5d5d" : combo >= 8 ? "#ff9a3a" : combo >= 4 ? "#ffd166" : "#e9eef6";
  const scale = 1 + Math.min(0.5, combo * 0.02);
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${Math.round(22 * scale)}px -apple-system, sans-serif`;
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(10,8,16,0.7)";
  ctx.strokeText(`${combo}× COMBO`, x, y);
  ctx.fillStyle = tier;
  ctx.fillText(`${combo}× COMBO`, x, y);
  const bw = 96;
  const frac = Math.max(0, comboTimer / 2.6);
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  roundRect(ctx, x - bw / 2, y + 16, bw, 5, 2);
  ctx.fill();
  ctx.fillStyle = tier;
  roundRect(ctx, x - bw / 2, y + 16, bw * frac, 5, 2);
  ctx.fill();
  ctx.restore();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

function drawPortals() {
  for (const p of portals) {
    if (scene === "dungeon" && p.room && p.room !== dungeon.currentRoom) continue;
    ctx.save();
    ctx.translate(p.x, p.y);
    const pulse = 0.5 + 0.5 * Math.sin(player.scarfWave);
    ctx.fillStyle = "rgba(120,220,255,0.22)";
    ctx.beginPath();
    ctx.arc(0, 0, p.r + pulse * 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#7fe3ff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, p.r * 0.66, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#bff0ff";
    ctx.font = "700 11px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(p.label, 0, -p.r - 8);
    ctx.textAlign = "left";
    ctx.restore();
  }
}

function drawPickups() {
  for (const p of pickups) {
    const bob = Math.sin(p.t * 4) * 3;
    ctx.save();
    ctx.translate(p.x, p.y + bob);
    ctx.fillStyle = "rgba(20,24,34,0.18)";
    ctx.beginPath();
    ctx.ellipse(0, 8 - bob, 9, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    if (p.kind === "coin") {
      ctx.fillStyle = "#f4c531";
      ctx.strokeStyle = "#9a6e12";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ffe27a";
      ctx.beginPath();
      ctx.arc(-2, -2, 2.4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const col = RARITIES[p.item.rarity].color;
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = col;
      ctx.strokeStyle = "#14110e";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -9);
      ctx.lineTo(8, 0);
      ctx.lineTo(0, 10);
      ctx.lineTo(-8, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawPrompt(text, w, h, color) {
  ctx.textAlign = "center";
  ctx.font = "600 16px -apple-system, sans-serif";
  const tw = ctx.measureText(text).width;
  ctx.fillStyle = "rgba(10,12,20,0.7)";
  roundRect(ctx, w / 2 - tw / 2 - 16, h - 92, tw + 32, 34, 8);
  ctx.fill();
  ctx.fillStyle = color || "#ffd166";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h - 74);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

function drawEntranceTooltip(dg, w, h) {
  const cfg = DUNGEON_TIERS[dg.tierIndex];
  const biome = BIOMES[dg.biome];
  const col = tierColor(cfg.tier);
  const lines = [
    [`${biome.name}`, col, "700 15px"],
    [`Tier ${cfg.tier}  ·  ${cfg.roomCount} rooms + boss (${biome.boss.name})`, "#cdd5e2", "500 12px"],
    [`Enemies:  HP ×${cfg.hpMult.toFixed(1)}   DMG ×${cfg.dmgMult.toFixed(1)}`, "#ff9a9a", "600 12px"],
    [`Reward:  ${cfg.reward.coins[0]}–${cfg.reward.coins[1]} coins, ${cfg.reward.items} item(s)${cfg.reward.relic ? " + Relic" : ""}`, "#9be29a", "600 12px"],
  ];
  let bw = 0;
  for (const [t, , f] of lines) {
    ctx.font = `${f} -apple-system, sans-serif`;
    bw = Math.max(bw, ctx.measureText(t).width);
  }
  bw += 24;
  const bh = 18 + lines.length * 19;
  let bx = input.mouseX + 18;
  let by = input.mouseY + 18;
  if (bx + bw > w - 8) bx = input.mouseX - bw - 18;
  if (by + bh > h - 8) by = h - bh - 8;
  roundRect(ctx, bx, by, bw, bh, 8);
  ctx.fillStyle = "rgba(12,16,26,0.97)";
  ctx.fill();
  ctx.strokeStyle = col;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  let ly = by + 22;
  for (const [t, c, f] of lines) {
    ctx.fillStyle = c;
    ctx.font = `${f} -apple-system, sans-serif`;
    ctx.fillText(t, bx + 12, ly);
    ly += 19;
  }
}

function drawBossBar(w) {
  const b = dungeon && dungeon.boss;
  if (!b || b.dead) return;
  const bw = Math.min(460, w * 0.6);
  const bh = 16;
  const x = (w - bw) / 2;
  const y = 22;
  ctx.fillStyle = "rgba(10,12,20,0.62)";
  roundRect(ctx, x - 6, y - 22, bw + 12, bh + 30, 8);
  ctx.fill();
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffd166";
  ctx.font = "700 13px -apple-system, sans-serif";
  ctx.fillText(`${(b.name || "Guardian").toUpperCase()} — Tier ${dungeon.cfg.tier}`, w / 2, y - 7);
  ctx.fillStyle = "#3a2630";
  roundRect(ctx, x, y, bw, bh, 4);
  ctx.fill();
  ctx.fillStyle = "#e24b4a";
  roundRect(ctx, x, y, bw * (b.hp / b.maxHp), bh, 4);
  ctx.fill();
  ctx.textAlign = "left";
}

// Mini room grid (top-right) showing discovered dungeon rooms.
function drawRoomMap(w) {
  const rooms = dungeon.rooms;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const r of rooms) {
    if (!r.seen) continue;
    minX = Math.min(minX, r.gx);
    maxX = Math.max(maxX, r.gx);
    minY = Math.min(minY, r.gy);
    maxY = Math.max(maxY, r.gy);
  }
  if (!isFinite(minX)) return;
  const cell = 16;
  const gap = 3;
  const cols = maxX - minX + 1;
  const rowsN = maxY - minY + 1;
  const panelW = cols * (cell + gap) + gap;
  const panelH = rowsN * (cell + gap) + gap;
  const px = w - panelW - 16;
  const py = 64;
  ctx.fillStyle = "rgba(12,16,26,0.6)";
  roundRect(ctx, px - 6, py - 6, panelW + 12, panelH + 12, 8);
  ctx.fill();
  for (const r of rooms) {
    if (!r.seen) continue;
    const cx = px + (r.gx - minX) * (cell + gap) + gap;
    const cy = py + (r.gy - minY) * (cell + gap) + gap;
    let col;
    if (r === dungeon.currentRoom) col = "#ffd166";
    else if (r.type === "boss") col = r.cleared ? "#7a5a5a" : "#e24b4a";
    else if (r.type === "treasure") col = "#e0b84a";
    else if (r.type === "start") col = "#7fe3ff";
    else col = r.cleared ? "#5db85d" : "#6a7080";
    ctx.fillStyle = col;
    roundRect(ctx, cx, cy, cell, cell, 3);
    ctx.fill();
    if (r === dungeon.currentRoom) {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      roundRect(ctx, cx, cy, cell, cell, 3);
      ctx.stroke();
    }
    const mark = r.type === "boss" ? "B" : r.type === "treasure" ? "$" : "";
    if (mark) {
      ctx.fillStyle = "#1a1620";
      ctx.font = "700 9px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(mark, cx + cell / 2, cy + cell / 2 + 1);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }
  }
}

function drawToasts(w, h) {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  toasts.forEach((t, i) => {
    const y = h * 0.38 - i * 28;
    const alpha = Math.min(1, t.t / 0.6);
    ctx.globalAlpha = alpha;
    ctx.font = "600 16px -apple-system, sans-serif";
    const tw = ctx.measureText(t.text).width;
    ctx.fillStyle = "rgba(10,12,20,0.6)";
    roundRect(ctx, w / 2 - tw / 2 - 12, y - 13, tw + 24, 26, 6);
    ctx.fill();
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, w / 2, y + 1);
    ctx.globalAlpha = 1;
  });
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

function drawBanner(w) {
  if (!banner) return;
  const alpha = Math.min(1, banner.t / 0.5);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = "center";
  ctx.font = "600 22px -apple-system, sans-serif";
  const tw = ctx.measureText(banner.text).width;
  ctx.fillStyle = "rgba(10,12,20,0.6)";
  roundRect(ctx, w / 2 - tw / 2 - 18, 64, tw + 36, 40, 8);
  ctx.fill();
  ctx.fillStyle = banner.safe ? "#9be29a" : "#ffd166";
  ctx.textBaseline = "middle";
  ctx.fillText(banner.text, w / 2, 85);
  ctx.restore();
  ctx.textAlign = "left";
}

function drawHud(w) {
  const bw = 240;
  const bh = 18;
  const x = 20;
  const y = 20;
  ctx.fillStyle = "rgba(10,16,32,0.55)";
  roundRect(ctx, x - 4, y - 4, bw + 8, bh + 8, 6);
  ctx.fill();
  ctx.fillStyle = "#3a4256";
  roundRect(ctx, x, y, bw, bh, 4);
  ctx.fill();
  const frac = player.hp / player.maxHp;
  ctx.fillStyle = frac > 0.3 ? "#ff5d73" : "#ff2e4d";
  roundRect(ctx, x, y, bw * frac, bh, 4);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "600 12px -apple-system, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText(`${Math.ceil(player.hp)} / ${player.maxHp}`, x + 8, y + bh / 2 + 1);

  if (player.healing) {
    ctx.fillStyle = "#7CFC9B";
    ctx.font = "700 12px -apple-system, sans-serif";
    ctx.fillText("✚ healing", x + bw + 12, y + bh / 2 + 1);
  }

  const dw = bw;
  const dh = 7;
  const dy = y + bh + 8;
  if (player.stats.dashEnabled) {
    ctx.fillStyle = "#2b3550";
    roundRect(ctx, x, dy, dw, dh, 3);
    ctx.fill();
    const charge = player.dashCharge;
    ctx.fillStyle = charge >= 1 ? "#5be3ff" : "rgba(91,227,255,0.5)";
    roundRect(ctx, x, dy, dw * charge, dh, 3);
    ctx.fill();
    ctx.fillStyle = charge >= 1 ? "#bdeeff" : "#7d8aa6";
    ctx.font = "700 10px -apple-system, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText("DASH", x + dw + 8, dy + dh / 2 + 1);
  }

  ctx.textBaseline = "alphabetic";
  if (scene === "dungeon") {
    const cleared = dungeon.rooms.filter((r) => r.cleared && r.type !== "start").length;
    const total = dungeon.rooms.filter((r) => r.type !== "start").length;
    ctx.font = "700 11px -apple-system, sans-serif";
    ctx.fillStyle = tierColor(dungeon.cfg.tier);
    ctx.fillText(`${dungeon.biome.name.toUpperCase()} T${dungeon.cfg.tier}  ·  ROOMS ${cleared}/${total}`, x, dy + dh + 16);
  } else {
    const inSafe = world.inSafeZone(player.x, player.y);
    ctx.font = "700 11px -apple-system, sans-serif";
    ctx.fillStyle = inSafe ? "#6fb46f" : "#c08a3a";
    ctx.fillText(inSafe ? "CAMP" : "WILDS", x, dy + dh + 16);
    ctx.fillStyle = "#7d8aa6";
    ctx.font = "600 11px -apple-system, sans-serif";
    ctx.fillText(`M: map (${mapMode})`, x + 70, dy + dh + 16);
  }

  ctx.textAlign = "right";
  ctx.font = "700 16px -apple-system, sans-serif";
  ctx.fillStyle = "#1b2236";
  ctx.fillText(`Slain: ${kills}`, w - 20, 30);
  ctx.fillStyle = "#caa12a";
  ctx.fillText(`◉ ${player.coins}`, w - 20, 52);
  if (player.godMode) {
    ctx.fillStyle = "#7CFC9B";
    ctx.font = "700 12px -apple-system, sans-serif";
    ctx.fillText("GOD", w - 20, 70);
  }
  ctx.textAlign = "left";
}

function drawGameOver(w, h) {
  ctx.fillStyle = "rgba(8, 12, 24, 0.6)";
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = "center";
  ctx.fillStyle = "#fff";
  ctx.font = "700 48px -apple-system, sans-serif";
  ctx.fillText("The penguin has fallen", w / 2, h / 2 - 20);
  ctx.font = "500 20px -apple-system, sans-serif";
  ctx.fillStyle = "#cdd7ee";
  ctx.fillText(`Creatures slain: ${kills}  —  click or press R to try again`, w / 2, h / 2 + 24);
  ctx.textAlign = "left";
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

requestAnimationFrame(frame);
