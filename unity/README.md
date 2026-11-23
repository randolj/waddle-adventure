# Waddle's Quest — Unity slice

An isolated Unity 6 URP project. Open **this `unity/` directory** in Unity Hub using **6000.3.15f1**. Open `Assets/Waddle/Scenes/Frostvault.unity` and press Play.

The canvas game at the repository root remains independently runnable with `python3 serve.py`.

## Play

Desktop first: WASD/arrows move, mouse aims, left click attacks, Space/left Shift dashes, E interacts, Esc pauses. Dash then attack during the grace window to perform a dash-strike. Enter returns to camp after extraction or death.

You start in **Snowhaven**, a safe camp in the Frostwood. Walk among the three canvas tents, talk to Pip, Mara and Bram with E, and rest in camp to restore health. The forge is an inspectable landmark; crafting is reserved for a later pass. NPCs currently reuse the Drifter model with colored collars.

Explore the surrounding snowy region: a frozen pond northwest of camp, a one-time supply cache beyond it, frost crystals, snow-laden firs and three roaming gremlins. Camp safety blocks damage and sends pursuing enemies back to their wilderness posts. The cache banks 8 coins and 2 shards immediately, and its claimed flag persists with the bank. The region map shows camp, pond, cache, the lantern trail and Frostvault. The camera follows Waddle outdoors.

Follow the lanterns northeast to the ruined Frostvault entrance and press E. In the vault, clear two gremlins and a charger. The charger has a ground warning before it lunges. Open the reward chest with E: its lid opens over 0.65 seconds, then the 40 coins and 6 shards are awarded. The open chest remains in the room. Reach the north gate and press E to begin the 0.8-second extraction channel; rewards are banked only when it finishes. Death forfeits carried rewards. Only banked totals persist, under the separate `waddle_unity_slice_bank_v1` PlayerPrefs key. Existing browser saves are untouched.

Hold left click to chain sword swings. Each swing commits its aim through wind-up, contact and recovery; presses near recovery end are buffered for 0.13 seconds. Dash lasts 0.16 seconds at 15m/s, followed by 0.28 seconds of recharge; the dash-strike grace lasts another 0.18 seconds after the dash. Waddle uses a 65-bone skinned mesh with idle/walk, an upper-body sword layer, dash anticipation and hit recoil. The sword follows the right-hand bone. The charger uses a 29-bone quadruped walk; its warning/charge lean and death fall-away remain procedural. Both gremlins now use a 31-bone skinned rig with skeletal locomotion and code-authored bite/recoil on the head and spine. All skeletal poses are evaluated by the simulation tick, so pause and hit-stop freeze animation alongside combat. Imported slash/hurt clips use selected action windows rather than compressing their long idle tails into a swing.

## Scope and art target

This is the first playable slice, not the full port. It contains one authored outdoor region and one dungeon room, one class, one sword, two enemy types, collision/cover, dash-strike, hit-stop, camera shake, slash/impact effects, procedural sound cues, chest/extraction, and bank persistence.

The selected target is [C's forms with B's lighting](../art-src/unity-concepts/selected-direction.md). The slice uses four Tripo-generated textured models with independent sword presentation, authored modular room geometry, a generated slate albedo, URP shadows, ambient fill, bloom, fog and warm/cool practical lights. All characters now use Tripo rigs and imported locomotion. Waddle’s gait follows measured travel, with a shortened loop, seam blending, restrained torso sway, backward playback and lower-body steering. Visual heading eases separately from immediate combat aim. Sword, dash and hurt poses retain their last sample through short blend-outs. The gremlin has additional head/spine bite and recoil poses. These are retargeted motions with procedural refinements and analytic foot grounding: Waddle’s feet, the charger’s four paws and the gremlin’s supporting rear feet use IK. The environment and presentation still need further work to match the approved concept. Procedural dungeon generation, complete inventory/classes/progression, mobile/controller controls, portal SDKs, and browser-save migration are outside this slice.

## Change the slice

- `Assets/Waddle/SliceTuning.asset`: gameplay values and replaceable model prefabs. Movement/dash start from `src/player.js` at 50 canvas pixels per metre; the sword is a deliberately fixed slice loadout, not the browser game's randomized starter equipment.
- `Scripts/SliceGame.cs`: run state, input, hit-stop, sound and bank writes.
- `Scripts/SlicePlayer.cs`: movement, dash, lunge and directional melee, including cover occlusion.
- `Scripts/SliceEnemy.cs`: gremlin chase and charger warning/charge/recovery.
- `Scripts/SliceWorld.cs`: deterministic authored dungeon, fallback models, lighting and camera.
- `Scripts/SliceOverworld.cs`: Snowhaven/Frostwood layout, safe camp, NPC conversations, outdoor props, cache, entrance, snow/fire/NPC animation on the simulation clock.
- `Scripts/SliceDressing.cs`: sculpted snow meshes, decorative architecture, banners and portal framing; adds no collision.
- `Scripts/SliceAtmosphere.cs`: one batched frost-mote mesh, source halos, contact shadows, lantern variation and portal phase, advanced by `SliceGame.Tick`.
- `Shaders/Atmosphere.shader`: soft transparent glow/contact and flowing gateway surface.
- `Scripts/SliceHud.cs`, `SliceEffects.cs`: interface and transient combat presentation.
- `Scripts/SliceFootIK.cs`: supporting-leg ground probes, two-bone solve, sole tilt, reachable stance anchors and airborne release.
- `Scripts/SliceSkeleton.cs`: manually evaluated Playables graph, actual-travel gait/loop seam, upper-body action mask, action crossfades, hand socket and bounded additive bone poses.
- `Editor/SkeletonBuilder.cs`: Generic rig/clip import, skinned URP prefabs and tuning installation.
- `Scripts/SliceChest.cs`: hinged lid, reveal scale, reward light and opening timing; advanced by the game tick so pause freezes both animation and payout.
- `Editor/SliceBuilder.cs`: scene regeneration, model installation and macOS build commands. Scene regeneration replaces the generated scene; author persistent layout changes in `SliceWorld.cs`.

Use **Waddle → Build or refresh slice scene** after changing world construction or model slots. Materials/meshes become normal assets, so the room is inspectable before Play. `SliceTuning.asset` survives regeneration. Custom Tripo prefabs must be Y-up, +Z forward, feet at the origin, with scale already applied; the sword prefab additionally rotates its upright source to point forward.

## Build and verify

From the repository root:

```sh
UNITY='/Applications/Unity/Hub/Editor/6000.3.15f1/Unity.app/Contents/MacOS/Unity'
"$UNITY" -batchmode -quit -projectPath "$PWD/unity" -buildTarget StandaloneOSX \
  -executeMethod SliceBuilder.RefreshAndBuild -logFile /tmp/waddle-build.log
```

The build is `unity/Builds/WaddlesQuest.app` (ignored by Git). Double-click it to play.

The latest environment pass is `Review/frostvault-atmosphere-v4.png`, with a short actual Unity recording in `Review/atmosphere-v4.gif` and verification in `Review/verification-v4.txt`.

The checked first-playable screenshot is in `Review/frostvault-first-playable.png`. The brighter feel/readability update is `Review/frostvault-polish-v2.png`; its 26-check verification summary is `Review/verification-v2.txt`. The original verification report remains in `Review/verification.txt`.

```sh
"unity/Builds/WaddlesQuest.app/Contents/MacOS/Waddle's Quest — Frostvault" \
  --waddle-smoke -batchmode -nographics -logFile /tmp/waddle-smoke.log
```

The smoke runner drives exact 1/60-second steps and exits nonzero on failure. It uses a unique temporary save key and deletes that key afterward. It also checks a live skeletal graph, skin weights, actual vertex deformation, the sword socket, the charger rig, and skeletal pause. It checks movement speed, diagonal normalization, dash distance/invulnerability, lunge heading, walls/cover, attack wind-up/committed aim/input buffering, melee cone and single-hit resolution, damage recovery, pause, room-clear/chest animation and reward timing, upward lid rotation, extraction channel/pause/idempotency and serialized bank data. Normal gameplay never runs the smoke harness.

`--waddle-capture` instead renders combat, chest-opening and opened-chest review screenshots into `unity/Builds/Captures/` and quits. It arranges a deterministic review scene without banking any rewards. Use a graphics-capable session for this flag. Add `--waddle-atmosphere-capture` to record 60 environment frames into `Builds/Captures/atmosphere-frames/`. `--waddle-start-paused` launches normal gameplay paused for review. The original screenshot remains in `Review/frostvault-first-playable.png`; the brighter second pass is `Review/frostvault-polish-v2.png`.

## Tripo pipeline

The key lives outside Git at `~/.config/waddles-quest/tripo-api-key.txt`, readable only by the current OS user. `TRIPO_API_KEY` can override the file. No key is included in Unity, builds, prompts, model provenance, or task logs.

```sh
python3 scripts/tripo_assets.py balance
python3 scripts/tripo_assets.py submit drifter
python3 scripts/tripo_assets.py poll drifter
```

`submit` spends credits; it refuses to resubmit an asset with a recorded task. `poll` retrieves the result and downloads it on success. Local task state stays outside the repository. If submission fails ambiguously, reconcile it in Tripo's task history before retrying. Four initial P2 generations used 440 credits total. Raw GLBs and non-secret provenance live in `art-src/tripo-models/`; image references and their imagegen prompts live in `art-src/unity-concepts/model-references/`.

Normalize downloaded GLBs with the installed Blender:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background \
  --python scripts/prepare_tripo_models.py
"$UNITY" -batchmode -quit -projectPath "$PWD/unity" \
  -executeMethod SliceBuilder.InstallTripoModels -logFile /tmp/waddle-models.log
```

The normalization script retains raw sources, exports FBX with feet pivots and consistent units/facing, and extracts the original texture bytes. Unity's installer creates URP materials and assignable prefabs. Current Tripo v3 API references: [generation](https://developers.tripo3d.ai/en/docs/generation-image-to-model/p), [uploads](https://developers.tripo3d.ai/en/docs/files), [authentication](https://developers.tripo3d.ai/en/docs/authentication).


## Skeletal assets

The first skeletal pass used **110 Tripo credits** (two rigs, five Waddle clips and one charger clip); balance afterward: **1,455**. Raw rig/clip GLBs and non-secret provenance are under `art-src/tripo-models/animation/`. The gremlin was later rigged with the API’s quadruped classification and retargeted walk for another **35 credits**. Balance after the gait/gremlin pass: **1,420**. Both enemy instances share that one asset.

```sh
python3 scripts/tripo_animation.py submit drifter check
python3 scripts/tripo_animation.py poll drifter check
# Stages: check → rig → clips; submit each once, poll until successful.
/Applications/Blender.app/Contents/MacOS/Blender --background \
  --python scripts/prepare_tripo_animation.py
"$UNITY" -batchmode -quit -projectPath "$PWD/unity" \
  -executeMethod SkeletonBuilder.InstallAndBuild -logFile /tmp/waddle-skeleton-build.log
```

The skeletal exporter excludes Tripo's hidden unskinned helper geometry before normalizing size, preserves bone weights/actions, and retains original texture bytes. `Models/*-skeletal/rig-audit.json` records exported bone and vertex counts. Use **Waddle → Install skeletal characters** after regenerating these FBXs; the static-model installer resets the model slots, so reinstall skeletons afterward if needed.

For an actual Unity animation recording, run `--waddle-capture --waddle-animation-capture`; it writes 100 fixed-tick PNG frames under `Builds/Captures/skeletal-frames/`, with no bank writes. The reviewed GIF and standalone verification report are `Review/skeletal-v3.gif` and `Review/verification-v3.txt`.


## Environment pass

The fourth pass replaces slab snow with generated, rounded snow meshes, adds wall buttresses, rubble, icicles, crimson banners, carved pillar accents and a pointed extraction arch. Floor tile values are closer together to reduce the checkerboard effect. Warmer lantern pools, restrained source haze, soft contact shadows, sparse drifting frost and a flowing portal veil bring more life to the room. The objective panel is smaller to reveal the gateway crest. Sword crescents have a bright edge over a cyan body and soft outer glow.

Environment animation uses the game simulation clock and freezes on pause; decorative atmosphere continues through brief combat hit-stop. Frost uses a single 96-quad mesh, not separate particle GameObjects. Decorative geometry adds no collision, and the central combat lanes remain clear. No additional AI-generated assets or Tripo credits were required. Bespoke environment textures/meshes and further animation polish remain future work.


## Gait, transitions and gremlins

The fifth pass ties walk phase to actual horizontal controller travel. Idle and blocked movement stop the gait, and walking resumes from the retained phase. Waddle’s source clip contains two cycles; the selected shorter loop blends across its seam. Locomotion eases in/out, torso sway gives the gait a penguin rhythm, and hips steer for strafing while the chest counter-rotates to preserve aim. Presentation turns over several frames while the attack cone responds immediately.

Action layers now retain the last sampled pose during recovery and overlap dash release with a dash-strike. Additive bone offsets restore their pre-offset local pose before each evaluation, including for bones whose constant animation channels Unity stripped; recoil cannot accumulate into a flipped body.

Gremlin walk deforms all 14,241 weighted vertices through a 31-bone skeleton. Bite and recoil are authored bone poses on top of locomotion, with existing contact-damage timing preserved. `--waddle-capture --waddle-motion-capture` records a close-up walk/stop/turn/attack/gremlin/dash review under `Builds/Captures/motion-v5-frames/`. See `Review/motion-v5.gif` and `Review/verification-v5.txt`.


## Charger weight and foot IK

The sixth pass selects one charger gait cycle from the three-cycle source clip and increases distance per cycle from roughly 0.8m to 1.1m. At the same 1.4m/s movement speed, cadence is about 27% slower. All four paw targets sit 0.12m farther outward, and the chest has a restrained 2.2-degree gait-driven sway.

`SliceFootIK` runs after clip evaluation and body posing, on the same simulation tick. It raycasts only solid world geometry, ignores triggers/characters, solves each supporting leg analytically, preserves bone lengths, and tilts the sole toward the surface normal. Reachable stance targets hold in world space; turns, teleports, swing phases and reach limits release them. Dashes and charges blend IK out. The solver restores the preceding raw pose before evaluating again, avoiding accumulation on constant or stripped animation channels.

Waddle has two supporting chains, the charger four, and the gremlin two rear-foot chains (the front pair are hands). Ground correction and step height are limited per rig. This is local foot fitting with bounded planting; it does not introduce terrain-following navigation, change collision/movement speed, or guarantee zero sliding at every speed on these very short stylized legs.

`--waddle-capture --waddle-ik-capture` records the charger walking, then standing with a paw on an opt-in sloped test stone, under `Builds/Captures/foot-ik-v6-frames/`. The final `unadjusted.png` shows the same pose with IK removed for comparison. The test stone is only part of review mode. See `Review/charger-foot-ik-v6.gif`, `Review/charger-ik-slope-v6.png` and `Review/verification-v6.txt`. No Tripo credits were used.


## Snowhaven and Frostwood

The seventh pass adds a 52m bounded authored outdoor region, with camp to the south and Frostvault to the northeast. Outdoors and the existing dungeon share one player/controller, but activate separate geometry, lights, volumes and enemy rosters. Entering the vault resets movement/action input, heals Waddle, teleports to the original room spawn and switches to its fixed camera. Extraction/death retains the result screen; **Return to camp / Enter** reloads the scene into Snowhaven with fresh encounters. Bank totals persist. The existing bank schema now includes `cacheClaimed`; older bank saves default to an unclaimed cache. Outdoor enemies do not trigger the dungeon chest.

The region uses generated meshes/materials and the existing Tripo characters. Bespoke NPC models, equipment crafting, region progression and additional biomes remain future work. The pond is traversable frozen ground with level collision; its visual surface does not change movement or introduce swimming. Snowfall, fire flicker and NPC idle animation use `SliceGame.Tick` and freeze on pause. Outdoor camera tracking is presentation-only. Map landmarks are visible from the start in this small region.

For an actual Unity screenshot set, run the built app with `--waddle-capture --waddle-overworld-capture`. It captures camp, pond and entrance without banking rewards. Review files are `Review/snowhaven-camp-v7.png`, `Review/frostwood-pond-v7.png`, `Review/frostvault-entrance-v7.png` and `Review/verification-v7.txt`. Existing capture/smoke flags still begin in the dungeon to preserve their test fixtures; normal launches begin outdoors. No additional Tripo calls were needed.
