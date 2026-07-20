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

// Storage adapter: prefer the CrazyGames Data Module (syncs to the player's CrazyGames
// account + reliable inside their cross-origin iframe, where localStorage can be
// partitioned/cleared) when INITIALIZED, else plain localStorage.
//
// TWO HARD RULES, both from CrazyGames QA:
// 1. NEVER touch the Data Module before SDK.init() has resolved — the SDK global exists
//    as soon as its <script> loads, but calling data.getItem/setItem pre-init logs
//    "CrazySDK is not initialized yet" and fails. `cloudReady` is flipped by main.js
//    once portal.init() succeeds; until then all IO is localStorage.
// 2. Once the cloud store is live, writes go to the Data Module EXCLUSIVELY — never
//    mirror to localStorage. The Data Module is scoped per identity (account when
//    logged in, per-guest otherwise); a shared localStorage mirror leaks progress
//    across identities (guest → login → logout carried the account's coins onto the
//    guest). Reads still fall back to localStorage ONLY when the identity's own store
//    is empty, so pre-SDK local saves migrate forward once.
let cloudReady = false;
export function setCloudReady() {
  cloudReady = true;
}
function cgData() {
  if (!cloudReady) return null;
  try {
    return (window.CrazyGames && window.CrazyGames.SDK && window.CrazyGames.SDK.data) || null;
  } catch {
    return null;
  }
}
const store = {
  get(key) {
    const cg = cgData();
    if (cg) {
      try {
        const v = cg.getItem(key);
        if (v != null) return v;
      } catch {}
    }
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, val) {
    const cg = cgData();
    if (cg) {
      try {
        cg.setItem(key, val);
        return; // cloud-exclusive: no localStorage mirror (identity-leak guard)
      } catch {}
    }
    try {
      localStorage.setItem(key, val);
    } catch {}
  },
};

// Permanent upgrades. `desc(level)` describes the bonus AT that level (so the
// shop can show "next: +90 max HP"); `cost(level)` is the price to reach `level`.
export const UPGRADES = [
  { id: "vigor", name: "Vigor", color: "#6fdc8c", max: 8, perLevel: "+18 max HP", desc: (l) => `+${18 * l} max HP`, cost: (l) => 16 + l * 12 },
  { id: "edge", name: "Edge", color: "#ff8f6f", max: 8, perLevel: "+5 base damage", desc: (l) => `+${5 * l} base damage`, cost: (l) => 20 + l * 14 },
  { id: "fortune", name: "Fortune", color: "#d9b85a", max: 6, perLevel: "+4% loot drop chance", desc: (l) => `+${4 * l}% loot drop chance`, cost: (l) => 24 + l * 16 },
  { id: "shardfall", name: "Shardfall", color: "#7fd2ff", max: 6, perLevel: "+12% shards earned", desc: (l) => `+${12 * l}% shards earned`, cost: (l) => 22 + l * 14 },
  { id: "reserves", name: "Reserves", color: "#caa6ff", max: 6, perLevel: "+25 starting coins", desc: (l) => `start each run with +${25 * l} coins`, cost: (l) => 14 + l * 10 },
  { id: "greed", name: "Greed", color: "#ffd166", max: 6, perLevel: "+6% coins found", desc: (l) => `+${6 * l}% coins found`, cost: (l) => 18 + l * 13 },
  { id: "prospector", name: "Prospector", color: "#7fc8e6", max: 5, perLevel: "+1 ✺ per clear", desc: (l) => `+${l} ✺ Frost Cores per dungeon clear`, cost: (l) => 26 + l * 18 },
  { id: "momentum", name: "Momentum", color: "#5be3ff", max: 5, perLevel: "-6% dash cooldown", desc: (l) => `-${6 * l}% dash cooldown`, cost: (l) => 20 + l * 14 },
  { id: "secondwind", name: "Second Wind", color: "#9bffc0", max: 5, perLevel: "+8% revive HP", desc: (l) => `ad-revive restores ${50 + 8 * l}% HP`, cost: (l) => 18 + l * 12 },
  { id: "hardened", name: "Hardened", color: "#8fb7ff", max: 5, perLevel: "+2% damage reduction", desc: (l) => `+${2 * l}% damage reduction`, cost: (l) => 24 + l * 16 },
];

function defaultState() {
  return {
    shards: 0,
    levels: { vigor: 0, edge: 0, fortune: 0, shardfall: 0, reserves: 0, greed: 0, prospector: 0, momentum: 0, secondwind: 0, hardened: 0 },
    stash: [],
    active: null, // class id currently being played, or null at the title screen
    chars: { drifter: null, warden: null, auralist: null }, // null = not created yet
    won: false, // have you slain the final boss? (account-wide Champion flag)
    deepest: 0, // deepest dungeon depth ever reached (drives the goal tracker)
    cores: 0, // Frost Cores — the crafting material (account-wide, never at risk)
    bounties: [], // active bounty instances (topped up to 3 by ensureBounties)
    daily: null, // { day:"Y-M-D", bounty } — one bigger bounty that re-rolls at local midnight
    drop: null, // Daily Supply Drop: { lastClaimDay:"Y-M-D", streak:n } — camp crate, once/day
    pcrate: null, // Shop Premium Crate: { lastClaimDay:"Y-M-D" } — ad-unsealed shop slot, once/day
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
    const raw = JSON.parse(store.get(KEY));
    if (raw) {
      const s = defaultState();
      s.shards = Math.max(0, raw.shards | 0);
      s.levels = { ...s.levels, ...(raw.levels || {}) };
      s.stash = Array.isArray(raw.stash) ? raw.stash : [];
      s.active = raw.active || null;
      for (const cls of Object.keys(s.chars)) s.chars[cls] = (raw.chars && raw.chars[cls]) || null;
      s.won = !!raw.won;
      s.deepest = Math.max(0, raw.deepest | 0);
      s.cores = Math.max(0, raw.cores | 0);
      s.bounties = Array.isArray(raw.bounties) ? raw.bounties : [];
      for (const b of s.bounties) if (b && b.bid >= bidCounter) bidCounter = b.bid + 1; // never reissue a live bid
      s.daily = raw.daily && raw.daily.bounty ? raw.daily : null;
      if (s.daily && s.daily.bounty.bid >= bidCounter) bidCounter = s.daily.bounty.bid + 1;
      s.drop = raw.drop && raw.drop.lastClaimDay ? raw.drop : null;
      s.pcrate = raw.pcrate && raw.pcrate.lastClaimDay ? raw.pcrate : null;
      bumpFromState(s);
      return s;
    }
    // Migrate a v1 save (shards + upgrade levels; v1 never persisted gear).
    const old = JSON.parse(store.get(OLD_KEY));
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

// --- Bounties (Mission Board) ---------------------------------------------
// Each bounty type keys off an existing in-game event (main.js calls bountyProgress).
// Templates roll into instances; the board stays topped up to 3. Plain-JSON instances
// (no item uids) so they're immune to the bumpUid path.
const BOUNTY_DEFS = [
  { type: "kills", color: "#ff9f6f", goal: [20, 40], cores: [4, 7], coins: [30, 70], label: (g) => `Slay ${g} creatures` },
  { type: "kindKills", color: "#ffb36f", goal: [8, 16], cores: [5, 8], coins: [40, 90], label: (g, t) => `Slay ${g} ${t}s` },
  { type: "clears", color: "#7fd2ff", goal: [1, 3], cores: [6, 10], coins: [60, 140], label: (g) => `Clear ${g} dungeon${g > 1 ? "s" : ""}` },
  { type: "depth", color: "#bfe8ff", goal: [3, 7], cores: [6, 12], coins: [60, 160], label: (g) => `Reach Depth ${g}` },
  { type: "extract", color: "#9be8b6", goal: [1, 3], cores: [5, 9], coins: [50, 120], label: (g) => `Extract ${g} time${g > 1 ? "s" : ""}` },
];
const WILD_TYPES = ["runt", "gremlin", "brute", "spitter", "charger"]; // real ENEMY_TYPES ids for kindKills

let bidCounter = 1;
function rollBounty(avoidTypes = [], opts = {}) {
  // Prefer a type not already on the board so the 3 slots stay varied (they
  // share a progress counter per type, so duplicates would tick up together).
  let pool = BOUNTY_DEFS.filter((d) => !avoidTypes.includes(d.type));
  if (!pool.length) pool = BOUNTY_DEFS;
  const d = pool[Math.floor(Math.random() * pool.length)];
  const ri = (a) => a[0] + Math.floor(Math.random() * (a[1] - a[0] + 1));
  const dscale = 1 + Math.min(1, getDeepest() / 10); // bigger bounties as you go deeper
  const rMul = opts.rewardMult || 1; // daily bounties pay more for a bigger goal
  const goal = Math.max(1, Math.round(ri(d.goal) * dscale * (opts.goalMult || 1)));
  const target = d.type === "kindKills" ? WILD_TYPES[Math.floor(Math.random() * WILD_TYPES.length)] : null;
  return {
    bid: bidCounter++,
    type: d.type,
    target,
    color: d.color,
    label: d.label(goal, target),
    prog: 0,
    goal,
    cores: Math.round(ri(d.cores) * dscale * rMul),
    coins: Math.round(ri(d.coins) * dscale * rMul),
    done: false,
    daily: !!opts.daily,
  };
}
// Returns true if it actually rolled/added a bounty (so the caller can persist a boot roll).
function ensureBounties(s = state) {
  const before = s.bounties.length;
  while (s.bounties.length < 3) s.bounties.push(rollBounty(s.bounties.map((b) => b.type)));
  return s.bounties.length !== before;
}

// --- Daily bounty: one bigger bounty that re-rolls at local midnight ---------
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
function rollDaily() {
  return rollBounty([], { goalMult: 1.6, rewardMult: 2.4, daily: true });
}
// Returns true if it rolled a fresh daily (new day / no daily yet) — so the caller can persist it.
function ensureDaily(s = state) {
  if (!s.daily || !s.daily.bounty || s.daily.day !== todayStr()) {
    s.daily = { day: todayStr(), bounty: rollDaily() };
    return true;
  }
  return false;
}
export function getDaily() {
  return state.daily ? state.daily.bounty : null;
}
// Whole hours until the daily resets (local midnight) — for the board's "resets in ~Xh".
export function dailyResetHours() {
  const now = new Date();
  const mid = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return Math.max(1, Math.ceil((mid - now) / 3600000));
}

// --- Daily Supply Drop (camp crate) ----------------------------------------
// Once per local day; rewards scale with the CONSECUTIVE-day streak (capped at 7 so
// the curve plateaus instead of compounding forever). Plain JSON — cloud-synced,
// bumpUid-immune. Claiming on the day after your last claim extends the streak;
// missing a day resets it to 1.
function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
export function dailyDropClaimable() {
  return !state.drop || state.drop.lastClaimDay !== todayStr();
}
export function dailyDropStreak() {
  return (state.drop && state.drop.streak) || 0;
}
// Shop Premium Crate: one ad-unsealed high-rarity shop slot per local day. The cap is
// burned ONLY when the reward actually lands (main.js marks on adFinished), so an
// adblocked attempt never wastes the day.
export function premiumCrateClaimable() {
  return !state.pcrate || state.pcrate.lastClaimDay !== todayStr();
}
export function markPremiumCrateClaimed() {
  state.pcrate = { lastClaimDay: todayStr() };
  save();
}

// The reward curve for a given streak day (capped at an effective day 7) — the ONE
// place the numbers live; the calendar popup previews with it and claims pay from it.
export function dailyDropRewardFor(day) {
  const eff = Math.min(7, Math.max(1, day));
  return { coins: 50 + 30 * (eff - 1), cores: 1 + Math.floor(eff / 3), shards: 5 + 3 * (eff - 1) };
}
// The streak day the NEXT claim would land on (today's day if already claimed) —
// drives the calendar's "TODAY" highlight.
export function dailyDropNextStreak() {
  const d = state.drop;
  if (!d || !d.lastClaimDay) return 1;
  if (d.lastClaimDay === todayStr()) return d.streak || 1;
  return d.lastClaimDay === yesterdayStr() ? (d.streak || 0) + 1 : 1;
}
// Claim today's drop. Returns { streak, coins, cores, shards, mystery } or null if
// already claimed today. `mystery` marks every 7th consecutive day — the calendar's
// "?" slot — and the CALLER grants a bonus item for it (at the camp safe point).
export function claimDailyDrop() {
  const t = todayStr();
  if (state.drop && state.drop.lastClaimDay === t) return null;
  const prev = state.drop || { lastClaimDay: null, streak: 0 };
  const streak = prev.lastClaimDay === yesterdayStr() ? (prev.streak || 0) + 1 : 1;
  state.drop = { lastClaimDay: t, streak };
  save();
  return { streak, ...dailyDropRewardFor(streak), mystery: streak % 7 === 0 };
}
export function getBounties() {
  return state.bounties;
}
// Advance any matching active bounty (the 3 slots AND the daily); returns the bounties
// that JUST completed (for toasts).
export function bountyProgress(type, amount = 1, tag = null) {
  let changed = false;
  const completed = [];
  const advance = (b) => {
    if (!b || b.done || b.type !== type) return;
    if (b.target && b.target !== tag) return; // kindKills filter
    b.prog = type === "depth" ? Math.max(b.prog, amount) : Math.min(b.goal, b.prog + amount);
    if (b.prog >= b.goal) {
      b.done = true;
      completed.push(b);
    }
    changed = true;
  };
  for (const b of state.bounties) advance(b);
  if (state.daily) advance(state.daily.bounty);
  if (changed) save();
  return completed;
}
// Claim a completed bounty — grants cores (account-wide, safe), returns it so main.js
// can credit the coins to the live player + save the character at the camp safe point.
export function claimBounty(bid) {
  // Daily bounty: mark claimed (it stays on the board until the next day rolls a new one).
  if (state.daily && state.daily.bounty && state.daily.bounty.bid === bid) {
    const b = state.daily.bounty;
    if (!b.done || b.claimed) return null;
    b.claimed = true;
    addCores(b.cores); // saves
    save();
    return b;
  }
  const i = state.bounties.findIndex((b) => b.bid === bid);
  if (i === -1 || !state.bounties[i].done) return null;
  const [b] = state.bounties.splice(i, 1);
  addCores(b.cores); // saves
  ensureBounties();
  save();
  return b;
}
export function rerollBounty(bid) {
  const i = state.bounties.findIndex((b) => b.bid === bid);
  if (i === -1 || state.bounties[i].prog > 0) return false; // only un-started bounties
  const otherTypes = state.bounties.filter((_, j) => j !== i).map((b) => b.type);
  state.bounties[i] = rollBounty(otherTypes);
  save();
  return true;
}
export function resetBounties() {
  state.bounties.length = 0;
  ensureBounties();
  state.daily = null;
  ensureDaily();
  save();
}

let state = load();
// Top up bounties + the daily on boot; persist ONCE if either actually rolled so a fresh
// roll is durable immediately (not just after the next mutator saves). Call both (no
// short-circuit) before deciding to save.
{
  const rolledB = ensureBounties();
  const rolledD = ensureDaily();
  if (rolledB || rolledD) save();
}

export function save() {
  store.set(KEY, JSON.stringify(state));
}

// --- Frost Cores (crafting material) ---
export function getCores() {
  return state.cores;
}
export function addCores(n) {
  state.cores += Math.max(0, Math.round(n));
  save();
  return state.cores;
}
export function spendCores(n) {
  if (state.cores < n) return false;
  state.cores -= n;
  save();
  return true;
}

// Re-read from storage. Called once after the portal SDK initialises so a cloud /
// cross-device save (CrazyGames Data Module) replaces the import-time localStorage load,
// before the player commits to a character at the title screen.
export function reloadFromStore() {
  state = load();
  const rolledB = ensureBounties();
  const rolledD = ensureDaily();
  if (rolledB || rolledD) save();
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
    coinMult: 1 + 0.06 * levelOf("greed"),
    bonusCores: levelOf("prospector"),
    dashCd: 0.06 * levelOf("momentum"),
    reviveHeal: 0.5 + 0.08 * levelOf("secondwind"),
    damageReduction: 0.02 * levelOf("hardened"),
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
