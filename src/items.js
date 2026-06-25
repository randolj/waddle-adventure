// Item catalog, rarities, and drop/shop rolls.
// Items modify the player's derived stats via `mods` (numbers add; booleans OR).

export const RARITIES = {
  common: { name: "Common", color: "#b0aea4", weight: 58, price: 8 },
  uncommon: { name: "Uncommon", color: "#5db85d", weight: 26, price: 20 },
  rare: { name: "Rare", color: "#3a8ade", weight: 11.5, price: 48 },
  epic: { name: "Epic", color: "#9b6ff0", weight: 4, price: 100 },
  legendary: { name: "Legendary", color: "#ef9f27", weight: 0.5, price: 200 },
};

export const RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary"];

export const SLOTS = ["weapon", "armor", "cloak", "trinket"];
export const SLOT_NAMES = { weapon: "Weapon", armor: "Armor", cloak: "Cloak", trinket: "Trinket" };

// Player classes. Weapons are shared across all; ARMOR is class-locked.
export const CLASSES = ["drifter", "warden", "auralist"];
export const CLASS_NAMES = { drifter: "Drifter", warden: "Warden", auralist: "Auralist" };

// Weapon archetypes — each makes the attack resolve differently (see player.js
// startAttack/resolveAttack). `weaponType` is a top-level item field (read off
// the equipped weapon directly), NOT a stat mod.
export const WEAPON_TYPE_NAMES = { sword: "Sword", mace: "Mace", dagger: "Daggers", bow: "Bow", staff: "Staff" };
export const RANGED_TYPES = new Set(["bow", "staff"]);

// Weapon IDENTITIES — a top-level `trait` on a (legendary) weapon grants a special
// ability beyond stats, handled in player.js (resolveAttack / startAttack) + main.js
// (projectiles). The descriptions drive the inventory tooltip. One per archetype.
export const WEAPON_TRAITS = {
  cleave: { name: "Cleave", desc: "Strikes splash damage to nearby foes." },
  quake: { name: "Quake", desc: "Each smash sends a shockwave all around you." },
  execute: { name: "Execute", desc: "Massive bonus damage to wounded foes." },
  multishot: { name: "Multishot", desc: "Looses a spread of three shots at once." },
  chain: { name: "Chain", desc: "Each shot arcs onward to another foe." },
};

// `color` is used for the in-game art (blade tint / scarf fabric).
// `weaponType` (weapons) and `classes` (armor) are top-level fields, not mods.
export const ITEM_TEMPLATES = [
  // --- Swords (balanced melee arc — the baseline attack) ---
  { id: "worn_sword", name: "Worn Sword", slot: "weapon", weaponType: "sword", rarity: "common", color: "#8a93a3", desc: "A chipped but trusty blade.", mods: { meleeDamage: 18, attackRange: 24, attackCooldown: -0.12, knockback: 60, attackArc: 0.1 } },
  { id: "fish_spear", name: "Fish Spear", slot: "weapon", weaponType: "sword", rarity: "uncommon", color: "#6f9a7e", desc: "Long reach, decent poke.", mods: { meleeDamage: 26, attackRange: 40, attackCooldown: -0.12, knockback: 80, attackArc: 0.04 } },
  { id: "ice_saber", name: "Ice Saber", slot: "weapon", weaponType: "sword", rarity: "rare", color: "#5f86c4", desc: "Fast, cold, and sharp.", mods: { meleeDamage: 34, attackRange: 30, attackCooldown: -0.16, knockback: 90, attackArc: 0.15 } },
  { id: "frostfang", name: "Frostfang", slot: "weapon", weaponType: "sword", rarity: "epic", color: "#8a6fce", desc: "Bites deep with frost.", mods: { meleeDamage: 46, attackRange: 34, attackCooldown: -0.18, knockback: 120, attackArc: 0.2 } },
  { id: "glacier_edge", name: "Glacier's Edge", slot: "weapon", weaponType: "sword", rarity: "legendary", color: "#cbb24a", trait: "cleave", desc: "A sliver of the eternal glacier — its arc shears through a crowd.", mods: { meleeDamage: 62, attackRange: 42, attackCooldown: -0.2, knockback: 160, attackArc: 0.25 } },

  // --- Maces (slow windup → one heavy, wide, high-knockback cone) ---
  { id: "ice_mallet", name: "Ice Mallet", slot: "weapon", weaponType: "mace", rarity: "common", color: "#7c8290", desc: "Slow, but it lands.", mods: { meleeDamage: 34, attackRange: 18, attackCooldown: 0.16, knockback: 280, attackArc: 0.55, windup: 0.16, heavy: true } },
  { id: "frostbreaker", name: "Frostbreaker", slot: "weapon", weaponType: "mace", rarity: "rare", color: "#5f7fc4", desc: "Shatters whatever it meets.", mods: { meleeDamage: 58, attackRange: 24, attackCooldown: 0.18, knockback: 360, attackArc: 0.6, windup: 0.17, heavy: true } },
  { id: "glacier_maul", name: "Glacier Maul", slot: "weapon", weaponType: "mace", rarity: "legendary", color: "#cbb24a", trait: "quake", desc: "An avalanche on a handle — every blow quakes the ground.", mods: { meleeDamage: 96, attackRange: 30, attackCooldown: 0.2, knockback: 460, attackArc: 0.7, windup: 0.18, heavy: true } },

  // --- Daggers (fast multi-hit flurry; each sub-hit rolls crit/lifesteal) ---
  { id: "shiv", name: "Shiv", slot: "weapon", weaponType: "dagger", rarity: "common", color: "#9aa0ac", desc: "Quick little jabs.", mods: { meleeDamage: 9, attackRange: 14, attackCooldown: -0.22, knockback: 30, attackArc: 0.18, hitCount: 2, critChance: 0.05 } },
  { id: "twin_fangs", name: "Twin Fangs", slot: "weapon", weaponType: "dagger", rarity: "uncommon", color: "#6f9a7e", desc: "A blur of two edges.", mods: { meleeDamage: 12, attackRange: 16, attackCooldown: -0.24, knockback: 36, attackArc: 0.2, hitCount: 2, critChance: 0.07 } },
  { id: "frost_talons", name: "Frost Talons", slot: "weapon", weaponType: "dagger", rarity: "epic", color: "#8a6fce", desc: "Three frozen slashes a beat.", mods: { meleeDamage: 16, attackRange: 18, attackCooldown: -0.26, knockback: 44, attackArc: 0.22, hitCount: 3, critChance: 0.1 } },
  { id: "reapers_kiss", name: "Reaper's Kiss", slot: "weapon", weaponType: "dagger", rarity: "legendary", color: "#cbb24a", trait: "execute", desc: "Finishes what fear begins.", mods: { meleeDamage: 22, attackRange: 20, attackCooldown: -0.28, knockback: 50, attackArc: 0.24, hitCount: 3, critChance: 0.14 } },

  // --- Bows (ranged physical — fire an arrow; damage = weapon dmg) ---
  { id: "hunting_bow", name: "Hunting Bow", slot: "weapon", weaponType: "bow", rarity: "common", color: "#9c7a4a", desc: "Keeps trouble at arm's length.", mods: { meleeDamage: 22, attackCooldown: 0.04, knockback: 70, projSpeed: 620, projR: 6 } },
  { id: "icewind_bow", name: "Icewind Bow", slot: "weapon", weaponType: "bow", rarity: "rare", color: "#5f86c4", desc: "Arrows that whistle cold.", mods: { meleeDamage: 36, attackCooldown: 0, knockback: 90, projSpeed: 700, projR: 7 } },
  { id: "aurora_longbow", name: "Aurora Longbow", slot: "weapon", weaponType: "bow", rarity: "legendary", color: "#cbb24a", trait: "multishot", desc: "Looses ribbons of light — three at a breath.", mods: { meleeDamage: 60, attackCooldown: -0.06, knockback: 120, projSpeed: 820, projR: 8 } },

  // --- Staves (ranged magic — homing frost bolt that chills on impact) ---
  { id: "frost_wand", name: "Frost Wand", slot: "weapon", weaponType: "staff", rarity: "uncommon", color: "#6f7fb0", desc: "Seeks, then freezes.", mods: { meleeDamage: 24, attackCooldown: 0.06, knockback: 60, projSpeed: 380, projR: 9, frostTouch: true } },
  { id: "blizzard_scepter", name: "Blizzard Scepter", slot: "weapon", weaponType: "staff", rarity: "epic", color: "#8a6fce", desc: "A storm bound to a rod.", mods: { meleeDamage: 42, attackCooldown: 0, knockback: 80, projSpeed: 430, projR: 11, frostTouch: true } },
  { id: "aurora_scepter", name: "Aurora Scepter", slot: "weapon", weaponType: "staff", rarity: "legendary", color: "#cbb24a", trait: "chain", desc: "Cold leaps from foe to foe.", mods: { meleeDamage: 58, attackCooldown: -0.04, knockback: 90, projSpeed: 470, projR: 12, frostTouch: true } },

  // --- Cloaks / scarves (grant the dash) ---
  { id: "tattered_scarf", name: "Tattered Scarf", slot: "cloak", rarity: "common", color: "#9a3a3a", desc: "A short, scrappy dash.", mods: { dashEnabled: true, dashSpeed: 900, dashTime: 0.12, dashRest: -0.02 } },
  { id: "wool_scarf", name: "Woolen Scarf", slot: "cloak", rarity: "uncommon", color: "#4e7a46", desc: "Warmer, a touch longer dash.", mods: { dashEnabled: true, dashSpeed: 940, dashTime: 0.14, dashRest: -0.04 } },
  { id: "drift_cloak", name: "Drift Cloak", slot: "cloak", rarity: "rare", color: "#3f6fae", desc: "Glide further, safer.", mods: { dashEnabled: true, dashSpeed: 980, dashTime: 0.16, dashRest: -0.06, iframeAfter: 0.03 } },
  { id: "phantom_cloak", name: "Phantom Cloak", slot: "cloak", rarity: "epic", color: "#7a5bbf", desc: "Phase through danger.", mods: { dashEnabled: true, dashSpeed: 1020, dashTime: 0.18, dashRest: -0.08, iframeAfter: 0.05 } },
  { id: "aurora_mantle", name: "Aurora Mantle", slot: "cloak", rarity: "legendary", color: "#c8902f", desc: "The sky itself trails behind you.", mods: { dashEnabled: true, dashSpeed: 1080, dashTime: 0.2, dashRest: -0.1, iframeAfter: 0.08, dsHitIframe: 0.5 } },

  // --- Trinkets (passive) ---
  { id: "smooth_pebble", name: "Smooth Pebble", slot: "trinket", rarity: "common", color: "#b0aea4", desc: "Oddly comforting.", mods: { moveSpeed: 12 } },
  { id: "fish_charm", name: "Fish Charm", slot: "trinket", rarity: "uncommon", color: "#5db85d", desc: "A little more vigor.", mods: { maxHp: 25 } },
  { id: "swift_charm", name: "Swift Charm", slot: "trinket", rarity: "rare", color: "#3a8ade", desc: "Light on the feet.", mods: { moveSpeed: 45 } },
  { id: "vigor_totem", name: "Vigor Totem", slot: "trinket", rarity: "epic", color: "#9b6ff0", desc: "Hardy and quick.", mods: { maxHp: 45, moveSpeed: 20 } },
  { id: "heart_of_winter", name: "Heart of Winter", slot: "trinket", rarity: "legendary", color: "#ef9f27", desc: "The cold no longer bites.", mods: { maxHp: 70, moveSpeed: 30, dsHitIframe: 0.5 } },

  // --- Class armor (class-locked via `classes`) ---
  // Drifter — light, crit + mobility.
  { id: "down_harness", name: "Down Harness", slot: "armor", classes: ["drifter"], rarity: "common", color: "#7fae8a", desc: "Light kit for a quick penguin.", mods: { critChance: 0.04, moveSpeed: 18, dashRest: -0.03 } },
  { id: "skirmisher_vest", name: "Skirmisher's Vest", slot: "armor", classes: ["drifter"], rarity: "rare", color: "#3f8ad6", desc: "Cut for the dance of the dash.", mods: { critChance: 0.07, moveSpeed: 30, dashRest: -0.05, maxHp: 15 } },
  { id: "phantom_down", name: "Phantom Down", slot: "armor", classes: ["drifter"], rarity: "legendary", color: "#ef9f27", desc: "Worn by those never quite there.", mods: { critChance: 0.12, moveSpeed: 42, dashRest: -0.07, iframeAfter: 0.04 } },
  // Warden — heavy, the durability source.
  { id: "plate_carapace", name: "Plate Carapace", slot: "armor", classes: ["warden"], rarity: "common", color: "#8a8470", desc: "A wall of blubber and bone.", mods: { damageReduction: 0.08, maxHp: 36, moveSpeed: -8 } },
  { id: "bulwark_shell", name: "Bulwark Shell", slot: "armor", classes: ["warden"], rarity: "rare", color: "#b08a3a", desc: "Nothing gets through easily.", mods: { damageReduction: 0.12, maxHp: 60, knockback: 60 } },
  { id: "aegis_of_the_floe", name: "Aegis of the Floe", slot: "armor", classes: ["warden"], rarity: "legendary", color: "#ef9f27", desc: "An iceberg that walks.", mods: { damageReduction: 0.18, maxHp: 100, lifesteal: 0.04 } },
  // Auralist — caster, crit + cooldown + frost.
  { id: "stormweave_vestment", name: "Stormweave Vestment", slot: "armor", classes: ["auralist"], rarity: "common", color: "#7f8cc0", desc: "Channels the cold cleanly.", mods: { critChance: 0.06, attackCooldown: -0.05, frostTouch: true } },
  { id: "rime_mantle", name: "Rime Mantle", slot: "armor", classes: ["auralist"], rarity: "rare", color: "#5f9fd6", desc: "Frost gathers at its hem.", mods: { critChance: 0.09, attackCooldown: -0.08, maxHp: 18, frostTouch: true } },
  { id: "aurora_regalia", name: "Aurora Regalia", slot: "armor", classes: ["auralist"], rarity: "legendary", color: "#ef9f27", desc: "The sky's own vestments.", mods: { critChance: 0.15, attackCooldown: -0.12, maxHp: 30, frostTouch: true } },
];

let uidCounter = 1;

// Ensure new items never reuse a uid loaded from a saved character/stash.
export function bumpUid(n) {
  if (n >= uidCounter) uidCounter = n + 1;
}

function template(id) {
  return ITEM_TEMPLATES.find((t) => t.id === id);
}

// --- Item Power (gear score / "ilvl") -------------------------------------
// Power scales mostly with WHERE an item dropped (`sourceLevel` = dungeon depth
// or overworld tier+1), nudged by rarity + quality. The player's Power Level is
// the average of their equipped items' power — the looter-shooter chase number.
function powerFor(sourceLevel, rarity, quality) {
  const lvl = Math.max(1, Math.floor(sourceLevel || 1));
  const rIdx = Math.max(0, RARITY_ORDER.indexOf(rarity));
  return Math.max(1, Math.round(lvl * 8 + rIdx * 6 + ((quality || 100) - 100) / 8));
}
// Read an item's power, with a fallback for legacy saves that predate the field.
export function itemPower(item) {
  if (!item) return 0;
  if (item.power != null) return item.power;
  return powerFor(1, item.rarity, item.quality);
}
// Recommended Power for content at a given depth (≈ the gear it drops).
export function recommendedPower(depth) {
  return Math.max(1, Math.round((depth || 1) * 8));
}

// Create a fresh item instance from a template (or template id).
export function makeItem(templateOrId) {
  const t = typeof templateOrId === "string" ? template(templateOrId) : templateOrId;
  const item = { uid: uidCounter++, id: t.id, name: t.name, slot: t.slot, rarity: t.rarity, color: t.color, desc: t.desc, mods: { ...t.mods }, power: powerFor(1, t.rarity, 100) };
  if (t.weaponType) item.weaponType = t.weaponType; // top-level, not a stat mod
  if (t.classes) item.classes = [...t.classes]; // class-locked armor
  if (t.trait) item.trait = t.trait; // weapon identity — a special on-hit/on-shot ability
  return item;
}

// The weapon's trait — from the item if present, else looked up from its template by id.
// (Items saved before traits existed lack the field, so we fall back to the template;
// the trait is intrinsic to the weapon, not a rolled/stored property.)
export function traitForItem(item) {
  if (!item) return null;
  if (item.trait) return item.trait;
  const t = template(item.id);
  return (t && t.trait) || null;
}


// Coins you get for selling an item (a fraction of its shop price).
export function sellValue(item) {
  return Math.max(1, Math.round(RARITIES[item.rarity].price * 0.4));
}

// A sealed relic — can't be equipped until decoded by the camp elder.
export function makeSealedRelic(sourceLevel = 5) {
  return {
    uid: uidCounter++,
    id: "sealed_relic",
    name: "Sealed Relic",
    slot: "relic",
    rarity: "legendary",
    color: "#ef9f27",
    desc: "Ancient and unreadable. Bring it to the elder to decode.",
    relic: true,
    srcLevel: sourceLevel, // remembers its drop depth so the decoded item's power matches
    power: powerFor(sourceLevel, "legendary", 100),
    mods: {},
  };
}

// --- Procedural rolls: each drop gets a quality roll + random affixes ---

// Affixes add a named bonus (prefix/suffix) + stat mods. `slots` limits where
// they can roll. Values are rolled ~0.7–1.3× the base.
const AFFIXES = [
  { id: "sharp", prefix: "Sharp", slots: ["weapon"], mod: { meleeDamage: 9 } },
  { id: "brutal", prefix: "Brutal", slots: ["weapon"], mod: { meleeDamage: 5, knockback: 90 } },
  { id: "keen", prefix: "Keen", slots: ["weapon", "trinket", "armor"], mod: { critChance: 0.07 } },
  { id: "vampiric", prefix: "Vampiric", slots: ["weapon"], mod: { lifesteal: 0.06 } },
  { id: "long", prefix: "Long", slots: ["weapon"], mod: { attackRange: 16 } },
  { id: "quick", prefix: "Quick", slots: ["weapon"], mod: { attackCooldown: -0.05 } },
  { id: "swift", suffix: "Swiftness", slots: ["cloak", "trinket", "armor"], mod: { moveSpeed: 26 } },
  { id: "vigor", suffix: "Vigor", slots: ["trinket", "cloak", "armor"], mod: { maxHp: 24 } },
  { id: "warding", suffix: "Warding", slots: ["trinket", "cloak", "armor"], mod: { damageReduction: 0.06 } },
  { id: "gale", suffix: "the Gale", slots: ["cloak"], mod: { dashSpeed: 120, dashRest: -0.03 } },
  { id: "phasing", suffix: "Phasing", slots: ["cloak"], mod: { iframeAfter: 0.04 } },
  { id: "fortune", suffix: "Fortune", slots: ["trinket"], mod: { maxHp: 14, moveSpeed: 14 } },
];

const AFFIX_COUNT = {
  common: () => 0,
  uncommon: () => (Math.random() < 0.5 ? 1 : 0),
  rare: () => 1,
  epic: () => 2,
  legendary: () => (Math.random() < 0.5 ? 3 : 2),
};

function roundMod(v) {
  return Math.abs(v) >= 4 ? Math.round(v) : Math.round(v * 100) / 100;
}

function rollAffixes(slot, count) {
  const avail = AFFIXES.filter((a) => a.slots.includes(slot));
  const out = [];
  for (let i = 0; i < count && avail.length; i++) {
    const a = avail.splice(Math.floor(Math.random() * avail.length), 1)[0];
    const roll = 0.7 + Math.random() * 0.6;
    const mod = {};
    for (const k of Object.keys(a.mod)) mod[k] = roundMod(a.mod[k] * roll);
    out.push({ id: a.id, prefix: a.prefix, suffix: a.suffix, label: a.prefix || a.suffix, mod });
  }
  return out;
}

function composeName(base, affixes) {
  const pre = affixes.find((a) => a.prefix);
  const suf = affixes.find((a) => a.suffix);
  let name = pre ? `${pre.prefix} ${base}` : base;
  if (suf) name += ` of ${suf.suffix}`;
  return name;
}

// Mods that are counts/structural — never scaled by quality.
const NOSCALE_MODS = new Set(["hitCount", "windup", "projR"]);

// Create a procedurally-rolled item (quality variance + affixes).
export function rollItem(templateOrId, sourceLevel = 1) {
  const t = typeof templateOrId === "string" ? template(templateOrId) : templateOrId;
  const item = makeItem(t);
  const q = 0.8 + Math.random() * 0.5; // 0.8..1.3
  item.quality = Math.round(q * 100);
  item.power = powerFor(sourceLevel, t.rarity, item.quality); // gear score from where it dropped
  for (const k of Object.keys(item.mods)) {
    if (typeof item.mods[k] === "number" && !NOSCALE_MODS.has(k)) item.mods[k] = roundMod(item.mods[k] * q);
  }
  item.affixes = rollAffixes(t.slot, AFFIX_COUNT[t.rarity]());
  for (const af of item.affixes) {
    for (const k of Object.keys(af.mod)) item.mods[k] = roundMod((item.mods[k] || 0) + af.mod[k]);
  }
  item.name = composeName(t.name, item.affixes);
  return item;
}

// Decode a sealed relic into a random rolled legendary item. A guaranteed reward
// shouldn't be class-locked armor you can't wear, so exclude off-class armor.
export function decodeRelic(rng = Math.random, forClass = null, sourceLevel = 5) {
  let legends = ITEM_TEMPLATES.filter((t) => t.rarity === "legendary");
  if (forClass) {
    const wearable = legends.filter((t) => !t.classes || t.classes.includes(forClass));
    if (wearable.length) legends = wearable;
  }
  return rollItem(legends[Math.floor(rng() * legends.length)], sourceLevel);
}

// --- Crafting recipes (the Forge) -----------------------------------------
// Forge a trait-legendary of a chosen weapon archetype. A fresh roll (quality +
// affixes vary), with its identity trait intact (carried by makeItem).
export function forgeLegendary(weaponType, sourceLevel = 6) {
  const t = ITEM_TEMPLATES.find((x) => x.rarity === "legendary" && x.slot === "weapon" && x.weaponType === weaponType);
  return t ? rollItem(t, sourceLevel) : null;
}
// Temper: bump an item's power + scale its numeric mods (in place, same uid → equipped
// slots + saves stay valid). NOSCALE structural mods are left alone.
export function temperItem(item) {
  const q = 1.08;
  for (const k of Object.keys(item.mods)) {
    if (typeof item.mods[k] === "number" && !NOSCALE_MODS.has(k)) item.mods[k] = roundMod(item.mods[k] * q);
  }
  item.quality = Math.min(160, Math.round((item.quality || 100) * q));
  item.power = Math.round((item.power || 1) * 1.1);
  return item;
}
// Reroll affixes: strip the old affix mods, roll fresh ones, re-merge, recompose name
// (in place, same uid).
export function rerollAffixes(item) {
  for (const af of item.affixes || []) {
    for (const k of Object.keys(af.mod)) item.mods[k] = roundMod((item.mods[k] || 0) - af.mod[k]);
  }
  item.affixes = rollAffixes(item.slot, AFFIX_COUNT[item.rarity]());
  for (const af of item.affixes) {
    for (const k of Object.keys(af.mod)) item.mods[k] = roundMod((item.mods[k] || 0) + af.mod[k]);
  }
  const t = template(item.id);
  item.name = composeName((t && t.name) || item.name, item.affixes);
  return item;
}

function weightedRarity(rng) {
  const total = RARITY_ORDER.reduce((s, r) => s + RARITIES[r].weight, 0);
  let x = rng() * total;
  for (const r of RARITY_ORDER) {
    x -= RARITIES[r].weight;
    if (x <= 0) return r;
  }
  return "common";
}

// Roll a rarity, then a random template of that rarity. `forClass` biases drops
// AWAY from armor locked to other classes (so a class isn't drowned in gear it
// can't wear) — off-class armor still slips through ~20% of the time to sell.
export function rollDropTemplate(rng = Math.random, forClass = null) {
  const rarity = weightedRarity(rng);
  let pool = ITEM_TEMPLATES.filter((t) => t.rarity === rarity);
  if (forClass && rng() < 0.8) {
    const biased = pool.filter((t) => !t.classes || t.classes.includes(forClass));
    if (biased.length) pool = biased;
  }
  return pool[Math.floor(rng() * pool.length)];
}

// A shop stock of {item, price}. `tier` (0 = camp .. 4 = deepest town) biases
// toward better gear — each slot keeps the best rarity of (1 + tier) rolls — and
// nudges prices up. So far-flung, dangerous towns stock the good stuff.
export function rollShopStock(count = 6, rng = Math.random, tier = 0) {
  const rolls = 1 + Math.max(0, tier);
  const stock = [];
  for (let i = 0; i < count; i++) {
    let t = rollDropTemplate(rng);
    for (let k = 1; k < rolls; k++) {
      const cand = rollDropTemplate(rng);
      if (RARITY_ORDER.indexOf(cand.rarity) > RARITY_ORDER.indexOf(t.rarity)) t = cand;
    }
    stock.push({ item: rollItem(t, tier + 1), price: Math.round(RARITIES[t.rarity].price * (1 + tier * 0.15)) });
  }
  return stock;
}
