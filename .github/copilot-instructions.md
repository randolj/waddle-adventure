# Copilot instructions — Waddle's Quest

The complete project guide for AI agents is in **[`AGENTS.md`](../AGENTS.md)** at the repo root: the code map, core conventions, and step-by-step playbooks for adding features. Read it before suggesting or making changes.

Quick essentials:
- Vanilla JS + HTML5 canvas, **zero dependencies, zero build step**, native ES modules. `index.html` loads `src/main.js`. No bundler, no frameworks, no TypeScript.
- All player stats derive from equipped-gear `mods` summed onto a per-class base in `recomputeStats()` — don't hardcode stats. A new stat key must get a baseline in `BASE_COMMON` (`src/player.js`).
- UI overlays are immediate-mode (render + handle input together each frame). Persistence is localStorage via `src/meta.js` — mind the gotchas listed in `AGENTS.md`.
- Match the existing style: small single-purpose modules, the conventions in `AGENTS.md`. When you add a system, update the CODE MAP + PLAYBOOKS in `AGENTS.md`.
