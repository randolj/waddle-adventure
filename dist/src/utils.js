// Small math + helper utilities shared across the game.

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

// Scale a fixed-size overlay (designed at refW × refH) to fit the real viewport,
// centred and never upscaled — so the same canvas UI fits any phone orientation.
// The caller draws its full-screen backdrop FIRST (at the real w,h), then calls this,
// then renders content using the returned ref-space dims + transformed mouse coords,
// then calls done() to pop the transform. mx/my map the pointer into ref space so all
// the existing hit-tests keep working unchanged.
export function fitScale(ctx, w, h, refW, refH, input) {
  const s = Math.min(1, w / refW, h / refH);
  const ox = (w - refW * s) / 2;
  const oy = (h - refH * s) / 2;
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(s, s);
  return {
    w: refW,
    h: refH,
    s,
    mx: (input.mouseX - ox) / s,
    my: (input.mouseY - oy) / s,
    done: () => ctx.restore(),
  };
}

export function dist(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

// Shortest signed difference between two angles, in range (-PI, PI].
export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Deterministic seedable PRNG so world layout is stable between reloads.
export function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randRange(rng, min, max) {
  return min + rng() * (max - min);
}

// --- Procedural texture + rough-shape helpers (for the gritty art style) ---

// Cheap deterministic 2D hash -> [0, 1).
export function hash2(x, y, seed = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Smooth bilinear value noise -> [0, 1).
export function valueNoise(x, y, seed = 0) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const sx = (x - x0) * (x - x0) * (3 - 2 * (x - x0));
  const sy = (y - y0) * (y - y0) * (3 - 2 * (y - y0));
  const v00 = hash2(x0, y0, seed);
  const v10 = hash2(x0 + 1, y0, seed);
  const v01 = hash2(x0, y0 + 1, seed);
  const v11 = hash2(x0 + 1, y0 + 1, seed);
  const a = v00 + (v10 - v00) * sx;
  const b = v01 + (v11 - v01) * sx;
  return a + (b - a) * sy;
}

// An array of per-segment radius multipliers (~1.0) for a rough, hand-drawn edge.
export function roughOutline(rng, segments, jitter) {
  const arr = [];
  for (let i = 0; i < segments; i++) arr.push(1 - jitter + rng() * jitter * 2);
  return arr;
}

// Trace a closed irregular blob from precomputed radius multipliers.
export function roughBlobPath(ctx, cx, cy, baseR, mults, squashY = 1, rot = 0) {
  const n = mults.length;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const idx = i % n;
    const a = rot + (idx / n) * Math.PI * 2;
    const x = cx + Math.cos(a) * baseR * mults[idx];
    const y = cy + Math.sin(a) * baseR * mults[idx] * squashY;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

// Trace a rounded-rect path (shared by every immediate-mode overlay).
export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
