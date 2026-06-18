import { clamp, angleDiff, roughOutline } from "./utils.js";
import { makeItem, SLOTS, RANGED_TYPES } from "./items.js";
import { metaBonuses, getClass } from "./meta.js";
import { applyPlayerArt, BODY_PALETTE, GHOST_LIFE } from "./playerart.js";

// Drawing + particle code lives in playerart.js (mixed onto Player.prototype at
// the bottom of this file); BODY_PALETTE is re-exported for menu.js.
export { BODY_PALETTE };

// --- Tuning that isn't equipment-driven ---
const MOVE_SMOOTH_K = 26; // higher = snappier accel/decel
const RADIUS = 18;
const DASH_STRIKE_GRACE = 0.14; // window after a dash where attack -> dash-strike
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

// Stats shared by every class for a "naked" penguin (no gear). Equipment +
// per-class overrides add to these.
const BASE_COMMON = {
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
  critChance: 0.08, // affixes raise this
  lifesteal: 0, // heal this fraction of melee damage dealt
  damageReduction: 0, // fraction of incoming damage ignored
  // Weapon-archetype stat keys (so they have a 0 baseline to sum onto).
  heavy: false, // mace — extra shake/hit-stop
  frostTouch: false, // hits chill the enemy
  windup: 0, // mace — delay before the heavy cone lands
  hitCount: 0, // daggers — number of sub-hits per swing
  projSpeed: 0, // bow/staff — projectile speed
  projR: 0, // bow/staff — projectile radius
  // Class dash flavor (the "ability" IS the dash, re-tuned per class).
  dashContact: false, // Warden — the dash plows through enemies, dealing damage
  dashBlink: false, // Auralist — the dash bursts frost (chills) and skips dash-strike
};

// Per-class overrides on top of BASE_COMMON. Class identity = these base stats +
// the class dash flavor + the class-locked armor slot.
const CLASS_BASE = {
  drifter: {}, // the default penguin — plays exactly like before
  warden: { maxHp: 145, moveSpeed: 224, critChance: 0.04, meleeDamage: 20, knockback: 340, damageReduction: 0.05, dashContact: true },
  auralist: { maxHp: 88, moveSpeed: 242, critChance: 0.13, meleeDamage: 14, attackCooldown: 0.38, frostTouch: true, dashBlink: true },
};

export function baseStatsFor(cls) {
  return { ...BASE_COMMON, ...(CLASS_BASE[cls] || {}) };
}

// Each class spawns with its basic armor + a weapon that fits its playstyle.
const STARTER_ARMOR = { drifter: "down_harness", warden: "plate_carapace", auralist: "stormweave_vestment" };
const STARTER_WEAPON = { drifter: "shiv", warden: "ice_mallet", auralist: "frost_wand" };

export class Player {
  constructor(x, y, cls, profile) {
    this.x = x;
    this.y = y;
    this.r = RADIUS;
    this.class = cls || getClass(); // drifter | warden | auralist
    this.bodyPalette = BODY_PALETTE[this.class] || BODY_PALETTE.drifter;
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
    // Archetype attack state.
    this.windupTimer = 0; // mace — counts down to the heavy hit
    this.hitsLeft = 0; // daggers — remaining sub-hits this swing
    this.hitTimer = 0; // daggers — time to the next sub-hit
    this.hitEvery = 0;
    this.pendingShot = null; // bow/staff — a {angle,speed,damage,...} drained by main
    this.dashHits = null; // Warden — enemies already hit by the current contact-dash
    this.contactHits = []; // hits landed by the contact-dash this frame (main drains for FX)
    this.blinkFx = false; // Auralist — set on a frost-blink so main spawns a ring

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
    this.equipped = Object.fromEntries(SLOTS.map((s) => [s, null])); // weapon/armor/cloak/trinket
    this._prevMaxHp = undefined;
    this.metaBonus = metaBonuses(); // permanent upgrades bought with shards
    this.recomputeStats(); // naked baseline

    if (profile && Array.isArray(profile.items)) {
      // Returning character — restore saved gear, coins, and equipped slots.
      // (Branch on the profile EXISTING, not on a non-empty bag: a character who
      // stashed away everything still has saved coins to restore.)
      this.loadProfile(profile);
    } else {
      // New character — a class-matched weapon, scarf, and the class's armor.
      this.addItem(makeItem(STARTER_WEAPON[this.class] || "worn_sword"));
      this.addItem(makeItem("tattered_scarf"));
      this.addItem(makeItem(STARTER_ARMOR[this.class] || STARTER_ARMOR.drifter));
    }

    // Precomputed scruffy belly edge + small jitter for the chunky body anchors.
    this.bellyOutline = roughOutline(() => Math.random(), 16, 0.06);
    this.bodyJitter = Array.from({ length: 12 }, () => (Math.random() - 0.5) * 0.06);
  }

  // Switch class: re-pick base stats, drop now-invalid class armor, and hand out
  // basic class armor if you own none for the new class.
  setClass(id) {
    if (!CLASS_BASE[id]) return;
    this.class = id;
    const armor = this.equipped.armor;
    if (armor && armor.classes && !armor.classes.includes(id)) this.unequip("armor");
    if (!this.equipped.armor) {
      // Equip owned class armor, or hand out the basic kit if you have none.
      const owned = this.inventory.find((it) => it.slot === "armor" && (!it.classes || it.classes.includes(id)));
      if (owned) this.equip(owned);
      else this.addItem(makeItem(STARTER_ARMOR[id] || STARTER_ARMOR.drifter));
    }
    this.recomputeStats();
  }

  canEquip(item) {
    if (!item) return false;
    if (item.classes && !item.classes.includes(this.class)) return false;
    return item.slot in this.equipped;
  }

  // --- Equipment ---
  recomputeStats() {
    const s = baseStatsFor(this.class);
    for (const slot of SLOTS) {
      const it = this.equipped[slot];
      if (!it) continue;
      for (const [k, v] of Object.entries(it.mods)) {
        if (typeof v === "boolean") s[k] = s[k] || v;
        else s[k] = (s[k] || 0) + v;
      }
    }
    // Permanent meta upgrades stack on top of gear.
    const mb = this.metaBonus;
    if (mb) {
      s.maxHp += mb.maxHp || 0;
      s.meleeDamage += mb.meleeDamage || 0;
    }
    // Floor the attack cooldown so stacked -cooldown gear can't zero/invert it.
    s.attackCooldown = Math.max(0.05, s.attackCooldown);
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
    if (!this.canEquip(item)) return; // rejects off-class armor
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

  // --- Save/load a character profile ---
  // Serialize this character's persistent state (gear + coins) for localStorage.
  toProfile() {
    const equipped = {};
    for (const slot of SLOTS) equipped[slot] = this.equipped[slot] ? this.equipped[slot].uid : null;
    return { coins: this.coins, items: this.inventory.slice(), equipped };
  }

  // Restore a saved profile: items go straight into the bag (no auto-equip),
  // then the saved equipped slots are re-applied by uid.
  loadProfile(profile) {
    this.coins = profile.coins || 0;
    for (const it of profile.items) this.inventory.push(it);
    const eq = profile.equipped || {};
    for (const slot of SLOTS) {
      const it = eq[slot] != null && this.inventory.find((x) => x.uid === eq[slot]);
      if (it && this.canEquip(it)) this.equipped[slot] = it;
    }
    this.recomputeStats();
    this.hp = this.maxHp;
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
    // Auralist's frost-blink is a clean backstep — no dash-strike lunge.
    this.dsWindow = this.stats.dashBlink ? 0 : time + DASH_STRIKE_GRACE;
    this.attackTimer = 0;
    this.isDashStrike = false;
    // Cancel any in-progress swing's archetype state so a dash can't carry
    // leftover multi-hit/windup timers into a later attack.
    this.hitsLeft = 0;
    this.hitTimer = 0;
    this.windupTimer = 0;

    // Warden: the dash plows through enemies, hitting each once.
    this.dashHits = this.stats.dashContact ? new Set() : null;
    // Auralist: the dash bursts frost at the launch point (chills nearby foes).
    if (this.stats.dashBlink && enemies) {
      for (const e of enemies) {
        if (!e.dead && Math.hypot(e.x - this.x, e.y - this.y) < 150) e.applyChill(1.6);
      }
      this.blinkFx = true;
    }
  }

  get weaponType() {
    return this.equipped.weapon ? this.equipped.weapon.weaponType || "sword" : null;
  }
  get isRanged() {
    return RANGED_TYPES.has(this.weaponType);
  }

  startAttack() {
    const wt = this.weaponType;
    this.swingDir *= -1;
    this.isDashStrike = false;
    // Reset per-swing archetype state.
    this.pendingHit = false;
    this.windupTimer = 0;
    this.hitsLeft = 0;
    this.pendingShot = null;
    this.cooldown = this.stats.attackCooldown;
    this.atkRange = this.stats.attackRange;
    this.atkArc = this.stats.attackArc;
    this.atkDamage = this.stats.meleeDamage;
    this.atkKnockback = this.stats.knockback;

    if (wt === "bow" || wt === "staff") {
      // Ranged: no melee cone — stash a shot for main.js to spawn.
      this.attackTimer = ATTACK_DURATION;
      this.attackDuration = ATTACK_DURATION;
      this.pendingShot = {
        angle: this.facing,
        speed: this.stats.projSpeed || 560,
        damage: this.stats.meleeDamage,
        knockback: this.stats.knockback,
        r: this.stats.projR || 7,
        homing: wt === "staff",
        chill: wt === "staff" || this.stats.frostTouch ? 1.4 : 0,
        magic: wt === "staff",
      };
    } else if (wt === "mace") {
      // Heavy: wide cone that lands after a windup.
      const wind = this.stats.windup || 0.16;
      this.windupTimer = wind;
      this.attackDuration = ATTACK_DURATION + wind;
      this.attackTimer = this.attackDuration;
    } else if (wt === "dagger") {
      // Flurry: several quick sub-hits, each rolling crit/lifesteal on its own.
      const n = Math.max(1, Math.round(this.stats.hitCount || 2));
      this.attackDuration = Math.max(ATTACK_DURATION, n * 0.1);
      this.attackTimer = this.attackDuration;
      this.hitsLeft = n;
      this.hitEvery = this.attackDuration / n;
      this.hitTimer = 0; // first sub-hit arms on the next update
    } else {
      // Sword (default): the original single instant cone.
      this.attackTimer = ATTACK_DURATION;
      this.attackDuration = ATTACK_DURATION;
      this.pendingHit = true;
    }
    this.emitSlash();
  }

  startDashStrike() {
    this.attackTimer = DS_DURATION;
    this.attackDuration = DS_DURATION;
    this.cooldown = this.stats.attackCooldown + 0.04;
    this.isDashStrike = true;
    this.pendingHit = true;
    // A dash-strike is always a single hit — never inherit dagger/mace timers.
    this.hitsLeft = 0;
    this.hitTimer = 0;
    this.windupTimer = 0;
    this.pendingShot = null;
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

  update(dt, input, world, worldMouse, enemies) {
    if (this.dead) return;
    this.contactHits.length = 0; // refilled by the contact-dash below

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
      // Dash-strike is melee-only (ranged fires normally) and disabled for the
      // Auralist's frost-blink (dsWindow is already 0 there, but be explicit).
      if (this.dsWindow > 0 && this.stats.dashEnabled && !this.isRanged && !this.stats.dashBlink) this.startDashStrike();
      else this.startAttack();
      this.attackBuffer = 0;
    }

    // Drive delayed (mace windup) and multi-hit (dagger flurry) attacks.
    if (this.attackTimer > 0) {
      if (this.windupTimer > 0) {
        this.windupTimer -= dt;
        if (this.windupTimer <= 0) this.pendingHit = true;
      }
      if (this.hitsLeft > 0) {
        this.hitTimer -= dt;
        if (this.hitTimer <= 0) {
          this.pendingHit = true;
          this.hitsLeft -= 1;
          this.hitTimer = this.hitEvery;
        }
      }
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

    // Warden contact-dash: damage each enemy plowed through once.
    if (this.dashTime > 0 && this.dashHits && enemies) {
      for (const e of enemies) {
        if (e.dead || this.dashHits.has(e)) continue;
        if (Math.hypot(e.x - this.x, e.y - this.y) > this.r + e.r + 6) continue;
        const dmg = Math.round(this.stats.meleeDamage * 0.9);
        const a = Math.atan2(e.y - this.y, e.x - this.x);
        e.takeHit(dmg, a, this.stats.knockback * 1.3);
        if (this.stats.lifesteal > 0) this.hp = Math.min(this.maxHp, this.hp + dmg * this.stats.lifesteal);
        if (this.stats.frostTouch && !e.dead) e.applyChill(1.4);
        this.dashHits.add(e);
        this.contactHits.push({ x: e.x, y: e.y, r: e.r, color: e.color, damage: dmg, crit: false, killed: e.dead, dashStrike: true, frost: !!this.stats.frostTouch });
      }
    }

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
    const wid = this.equipped.weapon && this.equipped.weapon.id;
    const frosty = !!this.stats.frostTouch || wid === "frostfang" || wid === "glacier_edge";
    const hits = [];
    for (const e of enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      if (d > this.atkRange + e.r) continue;
      const toEnemy = Math.atan2(e.y - this.y, e.x - this.x);
      if (Math.abs(angleDiff(toEnemy, this.facing)) > this.atkArc) continue;
      const crit = Math.random() < Math.min(0.95, this.stats.critChance);
      const dmg = crit ? Math.round(this.atkDamage * 2) : this.atkDamage;
      e.takeHit(dmg, this.facing, this.atkKnockback * (crit ? 1.4 : 1));
      if (this.stats.lifesteal > 0) this.hp = Math.min(this.maxHp, this.hp + dmg * this.stats.lifesteal);
      if (this.stats.frostTouch && !e.dead) e.applyChill(1.4);
      hits.push({ x: e.x, y: e.y, r: e.r, color: e.color, damage: dmg, crit, killed: e.dead, dashStrike: this.isDashStrike, frost: frosty });
    }
    if (hits.length) {
      this.chainWindow = CHAIN_WINDOW; // a landed hit lets you chain-dash onward
      if (this.isDashStrike) this.iframe = Math.max(this.iframe, this.stats.dsHitIframe);
    }
    return hits;
  }

  takeDamage(amount, srcX, srcY) {
    if (this.dead || this.invincible || this.godMode) return;
    amount *= 1 - Math.min(0.7, this.stats.damageReduction || 0);
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
}

// Attach all drawing + particle methods (body, weapon, armor, scarf, fx).
applyPlayerArt(Player);
