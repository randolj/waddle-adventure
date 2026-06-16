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

export const SLOTS = ["weapon", "cloak", "trinket"];
export const SLOT_NAMES = { weapon: "Weapon", cloak: "Cloak", trinket: "Trinket" };

// `color` is used for the in-game art (blade tint / scarf fabric).
export const ITEM_TEMPLATES = [
  // --- Weapons (melee) ---
  { id: "worn_sword", name: "Worn Sword", slot: "weapon", rarity: "common", color: "#8a93a3", desc: "A chipped but trusty blade.", mods: { meleeDamage: 18, attackRange: 24, attackCooldown: -0.12, knockback: 60, attackArc: 0.1 } },
  { id: "fish_spear", name: "Fish Spear", slot: "weapon", rarity: "uncommon", color: "#6f9a7e", desc: "Long reach, decent poke.", mods: { meleeDamage: 26, attackRange: 40, attackCooldown: -0.12, knockback: 80, attackArc: 0.04 } },
  { id: "ice_saber", name: "Ice Saber", slot: "weapon", rarity: "rare", color: "#5f86c4", desc: "Fast, cold, and sharp.", mods: { meleeDamage: 34, attackRange: 30, attackCooldown: -0.16, knockback: 90, attackArc: 0.15 } },
  { id: "frostfang", name: "Frostfang", slot: "weapon", rarity: "epic", color: "#8a6fce", desc: "Bites deep with frost.", mods: { meleeDamage: 46, attackRange: 34, attackCooldown: -0.18, knockback: 120, attackArc: 0.2 } },
  { id: "glacier_edge", name: "Glacier's Edge", slot: "weapon", rarity: "legendary", color: "#cbb24a", desc: "A sliver of the eternal glacier.", mods: { meleeDamage: 62, attackRange: 42, attackCooldown: -0.2, knockback: 160, attackArc: 0.25 } },

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
];

let uidCounter = 1;

export function template(id) {
  return ITEM_TEMPLATES.find((t) => t.id === id);
}

// Create a fresh item instance from a template (or template id).
export function makeItem(templateOrId) {
  const t = typeof templateOrId === "string" ? template(templateOrId) : templateOrId;
  return { uid: uidCounter++, id: t.id, name: t.name, slot: t.slot, rarity: t.rarity, color: t.color, desc: t.desc, mods: { ...t.mods } };
}

export function rarityColor(rarity) {
  return (RARITIES[rarity] || RARITIES.common).color;
}

// Coins you get for selling an item (a fraction of its shop price).
export function sellValue(item) {
  return Math.max(1, Math.round(RARITIES[item.rarity].price * 0.4));
}

// A sealed relic — can't be equipped until decoded by the camp elder.
export function makeSealedRelic() {
  return {
    uid: uidCounter++,
    id: "sealed_relic",
    name: "Sealed Relic",
    slot: "relic",
    rarity: "legendary",
    color: "#ef9f27",
    desc: "Ancient and unreadable. Bring it to the elder to decode.",
    relic: true,
    mods: {},
  };
}

// Decode a sealed relic into a random legendary item.
export function decodeRelic(rng = Math.random) {
  const legends = ITEM_TEMPLATES.filter((t) => t.rarity === "legendary");
  return makeItem(legends[Math.floor(rng() * legends.length)]);
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

// Roll a rarity, then a random template of that rarity.
export function rollDropTemplate(rng = Math.random) {
  const rarity = weightedRarity(rng);
  const pool = ITEM_TEMPLATES.filter((t) => t.rarity === rarity);
  return pool[Math.floor(rng() * pool.length)];
}

// A shuffled-ish shop stock of {item, price}.
export function rollShopStock(count = 6, rng = Math.random) {
  const stock = [];
  for (let i = 0; i < count; i++) {
    const t = rollDropTemplate(rng);
    stock.push({ item: makeItem(t), price: RARITIES[t.rarity].price });
  }
  return stock;
}
