// Screen-juice owned as a single `fx` instance in main.js: impact particles,
// floating damage numbers, expanding rings, screen shake, and hit-stop. main.js
// keeps thin wrappers (addShake/spawnBurst/addFloater/addRing) that delegate here
// so the many call sites stay unchanged.

export class Fx {
  constructor() {
    this.reset();
  }
  reset() {
    this.parts = []; // impact spark particles
    this.floaters = []; // floating damage numbers
    this.rings = []; // expanding shockwave rings
    this.shake = 0; // current screen-shake magnitude
    this.hitStop = 0; // remaining sim-freeze time
  }

  kick(mag) {
    this.shake = Math.min(16, Math.max(this.shake, mag));
  }
  freeze(dur) {
    this.hitStop = Math.max(this.hitStop, dur);
  }
  floater(x, y, text, color, size) {
    this.floaters.push({ x: x + (Math.random() - 0.5) * 14, y, text, color, size, life: 0.8, maxLife: 0.8, vy: -46 });
  }
  burst(x, y, n, color, speed, size, life) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * (0.6 + Math.random() * 0.6), maxLife: life, size: size * (0.6 + Math.random() * 0.7), color });
    }
  }
  ring(x, y, r0, r1, life, color, width) {
    this.rings.push({ x, y, r0, r1, life, maxLife: life, color, width: width || 3 });
  }

  // Decay shake + advance particles/floaters/rings (real dt — runs during hit-stop).
  update(dt) {
    this.shake = Math.max(0, this.shake - 50 * dt);
    for (const p of this.parts) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(0.02, dt);
      p.vy *= Math.pow(0.02, dt);
      p.life -= dt;
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const f of this.floaters) {
      f.y += f.vy * dt;
      f.vy *= Math.pow(0.2, dt);
      f.life -= dt;
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);
    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);
  }

  // Drawn in world space (inside the camera transform): sparks, then floating
  // numbers, then rings — same layering as before.
  draw(ctx) {
    for (const p of this.parts) {
      const a = Math.min(1, p.life / p.maxLife);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.4 + a * 0.6), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const f of this.floaters) {
      const a = Math.min(1, f.life / 0.4);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = `700 ${f.size}px -apple-system, sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(10,8,16,0.8)";
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    for (const r of this.rings) {
      const t = 1 - r.life / r.maxLife;
      const rad = r.r0 + (r.r1 - r.r0) * t;
      ctx.save();
      ctx.globalAlpha = (r.life / r.maxLife) * 0.7;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * (1 - t * 0.6);
      ctx.beginPath();
      ctx.arc(r.x, r.y, rad, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}
