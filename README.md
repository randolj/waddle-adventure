# Waddle's Quest

A top-down penguin roguelite. Pick a class, dive procedurally-scaling dungeons,
extract your loot, and spend permanent shards on account-wide upgrades. Logo +
favicon live in [assets/](assets/).

## Title screen & characters

The game boots to a **title screen** ([menu.js](src/menu.js)) — it doesn't drop
you straight in. From there you can:

- **Create / play one character per class** (Drifter, Warden, Auralist). Each
  character has its **own** class, inventory, equipped gear, and coins, saved to
  `localStorage`. Delete and remake from the same screen.
- **Stash / Transfer** — a shared stash to move items between your characters:
  deposit from a character's bag, withdraw into another. (Depositing an equipped
  item unequips it.)
- **How to Play** and **Classes** info panels.

**Shared vs per-character:** shards, the permanent upgrades, and the stash are
**account-wide** (every character benefits); class, gear, and coins are
**per-character**. Press **Esc** at camp to save and return to the title.

## Controls

- **WASD** / arrow keys — move (fast, snappy, lightly smoothed)
- **Mouse** — aim
- **Click** — attack toward the cursor (the weapon archetype changes how you hit)
- **Space** / Shift — **dash**, with **invincibility frames** (granted by the cloak)
- **Dash → Click** — **dash-strike**: attack out of a dash to cancel into a lunging hit (melee only)
- **I** — inventory (equip/unequip) · **E** — interact (shop / Elder / Quartermaster / enter dungeon / exit portal)
- **M** — cycle the map: off → corner minimap → fullscreen (fullscreen pauses)
- **Esc** — at camp, save and return to the title screen
- **`** (backtick) — debug menu
- **R** / click — after the penguin falls (forfeit unbanked loot, return to camp)

### Debug menu (`)

A paused overlay ([debug.js](src/debug.js)) for testing: give coins, full heal,
toggle god mode, equip legendaries, give a sealed relic, clear inventory, kill
all enemies, complete the current dungeon, teleport to camp, spawn any enemy
archetype, warp into a dungeon at any depth, and **give yourself any item** in the
catalog (clickable, grouped by slot and rarity-coloured).

### Classes & weapon archetypes

The penguin has a **class** (Destiny-style): each class has its own **armor** and
a **dash flavor**, but **weapons are shared** across all classes. Three classes,
swappable at the camp **Quartermaster** (`E`):

- **Drifter** — the default dash duelist (crit + speed); its dash is the one you
  already know. A fresh save is a Drifter, so nothing changes until you opt in.
- **Warden** — a bruiser: the only source of base damage-reduction + bonus HP,
  and its dash **plows through enemies**, dealing contact damage.
- **Auralist** — a frost caster: high crit + cooldown, and every hit **chills**
  (slows) enemies; its dash is a **frost-blink** that bursts cold at the launch
  point (no dash-strike lunge).

Class identity comes from class-locked **armor** (a 4th equip slot) + per-class
base stats + the dash flavor. Off-class armor still drops (sellable) but shows
*"Warden only"* etc. in the inventory. Your class persists across sessions.

**Weapon archetypes** — every weapon has a `weaponType` that changes how it
attacks (shared by all classes):

| Archetype | Feel | Attack |
|---|---|---|
| **Sword** | balanced | one instant mouse-aimed arc |
| **Mace** | slow, heavy | a wind-up, then one wide high-knockback smash |
| **Daggers** | fast, close | a 2–3 hit flurry, each sub-hit rolling crit/lifesteal on its own |
| **Bow** | ranged | fires an arrow (reuses the projectile system) — crit/lifesteal on impact |
| **Staff** | ranged magic | a homing frost bolt that **chills** what it hits |

Ranged weapons fire **friendly projectiles** (an `owner` flag splits them from
enemy shots) and skip the dash-strike. Affixes compose for free — *Sharp/Brutal*
boost arrow damage, *Keen* crit lands on every arrow, *Vampiric* procs per dagger
sub-hit. Class + weapon resolve independently, so builds multiply.

### Equipment, items & rarities

All combat/movement stats are **derived from equipped gear** — four slots
(weapon, **armor**, cloak, trinket). The penguin starts with a common Worn Sword,
Tattered Scarf, and its class's basic armor; with nothing equipped it has a weak
flipper melee and no dash.

Items have five **rarities** (common → legendary) with colour coding, and modify
stats via additive `mods`. They drop from slain creatures (rarity-weighted, ~20%
chance plus coins) or are **bought** from the camp shop. Open the inventory with
`I` to equip/unequip; shop at the camp stall with `E`. The shop has **Buy** and
**Sell** tabs — sell unwanted gear for ~40% of its price. Catalog + roll logic
live in `items.js`; the overlay UI in `inventory.js`.

**Procedural rolls + affixes.** Every dropped/bought/decoded item is rolled, not
fixed: a **quality** multiplier (80–130%, shown as `Q…%`) scales its numbers, and
it gains **0–3 random affixes** depending on rarity (a legendary can roll three).
Affixes are prefixes (weapons: *Sharp, Brutal, Keen, Vampiric, Long, Quick*) and
suffixes (cloaks/trinkets: *Swiftness, Vigor, Warding, the Gale, Phasing,
Fortune*) that add their own stat bonuses and rename the item — e.g. *"Vampiric
Glacier's Edge of Warding"*. So two drops of the same base are rarely identical.
Affixes can grant **crit chance**, **lifesteal**, and **damage reduction** on top
of the base stats; the inventory stats strip surfaces Crit always and Lifesteal /
Resist when you have them. Tooltips list quality + every rolled affix.

### Resting in the camp heals

Standing in the safe camp steadily restores HP (a green aura + HUD indicator
show it), so the loop is: venture into the wilds, fight + loot, retreat to camp
to heal and spend coins, repeat.

### Biomes

The overworld (10000×10000) has 5 **biomes** laid out as **concentric rings**
around the camp: an inner **Tundra** circle, a **Cavern** ring around it, then
the outer area sliced into angular wedges (**Emberwaste / Verdant Mire /
Shadowfen**). Distance from camp = difficulty. Each biome has its own ground
palette, obstacle tint, enemy pool, and boss type (`biomes.js`); wild spawns and
the dungeon at each entrance match the local biome. The map overlay (`M`) shows
the ring layout.

### Creatures

Archetypes: `runt` (fast swarmer), `gremlin` (balanced), `stalker`
(fast/aggressive), `brute` (slow tank), `spitter` (ranged — kites and fires
bolts), `warlock` (magic — lobs homing orbs). Ranged enemies emit projectiles
that the player can dash through (i-frames). Knockback scales by mass.

Bosses come in three kinds: **charger** (telegraphed lunge), **archer** (kites +
fires volleys), **caster** (homing orbs + radial bursts). Each biome has its own
named boss (e.g. Frost Warden, Shadow Maw).

### Dungeons — room by room (Isaac-style)

**Entrances** sit in the wilds, one per biome, each a different **starting depth
(1–5)**. Hover one to see its biome, room count, enemy **HP×/DMG×** scaling, and
reward preview; walk up + `E` to enter.

Inside, **one room is shown at a time, centred on screen**. Each room's doors
**lock while enemies remain**; clear the room and the doors open, then walk
through a door of your choice into the next room (a small **room map** in the
corner tracks where you are). The layout is a generated room graph; the farthest
room is the **boss room**.

**Depth is endless.** Difficulty isn't five fixed tiers anymore — it's an
open-ended **depth** number. Enemy HP/damage, boss strength, room count, and
rewards all scale with depth (the HUD shows "Depth N"). Clearing the boss grants
coins + items, and spawns **two** portals: **Exit** (bank your loot back at camp)
or **Descend** (dive one level deeper, keeping your gear, for tougher foes and
better loot). The deeper you push in a single run, the richer the rewards — there
is no top. Relic drop chance climbs with depth (guaranteed by depth 5).

**Relics** can't be equipped until decoded. Bring one to the bearded **Elder**
in camp and press `E` — he decodes it for free into a random **legendary**
(sword / garment / trinket).

### Runs, extraction & permanent upgrades

A dungeon dive is a **run**, and it works like an extraction shooter. Loot and
coins you pick up inside are **at risk** (the HUD flashes "⚠ LOOT AT RISK"):

- **Extract** (Exit portal after the boss) → you keep everything you found and
  bank **shards** for how deep you reached.
- **Descend** (the other portal) → push deeper for better loot, but it's still
  on the line.
- **Die in the dungeon** → you forfeit every item and coin gained that run
  (your gear from *before* the run is safe), and respawn at camp. You still
  salvage a smaller pile of shards as a consolation.

**Shards** are a permanent meta-currency — they are *never* lost and are saved to
your browser (`localStorage`), so progress carries across sessions. Spend them at
the camp **Quartermaster** (`E`) on permanent upgrades: **Vigor** (max HP),
**Edge** (base damage), **Fortune** (loot drop chance), **Shardfall** (more
shards earned), **Reserves** (starting coins). Each upgrade has multiple levels
and applies to every future run — so even a failed dive makes the next one
stronger. Logic in [src/meta.js](src/meta.js); the vendor overlay in
[src/metaui.js](src/metaui.js).

### Zones — camp, towns, and the wilds

The world centre is a **safe camp** (warm tint, dashed border, campfire): no
creatures spawn there and none can enter it. Venturing out into the **wilds**
triggers creatures to spawn near you. Crossing a boundary shows a banner; the HUD
names your current zone (and shows **WILDS · T0–T4** so you always know how
dangerous the area is).

**Towns.** Each outer biome has a **town** (Hollowdeep, Cinderhold, Mossvale,
Duskmere) — a safe haven with its own shop. They're also no-spawn, heal-on-rest
zones. Crucially, **a town's shop stocks better gear the deeper its tier** — but
**the wild enemies around higher-tier areas hit much harder** (HP + damage scale
with the area tier), so a low-level penguin can't just stroll out to Duskmere and
buy endgame gear: it'll get one-shot on the way. Earn your way outward. (The Elder
and Quartermaster live only at the central camp, the tier-0 home base.)

### Movement feel (Hades-inspired)

The dash is the core survival/mobility tool: a short, fast burst with i-frames
that linger briefly past the dash. Attacking inside the dash window cancels into
a stronger lunging **dash-strike** (more range + damage). Inputs are buffered
(~0.13s) so tight dash → strike → dash chains register cleanly. Tuning constants
live at the top of [src/player.js](src/player.js).

## Run it

The game uses native ES modules, so it must be served over HTTP (opening
`index.html` via `file://` will not work).

```bash
cd 2d-open
python3 -m http.server 5577
# then open http://localhost:5577
```

Any static server works (`npx serve`, etc.). No build step, no dependencies.

## Structure

> **Building on this?** [`AGENTS.md`](AGENTS.md) is the contributor/agent guide: a
> code map of where everything lives, the core conventions (stat system,
> immediate-mode UI, scene model, persistence gotchas), the `window.__game` debug
> API, and step-by-step **playbooks** for adding a weapon / class / ability /
> enemy / biome / affix / rarity / meta-upgrade and verifying a change. It's the
> single source of truth for every AI coding tool — `CLAUDE.md`, `GEMINI.md`,
> `.github/copilot-instructions.md`, and `.cursor/rules/` all just point at it.

```
index.html        canvas + controls hint
styles.css        full-screen layout
AGENTS.md         contributor + agent guide — code map, conventions, playbooks
CLAUDE.md / GEMINI.md / .github/ / .cursor/   thin pointers to AGENTS.md
assets/           logo.svg + favicon.svg
src/
  main.js         game loop, scene flow (menu/overworld/dungeon), HUD, save hooks
  menu.js         title screen: character profiles, stash/transfer, how-to, classes
  input.js        keyboard + mouse state (key-press edges + buffering)
  camera.js       follows the player, clamps to world bounds
  world.js        terrain, obstacles, safe camp zone + helpers
  player.js       the penguin: classes, profile load/save, dash flavors, weapon archetypes, art
  enemy.js        archetypes (runt/gremlin/stalker/brute/spitter/warlock) + boss + chill + projectiles
  biomes.js       biome palettes, enemy pools, boss types
  dungeon.js      room-by-room dungeons (Isaac-style), endless depth, door gating
  items.js        catalog, rarities, weapon types, class armor, procedural rolls/affixes
  meta.js         account save: shards + upgrades + stash + per-class character profiles
  inventory.js    inventory (4 slots) + shop overlay UI
  metaui.js       Quartermaster overlay: spend shards on permanent upgrades
  debug.js        debug menu overlay (backtick)
  minimap.js      corner + fullscreen map rendering
  sfx.js          procedural WebAudio sound effects
  utils.js        math helpers, seeded RNG, noise + rough-shape helpers
```

### Art style — textured hand-drawn grit

Everything is still drawn procedurally with canvas (no sprite assets), but in a
gritty, hand-drawn style rather than clean geometry:

- **Ground:** mottled dirty-ice from value noise, worn patches, jagged cracks,
  and scattered debris specks — plus a screen-space film-grain overlay + vignette.
- **Shapes:** irregular silhouettes (`roughOutline` / `roughBlobPath` in
  `utils.js`) with heavy dark ink outlines instead of perfect circles/ellipses.
- **Shading:** clipped gradient shadows + highlights + speckle texture on rocks,
  ice shards, creatures, and the penguin.

Each entity precomputes its scruffy outline once (stable, not jittering per
frame). Palette + grain knobs live at the tops of `world.js` and `main.js`.

### Rarity visual effects

Gear gets cooler the rarer it is (gated by `RARITY_RANK` in `player.js`):

- **Swords:** common = plain steel; rare+ = a glowing blade + fuller groove;
  epic+ = a gem on the guard + slimmer/longer blade; legendary = an animated
  energy band travelling up the blade.
- **Attacks:** the swing draws an animated, rarity-coloured **slash arc** with a
  bright leading edge; rare+ weapons also throw **spark particles**.
- **Cloaks:** rare+ leave **shimmer sparkles** in the trail (more while
  dashing); the legendary Aurora Mantle has a flowing aurora gradient + colour
  shimmer, and dash afterimages tint to the cloak's rarity colour.

### Game feel (juice)

Small effects that make combat feel weighty (wired in `main.js`):

- **Floating damage numbers** on hits (white; **crits** ~12% are bigger + gold),
  and a red `-N` when the penguin is hurt.
- **Screen shake** + brief **hit-stop** (freeze-frame) on landed hits, kills,
  and damage taken — bosses shake/freeze harder.
- **Impact sparks** on hit and a **death poof** (in the creature's colour) when
  one dies.
- **Pickup magnet** — coins/items drift toward you when close.
- **Low-HP vignette** — a pulsing red screen edge under 30% HP.
- **Smoothed camera** with a slight **aim look-ahead**.
- **Ambient motes** per biome (snow, embers, spores, dust, wisps).

### Combos & chaining

A **combo counter** tracks consecutive hits (it breaks if you take damage). After
a landed hit a short **chain window** opens: a dash while aiming at an enemy in
the cone becomes a fast **chain-dash** that snaps you to them and stops just in
strike range — so the loop is *hit → flick at the next target → dash in → strike*.
The chain target is highlighted with a cyan ring.

### Sound

Procedural WebAudio SFX (`sfx.js`, no files) for swings, hits/crits, kills,
dash, dash-strike, chain, hurt, coins, items, dungeon-enter and decode. Audio
starts on first interaction; mute it from the debug menu (`` ` ``).

### More feel

- **Off-screen damage indicator** — a red arrow points to where a hit came from.
- **Enemy spawn telegraph** — a pulsing marker precedes wild spawns (no pop-in).
- **Treasure rooms** in dungeons (a dead-end room with a free item + coins).
- **Dash whoosh** ring + dust, and **footstep dust** while running.
- **Signature effects** — frost weapons (Frostfang, Glacier's Edge) leave an icy
  burst on hit.

`window.__game` exposes `{ player, enemies, step(dt), reset() }` for debugging.

## What's implemented

- **Title screen** with a logo, one character per class (create/play/delete),
  a shared stash to transfer items between characters, and How-to-Play / class info
- **Multi-character saves** in localStorage: per-character class/gear/coins +
  account-wide shards/upgrades/stash; per-class penguin art (color + accessory)
- 2600×2000 open world with a following camera
- Penguin: 8-direction movement, mouse aiming, an arc sword attack with a
  directional hit-cone, knockback, hurt flash, and death/restart
- Hades-style scarf-dash (i-frames + afterimages) and dash-strike, with input
  buffering and a dash-charge HUD bar
- Equipment-grants-abilities model (scarf → dash); base melee is the sword
- **3 penguin classes** (Drifter/Warden/Auralist) with class-locked armor + a
  per-class dash flavor (plow-through / frost-blink); weapons shared; chosen at the title
- **5 weapon archetypes** (sword / mace / dagger / bow / staff) that each resolve
  attacks differently, incl. 2 ranged firing friendly projectiles + a frost chill
- Safe camp + wilds zones: spawning is gated on leaving the camp; creatures
  can't enter the camp; zone banners + HUD zone indicator
- Toggleable map: corner minimap + fullscreen (M)
- Inventory + equipment (4 slots incl. class armor), 5 item rarities, stat-modifying gear
- Procedural item rolls: per-item quality (80–130%) + 0–3 random affixes that
  rename the item and add crit / lifesteal / damage-reduction / more
- Loot drops (items + coins) from creatures; camp shop to buy + sell gear
- Resting in the camp heals the penguin (HP regen + aura)
- 6 creature archetypes incl. ranged (spitter) + magic (warlock) with a
  projectile system; 3 boss kinds (charger/archer/caster), one per biome
- 5 biomes in concentric rings/slices around camp (palette + enemy pool + boss)
- Room-by-room dungeons (Isaac-style, one centred room, door gating, room map),
  generated room graph, boss room
- **Endless depth**: difficulty/rewards scale with a depth number; a Descend
  portal on boss clear dives deeper in the same run (Exit banks loot at camp)
- **Extraction roguelite loop**: dungeon dives are runs with at-risk loot —
  extract to keep it, die and forfeit it; permanent **shards** persist regardless
- **Meta-progression**: a camp Quartermaster sells 5 permanent upgrades for
  shards, saved to localStorage and applied to every future run
- Relics (chance ramps with depth), decoded by the camp Elder into rolled legendaries
- Debug menu (backtick): coins, shards, god mode, give any item, spawn, warp to any depth, reset meta
- Large 10000×10000 ring-biome overworld with a dungeon entrance per biome
- HUD: health bar, dash charge, zone/room, kill counter, coins, shards, boss bar

## Next steps toward the full vision

1. **Build-enabling boons/relics** — in-run pickups that modify _how_ abilities
   work (chain lightning on dash-strike, bursts on crit), not just flat stats.
2. **Breadth** — status effects (burn/freeze/poison), elite/affixed enemies,
   more bosses, run goals/objectives.
3. **Secret entrances** — hidden dungeon doors revealed by bombs/proximity.
4. **Richer dungeons** — room variety (traps, treasure, shops), unique boss
   movesets that change with depth instead of one shared charge.
5. **Art pass** — swap primitive drawing for sprite sheets + animations.
