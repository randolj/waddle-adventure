# Penguin Dungeon — POC

A top-down action game where a sword-wielding penguin fights off creatures.
Eventually: Binding of Isaac–style dungeon rooms with secret entrances. This is
the **proof of concept**: a single wide-open snowy world with combat.

## Controls

- **WASD** / arrow keys — move (fast, snappy, lightly smoothed)
- **Mouse** — aim
- **Click** — swing the sword (the base melee attack)
- **Space** / Shift — **scarf-dash**, with **invincibility frames** (the dash is granted by the cloak)
- **Dash → Click** — **dash-strike**: attack out of a dash to cancel into a lunging hit (lands → 1s i-frames)
- **I** — inventory (equip/unequip) · **E** — interact (shop / Elder / enter dungeon / exit portal)
- **M** — cycle the map: off → corner minimap → fullscreen (fullscreen pauses)
- **`** (backtick) — debug menu
- **R** / click — restart after the penguin falls

### Debug menu (`)

A paused overlay ([debug.js](src/debug.js)) for testing: give coins, full heal,
toggle god mode, equip legendaries, give a sealed relic, clear inventory, kill
all enemies, complete the current dungeon, teleport to camp, spawn any enemy
archetype, warp into any dungeon tier, and **give yourself any item** in the
catalog (clickable, grouped by slot and rarity-coloured).

### Equipment, items & rarities

All combat/movement stats are **derived from equipped gear** — there are three
slots (weapon, cloak, trinket). The penguin starts with a common Worn Sword and
Tattered Scarf; with nothing equipped it has a weak flipper melee and no dash.

Items have five **rarities** (common → legendary) with colour coding, and modify
stats via additive `mods`. They drop from slain creatures (rarity-weighted, ~20%
chance plus coins) or are **bought** from the camp shop. Open the inventory with
`I` to equip/unequip; shop at the camp stall with `E`. The shop has **Buy** and
**Sell** tabs — sell unwanted gear for ~40% of its price. Catalog + roll logic
live in `items.js`; the overlay UI in `inventory.js`.

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

**Entrances** sit in the wilds, one per **tier (1–5)** and biome. Hover one to
see its biome, room count, enemy **HP×/DMG×** scaling, and reward preview; walk
up + `E` to enter.

Inside, **one room is shown at a time, centred on screen**. Each room's doors
**lock while enemies remain**; clear the room and the doors open, then walk
through a door of your choice into the next room (a small **room map** in the
corner tracks where you are). The layout is a generated room graph; the farthest
room is the **boss room**. Clearing the boss grants coins + items; **tier-5**
dungeons also drop a **Sealed Relic**. A Leave portal sits in the entrance room;
an Exit portal appears in the boss room on completion.

**Relics** can't be equipped until decoded. Bring one to the bearded **Elder**
in camp and press `E` — he decodes it for free into a random **legendary**
(sword / garment / trinket).

### Zones — safe camp vs the wilds

The world centre is a **safe camp** (warm tint, dashed border, campfire): no
creatures spawn there and none can enter it. Venturing out into the **wilds** is
what triggers creatures to spawn near you. Crossing the boundary shows a banner;
the HUD shows your current zone.

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

```
index.html        canvas + controls hint
styles.css        full-screen layout
src/
  main.js         game loop, zone-gated spawning, HUD, banners, game-over
  input.js        keyboard + mouse state (key-press edges + buffering)
  camera.js       follows the player, clamps to world bounds
  world.js        terrain, obstacles, safe camp zone + helpers
  player.js       the penguin: movement, dash, scarf, sword, drawing
  enemy.js        archetypes (runt/gremlin/stalker/brute/spitter/warlock) + boss variants
  biomes.js       biome palettes, enemy pools, boss types
  dungeon.js      room-by-room dungeons (Isaac-style), tiers, door gating
  items.js        item catalog, rarities, drop/shop rolls, relics
  inventory.js    inventory + shop overlay UI
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

- 2600×2000 open world with a following camera
- Penguin: 8-direction movement, mouse aiming, an arc sword attack with a
  directional hit-cone, knockback, hurt flash, and death/restart
- Hades-style scarf-dash (i-frames + afterimages) and dash-strike, with input
  buffering and a dash-charge HUD bar
- Equipment-grants-abilities model (scarf → dash); base melee is the sword
- Safe camp + wilds zones: spawning is gated on leaving the camp; creatures
  can't enter the camp; zone banners + HUD zone indicator
- Toggleable map: corner minimap + fullscreen (M)
- Inventory + equipment (3 slots), 5 item rarities, stat-modifying gear
- Loot drops (items + coins) from creatures; camp shop to buy + sell gear
- Resting in the camp heals the penguin (HP regen + aura)
- 6 creature archetypes incl. ranged (spitter) + magic (warlock) with a
  projectile system; 3 boss kinds (charger/archer/caster), one per biome
- 5 biomes in concentric rings/slices around camp (palette + enemy pool + boss)
- Room-by-room dungeons (Isaac-style, one centred room, door gating, room map),
  5 tiers, generated room graph, boss room, scaled HP/DMG + rewards
- Relics from tier-5 dungeons, decoded by the camp Elder into legendaries
- Debug menu (backtick): coins, god mode, give any item, spawn/warp, etc.
- Large 10000×10000 ring-biome overworld with a dungeon entrance per biome
- HUD: health bar, dash charge, zone/room, kill counter, coins, boss bar

## Next steps toward the full vision

1. **Secret entrances** — hidden dungeon doors revealed by bombs/proximity.
2. **Richer dungeons** — non-linear room layouts, room variety (traps, treasure,
   shops), unique boss movesets per tier instead of one shared charge.
3. **Deeper progression** — procedural stat rolls per item, set bonuses, more
   relic outcomes, hearts/health pickups in the wilds.
4. **More enemies & bosses** — ranged/elemental creatures, distinct boss types.
5. **Persistence** — keep loadout/coins across runs (or intentional roguelite resets).
6. **Art pass** — swap primitive drawing for sprite sheets + animations.
