# Waddle's Quest — Roadmap (Kanban)

A lightweight, version-controlled kanban board. Move a card between the columns
below as it progresses: **Backlog → Up Next → In Progress → Done**. Each card has
an effort tag and a one-line scope; deeper how-to lives in [AGENTS.md](AGENTS.md)
(the playbooks make most of these recipe-driven).

**Effort:** `S` ≈ a few hours · `M` ≈ a focused session · `L` ≈ multi-session · `XL` ≈ its own project.

> **GitHub sync:** these cards can be pushed to GitHub Issues with
> [`scripts/sync-roadmap-github.sh`](scripts/sync-roadmap-github.sh) (needs `gh`
> installed + authed). It's idempotent — add a card here, re-run, and only the new
> ones are created.

---

## 🔨 In Progress

_(nothing yet — pull a card from Up Next)_

---

## 📋 Up Next  (prioritized top-to-bottom)

> **Current focus: clarify & expand the core loop.** The game shouldn't read as "wander → find a dungeon → just fight" — give every step intent. A **premise + win condition** is shipped (see Done: descend to Depth 10, slay the Heart of Winter). The next facets give *direction* and make the overworld a place:

- [ ] **Goals & objectives** · `M` · loop — a contract/quest board at camp + a persistent on-screen objective tracker so the player always knows the next move. The spine that makes the loop legible.
- [ ] **Richer overworld** · `M` · loop — points of interest while traveling: shrines (buff your dive), treasure caches, roaming mini-bosses, stranded NPCs, events — marked on the map. Makes roaming a choice, not filler.
- [ ] **Camp & progression unlocks** · `M` · loop — the camp visibly grows; new NPCs / services / regions unlock as you play, so each run advances an arc beyond shard upgrades.
- [ ] **Dungeon discoverability** · `S` · UX — mark entrances on the corner + fullscreen map (tier-colored), add an off-screen arrow to the nearest entrance; lean on towns sitting next to dungeons. *Fixes a real "where are the dungeons?" pain.*
- [ ] **Status-effect system** · `M` · systems — generalize `chill` into burn / poison / freeze / stun (DoT + slow + stun). Foundational: deepens weapons, enemies, and boons at once.
- [ ] **Elite / affixed enemies** · `M` · enemies — roll modifiers (fast, explosive, shielded, vampiric, frozen-aura) onto existing archetypes for better loot. Biggest variety-per-effort win.
- [ ] **Mid-dive boons / altars** · `L` · systems ⭐ — altars that grant run-modifying boons ("dash-strike chains lightning", "crits explode", "every 5th hit freezes"). The keystone for replayability; ties weapons + enemies + dungeons together. (Was #4 on the scaling list.)
- [ ] **Dungeon room types** · `M` · dungeons — shrine/altar (risk-reward), mid-dive shop, trap rooms, wave/challenge rooms, mini-boss rooms.

---

## 🧊 Backlog

### Weapons
- [ ] **New weapon archetypes** · `M` — charge weapon (hold-to-release), thrown chakram/boomerang (hits out + back), spear (line-pierce), flail/whip (wide reach), bomb-thrower (AoE).
- [ ] **On-hit weapon procs** · `M` — chain-lightning, crit-explosions, bleed/poison (depends on the status system).
- [ ] **More weapon templates** · `S` — fill out the 5 existing archetypes with more rarities/variants (one `ITEM_TEMPLATES` entry each).

### Enemies
- [ ] **Biome-specific bosses + more boss variety** · `M` — beyond the 3 shared kinds (charger/archer/caster); phases, arena hazards, telegraphs.

### Dungeons
- [ ] **Secret rooms / bombable walls** · `M` — the original "secret entrances" vision; hidden rooms revealed by hazards/keys.
- [ ] **Hazards & interactables** · `M` — spike tiles, locked doors/keys, breakable objects with loot.

### Co-op
- [ ] **Local co-op (2P, one screen)** · `L` — second `Player` + second input scheme (gamepad) + camera that frames both. Bounded refactor (`player` is referenced everywhere assuming one). Ship before any netcode.
- [ ] **Online co-op** · `XL` — host-authoritative netcode (host runs sim → snapshots; clients send inputs), WebSocket relay, lobby UI, reconcile per-character saves with shared runs. Its own project — do local first.

### Content / progression
- [ ] **Run goals / objectives / bounties** · `M` — per-run goals, kill-the-X targets, account achievements.
- [ ] **6th biome / 4th class / a new rarity tier** · `S` each — all recipe-driven (see AGENTS.md playbooks).

### Polish
- [ ] **Settings / options** · `S` — volume, keybinds, toggles.
- [ ] **Audio / music pass** · `M` — beef up the procedural SFX, add ambient/combat music.
- [ ] **Sprite / art pass** · `XL` — swap procedural canvas art for sprite sheets + animation.

---

## ✅ Done

- [x] **Premise + win condition** — the campaign now has a destination: descend to **Depth 10** and slay a unique final boss, **The Heart of Winter** (a beefed caster spawned in place of the biome boss). Felling it triggers a **victory screen**, banks a big shard reward, and sets an account-wide **Champion** flag (persisted). Premise is surfaced via an intro banner + a persistent HUD goal tracker (`GOAL · reach Depth 10 / ✦ CHAMPION`); deepest depth is tracked account-wide. Endless play continues past the win. (`FINAL_DEPTH` in dungeon.js; `won`/`deepest`/`hasWon`/`markWon`/`noteDepth` in meta.js; `victory`/`finishVictory`/`drawVictory` in main+hud.)
- [x] **New enemy behaviors + visual variety** — six AI archetypes (charger telegraph-lunge, bomber rush+explode, summoner, splitter, front-blocking shielder, ally-mending healer), seeded across biome pools. `takeHit` returns damage-dealt (shielder block), enemies queue children via `this.spawns`/`flushEnemySpawns`, bombers burst in `onEnemyDeath`. Rendering split out into `enemyart.js`; one spiky-blob silhouette tuned per type (`aspect`/spikes/legs/eyes/`feature` + behavior tells) so archetypes read distinctly.
- [x] **Procedural item rolls + affixes** — per-item quality (80–130%) + 0–3 rarity-scaled affixes; crit / lifesteal / damage-reduction stats.
- [x] **Infinitely scaling dungeon depth** — replaced fixed tiers with an open-ended depth; exponential HP/dmg/reward scaling.
- [x] **Extraction run loop + meta-progression** — dives are runs with at-risk loot; Exit banks / Descend dives deeper / death forfeits; account-wide **shards** buy permanent Quartermaster upgrades.
- [x] **3 classes + 5 weapon archetypes** — Drifter/Warden/Auralist (class armor + dash flavors); sword/mace/dagger/bow/staff, incl. friendly ranged projectiles + frost chill.
- [x] **Title screen + multi-character profiles + shared stash** — one character per class, create/play/delete, item transfer between characters; localStorage persistence.
- [x] **Per-class penguin + armor art** — distinct bodies, drawn equipped armor, class-matched starting weapons; "Waddle's Quest" logo + favicon.
- [x] **Towns + area difficulty** — one town per outer biome (safe zone + tiered shop); wild-enemy HP/damage scale by area tier so you can't rush far towns for gear.
- [x] **Repo refactor + agent docs** — split the giants (`fx.js`/`hud.js`/`playerart.js`); `AGENTS.md` (canonical) with code map + conventions + playbooks, pointed at by `CLAUDE.md`/`GEMINI.md`/Copilot/Cursor.
