#!/usr/bin/env bash
# Sync ROADMAP.md cards -> GitHub Issues (idempotent: skips titles that already exist).
#
# One-time setup (you run these — auth is yours):
#   brew install gh
#   gh auth login            # pick GitHub.com, HTTPS, authenticate in browser
#
# Then run:  bash scripts/sync-roadmap-github.sh
#
# Re-runnable: it only creates labels/issues that don't exist yet, so you can add
# new ROADMAP cards here and run it again.
set -euo pipefail

command -v gh >/dev/null || { echo "gh not installed. Run: brew install gh && gh auth login"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "gh not authenticated. Run: gh auth login"; exit 1; }

REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
echo "Target repo: $REPO"

# --- Labels: area / effort / priority ---
ensure_label() { gh label create "$1" --color "$2" --description "$3" >/dev/null 2>&1 || true; }
ensure_label "area:ux"        "1d76db" "UX / quality-of-life"
ensure_label "area:enemies"   "b60205" "Enemy design"
ensure_label "area:weapons"   "d93f0b" "Weapons"
ensure_label "area:dungeons"  "5319e7" "Dungeons"
ensure_label "area:systems"   "0e8a16" "Core systems"
ensure_label "area:co-op"     "006b75" "Multiplayer"
ensure_label "area:content"   "fbca04" "Content / progression"
ensure_label "area:polish"    "c5def5" "Polish"
ensure_label "effort:S"       "c2e0c6" "~a few hours"
ensure_label "effort:M"       "fef2c0" "~a focused session"
ensure_label "effort:L"       "f9d0c4" "~multi-session"
ensure_label "effort:XL"      "e99695" "its own project"
ensure_label "priority:next"  "0052cc" "On the Up Next column"
ensure_label "keystone"       "5319e7" "High-leverage / unblocks others"

# Existing issue titles (open + closed), so re-runs don't duplicate.
EXISTING="$(gh issue list --repo "$REPO" --state all --limit 500 --json title -q '.[].title')"

add_issue() { # title | labels | state(open|closed) | body
  local title="$1" labels="$2" state="$3" body="$4"
  if grep -Fxq "$title" <<<"$EXISTING"; then
    echo "skip (exists): $title"; return
  fi
  local url
  url="$(gh issue create --repo "$REPO" --title "$title" --label "$labels" --body "$body")"
  echo "created: $title -> $url"
  if [ "$state" = "closed" ]; then gh issue close "$url" >/dev/null 2>&1 || true; fi
}

# ===== Up Next (open, priority:next) =====
add_issue "Dungeon discoverability (map markers + arrow)" "area:ux,effort:S,priority:next" open \
  "Mark dungeon entrances on the corner + fullscreen map (tier-colored), add an off-screen arrow to the nearest entrance while roaming. Lean on towns sitting next to dungeons. Fixes the 'where are the dungeons?' pain. Data: \`world.dungeons\` (x/y/tierIndex)."
add_issue "Status-effect system (burn / poison / freeze / stun)" "area:systems,effort:M,priority:next" open \
  "Generalize the existing \`chill\` into a reusable status layer (DoT + slow + stun). Foundational — deepens weapons, enemies, and boons at once. See enemy.js applyChill/effSpeed/chillTimer for the pattern."
add_issue "Elite / affixed enemies" "area:enemies,effort:M,priority:next" open \
  "Roll modifiers (fast, explosive, shielded, vampiric, frozen-aura) onto existing archetypes with better loot. Biggest variety-per-effort win (multiplies the 6 archetypes)."
add_issue "Mid-dive boons / altars (build-enabling)" "area:systems,effort:L,priority:next,keystone" open \
  "Altars in dungeons granting run-modifying boons ('dash-strike chains lightning', 'crits explode', 'every 5th hit freezes'). The keystone for replayability — ties weapons + enemies + dungeons together. (Was #4 on the scaling list.)"
add_issue "Dungeon room types" "area:dungeons,effort:M,priority:next" open \
  "Shrine/altar (risk-reward), mid-dive shop, trap rooms, wave/challenge rooms, mini-boss rooms. See dungeon.js room-graph generation + room.type."

# ===== Backlog (open) =====
add_issue "New weapon archetypes (charge / thrown / spear / whip / bomb)" "area:weapons,effort:M" open \
  "Charge weapon (hold-to-release), thrown chakram/boomerang (hits out + back), spear (line-pierce), flail/whip (wide reach), bomb-thrower (AoE). See AGENTS.md 'Add a WEAPON ARCHETYPE'."
add_issue "On-hit weapon procs (chain lightning / crit explosions / bleed)" "area:weapons,effort:M" open \
  "Weapon special effects on hit. Depends on the status-effect system."
add_issue "More weapon templates" "area:weapons,effort:S" open \
  "Fill out the 5 existing archetypes with more rarities/variants — one ITEM_TEMPLATES entry each."
add_issue "New enemy behaviors (charger / bomber / summoner / splitter / shielder / healer)" "area:enemies,effort:M" open \
  "New AI: charger (telegraphed dash), bomber (rush + explode), summoner, splitter (split on death), shielder (flank-only), healer (priority target). See AGENTS.md 'Add an ENEMY archetype'."
add_issue "Biome-specific bosses + more boss variety" "area:enemies,effort:M" open \
  "Beyond the 3 shared kinds (charger/archer/caster): phases, arena hazards, telegraphs."
add_issue "Secret rooms / bombable walls" "area:dungeons,effort:M" open \
  "The original 'secret entrances' vision — hidden rooms revealed by hazards/keys."
add_issue "Dungeon hazards & interactables" "area:dungeons,effort:M" open \
  "Spike tiles, locked doors/keys, breakable objects with loot."
add_issue "Local co-op (2P, one screen)" "area:co-op,effort:L" open \
  "Second Player + second input scheme (gamepad) + camera framing both. Bounded refactor (\`player\` is referenced everywhere assuming one). Ship before any netcode."
add_issue "Online co-op (host-authoritative netcode)" "area:co-op,effort:XL" open \
  "Host runs sim -> snapshots; clients send inputs. WebSocket relay, lobby UI, reconcile per-character saves with shared runs. Its own project — do local co-op first."
add_issue "Run goals / objectives / bounties" "area:content,effort:M" open \
  "Per-run goals, kill-the-X targets, account achievements."
add_issue "6th biome / 4th class / new rarity tier" "area:content,effort:S" open \
  "All recipe-driven — see the AGENTS.md playbooks."
add_issue "Settings / options (volume, keybinds)" "area:polish,effort:S" open \
  "Options screen: volume, keybinds, toggles."
add_issue "Audio / music pass" "area:polish,effort:M" open \
  "Beef up procedural SFX (sfx.js), add ambient/combat music."
add_issue "Sprite / art pass" "area:polish,effort:XL" open \
  "Swap procedural canvas art for sprite sheets + animation."

# ===== Done (closed, for record) =====
add_issue "[done] Procedural item rolls + affixes" "area:systems,effort:M" closed "Shipped. Per-item quality + rarity-scaled affixes; crit/lifesteal/damage-reduction."
add_issue "[done] Infinitely scaling dungeon depth" "area:dungeons,effort:M" closed "Shipped. Open-ended depth with exponential scaling."
add_issue "[done] Extraction run loop + shards/meta upgrades" "area:systems,effort:L" closed "Shipped. At-risk loot, Exit/Descend/death, account-wide shards + Quartermaster upgrades."
add_issue "[done] 3 classes + 5 weapon archetypes" "area:systems,effort:L" closed "Shipped. Drifter/Warden/Auralist; sword/mace/dagger/bow/staff incl. ranged."
add_issue "[done] Title screen + multi-character + stash" "area:systems,effort:L" closed "Shipped. One character per class, create/play/delete, shared stash, localStorage."
add_issue "[done] Per-class penguin + armor art + logo" "area:polish,effort:M" closed "Shipped. Distinct bodies, drawn equipped armor, class-matched starters, logo + favicon."
add_issue "[done] Towns + area difficulty" "area:content,effort:L" closed "Shipped. Town per outer biome (safe zone + tiered shop); wild-enemy scaling by area tier."
add_issue "[done] Repo refactor + agent docs" "area:polish,effort:M" closed "Shipped. Split giants (fx.js/hud.js/playerart.js); AGENTS.md + cross-tool agent files."

echo "Done. View: gh issue list --repo $REPO"
