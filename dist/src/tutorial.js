// Step-by-step onboarding for brand-new players. Non-blocking: the sim runs normally
// and each step advances as the player performs the action (move / attack / dash / dive),
// or after a short timer for info-only steps. main.js begins it on a FRESH boot (no saved
// character), feeds it events via note(), advances time via update(dt), and draws it via
// draw(view). Purely presentational — no game state imported.

import { roundRect as rr } from "./utils.js";

export class Tutorial {
  constructor() {
    this.active = false;
    this.i = 0;
    this.t = 0; // seconds on the current step
    // advance: an event name (fired by main.js note()) or "timer" (auto after `dur`s).
    // minT gives an info beat before an action step can complete.
    // `text` is the desktop (keyboard/mouse) phrasing; the optional `touchText` is the
    // MOBILE variant shown on touch devices — same advance event, different control verbs
    // (left stick / aim stick / on-screen DASH & E buttons instead of WASD / click / keys).
    // `guide` (optional) names an overworld target to point at this step: "dungeon"
    // (nearest entrance) or "camp". An event step may also carry `dur` as a fallback
    // timeout so it can't stick if the event never comes (e.g. player never reaches camp).
    this.steps = [
      { text: "Welcome, penguin! Use WASD to roam the frozen wilds.", touchText: "Welcome, penguin! Use the left stick to roam the frozen wilds.", advance: "move", minT: 0.6 },
      { text: "Head out into the wild and click a foe to attack — follow the red arrow.", touchText: "Head out into the wild, then aim the right stick at a foe — follow the red arrow.", advance: "attack", minT: 0.3, guide: "enemy" },
      { text: "Press SPACE to dash — great for dodging danger.", touchText: "Tap the DASH button to dodge danger.", advance: "dash", minT: 0.3 },
      { text: "Now strike RIGHT AFTER a dash — a stronger DASH-STRIKE lunge!", touchText: "DOUBLE-TAP the attack side of the screen to LUNGE — a dash-strike, even mid-fight!", advance: "lunge", minT: 0.3, dur: 14 },
      { text: "Glowing wilds hold shrines (buffs) & caches (loot). Head to the marked dungeon and press E to dive in.", touchText: "Glowing wilds hold shrines (buffs) & caches (loot). Head to the marked dungeon and tap E to dive in.", advance: "dungeon", minT: 0.3, guide: "dungeon", ff: true },
      { text: "This is a RUN — the loot you grab is AT RISK. Clear the room, then step into a portal to EXTRACT (banks your loot & ends the run) — or Descend for more.", advance: "diveEnd", minT: 0.1, ff: true },
      { text: "Run banked — nice work! Follow the arrow back to CAMP to heal and spend your shards. At camp, press TAB for the menu.", touchText: "Run banked — nice work! Follow the arrow back to CAMP to heal and spend your shards.", advance: "camp", minT: 0.4, dur: 30, guide: "camp" },
      { text: "Your quest: reach Depth 10 and still the Heart of Winter. Good luck out there!", advance: "timer", dur: 7 },
    ];
  }

  begin() {
    this.active = true;
    this.i = 0;
    this.t = 0;
  }
  stop() {
    this.active = false;
  }
  isActive() {
    return this.active && this.i < this.steps.length;
  }
  // The overworld target the tutorial is pointing at this step ("dungeon" | "camp" | null).
  // main.js sets it into the view as `tutorialHint` (so hud.js hides the generic wayfinder)
  // and draw() renders the matching pointer.
  overworldGuide() {
    if (!this.isActive()) return null;
    const g = this.steps[this.i].guide;
    return g === "dungeon" || g === "camp" || g === "enemy" ? g : null;
  }

  // main.js calls this for gameplay events; the current step advances if it matches.
  note(event) {
    if (!this.isActive()) return;
    const s = this.steps[this.i];
    if (s.advance === event && this.t >= (s.minT || 0)) return this._next();
    // A player who rushes ahead of the script (e.g. dives into a dungeon while the
    // attack step is still up) must not strand the arc: the dive event would be lost
    // and the "head to the dungeon" step could never complete from inside one. If a
    // LATER step is waiting for this event, fast-forward past it — but ONLY steps
    // flagged `ff` (discrete milestones like the dive). Ambient state events must
    // never fast-forward: "camp" fires every frame while standing in the safe zone,
    // and a fresh player SPAWNS at camp — jumping to it would skip the whole arc.
    for (let j = this.i + 1; j < this.steps.length; j++) {
      if (this.steps[j].advance === event && this.steps[j].ff) {
        this.i = j;
        this._next();
        return;
      }
    }
  }
  _next() {
    this.i++;
    this.t = 0;
    if (this.i >= this.steps.length) this.active = false;
  }
  update(dt) {
    if (!this.isActive()) return;
    this.t += dt;
    const s = this.steps[this.i];
    // Timer steps advance on `dur`; event steps that carry a `dur` use it as a fallback
    // timeout so a step can never stick if its event never fires.
    if (s.dur && this.t >= s.dur) this._next();
  }

  // A message card near the top-center. Screen-space (drawn outside the camera transform).
  draw(view) {
    if (!this.isActive()) return;
    const { ctx, w, h } = view;
    const s = this.steps[this.i];
    // Mobile devices get the touch-phrased instruction when one exists.
    const isTouch = !!(view.touch && view.touch.capable);
    const text = isTouch && s.touchText ? s.touchText : s.text;
    // COMPACT on short screens (landscape phones): smaller card tucked to the top so the
    // instructions never cover the player / the middle of the gameplay screen.
    const compact = h < 480;
    const bodyFont = compact ? "600 13px Fredoka, -apple-system, sans-serif" : "600 15px Fredoka, -apple-system, sans-serif";
    const cardW = Math.min(compact ? 500 : 560, w - 24);
    const pad = compact ? 12 : 18;
    ctx.save();
    ctx.textBaseline = "alphabetic";
    ctx.font = bodyFont;
    // Word-wrap the text to the card width.
    const words = text.split(" ");
    const maxTextW = cardW - pad * 2;
    const lines = [];
    let line = "";
    for (const word of words) {
      const test = line ? line + " " + word : word;
      if (ctx.measureText(test).width > maxTextW && line) {
        lines.push(line);
        line = word;
      } else line = test;
    }
    if (line) lines.push(line);

    const lineH = compact ? 18 : 21;
    const cardH = pad * 2 + (compact ? 16 : 20) + lines.length * lineH;
    const cx = w / 2;
    const cardX = cx - cardW / 2;
    const cardY = compact ? 56 : 74;

    // Card — clearly translucent so the world shows through the instruction box
    // (the text itself stays full-opacity for readability).
    ctx.fillStyle = "rgba(12,18,32,0.48)";
    rr(ctx, cardX, cardY, cardW, cardH, 12);
    ctx.fill();
    ctx.strokeStyle = "rgba(127,210,255,0.35)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // "TUTORIAL · step N/total" header.
    const headY = cardY + (compact ? 16 : 20);
    ctx.textAlign = "left";
    ctx.fillStyle = "#7fd2ff";
    ctx.font = (compact ? "800 11px" : "800 12px") + " Fredoka, -apple-system, sans-serif";
    ctx.fillText(`✦ TUTORIAL`, cardX + pad, headY);
    ctx.textAlign = "right";
    ctx.fillStyle = "#8b97ab";
    ctx.font = (compact ? "600 11px" : "600 12px") + " Fredoka, -apple-system, sans-serif";
    ctx.fillText(`${this.i + 1} / ${this.steps.length}`, cardX + cardW - pad, headY);

    // Body text.
    ctx.textAlign = "left";
    ctx.fillStyle = "#eaf1fb";
    ctx.font = bodyFont;
    let ty = cardY + pad + (compact ? 22 : 26);
    for (const l of lines) {
      ctx.fillText(l, cardX + pad, ty);
      ty += lineH;
    }
    ctx.restore();

    // Point the way to the current overworld target (dungeon to dive / camp to bank).
    const guide = this.overworldGuide();
    if (guide) this._drawPointer(view, guide);

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  // A pulsing marker toward the current tutorial target — the nearest dungeon entrance
  // (`kind==="dungeon"`) or the camp (`"camp"`). Edge arrow when off-screen, a pin when in
  // view. Shown on BOTH desktop (no on-screen waypoint, only the M-map) and mobile (whose
  // generic wayfinder is hidden this step, so there's exactly one marker). Screen projection
  // mirrors hud.js drawWaypoints: screenX = worldX - camera.x (no zoom).
  _drawPointer(view, kind) {
    const { ctx, w, h, world, camera, player, scene } = view;
    if (scene !== "overworld" || !world || !camera || !player) return;
    let tx, ty, label, sub, col;
    if (kind === "camp") {
      const z = world.safeZone;
      if (!z) return;
      tx = z.x + z.w / 2;
      ty = z.y + z.h / 2;
      label = "CAMP";
      sub = "heal & bank";
      col = "#7CFC9B";
    } else if (kind === "enemy") {
      // Point at the nearest wild creature (there are none inside the safe camp, so this
      // pulls a brand-new player out into the wild to find a foe to attack).
      let best = null;
      let nd = Infinity;
      for (const e of view.enemies || []) {
        const d = Math.hypot(e.x - player.x, e.y - player.y);
        if (d < nd) {
          nd = d;
          best = e;
        }
      }
      if (!best) return;
      tx = best.x;
      ty = best.y;
      label = "ENEMY";
      sub = "attack it";
      col = "#ff6b6b";
    } else {
      let best = null;
      let nd = Infinity;
      for (const dg of world.dungeons || []) {
        const d = Math.hypot(dg.x - player.x, dg.y - player.y);
        if (d < nd) {
          nd = d;
          best = dg;
        }
      }
      if (!best) return;
      tx = best.x;
      ty = best.y;
      label = "DUNGEON";
      sub = "dive here";
      col = "#ffd166";
    }
    const bd = Math.hypot(tx - player.x, ty - player.y);
    if (bd < 170) return; // basically there — the interaction prompt takes over

    const margin = 66;
    const cxs = w / 2;
    const cys = h / 2;
    const halfW = w / 2 - margin;
    const halfH = h / 2 - margin;
    const topSafe = h < 480 ? 150 : 210; // keep a top-edge arrow clear of the tutorial card (top-center)
    let ex = tx - camera.x;
    let ey = ty - camera.y;
    const onScreen = ex > margin && ex < w - margin && ey > margin && ey < h - margin;
    let ang = 0;
    if (!onScreen) {
      const dx = ex - cxs;
      const dy = ey - cys;
      const k = Math.max(Math.abs(dx) / halfW, Math.abs(dy) / halfH, 1);
      ex = cxs + dx / k;
      // Clamp: never ride up into the instruction card, never down into the bottom-center
      // interaction-prompt pill (drawPrompt draws at h-92..h-58).
      ey = Math.min(Math.max(cys + dy / k, topSafe), h - 116);
      ang = Math.atan2(dy, dx);
    }
    const pulse = 0.5 + 0.5 * Math.sin((view.fxClock || 0) * 4);
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Pulsing halo to draw the eye.
    ctx.globalAlpha = 0.3 + 0.35 * pulse;
    ctx.beginPath();
    ctx.arc(ex, ey, 20 + 6 * pulse, 0, Math.PI * 2);
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.stroke();
    // Backing disc.
    ctx.globalAlpha = 0.96;
    ctx.beginPath();
    ctx.arc(ex, ey, 18, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(10,14,24,0.82)";
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.stroke();
    if (onScreen) {
      ctx.beginPath();
      ctx.arc(ex, ey, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
    } else {
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(ang);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(11, 0);
      ctx.lineTo(-4, -7);
      ctx.lineTo(-4, 7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    // Label.
    const lx = onScreen ? ex : ex - Math.cos(ang) * 36;
    const ly = onScreen ? ey - 30 : ey - Math.sin(ang) * 36;
    ctx.globalAlpha = 1;
    ctx.fillStyle = col;
    ctx.font = "800 12px Fredoka, -apple-system, sans-serif";
    ctx.fillText(label, lx, ly - 7);
    ctx.fillStyle = "rgba(232,238,248,0.9)";
    ctx.font = "600 11px Fredoka, -apple-system, sans-serif";
    ctx.fillText(sub + " · " + Math.round(bd) + "m", lx, ly + 7);
    ctx.restore();
  }
}
