import { mulberry32, randRange, valueNoise, roughOutline, roughBlobPath } from "./utils.js";
import { depthColor } from "./dungeon.js";
import { BIOMES, BIOME_IDS } from "./biomes.js";

const INK = "#191620";

// Lighten (+) or darken (-) a #rrggbb colour.
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}

// The open world: dirty-ice ground, debris, cracks, and jagged obstacles.
export class World {
  constructor(width, height, seed = 1337) {
    this.width = width;
    this.height = height;
    this.tile = 56;
    this.seed = seed;

    const rng = mulberry32(seed);

    // Central safe camp: no creatures spawn or enter here; the start area (tier 0).
    this.safeZone = {
      name: "Camp",
      tier: 0,
      x: width / 2 - 400,
      y: height / 2 - 320,
      w: 800,
      h: 640,
    };

    // Vendor stall inside the camp (press E nearby to shop).
    this.shop = { x: width / 2 + 190, y: this.safeZone.y + 175, r: 36 };

    // The bearded elder who decodes relics (press E nearby).
    this.elder = { x: width / 2 - 250, y: height / 2 + 30, r: 30, wave: 0 };

    // The Quartermaster who sells permanent shard upgrades (press E nearby).
    this.quartermaster = { x: width / 2 + 250, y: height / 2 + 30, r: 30 };

    // The Mission Board (bounties) and the Forge (crafting) — press E nearby.
    this.missionBoard = { x: width / 2 - 190, y: this.safeZone.y + 175, r: 30 };
    this.forge = { x: width / 2, y: height / 2 + 150, r: 30 };

    // Dungeon entrances scattered through the wilds, one per difficulty tier.
    // Biomes are laid out as rings around the camp: an inner Tundra circle, a
    // Cavern ring around it, then the outer area sliced into angular wedges.
    const minDim = Math.min(width, height);
    this.ring0 = minDim * 0.17; // inner circle radius (Tundra)
    this.ring1 = minDim * 0.34; // second circle radius (Cavern ring beyond ring0)
    this.ringBiomes = ["tundra", "cavern"];
    this.sliceBiomes = ["ember", "verdant", "shadow"];

    // One dungeon entrance per tier, placed inside its biome region.
    const cx = width / 2;
    const cy = height / 2;
    const sliceAng = (i) => ((i + 0.5) / this.sliceBiomes.length) * Math.PI * 2 - Math.PI;
    const outerR = this.ring1 + (minDim / 2 - this.ring1) * 0.5;
    const specs = [
      { tier: 0, biome: "tundra", rad: this.ring0 * 0.72, ang: -Math.PI / 2 },
      { tier: 1, biome: "cavern", rad: (this.ring0 + this.ring1) / 2, ang: 0.7 },
      { tier: 2, biome: "ember", rad: outerR, ang: sliceAng(0) },
      { tier: 3, biome: "verdant", rad: outerR, ang: sliceAng(1) },
      { tier: 4, biome: "shadow", rad: outerR, ang: sliceAng(2) },
    ];
    this.dungeons = specs.map((s) => ({
      x: Math.max(180, Math.min(width - 180, cx + Math.cos(s.ang) * s.rad)),
      y: Math.max(180, Math.min(height - 180, cy + Math.sin(s.ang) * s.rad)),
      r: 46,
      tierIndex: s.tier,
      biome: s.biome,
    }));

    // One TOWN per outer biome (tiers 1-4), set beside that biome's dungeon
    // entrance — a safe haven with a shop whose gear quality scales with the tier.
    // The central camp is the tier-0 hub (it also has the Elder + Quartermaster).
    const TOWN_NAMES = { cavern: "Hollowdeep", ember: "Cinderhold", verdant: "Mossvale", shadow: "Duskmere" };
    this.towns = specs
      .filter((s) => s.tier >= 1)
      .map((s) => {
        const ang = s.ang + 0.55; // beside the dungeon entrance, same biome region
        const tx = Math.max(300, Math.min(width - 300, cx + Math.cos(ang) * s.rad));
        const ty = Math.max(300, Math.min(height - 300, cy + Math.sin(ang) * s.rad));
        const w = 540;
        const h = 440;
        const name = TOWN_NAMES[s.biome] || "Outpost";
        return {
          name,
          tier: s.tier,
          biome: s.biome,
          cx: tx,
          cy: ty,
          zone: { name, tier: s.tier, x: tx - w / 2, y: ty - h / 2, w, h },
          shop: { x: tx + 100, y: ty + 20, r: 34 },
        };
      });

    // All safe zones (camp + towns) — drive inSafeZone / keepOutOfSafe / healing.
    this.safeZones = [this.safeZone, ...this.towns.map((t) => t.zone)];

    // Solid obstacles (rocks / ice shards) the player and enemies collide with.
    this.obstacles = [];
    const obstacleCount = 160;
    for (let i = 0; i < obstacleCount; i++) {
      const r = randRange(rng, 26, 54);
      const x = randRange(rng, r + 40, width - r - 40);
      const y = randRange(rng, r + 40, height - r - 40);
      if (this.inSafeZone(x, y, 60)) continue; // keep the camp clear
      const kind = rng() < 0.5 ? "rock" : "ice";
      this.obstacles.push({
        x, y, r, kind, biome: this.biomeAt(x, y),
        outline: roughOutline(rng, 11, kind === "ice" ? 0.22 : 0.16),
        rot: rng() * Math.PI * 2,
        // A few interior facet lines + speckles, in local space.
        facets: Array.from({ length: 3 }, () => ({
          a: rng() * Math.PI * 2,
          len: randRange(rng, 0.4, 0.85),
        })),
        specks: Array.from({ length: Math.floor(r / 4) }, () => ({
          x: randRange(rng, -r * 0.6, r * 0.6),
          y: randRange(rng, -r * 0.6, r * 0.6),
          r: randRange(rng, 0.8, 2.2),
          d: rng() < 0.5,
        })),
      });
    }

    // Scattered debris specks (snow grit + dark flecks).
    this.specks = [];
    for (let i = 0; i < 2600; i++) {
      this.specks.push({
        x: randRange(rng, 0, width),
        y: randRange(rng, 0, height),
        r: randRange(rng, 0.6, 2.4),
        dark: rng() < 0.55,
      });
    }

    // Darker "exposed" patches worn into the ice.
    this.patches = [];
    for (let i = 0; i < 300; i++) {
      const pr = randRange(rng, 22, 64);
      this.patches.push({
        x: randRange(rng, 0, width),
        y: randRange(rng, 0, height),
        r: pr,
        outline: roughOutline(rng, 9, 0.3),
        rot: rng() * Math.PI * 2,
        alpha: randRange(rng, 0.06, 0.14),
      });
    }

    // Cracks: jagged polylines.
    this.cracks = [];
    for (let i = 0; i < 200; i++) {
      const sx = randRange(rng, 0, width);
      const sy = randRange(rng, 0, height);
      const pts = [{ x: sx, y: sy }];
      let a = rng() * Math.PI * 2;
      const segs = 2 + Math.floor(rng() * 4);
      for (let s = 0; s < segs; s++) {
        a += randRange(rng, -0.9, 0.9);
        const len = randRange(rng, 10, 30);
        const last = pts[pts.length - 1];
        pts.push({ x: last.x + Math.cos(a) * len, y: last.y + Math.sin(a) * len });
      }
      this.cracks.push({ pts, w: randRange(rng, 0.8, 1.8) });
    }
  }

  // Which biome owns (x, y) — concentric rings around camp, then angular slices.
  biomeAt(x, y) {
    if (this.inZone(this.safeZone, x, y, 120)) return "tundra"; // camp ground is tundra
    const cx = this.width / 2;
    const cy = this.height / 2;
    const d = Math.hypot(x - cx, y - cy);
    if (d < this.ring0) return this.ringBiomes[0];
    if (d < this.ring1) return this.ringBiomes[1];
    const a = Math.atan2(y - cy, x - cx) + Math.PI; // 0..2π
    const n = this.sliceBiomes.length;
    return this.sliceBiomes[Math.min(n - 1, Math.floor((a / (Math.PI * 2)) * n))];
  }

  // Difficulty tier (0 tundra .. 4 shadow) of the region at (x, y). Drives how
  // hard wild enemies hit, so you can't safely stroll to a far town for gear.
  tierAt(x, y) {
    const i = BIOME_IDS.indexOf(this.biomeAt(x, y));
    return i < 0 ? 0 : i;
  }

  // Is a point inside a single zone rect (with optional padding)?
  inZone(z, x, y, pad = 0) {
    return x > z.x - pad && x < z.x + z.w + pad && y > z.y - pad && y < z.y + z.h + pad;
  }

  // The safe zone (camp or a town) containing (x, y), or null.
  safeZoneAt(x, y, pad = 0) {
    for (const z of this.safeZones) if (this.inZone(z, x, y, pad)) return z;
    return null;
  }

  // Is (x, y) inside any safe zone? `pad` expands (positive) or shrinks the test.
  inSafeZone(x, y, pad = 0) {
    return !!this.safeZoneAt(x, y, pad);
  }

  // Push a point to the nearest edge of whichever safe zone it's in (keeps
  // creatures out of every camp/town).
  keepOutOfSafe(x, y, r) {
    const z = this.safeZoneAt(x, y, r);
    if (!z) return { x, y };
    const dl = x - (z.x - r);
    const dr = z.x + z.w + r - x;
    const dt = y - (z.y - r);
    const db = z.y + z.h + r - y;
    const m = Math.min(dl, dr, dt, db);
    if (m === dl) x = z.x - r;
    else if (m === dr) x = z.x + z.w + r;
    else if (m === dt) y = z.y - r;
    else y = z.y + z.h + r;
    return { x, y };
  }

  // Returns a point pushed out of any obstacle it overlaps.
  resolve(x, y, radius) {
    for (const o of this.obstacles) {
      const dx = x - o.x;
      const dy = y - o.y;
      const d = Math.hypot(dx, dy);
      const min = radius + o.r;
      if (d > 0 && d < min) {
        const push = (min - d) / d;
        x += dx * push;
        y += dy * push;
      } else if (d === 0) {
        x += min;
      }
    }
    return { x, y };
  }

  draw(ctx, camera, viewW, viewH) {
    const t = this.tile;
    const x0 = camera.x;
    const y0 = camera.y;
    const startX = Math.floor(x0 / t) * t;
    const startY = Math.floor(y0 / t) * t;

    // Mottled ground, coloured by the biome at each tile.
    for (let x = startX; x < x0 + viewW; x += t) {
      for (let y = startY; y < y0 + viewH; y += t) {
        const pal = BIOMES[this.biomeAt(x + t / 2, y + t / 2)].ground;
        const light = pal[0];
        const dark = pal[1];
        const n = valueNoise(x / t / 2.3, y / t / 2.3, this.seed);
        const m = n * 0.7 + valueNoise(x / t, y / t, this.seed + 7) * 0.3;
        const r = Math.round(dark[0] + (light[0] - dark[0]) * m);
        const g = Math.round(dark[1] + (light[1] - dark[1]) * m);
        const b = Math.round(dark[2] + (light[2] - dark[2]) * m);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x, y, t + 1, t + 1);
      }
    }

    const visible = (cx, cy, pad) =>
      cx + pad >= x0 && cx - pad <= x0 + viewW && cy + pad >= y0 && cy - pad <= y0 + viewH;

    // Worn patches.
    for (const p of this.patches) {
      if (!visible(p.x, p.y, p.r)) continue;
      ctx.fillStyle = `rgba(70, 78, 92, ${p.alpha})`;
      roughBlobPath(ctx, p.x, p.y, p.r, p.outline, 0.8, p.rot);
      ctx.fill();
    }

    // Cracks.
    ctx.strokeStyle = "rgba(40, 44, 58, 0.28)";
    ctx.lineCap = "round";
    for (const c of this.cracks) {
      if (!visible(c.pts[0].x, c.pts[0].y, 60)) continue;
      ctx.lineWidth = c.w;
      ctx.beginPath();
      ctx.moveTo(c.pts[0].x, c.pts[0].y);
      for (let i = 1; i < c.pts.length; i++) ctx.lineTo(c.pts[i].x, c.pts[i].y);
      ctx.stroke();
    }

    // Debris specks (grain).
    for (const s of this.specks) {
      if (!visible(s.x, s.y, 4)) continue;
      ctx.fillStyle = s.dark ? "rgba(45, 50, 64, 0.5)" : "rgba(244, 248, 252, 0.6)";
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Safe camp overlay.
    this.drawCamp(ctx);

    // Towns (visible ones only).
    for (const t of this.towns) {
      if (!visible(t.cx, t.cy, 360)) continue;
      this.drawTown(ctx, t);
    }

    // Rough world border.
    ctx.strokeStyle = "rgba(40, 44, 58, 0.6)";
    ctx.lineWidth = 8;
    ctx.strokeRect(0, 0, this.width, this.height);

    // Dungeon entrances.
    for (const dg of this.dungeons) {
      if (!visible(dg.x, dg.y, dg.r + 50)) continue;
      this.drawEntrance(ctx, dg);
    }

    // Obstacles.
    for (const o of this.obstacles) {
      if (!visible(o.x, o.y, o.r + 10)) continue;
      this.drawObstacle(ctx, o);
    }
  }

  drawEntrance(ctx, dg) {
    const { x, y, r } = dg;
    const depth = dg.tierIndex + 1;
    const col = depthColor(depth);
    ctx.save();
    ctx.lineJoin = "round";

    // Ground shadow.
    ctx.fillStyle = "rgba(20,24,38,0.3)";
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.6, r * 1.1, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Dark cave opening.
    ctx.fillStyle = "#14121b";
    ctx.beginPath();
    ctx.moveTo(x - r * 0.66, y + r * 0.55);
    ctx.lineTo(x - r * 0.66, y - r * 0.1);
    ctx.quadraticCurveTo(x, y - r * 0.95, x + r * 0.66, y - r * 0.1);
    ctx.lineTo(x + r * 0.66, y + r * 0.55);
    ctx.closePath();
    ctx.fill();

    // Stone arch frame.
    ctx.strokeStyle = "#6d7280";
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.78, y + r * 0.55);
    ctx.lineTo(x - r * 0.78, y - r * 0.08);
    ctx.quadraticCurveTo(x, y - r * 1.08, x + r * 0.78, y - r * 0.08);
    ctx.lineTo(x + r * 0.78, y + r * 0.55);
    ctx.stroke();
    ctx.strokeStyle = "#3f434e";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Tier banner above the arch.
    const bw = 54;
    const bx = x - bw / 2;
    const by = y - r * 1.5;
    ctx.fillStyle = col;
    ctx.strokeStyle = "#14110e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + bw, by);
    ctx.lineTo(bx + bw, by + 22);
    ctx.lineTo(x, by + 30);
    ctx.lineTo(bx, by + 22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#1a1610";
    ctx.font = "700 14px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`D${depth}`, x, by + 12);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.restore();
  }

  drawTown(ctx, t) {
    const z = t.zone;
    const accent = (BIOMES[t.biome] || BIOMES.tundra).accent || "#9bd1a0";
    // Safe ground tint + dashed border (tinted by the biome accent).
    ctx.fillStyle = "rgba(255, 220, 160, 0.06)";
    ctx.fillRect(z.x, z.y, z.w, z.h);
    ctx.strokeStyle = "rgba(120, 175, 120, 0.5)";
    ctx.lineWidth = 3;
    ctx.setLineDash([14, 10]);
    ctx.strokeRect(z.x, z.y, z.w, z.h);
    ctx.setLineDash([]);

    // A few huts around the square (kept off the shop).
    this.drawHut(ctx, t.cx - 150, t.cy - 90, accent);
    this.drawHut(ctx, t.cx - 60, t.cy + 110, accent);
    this.drawHut(ctx, t.cx + 130, t.cy - 110, accent);

    // The shop stall.
    this.drawShopAt(ctx, t.shop.x, t.shop.y);

    // Name + tier label.
    ctx.fillStyle = depthColor(t.tier + 1);
    ctx.font = "700 20px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${t.name.toUpperCase()}`, t.cx, z.y + 30);
    ctx.fillStyle = "rgba(90, 110, 90, 0.7)";
    ctx.font = "600 12px -apple-system, sans-serif";
    ctx.fillText(`safe town · tier ${t.tier}`, t.cx, z.y + 48);
    ctx.textAlign = "left";
  }

  drawHut(ctx, x, y, roofCol) {
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#14110e";
    ctx.lineWidth = 2;
    // Shadow.
    ctx.fillStyle = "rgba(25,30,45,0.2)";
    ctx.beginPath();
    ctx.ellipse(x, y + 26, 30, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    // Wall.
    ctx.fillStyle = "#7c6047";
    ctx.fillRect(x - 24, y - 6, 48, 34);
    ctx.strokeRect(x - 24, y - 6, 48, 34);
    // Roof.
    ctx.fillStyle = roofCol;
    ctx.beginPath();
    ctx.moveTo(x - 30, y - 4);
    ctx.lineTo(x, y - 30);
    ctx.lineTo(x + 30, y - 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Door.
    ctx.fillStyle = "#3a2c1e";
    ctx.fillRect(x - 7, y + 8, 14, 20);
    ctx.strokeRect(x - 7, y + 8, 14, 20);
  }

  drawCamp(ctx) {
    const z = this.safeZone;
    // Warm tint marking the safe ground.
    ctx.fillStyle = "rgba(255, 210, 140, 0.07)";
    ctx.fillRect(z.x, z.y, z.w, z.h);
    // Dashed warm border.
    ctx.strokeStyle = "rgba(120, 175, 120, 0.55)";
    ctx.lineWidth = 3;
    ctx.setLineDash([14, 10]);
    ctx.strokeRect(z.x, z.y, z.w, z.h);
    ctx.setLineDash([]);
    // Label.
    ctx.fillStyle = "rgba(60, 90, 60, 0.6)";
    ctx.font = "600 22px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("CAMP — SAFE", z.x + z.w / 2, z.y + 32);
    ctx.textAlign = "left";

    // A small campfire near the top of the camp.
    const fx = z.x + z.w / 2;
    const fy = z.y + 110;
    ctx.fillStyle = "rgba(25, 30, 45, 0.25)";
    ctx.beginPath();
    ctx.ellipse(fx, fy + 8, 26, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#6b7079";
    for (const a of [0, 1.05, 2.1, 3.14, 4.2, 5.25]) {
      ctx.beginPath();
      ctx.arc(fx + Math.cos(a) * 18, fy + Math.sin(a) * 7, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#e8923a";
    ctx.beginPath();
    ctx.moveTo(fx - 9, fy + 2);
    ctx.quadraticCurveTo(fx - 4, fy - 18, fx + 2, fy - 26);
    ctx.quadraticCurveTo(fx + 5, fy - 12, fx + 10, fy + 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ffd166";
    ctx.beginPath();
    ctx.moveTo(fx - 4, fy + 1);
    ctx.quadraticCurveTo(fx - 1, fy - 11, fx + 3, fy - 16);
    ctx.quadraticCurveTo(fx + 4, fy - 7, fx + 6, fy + 1);
    ctx.closePath();
    ctx.fill();

    this.drawShop(ctx);
    this.drawElder(ctx);
    this.drawQuartermaster(ctx);
    this.drawMissionBoard(ctx);
    this.drawForge(ctx);
  }

  // Bounty board — a wooden notice board with pinned papers.
  drawMissionBoard(ctx) {
    const { x, y } = this.missionBoard;
    ctx.save();
    ctx.translate(x, y);
    ctx.lineJoin = "round";
    ctx.fillStyle = "rgba(20,24,38,0.22)";
    ctx.beginPath();
    ctx.ellipse(0, 24, 26, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    // Posts.
    ctx.strokeStyle = "#5c3517";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-20, 24);
    ctx.lineTo(-20, -6);
    ctx.moveTo(20, 24);
    ctx.lineTo(20, -6);
    ctx.stroke();
    // Board.
    ctx.fillStyle = "#7a5230";
    ctx.strokeStyle = "#14110e";
    ctx.lineWidth = 2;
    ctx.fillRect(-28, -28, 56, 26);
    ctx.strokeRect(-28, -28, 56, 26);
    // Pinned papers.
    for (const [px, rot, col] of [[-15, -0.12, "#f3eede"], [4, 0.08, "#fff7e6"], [16, -0.05, "#eef0d8"]]) {
      ctx.save();
      ctx.translate(px, -15);
      ctx.rotate(rot);
      ctx.fillStyle = col;
      ctx.fillRect(-6, -7, 12, 15);
      ctx.fillStyle = "#c33";
      ctx.beginPath();
      ctx.arc(0, -6, 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = "#ffd166";
    ctx.font = "700 11px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("BOUNTIES", 0, -38);
    ctx.textAlign = "left";
    ctx.restore();
  }

  // Forge — an anvil with a glowing frost-core.
  drawForge(ctx) {
    const { x, y } = this.forge;
    ctx.save();
    ctx.translate(x, y);
    ctx.lineJoin = "round";
    ctx.fillStyle = "rgba(20,24,38,0.24)";
    ctx.beginPath();
    ctx.ellipse(0, 20, 26, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    // Anvil.
    ctx.fillStyle = "#3a4250";
    ctx.strokeStyle = "#14110e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-22, -2);
    ctx.lineTo(22, -2);
    ctx.lineTo(14, 4);
    ctx.lineTo(8, 4);
    ctx.lineTo(8, 16);
    ctx.lineTo(-8, 16);
    ctx.lineTo(-8, 4);
    ctx.lineTo(-14, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Horn.
    ctx.beginPath();
    ctx.moveTo(-22, -2);
    ctx.lineTo(-32, -4);
    ctx.lineTo(-22, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Glowing core resting on top.
    ctx.shadowColor = "#9fd8ff";
    ctx.shadowBlur = 12;
    ctx.fillStyle = "#bfe8ff";
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 ? 9 : 5;
      const px = Math.cos(a) * rr;
      const py = -10 + Math.sin(a) * rr;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#bfe8ff";
    ctx.font = "700 11px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("FORGE", 0, -28);
    ctx.textAlign = "left";
    ctx.restore();
  }

  drawQuartermaster(ctx) {
    const qx = this.quartermaster.x;
    const qy = this.quartermaster.y;
    const r = 18;
    ctx.save();
    ctx.translate(qx, qy);
    ctx.lineJoin = "round";

    // Shadow.
    ctx.fillStyle = "rgba(20,24,38,0.24)";
    ctx.beginPath();
    ctx.ellipse(0, r * 1.05, r * 1.0, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body (penguin in a teal quartermaster coat).
    ctx.fillStyle = "#1f5f6b";
    ctx.strokeStyle = "#14110e";
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.95, r * 1.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // White belly.
    ctx.fillStyle = "#e9eef0";
    ctx.beginPath();
    ctx.ellipse(0, r * 0.28, r * 0.5, r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eyes.
    ctx.fillStyle = "#f3efe6";
    ctx.beginPath();
    ctx.arc(-r * 0.28, -r * 0.45, r * 0.18, 0, Math.PI * 2);
    ctx.arc(r * 0.28, -r * 0.45, r * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#14110e";
    ctx.beginPath();
    ctx.arc(-r * 0.28, -r * 0.45, r * 0.09, 0, Math.PI * 2);
    ctx.arc(r * 0.28, -r * 0.45, r * 0.09, 0, Math.PI * 2);
    ctx.fill();

    // Beak.
    ctx.fillStyle = "#d9821c";
    ctx.strokeStyle = "#14110e";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-r * 0.16, -r * 0.26);
    ctx.lineTo(r * 0.16, -r * 0.26);
    ctx.lineTo(0, -r * 0.08);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // A floating shard crystal above (signals the upgrades vendor).
    ctx.fillStyle = "#7fd2ff";
    ctx.strokeStyle = "#163040";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(r * 1.2, -r * 1.5);
    ctx.lineTo(r * 1.5, -r * 1.1);
    ctx.lineTo(r * 1.2, -r * 0.7);
    ctx.lineTo(r * 0.9, -r * 1.1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Label.
    ctx.fillStyle = "rgba(60, 70, 90, 0.7)";
    ctx.font = "700 12px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("UPGRADES", 0, -r * 2.0);
    ctx.textAlign = "left";
    ctx.restore();
  }

  drawElder(ctx) {
    const ex = this.elder.x;
    const ey = this.elder.y;
    const r = 18;
    ctx.save();
    ctx.translate(ex, ey);
    ctx.lineJoin = "round";

    // Shadow.
    ctx.fillStyle = "rgba(20,24,38,0.24)";
    ctx.beginPath();
    ctx.ellipse(0, r * 1.05, r * 1.0, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Staff.
    ctx.strokeStyle = "#6a4a28";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(r * 1.15, -r * 1.4);
    ctx.lineTo(r * 1.15, r * 1.1);
    ctx.stroke();
    ctx.fillStyle = "#8fd0e6";
    ctx.beginPath();
    ctx.arc(r * 1.15, -r * 1.5, 5, 0, Math.PI * 2);
    ctx.fill();

    // Body (robed penguin).
    ctx.fillStyle = "#3a3550";
    ctx.strokeStyle = "#14110e";
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.95, r * 1.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Eyes.
    ctx.fillStyle = "#f3efe6";
    ctx.beginPath();
    ctx.arc(-r * 0.28, -r * 0.5, r * 0.18, 0, Math.PI * 2);
    ctx.arc(r * 0.28, -r * 0.5, r * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#14110e";
    ctx.beginPath();
    ctx.arc(-r * 0.28, -r * 0.5, r * 0.09, 0, Math.PI * 2);
    ctx.arc(r * 0.28, -r * 0.5, r * 0.09, 0, Math.PI * 2);
    ctx.fill();

    // Bushy white eyebrows.
    ctx.strokeStyle = "#eef2f5";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-r * 0.5, -r * 0.72);
    ctx.lineTo(-r * 0.08, -r * 0.66);
    ctx.moveTo(r * 0.08, -r * 0.66);
    ctx.lineTo(r * 0.5, -r * 0.72);
    ctx.stroke();

    // Beak.
    ctx.fillStyle = "#d9821c";
    ctx.strokeStyle = "#14110e";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-r * 0.16, -r * 0.34);
    ctx.lineTo(r * 0.16, -r * 0.34);
    ctx.lineTo(0, -r * 0.16);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Long white beard.
    ctx.fillStyle = "#eef2f5";
    ctx.strokeStyle = "rgba(20,20,24,0.25)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-r * 0.5, -r * 0.18);
    ctx.quadraticCurveTo(-r * 0.62, r * 0.7, 0, r * 1.5);
    ctx.quadraticCurveTo(r * 0.62, r * 0.7, r * 0.5, -r * 0.18);
    ctx.quadraticCurveTo(0, r * 0.2, -r * 0.5, -r * 0.18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Label.
    ctx.fillStyle = "rgba(60, 70, 90, 0.7)";
    ctx.font = "700 12px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("ELDER", 0, -r * 2.0);
    ctx.textAlign = "left";
    ctx.restore();
  }

  drawShop(ctx) {
    this.drawShopAt(ctx, this.shop.x, this.shop.y);
  }

  drawShopAt(ctx, sx, sy) {
    ctx.lineJoin = "round";
    // Shadow.
    ctx.fillStyle = "rgba(25,30,45,0.22)";
    ctx.beginPath();
    ctx.ellipse(sx, sy + 26, 46, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    // Posts.
    ctx.fillStyle = "#6b4a2a";
    ctx.strokeStyle = "#14110e";
    ctx.lineWidth = 2;
    ctx.fillRect(sx - 44, sy - 36, 6, 60);
    ctx.strokeRect(sx - 44, sy - 36, 6, 60);
    ctx.fillRect(sx + 38, sy - 36, 6, 60);
    ctx.strokeRect(sx + 38, sy - 36, 6, 60);
    // Striped awning.
    const aw = 92;
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 === 0 ? "#c64b4b" : "#efe7d8";
      ctx.fillRect(sx - 46 + i * (aw / 6), sy - 44, aw / 6, 16);
    }
    ctx.strokeStyle = "#14110e";
    ctx.lineWidth = 2;
    ctx.strokeRect(sx - 46, sy - 44, aw, 16);
    // Counter.
    ctx.fillStyle = "#8a5a32";
    ctx.fillRect(sx - 40, sy + 6, 80, 18);
    ctx.strokeRect(sx - 40, sy + 6, 80, 18);
    // Sign.
    ctx.fillStyle = "#2b2620";
    ctx.fillRect(sx - 22, sy - 24, 44, 18);
    ctx.strokeRect(sx - 22, sy - 24, 44, 18);
    ctx.fillStyle = "#ffd166";
    ctx.font = "700 11px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("SHOP", sx, sy - 14);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  drawObstacle(ctx, o) {
    const r = o.r;
    ctx.save();
    ctx.translate(o.x, o.y);

    // Grounded shadow.
    ctx.fillStyle = "rgba(25, 30, 45, 0.28)";
    ctx.beginPath();
    ctx.ellipse(2, r * 0.55, r * 1.0, r * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();

    const bcol = (BIOMES[o.biome] || BIOMES.tundra).obstacle[o.kind];
    const base = bcol;
    const dark = shade(bcol, -42);
    const light = shade(bcol, 46);

    // Body silhouette with a heavy ink outline.
    roughBlobPath(ctx, 0, 0, r, o.outline, 0.92, o.rot);
    ctx.fillStyle = base;
    ctx.fill();
    ctx.lineJoin = "round";
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();

    // Shaded lower half (clip to silhouette).
    ctx.save();
    roughBlobPath(ctx, 0, 0, r, o.outline, 0.92, o.rot);
    ctx.clip();
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.ellipse(r * 0.25, r * 0.4, r * 1.1, r * 0.9, 0, 0, Math.PI * 2);
    ctx.globalAlpha = 0.55;
    ctx.fill();
    ctx.globalAlpha = 1;
    // Top-left highlight.
    ctx.fillStyle = light;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.ellipse(-r * 0.35, -r * 0.4, r * 0.5, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    // Speckle texture.
    for (const s of o.specks) {
      ctx.fillStyle = s.d ? "rgba(20,24,34,0.4)" : "rgba(255,255,255,0.3)";
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Interior facet lines (cracks / cuts).
    ctx.strokeStyle = "rgba(20, 24, 34, 0.4)";
    ctx.lineWidth = 1.4;
    for (const f of o.facets) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(f.a) * r * f.len, Math.sin(f.a) * r * f.len);
      ctx.stroke();
    }

    ctx.restore();
  }
}
