import { clamp } from "./utils.js";

// A camera that follows a target and stays inside the world bounds.
export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.aheadX = 0; // eased aim look-ahead offset
    this.aheadY = 0;
  }

  // dt > 0 smooths toward the target; aimX/aimY add a gentle look-ahead offset
  // that is eased on its own so flipping the aim left/right doesn't lurch.
  follow(target, viewW, viewH, worldW, worldH, dt = 0, aimX = 0, aimY = 0) {
    const look = 42;
    if (dt > 0) {
      const ka = 1 - Math.exp(-4.5 * dt);
      this.aheadX += (aimX * look - this.aheadX) * ka;
      this.aheadY += (aimY * look - this.aheadY) * ka;
    } else {
      this.aheadX = aimX * look;
      this.aheadY = aimY * look;
    }
    const desiredX = target.x + this.aheadX - viewW / 2;
    const desiredY = target.y + this.aheadY - viewH / 2;
    const tx = worldW <= viewW ? (worldW - viewW) / 2 : clamp(desiredX, 0, worldW - viewW);
    const ty = worldH <= viewH ? (worldH - viewH) / 2 : clamp(desiredY, 0, worldH - viewH);
    if (dt > 0) {
      const k = 1 - Math.exp(-14 * dt);
      this.x += (tx - this.x) * k;
      this.y += (ty - this.y) * k;
    } else {
      this.x = tx;
      this.y = ty;
    }
  }

  // Convert a screen-space point to world-space.
  toWorld(sx, sy) {
    return { x: sx + this.x, y: sy + this.y };
  }
}
