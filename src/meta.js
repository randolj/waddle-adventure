// Persistent account + character saves (localStorage).
//
// ACCOUNT-WIDE (shared by every character): shards, permanent upgrades, and a
// shared stash used to transfer items between characters.
// PER-CHARACTER (one per class): coins, inventory, and equipped gear.
//
// Shards are earned every run (more for extracting, some even on death) and are
// NEVER lost — the layer that survives when a run is lost.

import { bumpUid } from "./items.js";

const KEY = "penguin_meta_v2";
const OLD_KEY = "penguin_meta_v1";

// Permanent upgrades. `desc(level)` describes the bonus AT that level (so the
// shop can show "next: +90 max HP"); `cost(level)` is the price to reach `level`.
export const UPGRADES = [
  { id: "vigor", name: "Vigor", color: "#6fdc8c", max: 8, perLevel: "+18 max HP", desc: (l) => `+${18 * l} max HP`, cost: (l) => 16 + l * 12 },
  { id: "edge", name: "Edge", color: "#ff8f6f", max: 8, perLevel: "+5 base damage", desc: (l) => `+${5 * l} base damage`, cost: (l) => 20 + l * 14 },
  { id: "fortune", name: "Fortune", color: "#d9b85a", max: 6, perLevel: "+4% loot drop chance", desc: (l) => `+${4 * l}% loot drop chance`, cost: (l) => 24 + l * 16 },
  { id: "shardfall", name: "Shardfall", color: "#7fd2ff", max: 6, perLevel: "+12% shards earned", desc: (l) => `+${12 * l}% shards earned`, cost: (l) => 22 + l * 14 },
  { id: "reserves", name: "Reserves", color: "#caa6ff", max: 6, perLevel: "+25 starting coins", desc: (l) => `start each run with +${25 * l} coins`, cost: (l) => 14 + l * 10 },
];

function defaultState() {
  return {
    shards: 0,
    levels: { vigor: 0, edge: 0, fortune: 0, shardfall: 0, reserves: 0 },
    stash: [],
    active: null, // class id currently being played, or null at the title screen
    chars: { drifter: null, warden: null, auralist: null }, // null = not created yet
    won: false, // have you slain the final boss? (account-wide Champion flag)
    deepest: 0, // deepest dungeon depth ever reached (drives the goal tracker)
  };
}

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

// Walk every saved item so the item uid counter never reissues a live uid.
function bumpFromState(s) {
  let max = 0;
  const scan = (arr) => {
    for (const it of arr || []) if (it && it.uid > max) max = it.uid;
  };
  scan(s.stash);
  for (const c of Object.values(s.chars || {})) if (c) scan(c.items);
  bumpUid(max);
}

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw) {
      const s = defaultState();
      s.shards = Math.max(0, raw.shards | 0);
      s.levels = { ...s.levels, ...(raw.levels || {}) };
      s.stash = Array.isArray(raw.stash) ? raw.stash : [];
      s.active = raw.active || null;
      for (const cls of Object.keys(s.chars)) s.chars[cls] = (raw.chars && raw.chars[cls]) || null;
      s.won = !!raw.won;
      s.deepest = Math.max(0, raw.deepest | 0);
      bumpFromState(s);
      return s;
    }
    // Migrate a v1 save (shards + upgrade levels; v1 never persisted gear).
    const old = JSON.parse(localStorage.getItem(OLD_KEY));
    const s = defaultState();
    if (old) {
      s.shards = Math.max(0, old.shards | 0);
      s.levels = { ...s.levels, ...(old.levels || {}) };
    }
    return s;
  } catch {
    return defaultState();
  }
}

let state = load();

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable — keep it in memory for the session */
  }
}

// --- Account: shards + upgrades ---
export function getShards() {
  return state.shards;
}
export function levelOf(id) {
  return state.levels[id] || 0;
}
function upgradeDef(id) {
  return UPGRADES.find((u) => u.id === id);
}
export function addShards(n) {
  state.shards += Math.max(0, Math.round(n));
  save();
  return state.shards;
}
export function nextCost(id) {
  const u = upgradeDef(id);
  const l = levelOf(id);
  return l >= u.max ? null : u.cost(l + 1);
}
export function canBuy(id) {
  const c = nextCost(id);
  return c !== null && state.shards >= c;
}
export function buyUpgrade(id) {
  if (!canBuy(id)) return false;
  state.shards -= nextCost(id);
  state.levels[id] = levelOf(id) + 1;
  save();
  return true;
}
export function resetMeta() {
  state = defaultState();
  save();
}

// --- The campaign goal: descend to the final depth and slay the boss there ---
export function hasWon() {
  return !!state.won;
}
export function markWon() {
  if (!state.won) {
    state.won = true;
    save();
  }
}
export function getDeepest() {
  return state.deepest || 0;
}
// Record a newly-reached depth (account-wide best). Safe to call mid-run: it
// banks an achievement stat, not at-risk loot.
export function noteDepth(d) {
  if (d > (state.deepest || 0)) {
    state.deepest = d;
    save();
  }
}

export function metaBonuses() {
  return {
    maxHp: 18 * levelOf("vigor"),
    meleeDamage: 5 * levelOf("edge"),
    dropChance: 0.04 * levelOf("fortune"),
    shardMult: 1 + 0.12 * levelOf("shardfall"),
    startCoins: 25 * levelOf("reserves"),
  };
}
export function shardsForRun(depth, extracted) {
  const base = extracted ? 4 + depth * 3 : 1 + depth * 1.5;
  return Math.max(1, Math.round(base * metaBonuses().shardMult));
}

// --- Characters (one profile per class) ---
export function getChars() {
  return state.chars;
}
export function getChar(cls) {
  return state.chars[cls] || null;
}
export function hasChar(cls) {
  return !!state.chars[cls];
}
// profile = { coins, items: [...], equipped: { slot: uid|null } }
export function saveChar(cls, profile) {
  state.chars[cls] = clone(profile);
  save();
}
export function deleteChar(cls) {
  state.chars[cls] = null;
  if (state.active === cls) state.active = null;
  save();
}
export function getActive() {
  return state.active;
}
export function setActive(cls) {
  state.active = cls;
  save();
}
// Back-compat: some code asks for "the class". It's whoever is active.
export function getClass() {
  return state.active || "drifter";
}

// --- Shared stash (item transfer between characters) ---
export function getStash() {
  return state.stash;
}
export function stashAdd(item) {
  state.stash.push(clone(item));
  save();
}
export function stashTake(uid) {
  const i = state.stash.findIndex((it) => it.uid === uid);
  if (i === -1) return null;
  const [it] = state.stash.splice(i, 1);
  save();
  return it;
}
