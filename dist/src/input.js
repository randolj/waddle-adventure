// Centralised keyboard + mouse state.

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set(); // key-down edges, awaiting consumePress()
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseMoved = false; // a real mouse has moved — so mouseX/Y are meaningful (not on touch)
    this.mouseDown = false;
    this.clicked = false; // true for one frame after a press; cleared by consumeClick()
    this.wheelY = 0; // accumulated wheel delta; drained by consumeWheel()

    // --- Touch bridge (written by TouchControls in touch.js) ---
    // Virtual left-stick movement, summed into axisX/axisY below.
    this.touchMove = { x: 0, y: 0 };
    // Virtual right-stick aim: a unit direction + an "engaged" flag. When active,
    // player.js drives `facing` from this and auto-fires (twin-stick).
    this.aimVec = { x: 1, y: 0 };
    this.aimActive = false;
    // True while an overlay/menu is open or no character is in play — TouchControls
    // then routes touches to the cursor (mouseX/mouseY/clicked) instead of the sticks.
    this.touchUi = false;
    // True while the player is standing on/next to something E would act on — the
    // touch E button only shows then (set each frame by main.js).
    this.canInteract = false;
    // True while a recall-to-camp is possible (overworld, alive, not already at camp)
    // — gates the touch CAMP button (set each frame by main.js).
    this.canRecall = false;

    // Keys the game consumes — preventDefault them (without a modifier) so Space/arrows
    // don't scroll the page / portal iframe, and they don't trip platform shortcuts.
    const GAME_KEYS = new Set([" ", "arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d", "e", "i", "m", "r", "`"]);
    window.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      if (GAME_KEYS.has(k) && !e.ctrlKey && !e.metaKey && !e.altKey) e.preventDefault();
      if (!e.repeat) this.pressed.add(k); // ignore auto-repeat for edge detection
      this.keys.add(k);
    });
    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.key.toLowerCase());
    });

    canvas.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
      this.mouseY = e.clientY - rect.top;
      this.mouseMoved = true;
    });
    canvas.addEventListener("mousedown", (e) => {
      if (e.button === 0) {
        this.mouseDown = true;
        this.clicked = true;
      }
    });
    window.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    canvas.addEventListener("wheel", (e) => {
      this.wheelY += e.deltaY;
    }, { passive: true });
    // Avoid stuck keys when the window loses focus.
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.pressed.clear();
    });
  }

  isDown(...keys) {
    return keys.some((k) => this.keys.has(k));
  }

  // Returns true once per physical key-press for any of the given keys.
  consumePress(...keys) {
    for (const k of keys) {
      if (this.pressed.has(k)) {
        this.pressed.delete(k);
        return true;
      }
    }
    return false;
  }

  // Movement axis from WASD / arrow keys (+ the touch left-stick), range [-1, 1].
  get axisX() {
    const kb = (this.isDown("d", "arrowright") ? 1 : 0) - (this.isDown("a", "arrowleft") ? 1 : 0);
    const v = kb + this.touchMove.x;
    return v < -1 ? -1 : v > 1 ? 1 : v;
  }
  get axisY() {
    const kb = (this.isDown("s", "arrowdown") ? 1 : 0) - (this.isDown("w", "arrowup") ? 1 : 0);
    const v = kb + this.touchMove.y;
    return v < -1 ? -1 : v > 1 ? 1 : v;
  }

  // Synthesise a key-press edge (touch buttons reuse the keyboard consumePress paths).
  injectPress(k) {
    this.pressed.add(k);
  }

  // Hold/release a key (hold-style touch buttons reuse the keyboard isDown paths).
  injectHold(k, down) {
    if (down) this.keys.add(k);
    else this.keys.delete(k);
  }

  consumeClick() {
    const c = this.clicked;
    this.clicked = false;
    return c;
  }

  // Drain accumulated wheel delta (positive = scrolled down).
  consumeWheel() {
    const d = this.wheelY;
    this.wheelY = 0;
    return d;
  }
}
