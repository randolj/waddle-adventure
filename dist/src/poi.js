// Overworld points of interest — a data-driven registry. Each POI kind is ONE
// entry in POI_TYPES; world.js places + draws them, main.js dispatches
// proximity/interaction, minimap.js + hud.js surface them on the map.
//
// Sim/draw-PURE: this module imports NO game state and never reaches into main.js.
// Every side-effect flows through the `api` surface main.js passes to onInteract
// (drop loot, grant a dive buff, spawn an elite, open the shrine picker, toast…).
// Adding a 6th POI type (stranded NPC, frozen event) is exactly one entry here.

import { depthColor } from "./dungeon.js";

// --- Run-scoped dive buffs (Frost Shrine) -----------------------------------
// A shrine rolls 3 of these for the player to choose from. `mod` MUST baseline in
// BASE_COMMON (player.js) or it sums dead. `kind`: flat (whole-number add), pct
// (fractional add, shown ×100), bool (turns a flag ON). Values scale with tier.
export const DIVE_BUFFS = [
  { id: "might", label: "Might", color: "#ff8f6f", desc: "+{v} melee damage", mod: "meleeDamage", base: 6, per: 3, kind: "flat" },
  { id: "swift", label: "Swiftness", color: "#9be29a", desc: "+{v} move speed", mod: "moveSpeed", base: 26, per: 10, kind: "flat" },
  { id: "ward", label: "Warding", color: "#7fd2ff", desc: "+{v}% damage reduction", mod: "damageReduction", base: 0.06, per: 0.02, kind: "pct" },
  { id: "precision", label: "Precision", color: "#ffd166", desc: "+{v}% crit chance", mod: "critChance", base: 0.06, per: 0.02, kind: "pct" },
  { id: "siphon", label: "Siphon", color: "#d98fff", desc: "+{v}% lifesteal", mod: "lifesteal", base: 0.05, per: 0.015, kind: "pct" },
  { id: "frost", label: "Frost", color: "#bfe8ff", desc: "your hits chill foes", mod: "frostTouch", base: true, per: 0, kind: "bool" },
  { id: "reach", label: "Reach", color: "#a0e0c0", desc: "+{v} attack range", mod: "attackRange", base: 10, per: 4, kind: "flat" },
];

// Build one concrete buff instance {id,label,color,text,mods} for a tier.
export function rollBuff(def, tier) {
  if (def.kind === "bool") {
    return { id: def.id, label: def.label, color: def.color, text: def.desc, mods: { [def.mod]: true } };
  }
  const v = def.base + def.per * tier;
  const mods = { [def.mod]: def.kind === "pct" ? Math.round(v * 100) / 100 : Math.round(v) };
  const shown = def.kind === "pct" ? Math.round(v * 100) : Math.round(v);
  return { id: def.id, label: def.label, color: def.color, text: def.desc.replace("{v}", shown), mods };
}

// Pick `n` distinct buff instances scaled by tier (for the shrine picker). `stats`
// (the player's live stats) drops boolean blessings already satisfied — e.g. the
// Auralist's baseline frostTouch — so a shrine can't offer a guaranteed no-op pick.
export function rollBuffChoices(tier, n = 3, stats = null) {
  const pool = DIVE_BUFFS.filter((d) => !(d.kind === "bool" && stats && stats[d.mod]));
  const out = [];
  for (let i = 0; i < n && pool.length; i++) {
    out.push(rollBuff(pool.splice(Math.floor(Math.random() * pool.length), 1)[0], tier));
  }
  return out;
}

// --- Small draw helpers (local space; world.drawPoi has translated to 0,0) ---
function glow(ctx, color, blur) {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
}
function noGlow(ctx) {
  ctx.shadowBlur = 0;
}

// --- The registry -----------------------------------------------------------
// interact: "press" (walk up + E) | "aggro" (spawn-once on proximity, no E) |
//           "contact" (auto on body overlap — wired in the dispatcher for free).
// reveal: discovery radius (flips p.found → map marker + waypoint).
// place: {count, minTier, maxTier} — generation count + which difficulty rings.
// onInteract(p, api) → return TRUE if spent immediately (mark cleared now), or
//   FALSE for a deferred flow (shrine opens a picker; mini-boss clears on kill).
export const POI_TYPES = {
  shrine: {
    id: "shrine",
    name: "Frost Shrine",
    label: "Press E — pray at the shrine",
    color: "#9fd8ff",
    interact: "press",
    reveal: 440,
    place: { count: 3, minTier: 0, maxTier: 4 },
    draw(ctx, p) {
      const spent = p.cleared;
      ctx.globalAlpha = spent ? 0.45 : 1;
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#14110e";
      ctx.lineWidth = 2;
      // Stepped stone base.
      ctx.fillStyle = "#5a6470";
      ctx.beginPath();
      ctx.moveTo(-17, 18);
      ctx.lineTo(17, 18);
      ctx.lineTo(11, -4);
      ctx.lineTo(-11, -4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Tapering pillar.
      ctx.fillStyle = "#6b7682";
      ctx.beginPath();
      ctx.moveTo(-9, -4);
      ctx.lineTo(9, -4);
      ctx.lineTo(6, -32);
      ctx.lineTo(-6, -32);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Floating frost crystal on top.
      if (!spent) glow(ctx, "#bfe8ff", 14);
      ctx.fillStyle = spent ? "#3a444e" : "#bfe8ff";
      ctx.beginPath();
      ctx.moveTo(0, -54);
      ctx.lineTo(8, -42);
      ctx.lineTo(0, -30);
      ctx.lineTo(-8, -42);
      ctx.closePath();
      ctx.fill();
      noGlow(ctx);
      // Tier-tinted rune on the pillar face.
      if (!spent) {
        ctx.strokeStyle = depthColor(p.tier + 1);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-4, -22);
        ctx.lineTo(4, -16);
        ctx.moveTo(4, -22);
        ctx.lineTo(-4, -16);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
    onInteract(p, api) {
      // Deferred: open the picker; the chosen blessing grants + clears the shrine.
      // Cache the rolled trio on the POI so closing and re-praying shows the SAME
      // choices (no free reroll-until-good); finishPoi drops it when the shrine is spent.
      if (!p.choices) p.choices = rollBuffChoices(p.tier + 1, 3, api.playerStats ? api.playerStats() : null);
      api.openShrine(p, p.choices);
      return false;
    },
  },

  cache: {
    id: "cache",
    name: "Treasure Cache",
    label: "Press E — open the cache",
    color: "#ffd166",
    interact: "press",
    reveal: 420,
    place: { count: 4, minTier: 0, maxTier: 4 },
    draw(ctx, p) {
      const spent = p.cleared;
      ctx.globalAlpha = spent ? 0.5 : 1;
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#3a2a16";
      ctx.lineWidth = 2;
      // Chest body.
      ctx.fillStyle = "#7a5230";
      ctx.beginPath();
      ctx.rect(-20, -4, 40, 22);
      ctx.fill();
      ctx.stroke();
      if (spent) {
        // Open, empty lid flipped back.
        ctx.fillStyle = "#8a6038";
        ctx.beginPath();
        ctx.moveTo(-20, -4);
        ctx.lineTo(-23, -22);
        ctx.lineTo(17, -22);
        ctx.lineTo(20, -4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#1c140c";
        ctx.fillRect(-16, -2, 32, 8);
      } else {
        // Closed domed lid + gold glow seam + lock.
        ctx.fillStyle = "#8a6038";
        ctx.beginPath();
        ctx.moveTo(-20, -4);
        ctx.quadraticCurveTo(0, -26, 20, -4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        glow(ctx, "#ffd166", 10);
        ctx.strokeStyle = "#ffd166";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-20, -4);
        ctx.lineTo(20, -4);
        ctx.stroke();
        noGlow(ctx);
        ctx.fillStyle = "#ffd166";
        ctx.fillRect(-3, -7, 6, 7);
      }
      // Metal bands.
      ctx.strokeStyle = "#caa24a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-12, -4);
      ctx.lineTo(-12, 18);
      ctx.moveTo(12, -4);
      ctx.lineTo(12, 18);
      ctx.stroke();
      ctx.globalAlpha = 1;
    },
    onInteract(p, api) {
      const tier = p.tier;
      // Cores capped at +2 so a zero-risk overworld cache never out-rewards an
      // at-risk dungeon chest (deep dives stay the best core + gear source).
      const cores = Math.min(2, 1 + (tier >> 1));
      api.dropItem(p.x, p.y - 44, tier + 1);
      api.dropCoins(p.x - 40, p.y + 10, 16 + Math.floor(Math.random() * 22) + tier * 6);
      api.dropCoins(p.x + 40, p.y + 10, 16 + Math.floor(Math.random() * 22) + tier * 6);
      api.addCores(cores);
      api.toast("Treasure cache cracked open!  +loot  +" + cores + " ✺", "#ffd166");
      api.burst(p.x, p.y - 6, 20, "#ffd166", 240, 3.6, 0.55);
      api.ring(p.x, p.y - 6, 8, 78, 0.5, "#ffe27a", 4);
      api.sfx.item();
      return true; // spent now
    },
  },

  miniboss: {
    id: "miniboss",
    name: "Roaming Warden",
    label: null, // no E — it wakes on sight (auto-aggro)
    color: "#ff6b6b",
    interact: "aggro",
    reveal: 480,
    place: { count: 3, minTier: 1, maxTier: 4 },
    draw(ctx, p) {
      const dead = p.cleared;
      const col = dead ? "#4a4750" : "#ff5a4a";
      ctx.globalAlpha = dead ? 0.5 : 1;
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#14110e";
      ctx.lineWidth = 2;
      // Standing totem stone.
      ctx.fillStyle = "#3a3640";
      ctx.beginPath();
      ctx.moveTo(-15, 18);
      ctx.lineTo(15, 18);
      ctx.lineTo(12, -18);
      ctx.lineTo(-12, -18);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Glowing rune skull.
      if (!dead) glow(ctx, col, 14);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(0, -2, 8, 0, Math.PI * 2);
      ctx.fill();
      noGlow(ctx);
      // Dark eye sockets.
      ctx.fillStyle = "#14110e";
      ctx.beginPath();
      ctx.arc(-3, -3, 2, 0, Math.PI * 2);
      ctx.arc(3, -3, 2, 0, Math.PI * 2);
      ctx.fill();
      // Jagged horns.
      ctx.strokeStyle = col;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-6, -8);
      ctx.lineTo(-13, -16);
      ctx.moveTo(6, -8);
      ctx.lineTo(13, -16);
      ctx.stroke();
      ctx.globalAlpha = 1;
    },
    onInteract(p, api) {
      // Wake a tier-scaled elite; it clears the POI when slain (overworld death
      // already drops loot + ticks kill bounties — no extra hook needed there).
      api.spawnElite(p);
      api.ring(p.x, p.y, 10, 120, 0.5, "#ff5a4a", 5);
      api.toast("A Roaming Warden wakes!", "#ff6b6b");
      api.sfx.dashStrike();
      return false; // cleared on the elite's death, not now
    },
  },

  stranded: {
    id: "stranded",
    name: "Stranded Penguin",
    label: "Press E — help the stranded penguin",
    color: "#ffb877",
    interact: "press",
    reveal: 420,
    place: { count: 2, minTier: 0, maxTier: 3 },
    draw(ctx, p) {
      const helped = p.cleared;
      ctx.globalAlpha = helped ? 0.5 : 1;
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#14110e";
      ctx.lineWidth = 2;
      // A little lost penguin — bluish, distinct from the green hero.
      ctx.fillStyle = "#4a6c86";
      ctx.beginPath();
      ctx.ellipse(0, 0, 15, 19, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#e6eef2";
      ctx.beginPath();
      ctx.ellipse(0, 5, 8, 11, 0, 0, Math.PI * 2);
      ctx.fill();
      // Eyes + beak (a worried little face).
      ctx.fillStyle = "#f3efe6";
      ctx.beginPath();
      ctx.arc(-5, -7, 3.5, 0, Math.PI * 2);
      ctx.arc(5, -7, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#14110e";
      ctx.beginPath();
      ctx.arc(-5, -6, 1.8, 0, Math.PI * 2);
      ctx.arc(5, -6, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#d9821c";
      ctx.beginPath();
      ctx.moveTo(-3, -2);
      ctx.lineTo(3, -2);
      ctx.lineTo(0, 2);
      ctx.closePath();
      ctx.fill();
      // A flipper waving for help (drops once helped).
      ctx.strokeStyle = "#4a6c86";
      ctx.lineWidth = 4.5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(13, 3);
      ctx.lineTo(helped ? 20 : 21, helped ? 6 : -12);
      ctx.stroke();
      ctx.lineCap = "butt";
      // A glowing distress "!" above (only while stranded).
      if (!helped) {
        ctx.fillStyle = "#ffd166";
        ctx.font = "800 22px Fredoka, -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("!", 0, -22);
        ctx.textAlign = "left";
      }
      ctx.globalAlpha = 1;
    },
    onInteract(p, api) {
      // Pure-upside "breather" — no fight. Rewards coins + shards + a Frost Core.
      const tier = p.tier;
      api.dropCoins(p.x, p.y, 40 + tier * 20 + Math.floor(Math.random() * 30));
      api.addCores(1);
      api.addShards(6 + tier * 3);
      api.toast("You guided a stranded penguin home!  +coins  +✦ shards  +1 ✺", "#ffd166");
      api.burst(p.x, p.y - 6, 16, "#9be29a", 200, 3, 0.5);
      api.ring(p.x, p.y, 8, 60, 0.5, "#ffd166", 3);
      api.sfx.coin();
      return true; // spent now
    },
  },

  // --- Roaming EVENTS (monetization beats) -----------------------------------
  // `session: true` = never persisted to clearedPois and re-armed by main.js a few
  // minutes after clearing, so every session (and every stretch of play) meets a
  // couple of fresh, optional rewarded-ad moments. Both keep the "never ad-or-
  // nothing" rule: the free path always pays something.

  skydrop: {
    id: "skydrop",
    name: "Sky-Drop Cache",
    label: "Press E — search the supply pod",
    color: "#8fd0ff",
    interact: "press",
    reveal: 480,
    place: { count: 2, minTier: 0, maxTier: 3 },
    session: true,
    draw(ctx, p) {
      const spent = p.cleared;
      ctx.globalAlpha = spent ? 0.45 : 1;
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#14110e";
      ctx.lineWidth = 2;
      // Draped parachute canopy, collapsed behind the pod.
      ctx.fillStyle = spent ? "#7c8898" : "#e86f5f";
      ctx.beginPath();
      ctx.moveTo(-26, -8);
      ctx.quadraticCurveTo(-6, -46, 22, -18);
      ctx.quadraticCurveTo(10, -6, -2, -10);
      ctx.quadraticCurveTo(-14, -2, -26, -8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Metal supply capsule, half-buried at an angle.
      ctx.save();
      ctx.rotate(-0.22);
      ctx.fillStyle = "#9fb2c4";
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(-16, -6, 32, 22, 8) : ctx.rect(-16, -6, 32, 22);
      ctx.fill();
      ctx.stroke();
      // Hatch seam + blinking beacon while unopened.
      ctx.strokeStyle = "#5d6d7d";
      ctx.beginPath();
      ctx.moveTo(-16, 5);
      ctx.lineTo(16, 5);
      ctx.stroke();
      if (!spent) {
        glow(ctx, "#8fd0ff", 12);
        ctx.fillStyle = "#bfe8ff";
        ctx.beginPath();
        ctx.arc(9, -1, 3.4, 0, Math.PI * 2);
        ctx.fill();
        noGlow(ctx);
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    },
    onInteract(p, api) {
      // The free find ALWAYS pays (never ad-or-nothing): a coin scatter on open.
      const tier = p.tier;
      api.dropCoins(p.x - 32, p.y + 12, 18 + tier * 8 + Math.floor(Math.random() * 16));
      api.dropCoins(p.x + 32, p.y + 12, 18 + tier * 8 + Math.floor(Math.random() * 16));
      api.burst(p.x, p.y - 8, 16, "#bfe8ff", 220, 3.2, 0.5);
      api.sfx.item();
      // Deferred: main.js opens the sealed-cache offer (rewarded ad → rare gear).
      api.openSkydrop(p);
      return false; // finishPoi happens when the offer resolves (open or leave)
    },
  },

  gilded: {
    id: "gilded",
    name: "Gilded Quarry",
    label: null, // no E — it wakes on sight (auto-aggro)
    color: "#ffd166",
    interact: "aggro",
    reveal: 500,
    place: { count: 2, minTier: 1, maxTier: 4 },
    session: true,
    draw(ctx, p) {
      const spent = p.cleared;
      ctx.globalAlpha = spent ? 0.4 : 1;
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#14110e";
      ctx.lineWidth = 2;
      // A gleaming golden beast, curled asleep — spiky silhouette.
      if (!spent) glow(ctx, "#ffd166", 16);
      ctx.fillStyle = spent ? "#6a5c34" : "#e8b53a";
      ctx.beginPath();
      const spikes = 9;
      for (let i = 0; i <= spikes * 2; i++) {
        const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 === 0 ? 20 : 13;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r * 0.8 - 6;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      noGlow(ctx);
      // Closed gleaming eyes while dormant.
      ctx.strokeStyle = "#14110e";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-8, -8);
      ctx.lineTo(-3, -7);
      ctx.moveTo(3, -7);
      ctx.lineTo(8, -8);
      ctx.stroke();
      // Scattered gold at its feet.
      ctx.fillStyle = "#ffd166";
      for (const [gx, gy] of [[-14, 12], [-2, 15], [10, 12]]) {
        ctx.beginPath();
        ctx.arc(gx, gy, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
    onInteract(p, api) {
      // Wake a gilded (tankier, golden) elite; its death showers boosted spoils and
      // offers the rewarded "double the spoils" beat (handled in main.js onEnemyDeath).
      api.spawnElite(p, { gilded: true });
      api.ring(p.x, p.y, 10, 130, 0.5, "#ffd166", 5);
      api.toast("A Gilded Quarry stirs — fell it for rich spoils!", "#ffd166");
      api.sfx.dashStrike();
      return false; // cleared on the elite's death, not now
    },
  },
};

export const POI_KINDS = Object.keys(POI_TYPES);
