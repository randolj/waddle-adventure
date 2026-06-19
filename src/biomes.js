// Biomes drive palettes (overworld ground + dungeon floor/walls), the enemy
// pool, and the boss type for each region/dungeon.

export const BIOMES = {
  tundra: {
    name: "Tundra",
    ground: [[198, 206, 215], [168, 178, 189]], // [light, dark] rgb
    obstacle: { rock: "#585d68", ice: "#7ea7b6" },
    floor: [50, 54, 66],
    wall: "#2b2f3c",
    accent: "#8fbfe0",
    pool: ["runt", "gremlin", "stalker", "charger"],
    boss: { kind: "charger", name: "Frost Warden", color: "#5a7fb0" },
  },
  cavern: {
    name: "Cavern",
    ground: [[152, 140, 124], [112, 100, 86]],
    obstacle: { rock: "#6a5d4a", ice: "#9a8a6a" },
    floor: [58, 50, 40],
    wall: "#33291f",
    accent: "#c79a5a",
    pool: ["gremlin", "brute", "spitter", "bomber"],
    boss: { kind: "archer", name: "Cave Tyrant", color: "#8a6a3a" },
  },
  ember: {
    name: "Emberwaste",
    ground: [[182, 116, 86], [130, 66, 48]],
    obstacle: { rock: "#7a4030", ice: "#c25a3a" },
    floor: [60, 34, 28],
    wall: "#3a1c16",
    accent: "#ff7a3a",
    pool: ["stalker", "spitter", "brute", "bomber", "charger"],
    boss: { kind: "charger", name: "Ember Colossus", color: "#c2502a" },
  },
  verdant: {
    name: "Verdant Mire",
    ground: [[126, 150, 92], [84, 112, 62]],
    obstacle: { rock: "#4e6438", ice: "#7aa34a" },
    floor: [36, 48, 30],
    wall: "#22301a",
    accent: "#8fd45a",
    pool: ["runt", "warlock", "gremlin", "summoner", "healer"],
    boss: { kind: "caster", name: "Mire Witch", color: "#5a8a3a" },
  },
  shadow: {
    name: "Shadowfen",
    ground: [[120, 108, 140], [82, 72, 104]],
    obstacle: { rock: "#4a3f5c", ice: "#7a5bbf" },
    floor: [40, 34, 56],
    wall: "#241f34",
    accent: "#9b6ff0",
    pool: ["warlock", "stalker", "spitter", "shielder", "splitter", "summoner"],
    boss: { kind: "caster", name: "Shadow Maw", color: "#7a4fb0" },
  },
};

// Index 0..4 maps to a biome (easy -> hard themed regions). Cycles by depth in
// dungeons (biomeForDepth) and feeds overworld ring/slice theming.
export const BIOME_IDS = ["tundra", "cavern", "ember", "verdant", "shadow"];
