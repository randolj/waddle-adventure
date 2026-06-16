import { clamp, angleDiff, roughOutline, roughBlobPath } from "./utils.js";
import { makeItem, SLOTS, RARITIES } from "./items.js";

const INK = "#14110e";

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

// --- Tuning that isn't equipment-driven ---
const MOVE_SMOOTH_K = 26; // higher = snappier accel/decel
const RADIUS = 18;
const DASH_STRIKE_GRACE = 0.14; // window after a dash where attack -> dash-strike
const GHOST_LIFE = 0.22; // dash afterimage lifetime
const LUNGE_SPEED = 540; // forward impulse on a dash-strike
const IMPULSE_FRICTION = 0.0006; // per-second decay factor for impulse velocity
const INPUT_BUFFER = 0.13;
const ATTACK_DURATION = 0.24;
const DS_DURATION = 0.22;

// Chain-dash: briefly after a hit, a dash toward an enemy in the aim cone
// snaps you to them (fast), so combos can be chained from target to target.
const CHAIN_WINDOW = 0.6;
const CHAIN_MAX = 460;
const CHAIN_CONE = 0.8; // half-angle (radians) of the aim cone
const CHAIN_SPEED = 1550;

// Stats for a "naked" penguin (no gear). Equipment adds to these.
const BASE_STATS = {
  maxHp: 100,
  moveSpeed: 250,
  meleeDamage: 16, // a weak flipper slap with no weapon
  attackRange: 52,
  attackArc: 1.4,
  attackCooldown: 0.42,
  knockback: 300,
  dashEnabled: false, // the cloak grants the dash
  dashSpeed: 0,
  dashTime: 0,
  dashRest: 0.22,
  iframeAfter: 0.06,
  dsHitIframe: 1.0,
};

// Visual tints keyed by rarity.
const SCARF_FABRIC = { common: "#9a3a3a", uncommon: "#4e7a46", rare: "#3f6fae", epic: "#7a5bbf", legendary: "#c8902f" };
const BLADE_DARK = { common: "#7f8a9b", uncommon: "#6f9a7e", rare: "#5f86c4", epic: "#8a6fce", legendary: "#cbb24a" };

export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.r = RADIUS;
    this.facing = 0;
    this.faceLeft = false;

    // Velocity = smoothed movement (vx,vy) + decaying impulse (ix,iy).
    this.vx = 0;
    this.vy = 0;
    this.ix = 0;
    this.iy = 0;

    // Dash state.
    this.dashTime = 0;
    this.dashCd = 0;
    this.dashX = 1;
    this.dashY = 0;
    this.dashSpeedCur = 0;
    this.iframe = 0;
    this.dsWindow = 0;
    this.dashBuffer = 0;
    this.ghosts = [];

    // Chain-dash + damage-direction state.
    this.chainWindow = 0;
    this.chainTarget = null;
    this.chainDash = false;
    this.hurtDir = 0;
    this.hurtTimer = 0;

    // Attack state.
    this.attackTimer = 0;
    this.attackDuration = ATTACK_DURATION;
    this.cooldown = 0;
    this.swingDir = 1;
    this.isDashStrike = false;
    this.pendingHit = false;
    this.attackBuffer = 0;
    this.atkRange = 0;
    this.atkArc = 0;
    this.atkDamage = 0;
    this.atkKnockback = 0;

    this.hurtFlash = 0;
    this.dead = false;
    this.healing = false;
    this.godMode = false; // debug: ignore all damage
    this.scarfWave = 0;
    this.fxTime = 0; // ever-increasing clock for cosmetic animations
    this.particles = []; // cosmetic sparks/shimmer (absolute world coords)
    this.shimmerTimer = 0;

    // Inventory + equipment. Abilities/stats come from gear.
    this.coins = 0;
    this.inventory = [];
    this.equipped = { weapon: null, cloak: null, trinket: null };
    this._prevMaxHp = undefined;
    this.recomputeStats(); // naked baseline

    // Starting loadout: a basic sword + a scarf (both common, equipped).
    this.addItem(makeItem("worn_sword"));
    this.addItem(makeItem("tattered_scarf"));

    // Precomputed scruffy belly edge + small jitter for the chunky body anchors.
    this.bellyOutline = roughOutline(() => Math.random(), 16, 0.06);
    this.bodyJitter = Array.from({ length: 12 }, () => (Math.random() - 0.5) * 0.06);
  }

  // --- Equipment ---
  recomputeStats() {
    const s = { ...BASE_STATS };
    for (const slot of SLOTS) {
      const it = this.equipped[slot];
      if (!it) continue;
      for (const [k, v] of Object.entries(it.mods)) {
        if (typeof v === "boolean") s[k] = s[k] || v;
        else s[k] = (s[k] || 0) + v;
      }
    }
    this.stats = s;
    this.maxHp = s.maxHp;
    if (this._prevMaxHp === undefined) {
      this.hp = s.maxHp;
    } else if (s.maxHp !== this._prevMaxHp) {
      // Gaining/losing max HP adjusts current HP by the same amount.
      this.hp = clamp(this.hp + (s.maxHp - this._prevMaxHp), 1, s.maxHp);
    } else {
      this.hp = Math.min(this.hp, s.maxHp);
    }
    this._prevMaxHp = s.maxHp;
  }

  addItem(item) {
    this.inventory.push(item);
    if (!this.equipped[item.slot]) this.equip(item); // auto-equip an empty slot
  }

  equip(item) {
    if (!item || !(item.slot in this.equipped)) return;
    this.equipped[item.slot] = item;
    this.recomputeStats();
  }

  unequip(slot) {
    if (this.equipped[slot]) {
      this.equipped[slot] = null;
      this.recomputeStats();
    }
  }

  removeItem(item) {
    const i = this.inventory.indexOf(item);
    if (i === -1) return;
    if (this.isEquipped(item)) this.unequip(item.slot);
    this.inventory.splice(i, 1);
  }

  isEquipped(item) {
    return this.equipped[item.slot] === item;
  }

  get hasWeapon() {
    return !!this.equipped.weapon;
  }
  get hasCloak() {
    return !!this.equipped.cloak;
  }

  get isAttacking() {
    return this.attackTimer > 0;
  }
  get isDashing() {
    return this.dashTime > 0;
  }
  get invincible() {
    return this.iframe > 0;
  }
  get dashReady() {
    return this.dashCd <= 0 && this.dashTime <= 0;
  }
  get dashCharge() {
    if (this.dashTime > 0) return 0;
    if (this.dashCd <= 0) return 1;
    return 1 - this.dashCd / this.stats.dashRest;
  }
  get swingProgress() {
    return 1 - this.attackTimer / this.attackDuration;
  }

  // Find an enemy in the aim cone to chain-dash to (during the chain window).
  chainTargetIn(enemies) {
    if (this.chainWindow <= 0 || !enemies) return null;
    let best = null;
    let bestD = Infinity;
    for (const e of enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      if (d > CHAIN_MAX || d < this.r + e.r) continue;
      const a = Math.atan2(e.y - this.y, e.x - this.x);
      if (Math.abs(angleDiff(a, this.facing)) > CHAIN_CONE) continue;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  startDash(input, enemies) {
    let dx = input.axisX;
    let dy = input.axisY;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      dx /= len;
      dy /= len;
    } else {
      dx = Math.cos(this.facing);
      dy = Math.sin(this.facing);
    }
    let time = this.stats.dashTime;
    let speed = this.stats.dashSpeed;
    this.chainDash = false;

    const target = this.chainTargetIn(enemies);
    if (target) {
      const a = Math.atan2(target.y - this.y, target.x - this.x);
      dx = Math.cos(a);
      dy = Math.sin(a);
      const reach = Math.max(20, Math.hypot(target.x - this.x, target.y - this.y) - this.r - target.r - 4);
      speed = CHAIN_SPEED;
      time = Math.min(0.3, reach / speed);
      this.chainDash = true;
    }

    this.dashX = dx;
    this.dashY = dy;
    this.dashSpeedCur = speed;
    this.dashTime = time;
    this.iframe = time + this.stats.iframeAfter;
    this.dsWindow = time + DASH_STRIKE_GRACE;
    this.attackTimer = 0;
    this.isDashStrike = false;
  }

  startAttack() {
    this.attackTimer = ATTACK_DURATION;
    this.attackDuration = ATTACK_DURATION;
    this.cooldown = this.stats.attackCooldown;
    this.swingDir *= -1;
    this.isDashStrike = false;
    this.pendingHit = true;
    this.atkRange = this.stats.attackRange;
    this.atkArc = this.stats.attackArc;
    this.atkDamage = this.stats.meleeDamage;
    this.atkKnockback = this.stats.knockback;
    this.emitSlash();
  }

  startDashStrike() {
    this.attackTimer = DS_DURATION;
    this.attackDuration = DS_DURATION;
    this.cooldown = this.stats.attackCooldown + 0.04;
    this.isDashStrike = true;
    this.pendingHit = true;
    // Dash-strike derives from the melee stats (longer reach, bigger hit).
    this.atkRange = this.stats.attackRange + 36;
    this.atkArc = this.stats.attackArc * 0.78;
    this.atkDamage = Math.round(this.stats.meleeDamage * 1.6);
    this.atkKnockback = this.stats.knockback * 1.5;
    this.ix = Math.cos(this.facing) * LUNGE_SPEED;
    this.iy = Math.sin(this.facing) * LUNGE_SPEED;
    this.dashTime = 0;
    this.dashCd = this.stats.dashRest;
    this.dsWindow = 0;
    this.emitSlash();
  }

  // Particles thrown off a swing — only for nicer (rare+) weapons.
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
  }

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
  }

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
  }

  update(dt, input, world, worldMouse, enemies) {
    if (this.dead) return;

    this.facing = Math.atan2(worldMouse.y - this.y, worldMouse.x - this.x);
    this.faceLeft = Math.cos(this.facing) < 0;

    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.iframe > 0) this.iframe -= dt;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.dsWindow > 0) this.dsWindow -= dt;
    if (this.dashBuffer > 0) this.dashBuffer -= dt;
    if (this.attackBuffer > 0) this.attackBuffer -= dt;
    if (this.chainWindow > 0) this.chainWindow -= dt;
    if (this.hurtTimer > 0) this.hurtTimer -= dt;
    this.scarfWave += dt * 9;
    this.fxTime += dt;

    // Highlight the enemy a chain-dash would snap to.
    this.chainTarget = this.chainTargetIn(enemies);

    if (input.consumePress("shift", " ")) this.dashBuffer = INPUT_BUFFER;
    if (input.consumeClick()) this.attackBuffer = INPUT_BUFFER;

    // Dash requires a cloak equipped.
    if (this.dashBuffer > 0 && this.dashReady && this.stats.dashEnabled) {
      this.startDash(input, enemies);
      this.dashBuffer = 0;
    }

    if (this.attackBuffer > 0 && this.cooldown <= 0 && this.attackTimer <= 0) {
      if (this.dsWindow > 0 && this.stats.dashEnabled) this.startDashStrike();
      else this.startAttack();
      this.attackBuffer = 0;
    }

    // Smooth movement velocity toward the input direction.
    let ax = input.axisX;
    let ay = input.axisY;
    const len = Math.hypot(ax, ay);
    let tvx = 0;
    let tvy = 0;
    if (len > 0) {
      ax /= len;
      ay /= len;
      tvx = ax * this.stats.moveSpeed;
      tvy = ay * this.stats.moveSpeed;
    }
    const k = 1 - Math.exp(-MOVE_SMOOTH_K * dt);
    this.vx += (tvx - this.vx) * k;
    this.vy += (tvy - this.vy) * k;

    if (this.dashTime > 0) {
      this.dashTime -= dt;
      this.ghosts.push({ x: this.x, y: this.y, life: GHOST_LIFE, faceLeft: this.faceLeft });
      if (this.dashTime <= 0) this.dashCd = this.stats.dashRest;
    } else if (this.dashCd > 0) {
      this.dashCd -= dt;
    }
    const friction = Math.pow(IMPULSE_FRICTION, dt);
    this.ix *= friction;
    this.iy *= friction;

    let mx, my;
    if (this.dashTime > 0) {
      mx = this.dashX * this.dashSpeedCur;
      my = this.dashY * this.dashSpeedCur;
    } else {
      mx = this.vx + this.ix;
      my = this.vy + this.iy;
    }
    this.x += mx * dt;
    this.y += my * dt;

    const resolved = world.resolve(this.x, this.y, this.r);
    this.x = clamp(resolved.x, this.r, world.width - this.r);
    this.y = clamp(resolved.y, this.r, world.height - this.r);

    if (this.attackTimer > 0) {
      this.attackTimer -= dt;
      if (this.attackTimer <= 0) this.isDashStrike = false;
    }

    this.ghosts = this.ghosts.filter((g) => (g.life -= dt) > 0);
    this.emitShimmer(dt);
    this.updateParticles(dt);
  }

  // Returns the hits landed this swing so the caller can spawn juice.
  resolveAttack(enemies) {
    if (!this.pendingHit) return [];
    this.pendingHit = false;
    const hits = [];
    for (const e of enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      if (d > this.atkRange + e.r) continue;
      const toEnemy = Math.atan2(e.y - this.y, e.x - this.x);
      if (Math.abs(angleDiff(toEnemy, this.facing)) > this.atkArc) continue;
      const crit = Math.random() < 0.12;
      const dmg = crit ? Math.round(this.atkDamage * 2) : this.atkDamage;
      e.takeHit(dmg, this.facing, this.atkKnockback * (crit ? 1.4 : 1));
      hits.push({ x: e.x, y: e.y, r: e.r, color: e.color, damage: dmg, crit, killed: e.dead, dashStrike: this.isDashStrike });
    }
    if (hits.length) {
      this.chainWindow = CHAIN_WINDOW; // a landed hit lets you chain-dash onward
      if (this.isDashStrike) this.iframe = Math.max(this.iframe, this.stats.dsHitIframe);
    }
    return hits;
  }

  takeDamage(amount, srcX, srcY) {
    if (this.dead || this.invincible || this.godMode) return;
    this.hp -= amount;
    this.hurtFlash = 0.25;
    if (srcX !== undefined) {
      this.hurtDir = Math.atan2(srcY - this.y, srcX - this.x);
      this.hurtTimer = 1.0;
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
    }
  }

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

    // The swing arc (a flipper slash even with no weapon).
    if (this.isAttacking) this.drawSwingArc(ctx);

    const scarfCol = this.hasCloak ? SCARF_FABRIC[this.equipped.cloak.rarity] : null;
    if (this.hasCloak) this.drawScarfTail(ctx, scarfCol);

    const swordBehind = Math.sin(this.swordAngle()) < -0.15;
    if (this.hasWeapon && swordBehind) this.drawSword(ctx);
    this.drawBody(ctx);
    if (this.hasCloak) this.drawScarfNeck(ctx, scarfCol);
    if (this.hasWeapon && !swordBehind) this.drawSword(ctx);

    ctx.restore();
  }

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
  }

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
  }

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
  }

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
  }

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
  }

  drawBody(ctx) {
    const r = this.r;
    const flip = this.faceLeft ? -1 : 1;
    const flash = this.hurtFlash > 0;
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
    ctx.fillStyle = flash ? "#ff6b6b" : "#2a2620";
    ctx.fill();
    ctx.lineWidth = 2.8;
    ctx.strokeStyle = INK;
    ctx.stroke();

    if (!flash) {
      ctx.save();
      this.traceBody(ctx, r);
      ctx.clip();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = "#1b1813";
      ctx.beginPath();
      ctx.ellipse(r * 0.7, r * 0.3, r * 0.9, r * 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3a352c";
      ctx.beginPath();
      ctx.ellipse(-r * 0.45, -r * 0.75, r * 0.5, r * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    roughBlobPath(ctx, 0, r * 0.26, r * 0.62, this.bellyOutline, 1.4, 0);
    ctx.fillStyle = flash ? "#ffd0c0" : "#dadcd2";
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = "rgba(20,17,14,0.32)";
    ctx.stroke();

    ctx.fillStyle = flash ? "#ff6b6b" : "#221f19";
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

    ctx.restore();
  }

  swordAngle() {
    if (this.isAttacking) {
      if (this.isDashStrike) return this.facing;
      const p = this.swingProgress;
      return this.facing + this.swingDir * (this.atkArc - p * this.atkArc * 2);
    }
    return this.facing + this.swingDir * 0.5;
  }

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
  }
}
