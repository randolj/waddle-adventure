import { Enemy } from "./enemy.js";
import { dist, valueNoise, mulberry32, roundRect } from "./utils.js";
import { BIOMES, BIOME_IDS } from "./biomes.js";

// The campaign goal: reach this depth and slay the boss waiting there (the Heart
// of Winter) to win. Depth stays open-ended past it for endless play.
export const FINAL_DEPTH = 10;

// Difficulty is driven by a single endless "depth" number. Each level scales
// enemy HP + damage (and room count + rewards) — you can always go deeper.
export function dungeonConfig(depth) {
  const relic = depth >= 5 ? true : Math.random() < Math.max(0, (depth - 2) * 0.1);
  return {
    depth,
    hpMult: 0.8 * Math.pow(1.24, depth - 1),
    dmgMult: 0.8 * Math.pow(1.16, depth - 1),
    roomCount: Math.min(11, 3 + Math.floor(depth * 0.7)),
    enemyBase: Math.min(8, 3 + Math.floor(depth * 0.4)),
    boss: { hp: 0.45 * Math.pow(1.3, depth - 1), dmg: 0.8 * Math.pow(1.16, depth - 1) },
    reward: {
      coins: [Math.round(14 * Math.pow(depth, 1.15)), Math.round(28 * Math.pow(depth, 1.15))],
      items: depth >= 4 ? 2 : 1,
      relic,
    },
  };
}

// Biome cycles by depth (so descending rotates the theme).
export function biomeForDepth(depth) {
  return BIOMES[BIOME_IDS[(depth - 1) % BIOME_IDS.length]];
}

// Color ramps with depth: common→legendary for the first 5, then an escalating
// "danger" ramp (gold → orange → red → magenta) so endless depths stay distinct.
const TIER_COLORS = ["#b0aea4", "#5db85d", "#3a8ade", "#9b6ff0", "#ef9f27"];
const DEEP_COLORS = ["#ef9f27", "#ff7a3c", "#ff5d5d", "#ff4f8b", "#e84bd6", "#c04bff"];
export function depthColor(depth) {
  if (depth <= TIER_COLORS.length) return TIER_COLORS[depth - 1];
  const i = Math.min(DEEP_COLORS.length - 1, depth - TIER_COLORS.length);
  return DEEP_COLORS[i];
}

const WALL = 32;
const DOOR_W = 140;
const IW = 860; // interior width
const IH = 620; // interior height
const FULL_W = IW + WALL * 2;
const FULL_H = IH + WALL * 2;
const L = WALL; // interior left
const R = WALL + IW; // interior right
const T = WALL; // interior top
const B = WALL + IH; // interior bottom
const CX = FULL_W / 2;
const CY = FULL_H / 2;

const DIRS = [
  { name: "N", dx: 0, dy: -1 },
  { name: "E", dx: 1, dy: 0 },
  { name: "S", dx: 0, dy: 1 },
  { name: "W", dx: -1, dy: 0 },
];
const OPP = { N: "S", S: "N", E: "W", W: "E" };

function resolveRect(x, y, r, rc) {
  const cx = Math.max(rc.x, Math.min(x, rc.x + rc.w));
  const cy = Math.max(rc.y, Math.min(y, rc.y + rc.h));
  const dx = x - cx;
  const dy = y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return { x, y };
  if (d2 === 0) {
    const left = x - rc.x;
    const right = rc.x + rc.w - x;
    const top = y - rc.y;
    const bot = rc.y + rc.h - y;
    const m = Math.min(left, right, top, bot);
    if (m === left) return { x: rc.x - r, y };
    if (m === right) return { x: rc.x + rc.w + r, y };
    if (m === top) return { x, y: rc.y - r };
    return { x, y: rc.y + rc.h + r };
  }
  const d = Math.sqrt(d2);
  const push = (r - d) / d;
  return { x: x + dx * push, y: y + dy * push };
}

// Push a circle (x,y,r) out of a circular obstacle.
function resolveCircle(x, y, r, o) {
  const dx = x - o.x;
  const dy = y - o.y;
  const d2 = dx * dx + dy * dy;
  const rr = r + o.r;
  if (d2 >= rr * rr) return { x, y };
  if (d2 === 0) return { x: o.x + rr, y }; // dead-center — eject along +x
  const d = Math.sqrt(d2);
  const push = (rr - d) / d;
  return { x: x + dx * push, y: y + dy * push };
}

export class Dungeon {
  constructor(depth) {
    this.depth = depth;
    this.cfg = dungeonConfig(depth);
    this.biome = biomeForDepth(depth);
    this.seed = 4000 + depth * 17;
    this.width = FULL_W;
    this.height = FULL_H;
    this.complete = false;
    this.boss = null;

    this.rooms = this.generate(this.cfg.roomCount);
    this.currentRoom = this.rooms[0];
    this.currentRoom.seen = true;
    this.buildCurrent();
  }

  generate(count) {
    const map = new Map();
    const key = (x, y) => x + "," + y;
    const newRoom = (gx, gy, type) => ({ gx, gy, type, doors: {}, spawned: false, cleared: type === "start", seen: false });

    const start = newRoom(0, 0, "start");
    map.set(key(0, 0), start);
    let guard = 0;
    while (map.size < count && guard++ < 500) {
      const arr = [...map.values()];
      const base = arr[Math.floor(Math.random() * arr.length)];
      const dir = DIRS[Math.floor(Math.random() * 4)];
      const nx = base.gx + dir.dx;
      const ny = base.gy + dir.dy;
      if (map.has(key(nx, ny))) continue;
      map.set(key(nx, ny), newRoom(nx, ny, "combat"));
    }

    // Doors from grid adjacency.
    for (const rm of map.values()) {
      for (const dir of DIRS) {
        rm.doors[dir.name] = map.get(key(rm.gx + dir.dx, rm.gy + dir.dy)) || null;
      }
    }

    // Boss = farthest room from start (BFS over doors).
    const distNum = new Map([[start, 0]]);
    const queue = [start];
    while (queue.length) {
      const cur = queue.shift();
      for (const dir of DIRS) {
        const nb = cur.doors[dir.name];
        if (nb && !distNum.has(nb)) {
          distNum.set(nb, distNum.get(cur) + 1);
          queue.push(nb);
        }
      }
    }
    let boss = start;
    let far = -1;
    for (const [room, d] of distNum) {
      if (room.type === "start") continue;
      if (d > far) {
        far = d;
        boss = room;
      }
    }
    if (boss !== start) boss.type = "boss";

    // A combat room becomes a treasure room — prefer a dead-end, else any combat
    // room (so even linear dungeons get one).
    const neighbours = (r) => DIRS.reduce((n, dir) => n + (r.doors[dir.name] ? 1 : 0), 0);
    const pickRoom = () => {
      const combats = [...map.values()].filter((r) => r.type === "combat");
      return combats.find((r) => neighbours(r) === 1) || combats[0] || null;
    };
    const treasure = pickRoom();
    if (treasure) treasure.type = "treasure";

    // A healing-fountain room — only every 5th depth (5, 10, …), preferring a dead-end,
    // so healing is a meaningful milestone rather than a guarantee every dive.
    if (this.depth % 5 === 0) {
      const heal = pickRoom();
      if (heal) heal.type = "heal";
    }

    return [...map.values()];
  }

  // --- geometry exposed for portals/HUD ---
  get interior() {
    return { left: L, right: R, top: T, bottom: B, cx: CX, cy: CY };
  }

  startPos() {
    return { x: CX, y: CY };
  }

  doorOpen(room, dirName) {
    return !!room.doors[dirName] && room.cleared;
  }

  buildCurrent() {
    const room = this.currentRoom;
    const walls = [];
    const hWall = (x0, x1, y, h, gap) => {
      if (!gap) {
        walls.push({ x: x0, y, w: x1 - x0, h });
        return;
      }
      walls.push({ x: x0, y, w: CX - DOOR_W / 2 - x0, h });
      walls.push({ x: CX + DOOR_W / 2, y, w: x1 - (CX + DOOR_W / 2), h });
    };
    const vWall = (y0, y1, x, w, gap) => {
      if (!gap) {
        walls.push({ x, y: y0, w, h: y1 - y0 });
        return;
      }
      walls.push({ x, y: y0, w, h: CY - DOOR_W / 2 - y0 });
      walls.push({ x, y: CY + DOOR_W / 2, w, h: y1 - (CY + DOOR_W / 2) });
    };
    hWall(0, FULL_W, 0, WALL, this.doorOpen(room, "N"));
    hWall(0, FULL_W, B, WALL, this.doorOpen(room, "S"));
    vWall(0, FULL_H, 0, WALL, this.doorOpen(room, "W"));
    vWall(0, FULL_H, R, WALL, this.doorOpen(room, "E"));
    this.walls = walls;
    this.buildObstacles(room);
    // Precompute static floor detail (cracks + pebbles) per room so draw() replays
    // it instead of re-seeding an RNG every frame.
    const drng = mulberry32(this.seed + room.gx * 17 + room.gy * 31);
    const cracks = [];
    for (let i = 0; i < 14; i++) {
      const fx = L + 30 + drng() * (IW - 60);
      const fy = T + 30 + drng() * (IH - 60);
      const len = 8 + drng() * 22;
      const a = drng() * Math.PI;
      cracks.push([fx, fy, fx + Math.cos(a) * len, fy + Math.sin(a) * len]);
    }
    const pebbles = [];
    for (let i = 0; i < 18; i++) {
      pebbles.push([L + 20 + drng() * (IW - 40), T + 20 + drng() * (IH - 40), 1 + drng() * 2]);
    }
    this.floorDetail = { cracks, pebbles };
  }

  // Collidable props for a combat room — deterministic from the room's grid
  // coords, kept off the center + door cross so they're cover, not blockers.
  buildObstacles(room) {
    this.obstacles = [];
    if (room.type !== "combat") return;
    const rng = mulberry32(this.seed + room.gx * 131 + room.gy * 89 + 7);
    const kinds = ["rock", "rock", "crystal", "pillar"];
    const n = 3 + Math.floor(rng() * 3); // 3–5
    let tries = 0;
    while (this.obstacles.length < n && tries++ < 80) {
      const x = L + 70 + rng() * (IW - 140);
      const y = T + 70 + rng() * (IH - 140);
      const orad = 20 + rng() * 16;
      if (dist(x, y, CX, CY) < 120) continue; // clear the entry/fight center
      // keep the doorway lanes (±DOOR_W/2) clear, accounting for the prop's radius
      if (Math.abs(x - CX) - orad < 84 || Math.abs(y - CY) - orad < 84) continue;
      if (this.obstacles.some((o) => dist(o.x, o.y, x, y) < o.r + orad + 26)) continue;
      this.obstacles.push({ x, y, r: orad, kind: kinds[Math.floor(rng() * kinds.length)], jitter: rng() * 10 });
    }
  }

  resolve(x, y, r) {
    for (const w of this.walls) ({ x, y } = resolveRect(x, y, r, w));
    for (const o of this.obstacles || []) ({ x, y } = resolveCircle(x, y, r, o));
    for (const w of this.walls) ({ x, y } = resolveRect(x, y, r, w)); // re-seat after props so nothing is pushed into a wall
    return { x, y };
  }

  spawnRoom(room, player, enemies) {
    room.spawned = true;
    const cfg = this.cfg;
    if (room.type === "boss") {
      // At the final depth, the biome boss is replaced by the campaign's last
      // boss — bigger, named, and the win trigger when it falls.
      const final = this.depth >= FINAL_DEPTH;
      const e = new Enemy(CX, CY, "boss", final ? { hp: cfg.boss.hp * 1.6, dmg: cfg.boss.dmg * 1.25 } : { hp: cfg.boss.hp, dmg: cfg.boss.dmg });
      if (final) {
        e.bossKind = "caster";
        e.name = "The Heart of Winter";
        e.color = "#bfe3ff";
        e.isFinal = true;
      } else {
        e.bossKind = this.biome.boss.kind;
        e.name = this.biome.boss.name;
        e.color = this.biome.boss.color;
      }
      enemies.push(e);
      this.boss = e;
      return;
    }
    if (room.type === "start" || room.type === "treasure" || room.type === "heal") return;
    const scale = { hp: cfg.hpMult, dmg: cfg.dmgMult };
    const count = cfg.enemyBase + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const type = this.biome.pool[Math.floor(Math.random() * this.biome.pool.length)];
      let ex = CX;
      let ey = CY;
      for (let tries = 0; tries < 12; tries++) {
        ex = L + 70 + Math.random() * (IW - 140);
        ey = T + 70 + Math.random() * (IH - 140);
        if (dist(ex, ey, player.x, player.y) > 150) break;
      }
      const en = new Enemy(ex, ey, type, scale);
      const er = this.resolve(en.x, en.y, en.r); // start off the walls + props
      en.x = er.x;
      en.y = er.y;
      enemies.push(en);
    }
  }

  atDoor(player, dir) {
    if (!this.doorOpen(this.currentRoom, dir.name)) return false;
    if (dir.name === "E") return player.x > R + 6 && Math.abs(player.y - CY) < DOOR_W / 2;
    if (dir.name === "W") return player.x < L - 6 && Math.abs(player.y - CY) < DOOR_W / 2;
    if (dir.name === "N") return player.y < T - 6 && Math.abs(player.x - CX) < DOOR_W / 2;
    return player.y > B + 6 && Math.abs(player.x - CX) < DOOR_W / 2;
  }

  enterRoom(nb, fromDir, player, enemies) {
    this.currentRoom = nb;
    const opp = OPP[fromDir.name];
    const r = player.r + 16;
    if (opp === "W") {
      player.x = L + r;
      player.y = CY;
    } else if (opp === "E") {
      player.x = R - r;
      player.y = CY;
    } else if (opp === "N") {
      player.y = T + r;
      player.x = CX;
    } else {
      player.y = B - r;
      player.x = CX;
    }
    player.vx = player.vy = player.ix = player.iy = 0;
    player.dashTime = 0;
    player.attackTimer = 0;
    enemies.length = 0;
    nb.seen = true;
    this.buildCurrent();
    if (!nb.spawned) this.spawnRoom(nb, player, enemies);
  }

  tick(player, enemies) {
    const room = this.currentRoom;
    if (room.spawned && !room.cleared && enemies.length === 0) {
      room.cleared = true;
      this.buildCurrent();
      if (room.type === "boss") this.complete = true;
    }
    if (room.cleared) {
      for (const dir of DIRS) {
        const nb = room.doors[dir.name];
        if (nb) nb.seen = true;
        if (nb && this.atDoor(player, dir)) {
          this.enterRoom(nb, dir, player, enemies);
          return;
        }
      }
    }
  }

  draw(ctx, camera, viewW, viewH) {
    const room = this.currentRoom;
    const fc = this.biome.floor;
    const tile = 64;
    for (let x = L; x < R; x += tile) {
      for (let y = T; y < B; y += tile) {
        const n = valueNoise(x / tile / 2, y / tile / 2, this.seed);
        const v = Math.round(n * 18 - 9);
        ctx.fillStyle = `rgb(${fc[0] + v},${fc[1] + v},${fc[2] + v})`;
        ctx.fillRect(x, y, tile + 1, tile + 1);
      }
    }
    if (room.type === "boss") {
      ctx.fillStyle = "rgba(120, 40, 40, 0.08)";
      ctx.fillRect(L, T, IW, IH);
    } else if (room.type === "treasure") {
      ctx.fillStyle = "rgba(220, 184, 74, 0.07)";
      ctx.fillRect(L, T, IW, IH);
    } else if (room.type === "heal") {
      ctx.fillStyle = "rgba(110, 220, 150, 0.07)";
      ctx.fillRect(L, T, IW, IH);
    } else if (room.cleared) {
      ctx.fillStyle = "rgba(120, 180, 130, 0.05)";
      ctx.fillRect(L, T, IW, IH);
    }

    // Edge vignette for depth/atmosphere (gradient geometry is constant — cache it).
    if (!this._vignette) {
      const vg = ctx.createRadialGradient(CX, CY, IW * 0.28, CX, CY, IW * 0.62);
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(0,0,0,0.32)");
      this._vignette = vg;
    }
    ctx.fillStyle = this._vignette;
    ctx.fillRect(L, T, IW, IH);

    // Sparse floor detail (cracks + pebbles), precomputed per room in buildCurrent.
    ctx.strokeStyle = "rgba(0,0,0,0.13)";
    ctx.lineWidth = 1.5;
    for (const c of this.floorDetail.cracks) {
      ctx.beginPath();
      ctx.moveTo(c[0], c[1]);
      ctx.lineTo(c[2], c[3]);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(255,255,255,0.045)";
    for (const p of this.floorDetail.pebbles) {
      ctx.beginPath();
      ctx.arc(p[0], p[1], p[2], 0, Math.PI * 2);
      ctx.fill();
    }

    // Walls.
    for (const w of this.walls) {
      ctx.fillStyle = this.biome.wall;
      ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.fillRect(w.x, w.y, w.w, 3);
      ctx.strokeStyle = "rgba(10,12,20,0.7)";
      ctx.lineWidth = 2;
      ctx.strokeRect(w.x, w.y, w.w, w.h);
    }

    // Doors (open threshold or locked barrier).
    const acc = this.biome.accent;
    for (const dir of DIRS) {
      const nb = room.doors[dir.name];
      if (!nb) continue;
      const open = this.doorOpen(room, dir.name);
      let gx, gy, gw, gh;
      if (dir.name === "N") { gx = CX - DOOR_W / 2; gy = 0; gw = DOOR_W; gh = WALL; }
      else if (dir.name === "S") { gx = CX - DOOR_W / 2; gy = B; gw = DOOR_W; gh = WALL; }
      else if (dir.name === "W") { gx = 0; gy = CY - DOOR_W / 2; gw = WALL; gh = DOOR_W; }
      else { gx = R; gy = CY - DOOR_W / 2; gw = WALL; gh = DOOR_W; }
      if (open) {
        ctx.fillStyle = "rgba(10,14,22,0.55)";
        ctx.fillRect(gx, gy, gw, gh);
        ctx.fillStyle = "rgba(140, 230, 160, 0.5)";
        if (gw > gh) {
          ctx.fillRect(gx, gy, gw, 3);
          ctx.fillRect(gx, gy + gh - 3, gw, 3);
        } else {
          ctx.fillRect(gx, gy, 3, gh);
          ctx.fillRect(gx + gw - 3, gy, 3, gh);
        }
      } else {
        ctx.fillStyle = "#3a3142";
        ctx.fillRect(gx, gy, gw, gh);
        ctx.strokeStyle = acc;
        ctx.lineWidth = 3;
        ctx.strokeRect(gx + 2, gy + 2, gw - 4, gh - 4);
        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.arc(gx + gw / 2, gy + gh / 2, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#1a1620";
        ctx.fillRect(gx + gw / 2 - 2, gy + gh / 2, 4, 8);
      }
    }

    // Interior props: cover obstacles + the room's interactable (chest / fountain).
    for (const o of this.obstacles) this.drawObstacle(ctx, o);
    if (room.type === "treasure") this.drawChest(ctx, CX, CY, room.looted);
    if (room.type === "heal") this.drawFountain(ctx, CX, CY, room.drained);
  }

  drawObstacle(ctx, o) {
    const ob = this.biome.obstacle;
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.lineJoin = "round";
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(0, o.r * 0.75, o.r * 0.95, o.r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#14110e";
    if (o.kind === "crystal") {
      ctx.fillStyle = this.biome.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -o.r * 1.2);
      ctx.lineTo(o.r * 0.6, -o.r * 0.1);
      ctx.lineTo(o.r * 0.34, o.r * 0.7);
      ctx.lineTo(-o.r * 0.34, o.r * 0.7);
      ctx.lineTo(-o.r * 0.6, -o.r * 0.1);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.beginPath();
      ctx.moveTo(0, -o.r * 1.2);
      ctx.lineTo(o.r * 0.22, -o.r * 0.1);
      ctx.lineTo(-o.r * 0.08, o.r * 0.4);
      ctx.closePath();
      ctx.fill();
    } else if (o.kind === "pillar") {
      ctx.fillStyle = ob.rock;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.rect(-o.r * 0.7, -o.r * 1.3, o.r * 1.4, o.r * 2.1);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(-o.r * 0.7, -o.r * 1.3, o.r * 0.35, o.r * 2.1);
      ctx.fillStyle = ob.ice;
      ctx.fillRect(-o.r * 0.85, -o.r * 1.45, o.r * 1.7, o.r * 0.3);
      ctx.strokeRect(-o.r * 0.85, -o.r * 1.45, o.r * 1.7, o.r * 0.3);
    } else {
      ctx.fillStyle = ob.rock;
      ctx.lineWidth = 2.5;
      const pts = 8;
      ctx.beginPath();
      for (let i = 0; i <= pts; i++) {
        const a = (i / pts) * Math.PI * 2;
        const rad = o.r * (0.82 + Math.sin(i * 2.3 + o.jitter) * 0.16);
        const px = Math.cos(a) * rad;
        const py = Math.sin(a) * rad * 0.92;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.beginPath();
      ctx.ellipse(-o.r * 0.25, -o.r * 0.3, o.r * 0.4, o.r * 0.24, -0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawChest(ctx, x, y, opened) {
    ctx.save();
    ctx.translate(x, y);
    ctx.lineJoin = "round";
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(0, 20, 30, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    const wood = "#7a4a28";
    const gold = "#e0b84a";
    ctx.strokeStyle = "#14110e";
    ctx.lineWidth = 2.5;
    ctx.fillStyle = wood;
    roundRect(ctx, -28, -6, 56, 28, 4);
    ctx.fill();
    ctx.stroke();
    if (opened) {
      ctx.fillStyle = wood;
      ctx.beginPath();
      ctx.moveTo(-28, -6);
      ctx.lineTo(-24, -34);
      ctx.lineTo(28, -34);
      ctx.lineTo(28, -6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(255,226,122,0.5)";
      ctx.beginPath();
      ctx.ellipse(0, 2, 22, 9, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = wood;
      ctx.beginPath();
      ctx.moveTo(-28, -6);
      ctx.quadraticCurveTo(-28, -24, 0, -24);
      ctx.quadraticCurveTo(28, -24, 28, -6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = gold;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-28, -6);
      ctx.lineTo(28, -6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -23);
      ctx.lineTo(0, 22);
      ctx.stroke();
      ctx.fillStyle = gold;
      ctx.beginPath();
      ctx.arc(0, -2, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#14110e";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  drawFountain(ctx, x, y, drained) {
    ctx.save();
    ctx.translate(x, y);
    ctx.lineJoin = "round";
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(0, 16, 34, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#6a7080";
    ctx.strokeStyle = "#14110e";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(0, 6, 32, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#4a505e";
    ctx.beginPath();
    ctx.ellipse(0, 4, 24, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    if (!drained) {
      ctx.fillStyle = "rgba(120, 230, 170, 0.75)";
      ctx.beginPath();
      ctx.ellipse(0, 4, 20, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(200,255,220,0.5)";
      ctx.beginPath();
      ctx.ellipse(-5, 2, 8, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(180,255,210,0.6)";
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc((i - 1) * 8, -8 - i * 3, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = "#3a4048";
      ctx.beginPath();
      ctx.ellipse(0, 4, 20, 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
