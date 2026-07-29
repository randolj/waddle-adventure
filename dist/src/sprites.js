// Optional PNG sprite overrides for the procedural art. Drop a file into
// assets/sprites/ with a documented name and it takes over the matching draw;
// anything missing (or still loading, or failed) falls back SILENTLY to the
// procedural rendering — partial sprite sets are always safe, and removing a
// file restores the old look. No preloading: the first query kicks off the
// load, later queries return the cached Image.
//
// Naming contract (all .png, transparent background):
//   penguin-<class>       body sprite (drifter / warden / auralist), front-facing,
//                         feet at the bottom — replaces body+armor (scarf, auras,
//                         particles and weapons still draw around it)
//   weapon-<archetype>    sword / mace / dagger / bow / staff (NOTE: "dagger"
//                         singular — the weaponType id) — drawn pointing RIGHT
//                         with the grip ~15% from the left edge
//   weapon-<templateId>   optional per-item override (e.g. weapon-glacier_maul);
//                         checked before the archetype sprite

const cache = new Map();

export function sprite(name) {
  let img = cache.get(name);
  if (!img) {
    img = new Image();
    img.src = `assets/sprites/${name}.png`;
    cache.set(name, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}
