// Centralised keyboard + mouse state.

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set(); // key-down edges, awaiting consumePress()
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDown = false;
    this.clicked = false; // true for one frame after a press; cleared by consumeClick()

    window.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
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

  // Movement axis from WASD / arrow keys, range [-1, 1] per axis.
  get axisX() {
    return (this.isDown("d", "arrowright") ? 1 : 0) - (this.isDown("a", "arrowleft") ? 1 : 0);
  }
  get axisY() {
    return (this.isDown("s", "arrowdown") ? 1 : 0) - (this.isDown("w", "arrowup") ? 1 : 0);
  }

  consumeClick() {
    const c = this.clicked;
    this.clicked = false;
    return c;
  }
}
