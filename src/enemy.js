import { dist, roughOutline } from "./utils.js";

const INK = "#140f1c";

// Enemy archetypes. Difficulty scales hp + damage on top of these bases.
export const ENEMY_TYPES = {
  runt: { hp: 26, speed: 132, dmg: 6, r: 12, color: "#6f8a4a", spikes: 4, contact: 0.6, mass: 0.7, eye: "#d6ff9a" },
  gremlin: { hp: 60, speed: 96, dmg: 12, r: 16, color: "#574f68", spikes: 6, contact: 0.7, mass: 1, eye: "#aef0ff" },
  stalker: { hp: 48, speed: 156, dmg: 11, r: 14, color: "#7a4f6b", spikes: 7, contact: 0.5, mass: 0.8, eye: "#ffb0e6" },
  brute: { hp: 160, speed: 58, dmg: 24, r: 25, color: "#585662", spikes: 8, contact: 0.9, mass: 2.4, eye: "#ffd0a0" },
  // Ranged: keeps its distance and spits straight bolts.
  spitter: { hp: 42, speed: 92, dmg: 8, r: 14, color: "#7a8c4a", spikes: 5, contact: 0.6, mass: 0.9, eye: "#e6ff9a", ranged: true, pref: 280, fireRange: 430, fireCd: 1.5, projSpeed: 300, projDmg: 10, projColor: "#bfe06a", projR: 7 },
  // Magic: slower, lobs homing orbs.
  warlock: { hp: 56, speed: 76, dmg: 9, r: 16, color: "#5a4b8a", spikes: 3, contact: 0.6, mass: 1.1, eye: "#cbb0ff", ranged: true, magic: true, pref: 330, fireRange: 480, fireCd: 2.3, projSpeed: 190, projDmg: 13, projColor: "#b08aff", projR: 9, homing: true },
  boss: { hp: 760, speed: 70, dmg: 28, r: 40, color: "#7a2f3a", spikes: 11, contact: 0.85, mass: 7, eye: "#ffd166", isBoss: true },
};

const BOSS_CHARGE_SPEED = 640;

export function makeProjectile(x, y, angle, speed, damage, color, homing, r, owner) {
  // `owner` ('enemy' | 'player') decides who the projectile collides with.
  return { x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: r || 7, damage, life: homing ? 4.5 : 3, color, homing: !!homing, owner: owner || "enemy" };
}

export class Enemy {
  constructor(x, y, typeId = "gremlin", scale = { hp: 1, dmg: 1 }) {
    const t = ENEMY_TYPES[typeId] || ENEMY_TYPES.gremlin;
    this.type = typeId;
    this.isBoss = !!t.isBoss;
    this.ranged = !!t.ranged;
    this.magic = !!t.magic;
    this.x = x;
    this.y = y;
    this.r = t.r;
    this.maxHp = Math.round(t.hp * (scale.hp || 1));
    this.hp = this.maxHp;
    this.speed = t.speed;
    this.damage = Math.round(t.dmg * (scale.dmg || 1));
    this.color = t.color;
    this.eyeColor = t.eye;
    this.mass = t.mass;
    this.contactInterval = t.contact;
    this.dead = false;

    // Ranged params.
    this.pref = t.pref || 0;
    this.fireRange = t.fireRange || 0;
    this.fireCd = t.fireCd || 1;
    this.projSpeed = t.projSpeed || 280;
    this.projDmg = Math.round((t.projDmg || 8) * (scale.dmg || 1));
    this.projColor = t.projColor || "#fff";
    this.projR = t.projR || 7;
    this.homing = !!t.homing;
    this.fireTimer = Math.random() * this.fireCd;
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;

    // Boss.
    this.bossKind = "charger";
    this.name = "Guardian";
    this.bossState = "chase";
    this.bossTimer = 1.5;
    this.castCount = 0;
    this.chargeDx = 0;
    this.chargeDy = 0;

    this.vx = 0;
    this.vy = 0;
    this.hurtFlash = 0;
    this.contactTimer = 0;
    this.chillTimer = 0; // frost slow (frostTouch / staff / Auralist) — scales speed down
    this.wobble = Math.random() * Math.PI * 2;

    this.outline = roughOutline(() => Math.random(), this.isBoss ? 15 : 13, 0.2);
    const spikeCount = t.spikes + Math.floor(Math.random() * 2);
    this.spikes = Array.from({ length: spikeCount }, (_, i) => ({
      a: (i / spikeCount) * Math.PI * 2 + Math.random() * 0.3,
      len: 1.25 + Math.random() * 0.4,
      w: 0.26 + Math.random() * 0.16,
    }));
    this.specks = Array.from({ length: Math.round(this.r / 4) }, () => ({
      x: (Math.random() - 0.5) * this.r,
      y: (Math.random() - 0.5) * this.r,
      r: 0.8 + Math.random() * 1.6,
    }));
  }

  takeHit(damage, fromAngle, knockback) {
    this.hp -= damage;
    this.hurtFlash = 0.18;
    const kb = knockback / this.mass;
    this.vx += Math.cos(fromAngle) * kb;
    this.vy += Math.sin(fromAngle) * kb;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
    }
  }

  // Frost slow — bosses shrug off most of it.
  applyChill(dur) {
    this.chillTimer = Math.max(this.chillTimer, this.isBoss ? dur * 0.4 : dur);
  }
  get effSpeed() {
    return this.chillTimer > 0 ? this.speed * 0.5 : this.speed;
  }

  update(dt, player, world, projectiles) {
    if (this.dead) return;
    this.wobble += dt * 8;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.contactTimer > 0) this.contactTimer -= dt;
    if (this.chillTimer > 0) this.chillTimer -= dt;

    if (this.isBoss) this.updateBoss(dt, player, projectiles);
    else if (this.ranged) this.updateRanged(dt, player, projectiles);
    else this.updateChase(dt, player);

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const decay = Math.pow(0.0025, dt);
    this.vx *= decay;
    this.vy *= decay;

    const before = { x: this.x, y: this.y };
    const resolved = world.resolve(this.x, this.y, this.r);
    this.x = resolved.x;
    this.y = resolved.y;
    this.x = Math.max(this.r, Math.min(world.width - this.r, this.x));
    this.y = Math.max(this.r, Math.min(world.height - this.r, this.y));
    if (world.keepOutOfSafe) {
      const safe = world.keepOutOfSafe(this.x, this.y, this.r);
      this.x = safe.x;
      this.y = safe.y;
    }
    if (this.bossState === "charge" && dist(before.x, before.y, this.x, this.y) < this.speed * dt) {
      this.bossState = "recover";
      this.bossTimer = 0.6;
    }

    this.tryContact(player);
  }

  updateChase(dt, player) {
    if (this.vx * this.vx + this.vy * this.vy < 60 * 60) {
      const a = Math.atan2(player.y - this.y, player.x - this.x);
      this.x += Math.cos(a) * this.effSpeed * dt;
      this.y += Math.sin(a) * this.effSpeed * dt;
    }
  }

  // Kite to a preferred range, then fire.
  updateRanged(dt, player, projectiles) {
    if (this.vx * this.vx + this.vy * this.vy < 60 * 60) {
      const a = Math.atan2(player.y - this.y, player.x - this.x);
      const d = dist(this.x, this.y, player.x, player.y);
      let mvx = 0;
      let mvy = 0;
      if (d > this.pref + 50) {
        mvx = Math.cos(a);
        mvy = Math.sin(a);
      } else if (d < this.pref - 50) {
        mvx = -Math.cos(a);
        mvy = -Math.sin(a);
      } else {
        mvx = Math.cos(a + (Math.PI / 2) * this.strafeDir) * 0.6;
        mvy = Math.sin(a + (Math.PI / 2) * this.strafeDir) * 0.6;
      }
      this.x += mvx * this.effSpeed * dt;
      this.y += mvy * this.effSpeed * dt;
    }
    this.fireTimer -= dt;
    if (this.fireTimer <= 0 && !player.dead && projectiles) {
      const d = dist(this.x, this.y, player.x, player.y);
      if (d < this.fireRange) {
        const a = Math.atan2(player.y - this.y, player.x - this.x);
        projectiles.push(makeProjectile(this.x, this.y, a, this.projSpeed, this.projDmg, this.projColor, this.homing, this.projR));
        this.fireTimer = this.fireCd * (0.85 + Math.random() * 0.3);
      }
    }
  }

  updateBoss(dt, player, projectiles) {
    if (this.bossKind === "charger") {
      this.bossCharger(dt, player);
      return;
    }
    // Ranged bosses (archer / caster): kite + cast on a timer.
    if (this.vx * this.vx + this.vy * this.vy < 80 * 80) {
      const a = Math.atan2(player.y - this.y, player.x - this.x);
      const d = dist(this.x, this.y, player.x, player.y);
      const pref = 360;
      let mvx = 0;
      let mvy = 0;
      if (d > pref + 80) {
        mvx = Math.cos(a);
        mvy = Math.sin(a);
      } else if (d < pref - 40) {
        mvx = -Math.cos(a);
        mvy = -Math.sin(a);
      } else {
        mvx = Math.cos(a + (Math.PI / 2) * this.strafeDir) * 0.7;
        mvy = Math.sin(a + (Math.PI / 2) * this.strafeDir) * 0.7;
      }
      this.x += mvx * this.speed * dt;
      this.y += mvy * this.speed * dt;
    }
    this.bossTimer -= dt;
    if (this.bossTimer <= 0 && projectiles && !player.dead) {
      const a = Math.atan2(player.y - this.y, player.x - this.x);
      const pdmg = Math.max(8, Math.round(this.damage * 0.55));
      if (this.bossKind === "archer") {
        for (let i = -2; i <= 2; i++) {
          projectiles.push(makeProjectile(this.x, this.y, a + i * 0.16, 340, pdmg, "#ffd27a", false, 8));
        }
        this.bossTimer = 1.5;
      } else {
        // caster: homing fan, with a radial burst every 3rd cast.
        for (let i = -1; i <= 1; i++) {
          projectiles.push(makeProjectile(this.x, this.y, a + i * 0.3, 190, pdmg, "#c79bff", true, 10));
        }
        this.castCount++;
        if (this.castCount % 3 === 0) {
          for (let i = 0; i < 14; i++) {
            projectiles.push(makeProjectile(this.x, this.y, (i / 14) * Math.PI * 2, 220, pdmg, "#c79bff", false, 8));
          }
        }
        this.bossTimer = 2.0;
      }
    }
  }

  bossCharger(dt, player) {
    this.bossTimer -= dt;
    const a = Math.atan2(player.y - this.y, player.x - this.x);
    const d = dist(this.x, this.y, player.x, player.y);
    if (this.bossState === "chase") {
      this.x += Math.cos(a) * this.speed * dt;
      this.y += Math.sin(a) * this.speed * dt;
      if (this.bossTimer <= 0 && d < 460) {
        this.bossState = "telegraph";
        this.bossTimer = 0.7;
        this.chargeDx = Math.cos(a);
        this.chargeDy = Math.sin(a);
      }
    } else if (this.bossState === "telegraph") {
      if (this.bossTimer <= 0) {
        this.bossState = "charge";
        this.bossTimer = 0.5;
        this.vx = this.chargeDx * BOSS_CHARGE_SPEED;
        this.vy = this.chargeDy * BOSS_CHARGE_SPEED;
      }
    } else if (this.bossState === "charge") {
      if (this.bossTimer <= 0) {
        this.bossState = "recover";
        this.bossTimer = 0.6;
      }
    } else if (this.bossTimer <= 0) {
      this.bossState = "chase";
      this.bossTimer = 2.2 + Math.random();
    }
  }

  tryContact(player) {
    if (player.dead || player.invincible) return;
    if (dist(this.x, this.y, player.x, player.y) >= this.r + player.r) return;
    if (this.contactTimer > 0) return;
    const charging = this.bossState === "charge";
    player.takeDamage(charging ? Math.round(this.damage * 1.6) : this.damage, this.x, this.y);
    this.contactTimer = charging ? 0.4 : this.contactInterval;
    const a = Math.atan2(this.y - player.y, this.x - player.x);
    this.vx += Math.cos(a) * 120;
    this.vy += Math.sin(a) * 120;
  }

  draw(ctx) {
    const r = this.r;
    const bob = Math.sin(this.wobble) * (this.isBoss ? 3 : 2);
    const telegraph = this.bossState === "telegraph";
    const flash = this.hurtFlash > 0 || telegraph;
    ctx.save();
    ctx.translate(this.x, this.y + bob);

    ctx.fillStyle = "rgba(20, 24, 38, 0.26)";
    ctx.beginPath();
    ctx.ellipse(0, r * 0.85 - bob, r * 0.95, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineJoin = "round";

    ctx.strokeStyle = INK;
    ctx.lineWidth = this.isBoss ? 3 : 2;
    for (const s of this.spikes) {
      const a = s.a + Math.sin(this.wobble * 0.5) * 0.05;
      const bx = Math.cos(a) * r * 0.7;
      const by = Math.sin(a) * r * 0.7;
      const tx = Math.cos(a) * r * s.len;
      const ty = Math.sin(a) * r * s.len;
      const px = Math.cos(a + Math.PI / 2) * r * s.w;
      const py = Math.sin(a + Math.PI / 2) * r * s.w;
      ctx.fillStyle = flash ? "#ffffff" : "#b9c9e6";
      ctx.beginPath();
      ctx.moveTo(bx + px, by + py);
      ctx.lineTo(tx, ty);
      ctx.lineTo(bx - px, by - py);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    const n = this.outline.length;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const idx = i % n;
      const a = (idx / n) * Math.PI * 2;
      const rad = r * this.outline[idx];
      const px = Math.cos(a) * rad;
      const py = Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = flash ? (telegraph ? "#ffd0d0" : "#ffffff") : this.color;
    ctx.fill();
    // Chilled enemies get a frosty blue wash.
    if (this.chillTimer > 0 && !flash) {
      ctx.fillStyle = "rgba(150,210,255,0.34)";
      ctx.fill();
    }
    ctx.lineWidth = this.isBoss ? 3.5 : 2.5;
    ctx.strokeStyle = this.chillTimer > 0 && !flash ? "#9fd8ff" : INK;
    ctx.stroke();

    if (!flash) {
      ctx.save();
      ctx.clip();
      ctx.fillStyle = "rgba(20,16,28,0.4)";
      ctx.beginPath();
      ctx.ellipse(r * 0.3, r * 0.45, r * 1.1, r * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(200, 215, 240, 0.4)";
      for (const s of this.specks) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Magic casters get a little hovering rune.
    if (this.magic && !flash) {
      ctx.strokeStyle = "rgba(190, 150, 255, 0.8)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, -r * 1.5, r * 0.3, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (this.isBoss) {
      ctx.fillStyle = flash ? "#fff" : "#1c1620";
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(sx * r * 0.35, -r * 0.8);
        ctx.lineTo(sx * r * 0.62, -r * 1.45);
        ctx.lineTo(sx * r * 0.7, -r * 0.7);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }

    const ey = -r * 0.08;
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(-r * 0.32, ey, r * 0.26, 0, Math.PI * 2);
    ctx.arc(r * 0.32, ey, r * 0.26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = flash ? "#ff5d5d" : this.eyeColor;
    ctx.beginPath();
    ctx.arc(-r * 0.3, ey + 0.02 * r, r * 0.13, 0, Math.PI * 2);
    ctx.arc(r * 0.34, ey + 0.02 * r, r * 0.13, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    if (!this.isBoss && this.hp < this.maxHp && !this.dead) {
      const w = r * 2;
      ctx.fillStyle = "rgba(10,12,20,0.55)";
      ctx.fillRect(this.x - r, this.y - r * 2.1, w, 5);
      ctx.fillStyle = "#8be29a";
      ctx.fillRect(this.x - r, this.y - r * 2.1, w * (this.hp / this.maxHp), 5);
    }
  }
}
