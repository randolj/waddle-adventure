import { dist, angleDiff, clamp, roughOutline } from "./utils.js";
import { applyEnemyArt } from "./enemyart.js";

// Enemy archetypes. Difficulty scales hp + damage on top of these bases.
//
// Behavior is selected by booleans (charger/bomber/summoner/healer/shielder/
// splits/ranged/isBoss) — see `update()`'s dispatch. The `viz` fields (aspect,
// spikeLen, legs, eyeCount, eyeScale, feature) drive the silhouette so the
// archetypes read as visually distinct, not just recolored blobs.
export const ENEMY_TYPES = {
  runt: { hp: 26, speed: 132, dmg: 6, r: 12, color: "#6f8a4a", spikes: 4, contact: 0.6, mass: 0.7, eye: "#d6ff9a", spikeLen: 0.55, eyeScale: 1.45 },
  gremlin: { hp: 60, speed: 96, dmg: 12, r: 16, color: "#574f68", spikes: 6, contact: 0.7, mass: 1, eye: "#aef0ff" },
  stalker: { hp: 48, speed: 156, dmg: 11, r: 14, color: "#7a4f6b", spikes: 7, contact: 0.5, mass: 0.8, eye: "#ffb0e6", aspect: 0.9, spikeLen: 1.35, legs: true, eyeScale: 0.8 },
  brute: { hp: 160, speed: 58, dmg: 24, r: 25, color: "#585662", spikes: 8, contact: 0.9, mass: 2.4, eye: "#ffd0a0", aspect: 1.22, spikeLen: 0.7, eyeScale: 0.85, feature: "horns", hornUp: true },
  // Ranged: keeps its distance and spits straight bolts.
  spitter: { hp: 42, speed: 92, dmg: 8, r: 14, color: "#7a8c4a", spikes: 5, contact: 0.6, mass: 0.9, eye: "#e6ff9a", ranged: true, pref: 280, fireRange: 430, fireCd: 1.5, projSpeed: 300, projDmg: 10, projColor: "#bfe06a", projR: 7, aspect: 1.05, spikeLen: 0.7, eyeScale: 1.5, eyeCount: 1, feature: "nozzle" },
  // Magic: slower, lobs homing orbs.
  warlock: { hp: 56, speed: 76, dmg: 9, r: 16, color: "#5a4b8a", spikes: 3, contact: 0.6, mass: 1.1, eye: "#cbb0ff", ranged: true, magic: true, pref: 330, fireRange: 480, fireCd: 2.3, projSpeed: 190, projDmg: 13, projColor: "#b08aff", projR: 9, homing: true, aspect: 0.92, spikeLen: 0, eyeScale: 0.95 },

  // --- New behaviors ---
  // Charger: stalks, then telegraphs and lunges in a straight high-speed line.
  charger: { hp: 78, speed: 86, dmg: 16, r: 18, color: "#8a5a3a", spikes: 6, contact: 0.8, mass: 1.8, eye: "#ffd0a0", charger: true, chargeWind: 0.55, chargeSpeed: 680, aspect: 1.12, spikeLen: 0.45, eyeScale: 0.9, feature: "horns" },
  // Bomber: fragile kamikaze — rushes, lights a fuse, then bursts (and bursts
  // on death too, so killing it point-blank still hurts).
  bomber: { hp: 30, speed: 158, dmg: 9, r: 15, color: "#b8472e", spikes: 4, contact: 0.7, mass: 0.8, eye: "#ffe08a", bomber: true, fuseRange: 74, fuseTime: 0.7, boomR: 100, boomDmg: 22, aspect: 1, spikeLen: 0, eyeScale: 1.1, feature: "fuse" },
  // Summoner: hangs back and conjures minions on a timer (priority kill).
  summoner: { hp: 80, speed: 70, dmg: 8, r: 17, color: "#4a5a8a", spikes: 3, contact: 0.8, mass: 1.2, eye: "#bcd0ff", summoner: true, pref: 300, summonType: "runt", summonCd: 3.4, summonCap: 18, aspect: 0.84, spikeLen: 0.2, eyeScale: 0.9, eyeCount: 3, feature: "sigil" },
  // Splitter: a slow blob that cleaves into two smaller (non-splitting) copies
  // when it dies.
  splitter: { hp: 92, speed: 90, dmg: 12, r: 19, color: "#5a7a5e", spikes: 6, contact: 0.7, mass: 1.1, eye: "#caffd0", splits: true, aspect: 1, spikeLen: 0.85, eyeScale: 0.9, feature: "seam" },
  // Shielder: a wall on legs. Blocks damage from the front; turns slowly enough
  // that a nimble player can dash around and hit its flank.
  shielder: { hp: 112, speed: 60, dmg: 16, r: 19, color: "#6a6a72", spikes: 5, contact: 0.85, mass: 2.0, eye: "#dfe6ff", shielder: true, shieldArc: 1.35, turnRate: 2.3, aspect: 1.06, spikeLen: 0.35, eyeScale: 0.9, feature: "shield" },
  // Healer: keeps its distance and mends wounded allies (kill it first).
  healer: { hp: 64, speed: 92, dmg: 7, r: 15, color: "#6aa07a", spikes: 3, contact: 0.6, mass: 0.9, eye: "#e6fff0", healer: true, pref: 230, healRange: 260, healCd: 2.4, aspect: 0.96, spikeLen: 0, eyeScale: 1, feature: "cross" },

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
    this.facing = 0;

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

    // --- Behavior flags + per-archetype state ---
    this.charger = !!t.charger;
    this.bomber = !!t.bomber;
    this.summoner = !!t.summoner;
    this.healer = !!t.healer;
    this.shielder = !!t.shielder;
    this.splits = !!t.splits;
    this.gen = 0; // split generation — children (gen>0) don't split again
    this.spawns = []; // queued child descriptors; drained by main.js
    this.spawnScale = { hp: scale.hp || 1, dmg: scale.dmg || 1 }; // inherited difficulty

    // Charger.
    this.chargeState = "chase";
    this.chargeTimer = 1.2 + Math.random();
    this.chargeWind = t.chargeWind || 0.55;
    this.chargeSpeed = t.chargeSpeed || 660;
    this.chargeDx = 0;
    this.chargeDy = 0;
    // Bomber.
    this.fuseRange = t.fuseRange || 72;
    this.fuseTime = t.fuseTime || 0.7;
    this.fuseT = 0;
    this.boomR = t.boomR || 96;
    this.boomDmg = Math.round((t.boomDmg || t.dmg) * (scale.dmg || 1) * 1.15);
    // Summoner.
    this.summonType = t.summonType || "runt";
    this.summonCd = t.summonCd || 3.2;
    this.summonT = Math.random() * (t.summonCd || 3.2);
    this.summonCap = t.summonCap || 16;
    this.summonPulse = 0;
    // Healer.
    this.healRange = t.healRange || 260;
    this.healCd = t.healCd || 2.4;
    this.healT = Math.random() * (t.healCd || 2.4);
    this.healBeam = null;
    // Shielder. The shield blocks frontal hits but shatters after `shieldMax`
    // of them, leaving the enemy stunned + exposed (its weakness).
    this.shieldArc = t.shieldArc || 0;
    this.turnRate = t.turnRate || 2.4;
    this.blockFlash = 0;
    this.shieldMax = t.shieldMax || 5;
    this.shieldHits = this.shieldMax;
    this.stunTimer = 0;
    this.shieldBreakFx = 0;

    // Boss.
    this.bossKind = "charger";
    this.name = "Guardian";
    this.bossState = "chase";
    this.bossTimer = 1.5;
    this.castCount = 0;

    this.vx = 0;
    this.vy = 0;
    this.hurtFlash = 0;
    this.contactTimer = 0;
    this.chillTimer = 0; // frost slow (frostTouch / staff / Auralist) — scales speed down
    this.wobble = Math.random() * Math.PI * 2;

    // --- Visual identity (silhouette knobs) ---
    this.aspect = t.aspect || 1; // horizontal stretch of the body
    this.spikeLen = t.spikeLen != null ? t.spikeLen : 1; // 0 hides the spikes
    this.legs = !!t.legs;
    this.eyeCount = t.eyeCount || 2;
    this.eyeScale = t.eyeScale || 1;
    this.feature = t.feature || null; // horns/fuse/sigil/cross/shield/seam/nozzle
    this.hornUp = !!t.hornUp;

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

  // Returns the damage actually dealt (after the shielder's frontal block), so
  // callers can show the real number / lifesteal the real amount.
  takeHit(damage, fromAngle, knockback) {
    let dealt = damage;
    let kb = knockback;
    if (this.shieldArc > 0 && !this.dead) {
      // `fromAngle` points from attacker toward us, so the attacker sits in the
      // `fromAngle + PI` direction. A frontal hit is one inside the shield arc.
      if (Math.abs(angleDiff(fromAngle + Math.PI, this.facing)) < this.shieldArc) {
        dealt = Math.max(1, Math.round(damage * 0.12));
        kb = knockback * 0.25;
        this.blockFlash = 0.16;
        this.shieldHits -= 1;
        if (this.shieldHits <= 0) {
          // Shield shatters: drop the guard, stun, and leave it wide open.
          this.shieldArc = 0;
          this.stunTimer = 1.8;
          this.shieldBreakFx = 0.4;
        }
      }
    }
    this.hp -= dealt;
    this.hurtFlash = 0.18;
    const k = kb / this.mass;
    this.vx += Math.cos(fromAngle) * k;
    this.vy += Math.sin(fromAngle) * k;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
    }
    return dealt;
  }

  // Frost slow — bosses shrug off most of it.
  applyChill(dur) {
    this.chillTimer = Math.max(this.chillTimer, this.isBoss ? dur * 0.4 : dur);
  }
  get effSpeed() {
    return this.chillTimer > 0 ? this.speed * 0.5 : this.speed;
  }

  update(dt, player, world, projectiles, enemies) {
    if (this.dead) return;
    this.wobble += dt * 8;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.contactTimer > 0) this.contactTimer -= dt;
    if (this.chillTimer > 0) this.chillTimer -= dt;
    if (this.blockFlash > 0) this.blockFlash -= dt;
    if (this.stunTimer > 0) this.stunTimer -= dt;
    if (this.shieldBreakFx > 0) this.shieldBreakFx -= dt;
    const stunned = this.stunTimer > 0;

    if (stunned) {
      // Dazed (shield just shattered) — no AI, no attack; just coast on knockback.
    } else if (this.isBoss) this.updateBoss(dt, player, projectiles);
    else if (this.charger) this.updateCharger(dt, player);
    else if (this.bomber) this.updateBomber(dt, player);
    else if (this.summoner) this.updateSummoner(dt, player, enemies);
    else if (this.healer) this.updateHealer(dt, player, enemies);
    else if (this.shielder) this.updateShielder(dt, player);
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
    // A charge that slams into a wall ends early (boss + charger).
    const moved = dist(before.x, before.y, this.x, this.y);
    if (this.bossState === "charge" && moved < this.speed * dt) {
      this.bossState = "recover";
      this.bossTimer = 0.6;
    }
    if (this.chargeState === "charge" && moved < this.speed * dt) {
      this.chargeState = "recover";
      this.chargeTimer = 0.5;
    }

    if (!stunned) this.tryContact(player);
  }

  updateChase(dt, player) {
    if (this.vx * this.vx + this.vy * this.vy < 60 * 60) {
      const a = Math.atan2(player.y - this.y, player.x - this.x);
      this.facing = a;
      this.x += Math.cos(a) * this.effSpeed * dt;
      this.y += Math.sin(a) * this.effSpeed * dt;
    }
  }

  // Kite to a preferred range, then fire.
  updateRanged(dt, player, projectiles) {
    if (this.vx * this.vx + this.vy * this.vy < 60 * 60) {
      const a = Math.atan2(player.y - this.y, player.x - this.x);
      this.facing = a;
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

  // Charger: chase -> telegraph (visible wind-up) -> charge (lunge) -> recover.
  updateCharger(dt, player) {
    this.chargeTimer -= dt;
    const a = Math.atan2(player.y - this.y, player.x - this.x);
    const d = dist(this.x, this.y, player.x, player.y);
    if (this.chargeState === "chase") {
      this.facing = a;
      if (this.vx * this.vx + this.vy * this.vy < 60 * 60) {
        this.x += Math.cos(a) * this.effSpeed * dt;
        this.y += Math.sin(a) * this.effSpeed * dt;
      }
      if (this.chargeTimer <= 0 && d < 440) {
        this.chargeState = "telegraph";
        this.chargeTimer = this.chargeWind;
        this.chargeDx = Math.cos(a);
        this.chargeDy = Math.sin(a);
        this.facing = a;
      }
    } else if (this.chargeState === "telegraph") {
      this.facing = Math.atan2(this.chargeDy, this.chargeDx);
      if (this.chargeTimer <= 0) {
        this.chargeState = "charge";
        this.chargeTimer = 0.45;
        this.vx = this.chargeDx * this.chargeSpeed;
        this.vy = this.chargeDy * this.chargeSpeed;
      }
    } else if (this.chargeState === "charge") {
      if (this.chargeTimer <= 0) {
        this.chargeState = "recover";
        this.chargeTimer = 0.5;
      }
    } else {
      // recover
      if (this.chargeTimer <= 0) {
        this.chargeState = "chase";
        this.chargeTimer = 1.5 + Math.random() * 1.2;
      }
    }
  }

  // Bomber: rush straight in; once close (or on death) it bursts via onEnemyDeath.
  updateBomber(dt, player) {
    const a = Math.atan2(player.y - this.y, player.x - this.x);
    const d = dist(this.x, this.y, player.x, player.y);
    this.facing = a;
    if (this.vx * this.vx + this.vy * this.vy < 60 * 60) {
      const sp = this.fuseT > 0 ? this.effSpeed * 1.15 : this.effSpeed;
      this.x += Math.cos(a) * sp * dt;
      this.y += Math.sin(a) * sp * dt;
    }
    if (this.fuseT > 0) {
      this.fuseT -= dt;
      if (this.fuseT <= 0) {
        this.hp = 0;
        this.dead = true; // explosion handled in main.js onEnemyDeath
      }
    } else if (d < this.fuseRange) {
      this.fuseT = this.fuseTime;
    }
  }

  // Summoner: hold a mid range and conjure minions on a timer.
  updateSummoner(dt, player, enemies) {
    const a = Math.atan2(player.y - this.y, player.x - this.x);
    const d = dist(this.x, this.y, player.x, player.y);
    this.facing = a;
    if (this.vx * this.vx + this.vy * this.vy < 60 * 60) {
      let mvx = 0;
      let mvy = 0;
      if (d < this.pref - 40) {
        mvx = -Math.cos(a);
        mvy = -Math.sin(a);
      } else if (d > this.pref + 120) {
        mvx = Math.cos(a) * 0.6;
        mvy = Math.sin(a) * 0.6;
      } else {
        mvx = Math.cos(a + (Math.PI / 2) * this.strafeDir) * 0.5;
        mvy = Math.sin(a + (Math.PI / 2) * this.strafeDir) * 0.5;
      }
      this.x += mvx * this.effSpeed * dt;
      this.y += mvy * this.effSpeed * dt;
    }
    if (this.summonPulse > 0) this.summonPulse -= dt;
    this.summonT -= dt;
    if (this.summonT <= 0 && enemies && enemies.length < this.summonCap && d < 600) {
      const n = Math.random() < 0.5 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const ang = Math.random() * Math.PI * 2;
        const rr = this.r + 18 + Math.random() * 14;
        this.spawns.push({ x: this.x + Math.cos(ang) * rr, y: this.y + Math.sin(ang) * rr, type: this.summonType, hp: this.spawnScale.hp * 0.8, dmg: this.spawnScale.dmg, gen: 1 });
      }
      this.summonT = this.summonCd * (0.85 + Math.random() * 0.3);
      this.summonPulse = 0.45;
    }
  }

  // Healer: flee the player, mend the nearest wounded (non-healer) ally.
  updateHealer(dt, player, enemies) {
    const a = Math.atan2(player.y - this.y, player.x - this.x);
    const d = dist(this.x, this.y, player.x, player.y);
    this.facing = a;
    if (this.vx * this.vx + this.vy * this.vy < 60 * 60) {
      let mvx = 0;
      let mvy = 0;
      if (d < this.pref) {
        mvx = -Math.cos(a);
        mvy = -Math.sin(a);
      } else {
        mvx = Math.cos(a + (Math.PI / 2) * this.strafeDir) * 0.5;
        mvy = Math.sin(a + (Math.PI / 2) * this.strafeDir) * 0.5;
      }
      this.x += mvx * this.effSpeed * dt;
      this.y += mvy * this.effSpeed * dt;
    }
    if (this.healBeam) {
      this.healBeam.t -= dt;
      if (this.healBeam.t <= 0 || this.healBeam.target.dead) this.healBeam = null;
    }
    this.healT -= dt;
    if (this.healT <= 0 && enemies) {
      let best = null;
      let bestD = Infinity;
      for (const o of enemies) {
        if (o === this || o.dead || o.healer || o.isBoss) continue;
        if (o.hp >= o.maxHp) continue;
        const dd = dist(this.x, this.y, o.x, o.y);
        if (dd < this.healRange && dd < bestD) {
          bestD = dd;
          best = o;
        }
      }
      if (best) {
        best.hp = Math.min(best.maxHp, best.hp + Math.max(6, Math.round(best.maxHp * 0.12)));
        this.healBeam = { target: best, t: 0.35 }; // live ref so the beam tracks the ally
        this.healT = this.healCd;
      } else {
        this.healT = 0.5; // nothing to heal — check again soon
      }
    }
  }

  // Shielder: turn slowly toward the player while advancing (flank to hurt it).
  updateShielder(dt, player) {
    const want = Math.atan2(player.y - this.y, player.x - this.x);
    const turn = this.turnRate * dt;
    this.facing += clamp(angleDiff(want, this.facing), -turn, turn);
    if (this.vx * this.vx + this.vy * this.vy < 60 * 60) {
      this.x += Math.cos(this.facing) * this.effSpeed * dt;
      this.y += Math.sin(this.facing) * this.effSpeed * dt;
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
    this.facing = a;
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
      this.facing = Math.atan2(this.chargeDy, this.chargeDx);
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
    // A bomber sets dead mid-update (fuse-out) — don't also land a contact hit
    // on the same frame it explodes.
    if (this.dead || player.dead || player.invincible) return;
    if (dist(this.x, this.y, player.x, player.y) >= this.r + player.r) return;
    if (this.contactTimer > 0) return;
    // "Charging" = mid-lunge: the charge state flips to recover in one frame, so
    // also treat a fast charger/boss moving TOWARD the player as charging. The
    // toward-player test excludes knockback recoil (which points away).
    const toward = this.vx * (player.x - this.x) + this.vy * (player.y - this.y) > 0;
    const fast = (this.charger || this.isBoss) && toward && this.vx * this.vx + this.vy * this.vy > 360 * 360;
    const charging = this.bossState === "charge" || this.chargeState === "charge" || fast;
    player.takeDamage(charging ? Math.round(this.damage * 1.6) : this.damage, this.x, this.y);
    this.contactTimer = charging ? 0.4 : this.contactInterval;
    const a = Math.atan2(this.y - player.y, this.x - player.x);
    this.vx += Math.cos(a) * 120;
    this.vy += Math.sin(a) * 120;
  }

}

// Attach all rendering (the blobby silhouette + tells), mixed onto the prototype.
applyEnemyArt(Enemy);
