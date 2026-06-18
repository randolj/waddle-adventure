import { roughBlobPath } from "./utils.js";
import { RARITIES } from "./items.js";

// Penguin art: body / weapon / armor / particle rendering + the rarity visual
// helpers it needs. Mixed onto Player.prototype via applyPlayerArt() so player.js
// stays focused on simulation. Every method here runs with `this` = the Player.

const INK = "#14110e";
export const GHOST_LIFE = 0.22; // dash afterimage lifetime (set on push in player.js, faded here)
// Rarity tiers (0 common .. 4 legendary) gate the fancy visual effects.
const RARITY_RANK = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };
function rankOf(item) {
  return item ? RARITY_RANK[item.rarity] || 0 : 0;
}
function rarityGlow(item) {
  return item ? RARITIES[item.rarity].color : "#ffffff";
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
// Shimmer palettes for the scarf trail (rare+); legendary cycles like an aurora.
const SHIMMER = {
  rare: ["#9fd0ff"],
  epic: ["#c9a6ff", "#e6d2ff"],
  legendary: ["#8fe3c8", "#7fd6ff", "#c79bff", "#ffe08a"],
};

// Visual tints keyed by rarity.
const SCARF_FABRIC = { common: "#9a3a3a", uncommon: "#4e7a46", rare: "#3f6fae", epic: "#7a5bbf", legendary: "#c8902f" };
const BLADE_DARK = { common: "#7f8a9b", uncommon: "#6f9a7e", rare: "#5f86c4", epic: "#8a6fce", legendary: "#cbb24a" };

// Each class wears a distinct body palette (green skirmisher, steel bruiser,
// violet frost-caster); the equipped armor is then drawn on top via drawArmor.
export const BODY_PALETTE = {
  drifter: { base: "#00563b", dark: "#003526", light: "#0a6e4a", flipper: "#00402d", belly: "#dadcd2" },
  warden: { base: "#3a4f63", dark: "#243441", light: "#52708c", flipper: "#2b3d4b", belly: "#d7dde2" },
  auralist: { base: "#4b3f74", dark: "#2f2750", light: "#6a5aa6", flipper: "#39305c", belly: "#dcd7ea" },
};

export function applyPlayerArt(Player) {
  Object.assign(Player.prototype, {
  emitSlash() {
    const w = this.equipped.weapon;
    const rk = rankOf(w);
    if (rk < 2) return;
    const glow = rarityGlow(w);
    const n = 3 + rk * 3 + (this.isDashStrike ? 4 : 0);
    const reach = this.atkRange;
    for (let i = 0; i < n; i++) {
      const a = this.facing + (Math.random() - 0.5) * this.atkArc * 1.4;
      const sp = 220 + Math.random() * 260;
      const d = reach * (0.5 + Math.random() * 0.5);
      this.particles.push({
        x: this.x + Math.cos(a) * d * 0.4,
        y: this.y + Math.sin(a) * d * 0.4,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.28 + Math.random() * 0.18,
        maxLife: 0.46,
        size: 2 + Math.random() * 2.5,
        color: Math.random() < 0.4 ? "#ffffff" : glow,
        spark: true,
      });
    }
  },

  // Shimmer/sparkle left in the scarf trail — only for fancier (rare+) cloaks.
  emitShimmer(dt) {
    const c = this.equipped.cloak;
    const rk = rankOf(c);
    if (rk < 2) return;
    const speed = this.isDashing ? 1.6 : Math.min(Math.hypot(this.vx, this.vy) / this.stats.moveSpeed, 1);
    if (speed < 0.12) return;
    this.shimmerTimer -= dt;
    const rate = 0.05 / (rk - 1) / (0.4 + speed); // faster when faster / rarer
    if (this.shimmerTimer > 0) return;
    this.shimmerTimer = rate;
    const pal = SHIMMER[c.rarity] || SHIMMER.rare;
    const col = pal[(Math.floor(this.fxTime * 6) + Math.floor(Math.random() * pal.length)) % pal.length];
    // Emit from behind the penguin (opposite movement).
    let bx = -this.vx;
    let by = -this.vy;
    if (this.isDashing) {
      bx = -this.dashX;
      by = -this.dashY;
    }
    const bl = Math.hypot(bx, by) || 1;
    const ox = (bx / bl) * this.r * 1.1;
    const oy = (by / bl) * this.r * 1.1 - this.r * 0.2;
    this.particles.push({
      x: this.x + ox + (Math.random() - 0.5) * this.r,
      y: this.y + oy + (Math.random() - 0.5) * this.r,
      vx: (Math.random() - 0.5) * 30,
      vy: (Math.random() - 0.5) * 30 - 14,
      life: 0.45 + Math.random() * 0.4 + rk * 0.06,
      maxLife: 1.0,
      size: 1.6 + Math.random() * 2 + (this.isDashing ? 1.5 : 0),
      color: col,
      spark: false,
    });
  },

  updateParticles(dt) {
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(p.spark ? 0.02 : 0.4, dt);
      p.vy *= Math.pow(p.spark ? 0.02 : 0.4, dt);
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    if (this.particles.length > 140) this.particles.splice(0, this.particles.length - 140);
  },
  draw(ctx) {
    const cloakRank = rankOf(this.equipped.cloak);
    const ghostCol = this.hasCloak && cloakRank >= 2 ? rarityGlow(this.equipped.cloak) : "#7fd6ff";
    for (const g of this.ghosts) {
      ctx.save();
      const a = (g.life / GHOST_LIFE) * (0.34 + cloakRank * 0.05);
      if (cloakRank >= 3) {
        ctx.shadowColor = ghostCol;
        ctx.shadowBlur = 10;
      }
      ctx.globalAlpha = a;
      ctx.translate(g.x, g.y);
      ctx.scale(g.faceLeft ? -1 : 1, 1);
      ctx.fillStyle = ghostCol;
      ctx.beginPath();
      ctx.ellipse(0, -this.r * 0.05, this.r * 0.92, this.r * 1.22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    this.drawParticles(ctx);

    ctx.save();
    ctx.translate(this.x, this.y);

    // Contact shadow.
    ctx.fillStyle = "rgba(40, 60, 90, 0.22)";
    ctx.beginPath();
    ctx.ellipse(0, this.r * 0.95, this.r * 1.05, this.r * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();

    // Healing aura (resting in camp): pulsing green ring + a rising plus.
    if (this.healing) {
      const pulse = 0.5 + 0.5 * Math.sin(this.scarfWave * 0.9);
      ctx.save();
      ctx.globalAlpha = 0.2 + pulse * 0.22;
      ctx.strokeStyle = "#7CFC9B";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, -this.r * 0.1, this.r * (1.3 + pulse * 0.3), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.55 + pulse * 0.35;
      ctx.fillStyle = "#9be29a";
      const py = -this.r * 1.85 - pulse * 6;
      ctx.fillRect(-2, py - 6, 4, 14);
      ctx.fillRect(-6, py - 2, 14, 4);
      ctx.restore();
    }

    if (this.invincible) {
      ctx.strokeStyle = "rgba(130, 220, 255, 0.75)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, -this.r * 0.1, this.r * 1.3, 0, Math.PI * 2);
      ctx.stroke();
    }

    // The swing arc (a flipper slash even with no weapon) — melee only.
    if (this.isAttacking && !this.isRanged) this.drawSwingArc(ctx);

    const scarfCol = this.hasCloak ? SCARF_FABRIC[this.equipped.cloak.rarity] : null;
    if (this.hasCloak) this.drawScarfTail(ctx, scarfCol);

    const swordBehind = Math.sin(this.swordAngle()) < -0.15;
    if (this.hasWeapon && swordBehind) this.drawWeapon(ctx);
    this.drawBody(ctx);
    if (this.hasCloak) this.drawScarfNeck(ctx, scarfCol);
    if (this.hasWeapon && !swordBehind) this.drawWeapon(ctx);

    ctx.restore();
  },

  drawParticles(ctx) {
    for (const p of this.particles) {
      const a = Math.min(1, Math.max(0, p.life / p.maxLife));
      ctx.save();
      ctx.globalAlpha = a;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 6;
      if (p.spark) {
        const vl = Math.hypot(p.vx, p.vy) || 1;
        const len = p.size * 4;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(p.x - (p.vx / vl) * len, p.y - (p.vy / vl) * len);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = a * 0.7;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 0.8;
        const s = p.size * 1.7;
        ctx.beginPath();
        ctx.moveTo(p.x - s, p.y);
        ctx.lineTo(p.x + s, p.y);
        ctx.moveTo(p.x, p.y - s);
        ctx.lineTo(p.x, p.y + s);
        ctx.stroke();
      }
      ctx.restore();
    }
  },

  // Animated slash: a sweeping trail + bright leading edge, glowing by rarity.
  drawSwingArc(ctx) {
    const w = this.equipped.weapon;
    const rk = rankOf(w);
    const col = rk >= 1 ? rarityGlow(w) : "#cfeaff";

    ctx.save();
    if (rk >= 2) {
      ctx.shadowColor = col;
      ctx.shadowBlur = 6 + rk * 3;
    }

    if (this.isDashStrike) {
      ctx.rotate(this.facing);
      const len = this.atkRange * 1.05;
      const wdt = this.atkRange * 0.22;
      ctx.beginPath();
      ctx.moveTo(this.r * 0.6, 0);
      ctx.lineTo(len * 0.5, -wdt);
      ctx.lineTo(len, 0);
      ctx.lineTo(len * 0.5, wdt);
      ctx.closePath();
      ctx.fillStyle = hexA(col, 0.22 + rk * 0.03);
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2 + rk;
      ctx.beginPath();
      ctx.moveTo(this.r * 0.6, 0);
      ctx.lineTo(len, 0);
      ctx.stroke();
      ctx.restore();
      return;
    }

    const p = this.swingProgress;
    const start = this.facing + this.swingDir * this.atkArc;
    const cur = this.facing + this.swingDir * (this.atkArc - p * this.atkArc * 2);
    const rO = this.atkRange;
    const rI = this.atkRange * 0.42;
    const steps = 12;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const a = start + (cur - start) * (i / steps);
      ctx.lineTo(Math.cos(a) * rO, Math.sin(a) * rO);
    }
    for (let i = steps; i >= 0; i--) {
      const a = start + (cur - start) * (i / steps);
      ctx.lineTo(Math.cos(a) * rI, Math.sin(a) * rI);
    }
    ctx.closePath();
    ctx.fillStyle = hexA(col, 0.16 + rk * 0.03);
    ctx.fill();
    // Bright leading edge.
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3 + rk;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(Math.cos(cur) * rI, Math.sin(cur) * rI);
    ctx.lineTo(Math.cos(cur) * rO * 1.03, Math.sin(cur) * rO * 1.03);
    ctx.stroke();
    ctx.restore();
  },

  drawScarfTail(ctx, col) {
    const r = this.r;
    let fx, fy, speed;
    if (this.isDashing) {
      fx = -this.dashX;
      fy = -this.dashY;
      speed = 1.5;
    } else {
      const v = Math.hypot(this.vx, this.vy);
      if (v > 25) {
        fx = -this.vx / v;
        fy = -this.vy / v;
        speed = Math.min(v / this.stats.moveSpeed, 1);
      } else {
        fx = 0;
        fy = 1;
        speed = 0.25;
      }
    }
    const ang = Math.atan2(fy, fx);
    const px = Math.cos(ang + Math.PI / 2);
    const py = Math.sin(ang + Math.PI / 2);
    const len = r * (1.0 + speed * 1.8);
    const segs = 6;
    const pts = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const wob = Math.sin(this.scarfWave - i * 0.8) * r * 0.18 * t * (0.5 + speed);
      pts.push({ x: Math.cos(ang) * len * t + px * wob, y: -r * 0.02 + Math.sin(ang) * len * t + py * wob, t });
    }
    const half = (t) => r * 0.22 * (1 - t) + r * 0.03;
    ctx.beginPath();
    ctx.moveTo(pts[0].x + px * half(0), pts[0].y + py * half(0));
    for (let i = 1; i <= segs; i++) ctx.lineTo(pts[i].x + px * half(pts[i].t), pts[i].y + py * half(pts[i].t));
    for (let i = segs; i >= 0; i--) ctx.lineTo(pts[i].x - px * half(pts[i].t), pts[i].y - py * half(pts[i].t));
    ctx.closePath();
    const rk = rankOf(this.equipped.cloak);
    if (this.hurtFlash > 0) {
      ctx.fillStyle = "#ff8a8a";
    } else if (rk >= 4) {
      // Legendary: a flowing aurora gradient down the scarf.
      const g = ctx.createLinearGradient(0, 0, pts[segs].x, pts[segs].y);
      const pal = SHIMMER.legendary;
      const shift = Math.floor(this.fxTime * 2);
      for (let i = 0; i < pal.length; i++) g.addColorStop(i / (pal.length - 1), pal[(i + shift) % pal.length]);
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = col;
    }
    ctx.lineJoin = "round";
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = INK;
    if (rk >= 3 && this.hurtFlash <= 0) {
      ctx.shadowColor = rarityGlow(this.equipped.cloak);
      ctx.shadowBlur = 8;
    }
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.stroke();

    // A shimmer highlight running down the scarf (rare+).
    if (rk >= 2 && this.hurtFlash <= 0) {
      for (let k = 0; k < (rk >= 3 ? 2 : 1); k++) {
        const ph = (this.fxTime * 1.4 + k * 0.5) % 1;
        const fi = ph * segs;
        const i0 = Math.min(segs, Math.floor(fi));
        const i1 = Math.min(segs, i0 + 1);
        const ft = fi - i0;
        const hx = pts[i0].x + (pts[i1].x - pts[i0].x) * ft;
        const hy = pts[i0].y + (pts[i1].y - pts[i0].y) * ft;
        ctx.save();
        ctx.globalAlpha = 0.75 * (1 - ph * 0.4);
        ctx.fillStyle = "#ffffff";
        ctx.shadowColor = rarityGlow(this.equipped.cloak);
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(hx, hy, half(ph) * 0.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  },

  drawScarfNeck(ctx, col) {
    const r = this.r;
    ctx.lineJoin = "round";
    ctx.fillStyle = this.hurtFlash > 0 ? "#ff8a8a" : col;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.82, r * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-r * 0.5, -r * 0.06);
    ctx.lineTo(r * 0.5, -r * 0.02);
    ctx.stroke();
  },

  traceBody(ctx, r) {
    const j = this.bodyJitter;
    const HW = 0.98;
    ctx.beginPath();
    ctx.moveTo(0, (-1.3 + j[0]) * r);
    ctx.bezierCurveTo((0.55 + j[1]) * r, -1.3 * r, HW * r, (-1.04 + j[2]) * r, HW * r, (-0.64 + j[3]) * r);
    ctx.lineTo(HW * r, (0.58 + j[4]) * r);
    ctx.bezierCurveTo(HW * r, 0.95 * r, (0.9 + j[5]) * r, 1.16 * r, (0.64 + j[6]) * r, 1.16 * r);
    ctx.lineTo((-0.64 + j[7]) * r, 1.16 * r);
    ctx.bezierCurveTo((-0.9 + j[8]) * r, 1.16 * r, -HW * r, 0.95 * r, -HW * r, (0.58 + j[9]) * r);
    ctx.lineTo(-HW * r, (-0.64 + j[10]) * r);
    ctx.bezierCurveTo(-HW * r, -1.04 * r, (-0.55 + j[11]) * r, -1.3 * r, 0, (-1.3 + j[0]) * r);
    ctx.closePath();
  },

  drawBody(ctx) {
    const r = this.r;
    const flip = this.faceLeft ? -1 : 1;
    const flash = this.hurtFlash > 0;
    const pal = this.bodyPalette || BODY_PALETTE.drifter;
    ctx.save();
    ctx.scale(flip, 1);
    ctx.lineJoin = "round";

    ctx.fillStyle = flash ? "#ff9a6b" : "#d9821c";
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    for (const fx of [-r * 0.5, r * 0.5]) {
      ctx.beginPath();
      ctx.ellipse(fx, r * 1.14, r * 0.4, r * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    this.traceBody(ctx, r);
    ctx.fillStyle = flash ? "#ff6b6b" : pal.base;
    ctx.fill();
    ctx.lineWidth = 2.8;
    ctx.strokeStyle = INK;
    ctx.stroke();

    if (!flash) {
      ctx.save();
      this.traceBody(ctx, r);
      ctx.clip();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = pal.dark;
      ctx.beginPath();
      ctx.ellipse(r * 0.7, r * 0.3, r * 0.9, r * 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = pal.light;
      ctx.beginPath();
      ctx.ellipse(-r * 0.45, -r * 0.75, r * 0.5, r * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    roughBlobPath(ctx, 0, r * 0.26, r * 0.62, this.bellyOutline, 1.4, 0);
    ctx.fillStyle = flash ? "#ffd0c0" : pal.belly;
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = "rgba(20,17,14,0.32)";
    ctx.stroke();

    ctx.fillStyle = flash ? "#ff6b6b" : pal.flipper;
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.beginPath();
    ctx.ellipse(-r * 0.92, r * 0.08, r * 0.2, r * 0.58, 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const eyeY = -r * 0.72;
    ctx.fillStyle = "#f3efe6";
    ctx.beginPath();
    ctx.arc(-r * 0.28, eyeY, r * 0.2, 0, Math.PI * 2);
    ctx.arc(r * 0.28, eyeY, r * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(-r * 0.22, eyeY, r * 0.11, 0, Math.PI * 2);
    ctx.arc(r * 0.34, eyeY, r * 0.11, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = flash ? "#ff9a6b" : "#d9821c";
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = INK;
    ctx.beginPath();
    ctx.moveTo(-r * 0.18, -r * 0.42);
    ctx.lineTo(r * 0.18, -r * 0.42);
    ctx.lineTo(0, -r * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    if (!flash) this.drawArmor(ctx, r);

    ctx.restore();
  },

  // Draw the EQUIPPED armor on the body. Shape is keyed to the armor's class
  // category (light harness / heavy plate / frost robe); tint comes from the
  // armor's own color, with a glow at rare+. Nothing draws when unarmored.
  drawArmor(ctx, r) {
    const a = this.equipped.armor;
    if (!a) return;
    const cat = a.classes ? a.classes[0] : this.class;
    const col = a.color || "#8a8470";
    const rk = rankOf(a);
    ctx.save();
    if (rk >= 2) {
      ctx.shadowColor = rarityGlow(a);
      ctx.shadowBlur = 3 + rk * 2;
    }
    ctx.strokeStyle = INK;

    if (cat === "warden") {
      // Heavy plate: pauldrons + a ridged breastplate with rivets.
      ctx.fillStyle = col;
      ctx.lineWidth = 1.8;
      for (const dx of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(dx * r * 0.62, -r * 0.28, r * 0.3, r * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(-r * 0.52, -r * 0.18);
      ctx.lineTo(r * 0.52, -r * 0.18);
      ctx.lineTo(r * 0.4, r * 0.34);
      ctx.lineTo(0, r * 0.46);
      ctx.lineTo(-r * 0.4, r * 0.34);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "rgba(20,17,14,0.45)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.16);
      ctx.lineTo(0, r * 0.4);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      for (const dx of [-r * 0.34, r * 0.34]) {
        ctx.beginPath();
        ctx.arc(dx, r * 0.02, r * 0.06, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (cat === "auralist") {
      // Frost robe: a draped collar + shoulder cloth, with a floating crystal.
      ctx.fillStyle = col;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-r * 0.6, -r * 0.1);
      ctx.quadraticCurveTo(-r * 0.5, r * 0.55, -r * 0.18, r * 0.5);
      ctx.lineTo(-r * 0.05, -r * 0.18);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(r * 0.6, -r * 0.1);
      ctx.quadraticCurveTo(r * 0.5, r * 0.55, r * 0.18, r * 0.5);
      ctx.lineTo(r * 0.05, -r * 0.18);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Collar V at the neck.
      ctx.beginPath();
      ctx.moveTo(-r * 0.34, -r * 0.34);
      ctx.lineTo(0, -r * 0.05);
      ctx.lineTo(r * 0.34, -r * 0.34);
      ctx.lineWidth = 2.2;
      ctx.stroke();
      // Floating frost crystal above the head.
      const cy = -r * 1.55 + Math.sin(this.fxTime * 3) * r * 0.08;
      ctx.shadowColor = "#9fd8ff";
      ctx.shadowBlur = 8;
      ctx.fillStyle = "#bfe8ff";
      ctx.strokeStyle = "#3a5f86";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(0, cy - r * 0.34);
      ctx.lineTo(r * 0.2, cy);
      ctx.lineTo(0, cy + r * 0.34);
      ctx.lineTo(-r * 0.2, cy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      // Light harness: crossed shoulder straps + a buckle.
      ctx.strokeStyle = col;
      ctx.lineWidth = r * 0.16;
      ctx.beginPath();
      ctx.moveTo(-r * 0.42, -r * 0.42);
      ctx.lineTo(r * 0.34, r * 0.24);
      ctx.moveTo(r * 0.42, -r * 0.42);
      ctx.lineTo(-r * 0.34, r * 0.24);
      ctx.stroke();
      ctx.strokeStyle = "rgba(20,17,14,0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-r * 0.42, -r * 0.42);
      ctx.lineTo(r * 0.34, r * 0.24);
      ctx.moveTo(r * 0.42, -r * 0.42);
      ctx.lineTo(-r * 0.34, r * 0.24);
      ctx.stroke();
      ctx.fillStyle = "#cdb24a";
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, -r * 0.06, r * 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  },

  swordAngle() {
    if (this.isAttacking) {
      if (this.isDashStrike) return this.facing;
      const p = this.swingProgress;
      return this.facing + this.swingDir * (this.atkArc - p * this.atkArc * 2);
    }
    return this.facing + this.swingDir * 0.5;
  },

  // Dispatch to the right weapon art by archetype.
  drawWeapon(ctx) {
    switch (this.weaponType) {
      case "mace":
        return this.drawMace(ctx);
      case "bow":
        return this.drawBow(ctx);
      case "staff":
        return this.drawStaff(ctx);
      default:
        return this.drawSword(ctx); // sword + daggers (daggers are just short)
    }
  },

  // Mace — stubby handle with a heavy head; flares while winding up.
  drawMace(ctx) {
    const w = this.equipped.weapon;
    const rk = rankOf(w);
    const glow = rarityGlow(w);
    const angle = this.swordAngle();
    const grip = this.r * 0.7;
    const reach = (this.isAttacking ? this.atkRange + 22 : this.r * 1.7) + (this.windupTimer > 0 ? 6 : 0);
    ctx.save();
    ctx.rotate(angle);
    ctx.translate(grip, 0);
    ctx.lineJoin = "round";
    // Shaft.
    ctx.strokeStyle = "#5c3517";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(reach - grip - 10, 0);
    ctx.stroke();
    // Head.
    const hx = reach - grip;
    if (rk >= 2) {
      ctx.shadowColor = glow;
      ctx.shadowBlur = 4 + rk * 2;
    }
    ctx.fillStyle = w.color;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    const hr = 9 + rk;
    ctx.beginPath();
    ctx.arc(hx, 0, hr, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Spikes.
    ctx.fillStyle = "#cfd6e0";
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(hx + Math.cos(a) * hr, Math.sin(a) * hr);
      ctx.lineTo(hx + Math.cos(a) * (hr + 5), Math.sin(a) * (hr + 5));
      ctx.lineTo(hx + Math.cos(a + 0.3) * hr, Math.sin(a + 0.3) * hr);
      ctx.closePath();
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  },

  // Bow — a curved limb + string, held out front; nocks an arrow while firing.
  drawBow(ctx) {
    const w = this.equipped.weapon;
    const rk = rankOf(w);
    const glow = rarityGlow(w);
    const angle = this.facing;
    const hold = this.r * 1.2;
    ctx.save();
    ctx.rotate(angle);
    ctx.translate(hold, 0);
    ctx.lineJoin = "round";
    const span = 16 + rk * 2;
    if (rk >= 2) {
      ctx.shadowColor = glow;
      ctx.shadowBlur = 4 + rk * 2;
    }
    // Limb (a C facing forward).
    ctx.strokeStyle = w.color;
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.arc(-4, 0, span, -Math.PI / 2.1, Math.PI / 2.1);
    ctx.stroke();
    ctx.shadowBlur = 0;
    // String.
    const draw = this.isAttacking ? Math.max(0, 6 * (1 - this.swingProgress)) : 0;
    ctx.strokeStyle = "rgba(240,245,255,0.8)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-4 + Math.cos(-Math.PI / 2.1) * span, Math.sin(-Math.PI / 2.1) * span);
    ctx.lineTo(-4 - draw, 0);
    ctx.lineTo(-4 + Math.cos(Math.PI / 2.1) * span, Math.sin(Math.PI / 2.1) * span);
    ctx.stroke();
    // Nocked arrow during the draw.
    if (draw > 0) {
      ctx.strokeStyle = "#caa14a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-4 - draw, 0);
      ctx.lineTo(span + 6, 0);
      ctx.stroke();
      ctx.fillStyle = "#e6edf6";
      ctx.beginPath();
      ctx.moveTo(span + 12, 0);
      ctx.lineTo(span + 4, -3);
      ctx.lineTo(span + 4, 3);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  },

  // Staff — a rod tipped with a glowing orb that pulses when casting.
  drawStaff(ctx) {
    const w = this.equipped.weapon;
    const rk = rankOf(w);
    const glow = rarityGlow(w);
    const angle = this.swordAngle();
    const grip = this.r * 0.6;
    const reach = this.r * 2.0;
    ctx.save();
    ctx.rotate(angle);
    ctx.translate(grip, 0);
    ctx.lineJoin = "round";
    // Rod.
    ctx.strokeStyle = "#6a4a28";
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(reach - grip, 0);
    ctx.stroke();
    // Orb.
    const ox = reach - grip;
    const pulse = this.isAttacking ? 1.4 : 1 + Math.sin(this.fxTime * 4) * 0.12;
    ctx.shadowColor = "#9fd8ff";
    ctx.shadowBlur = 8 + rk * 2;
    ctx.fillStyle = "#bfe8ff";
    ctx.beginPath();
    ctx.arc(ox, 0, (4 + rk) * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#eaf6ff";
    ctx.beginPath();
    ctx.arc(ox - 1, -1, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },

  drawSword(ctx) {
    const w = this.equipped.weapon;
    const rk = rankOf(w);
    const glow = rarityGlow(w);
    const angle = this.swordAngle();
    const grip = this.r * 0.7;
    const reach = this.isAttacking ? this.atkRange : this.r * 1.9;
    const dark = BLADE_DARK[w.rarity] || BLADE_DARK.common;

    ctx.save();
    ctx.rotate(angle);
    ctx.translate(grip, 0);
    const bladeLen = reach - grip;
    ctx.lineJoin = "round";

    // Handle.
    ctx.fillStyle = "#5c3517";
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.fillRect(-7, -3.5, 11, 7);
    ctx.strokeRect(-7, -3.5, 11, 7);

    // Guard — broader + rarity-tinted with a gem for epic+.
    const gW = rk >= 3 ? 6 : 4;
    const gH = rk >= 3 ? 16 : 14;
    ctx.fillStyle = rk >= 2 ? "#caa14a" : "#b7913f";
    ctx.fillRect(2, -gH / 2, gW, gH);
    ctx.strokeRect(2, -gH / 2, gW, gH);
    if (rk >= 3) {
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(5, 0, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }

    // Blade — glowing, slimmer + longer tip for higher rarity.
    if (rk >= 2) {
      ctx.shadowColor = glow;
      ctx.shadowBlur = 4 + rk * 3;
    }
    const tipBack = rk >= 2 ? 12 : 8;
    const halfW = rk >= 3 ? 3.4 : 4;
    const grad = ctx.createLinearGradient(6, -4, 6, 4);
    grad.addColorStop(0, "#eef4fb");
    grad.addColorStop(0.5, "#aeb9c8");
    grad.addColorStop(1, dark);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(6, -halfW);
    ctx.lineTo(bladeLen - tipBack, -halfW + 0.5);
    ctx.lineTo(bladeLen, 0);
    ctx.lineTo(bladeLen - tipBack, halfW - 0.5);
    ctx.lineTo(6, halfW);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Fuller groove (rare+).
    if (rk >= 2) {
      ctx.strokeStyle = hexA(glow, 0.5);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(9, 0);
      ctx.lineTo(bladeLen - tipBack - 2, 0);
      ctx.stroke();
    }

    // Legendary: a bright energy band travelling up the blade.
    if (rk >= 4) {
      const ph = (this.fxTime * 0.9) % 1;
      const bx = 8 + (bladeLen - 12) * ph;
      ctx.save();
      ctx.globalAlpha = 0.85 * (1 - Math.abs(ph - 0.5) * 0.6);
      ctx.shadowColor = glow;
      ctx.shadowBlur = 10;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(bx, -halfW + 0.5);
      ctx.lineTo(bx, halfW - 0.5);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  },
  });
}
