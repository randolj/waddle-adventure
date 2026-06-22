// On-screen twin-stick touch controls for mobile / touchscreen play.
//
// Left half of the screen = a floating MOVE stick -> input.touchMove (summed into
// input.axisX/axisY). Right half = a floating AIM stick -> input.aimVec/aimActive,
// which player.js uses to drive `facing` and auto-fire. Fixed corner buttons inject
// keyboard-press edges (dash / interact / inventory) so all existing input paths are
// reused unchanged. When an overlay is open (input.touchUi), touches instead drive the
// cursor (mouseX/mouseY + click + wheel) so the immediate-mode menus work as-is.
//
// Desktop is untouched: nothing draws and no bridge field changes until the user's
// first real touch, and aimActive only ever flips on via this module.

const STICK_R = 60; // max knob travel from the stick origin (logical px)
const DEAD = 10; // aim deadzone — below this the stick reads as "not engaged"
const UI_DRAG = 10; // px of travel before a UI touch counts as a scroll, not a tap
const DOUBLE_TAP_MS = 300; // two aim-side taps within this => lunge (dash-strike)

export class TouchControls {
  constructor(canvas, input) {
    this.canvas = canvas;
    this.input = input;
    this.capable = "ontouchstart" in window || (navigator.maxTouchPoints || 0) > 0;
    this.everTouched = false; // gates drawing — stay invisible for pure mouse use
    this.touches = new Map(); // identifier -> {role, ox, oy, x, y, key?, dragged?, sy?}
    this.pressedBtns = new Set(); // button keys currently held (for highlight)
    this.lastAimTap = 0; // timestamp of the previous aim-side touch (double-tap detect)

    if (!this.capable) return;
    const opts = { passive: false };
    canvas.addEventListener("touchstart", (e) => this.onStart(e), opts);
    canvas.addEventListener("touchmove", (e) => this.onMove(e), opts);
    canvas.addEventListener("touchend", (e) => this.onEnd(e), opts);
    canvas.addEventListener("touchcancel", (e) => this.onEnd(e), opts);
  }

  // Logical-pixel layout, recomputed from the live viewport each query.
  // The E (interact) and CAMP (recall) buttons only appear when their action is valid.
  buttons(w, h) {
    return [
      // Top: hold to recall to camp — reuses the hold-R path (need + hold flagged).
      { key: "r", label: "CAMP", x: w / 2, y: 42, r: 27, color: "#7CFC9B", need: "recall", hold: true },
      { key: " ", label: "DASH", x: w - 74, y: h - 80, r: 46, color: "#7fd8ff" },
      { key: "e", label: "E", x: w - 172, y: h - 60, r: 36, color: "#ffd166", need: "interact" },
      { key: "i", label: "BAG", x: w - 76, y: h - 180, r: 30, color: "#c4a6ff" },
    ].filter((b) => {
      if (b.need === "interact") return this.input.canInteract;
      if (b.need === "recall") return this.input.canRecall;
      return true;
    });
  }

  pos(touch) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  }

  viewSize() {
    const dpr = window.devicePixelRatio || 1;
    return { w: this.canvas.width / dpr, h: this.canvas.height / dpr };
  }

  onStart(e) {
    e.preventDefault(); // also suppresses the synthetic mouse events that follow
    this.everTouched = true;
    const { w, h } = this.viewSize();
    for (const t of e.changedTouches) {
      const p = this.pos(t);
      if (this.input.touchUi) {
        // Overlay open: drive the cursor. Tap (no drag) becomes a click on release.
        this.input.mouseX = p.x;
        this.input.mouseY = p.y;
        this.touches.set(t.identifier, { role: "ui", x: p.x, y: p.y, sy: p.y, dragged: false });
        continue;
      }
      const btn = this.buttons(w, h).find((b) => Math.hypot(p.x - b.x, p.y - b.y) <= b.r);
      if (btn) {
        if (btn.hold) this.input.injectHold(btn.key, true); // held until release
        else this.input.injectPress(btn.key);
        this.pressedBtns.add(btn.key);
        this.touches.set(t.identifier, { role: "btn", key: btn.key, hold: !!btn.hold });
        continue;
      }
      const role = p.x < w * 0.5 ? "move" : "aim";
      if (role === "aim") {
        // Double-tapping the aim (attack) side fires a lunge — a dash-strike toward
        // the last aim direction. player.js consumes the "lunge" press.
        const now = typeof performance !== "undefined" ? performance.now() : 0;
        if (now - this.lastAimTap < DOUBLE_TAP_MS) {
          this.input.injectPress("lunge");
          this.lastAimTap = 0; // consume, so a third quick tap doesn't chain
        } else {
          this.lastAimTap = now;
        }
      }
      this.touches.set(t.identifier, { role, ox: p.x, oy: p.y, x: p.x, y: p.y });
    }
    this.recompute();
  }

  onMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const rec = this.touches.get(t.identifier);
      if (!rec) continue;
      const p = this.pos(t);
      if (rec.role === "ui") {
        this.input.mouseX = p.x;
        this.input.mouseY = p.y;
        this.input.wheelY += rec.sy - p.y; // drag = scroll
        if (Math.abs(p.y - rec.sy) > UI_DRAG) rec.dragged = true;
        continue;
      }
      rec.x = p.x;
      rec.y = p.y;
    }
    this.recompute();
  }

  onEnd(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const rec = this.touches.get(t.identifier);
      if (!rec) continue;
      if (rec.role === "ui" && !rec.dragged) this.input.clicked = true; // tap -> click
      if (rec.role === "btn") {
        if (rec.hold) this.input.injectHold(rec.key, false); // release the held key
        this.pressedBtns.delete(rec.key);
      }
      this.touches.delete(t.identifier);
    }
    this.recompute();
  }

  // Reduce the active stick touches into the input bridge fields.
  recompute() {
    let move = null;
    let aim = null;
    for (const rec of this.touches.values()) {
      if (rec.role === "move") move = rec;
      else if (rec.role === "aim") aim = rec;
    }
    if (move) {
      let dx = move.x - move.ox;
      let dy = move.y - move.oy;
      const d = Math.hypot(dx, dy) || 1;
      const m = Math.min(1, d / STICK_R);
      this.input.touchMove.x = (dx / d) * m;
      this.input.touchMove.y = (dy / d) * m;
    } else {
      this.input.touchMove.x = 0;
      this.input.touchMove.y = 0;
    }
    if (aim) {
      const dx = aim.x - aim.ox;
      const dy = aim.y - aim.oy;
      const d = Math.hypot(dx, dy);
      if (d > DEAD) {
        this.input.aimVec.x = dx / d;
        this.input.aimVec.y = dy / d;
        this.input.aimActive = true;
      } else {
        this.input.aimActive = false;
      }
    } else {
      this.input.aimActive = false;
    }
  }

  // Screen-space overlay. Self-gates: only on touch devices, only after first touch,
  // and never while a menu is open (the caller also guards on scene/dead/victory).
  draw(ctx, w, h) {
    if (!this.capable || !this.everTouched || this.input.touchUi) return;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Idle home hints for the two floating sticks.
    let move = null;
    let aim = null;
    for (const rec of this.touches.values()) {
      if (rec.role === "move") move = rec;
      else if (rec.role === "aim") aim = rec;
    }
    this.drawStick(ctx, move, w * 0.16, h * 0.74, "#cfe6ff");
    this.drawStick(ctx, aim, w * 0.84, h * 0.74, "#ffd9a8");

    for (const b of this.buttons(w, h)) {
      const held = this.pressedBtns.has(b.key);
      ctx.globalAlpha = held ? 0.9 : 0.5;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = held ? b.color : "rgba(14,18,28,0.55)";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = b.color;
      ctx.stroke();
      ctx.globalAlpha = held ? 1 : 0.85;
      ctx.fillStyle = held ? "#0c1018" : b.color;
      ctx.font = "700 " + (b.r > 40 ? 16 : 13) + "px -apple-system, sans-serif";
      ctx.fillText(b.label, b.x, b.y + 1);
    }
    ctx.restore();
  }

  drawStick(ctx, rec, hx, hy, color) {
    // Base ring at the touch origin if engaged, else a faint home hint.
    const ox = rec ? rec.ox : hx;
    const oy = rec ? rec.oy : hy;
    ctx.globalAlpha = rec ? 0.4 : 0.18;
    ctx.beginPath();
    ctx.arc(ox, oy, STICK_R, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = color;
    ctx.stroke();
    if (!rec) return;
    // Knob, clamped to the ring.
    let dx = rec.x - ox;
    let dy = rec.y - oy;
    const d = Math.hypot(dx, dy);
    if (d > STICK_R) {
      dx = (dx / d) * STICK_R;
      dy = (dy / d) * STICK_R;
    }
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.arc(ox + dx, oy + dy, 26, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
}
