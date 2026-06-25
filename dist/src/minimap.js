// Renders the world map in two modes: a corner minimap and a fullscreen overlay.

import { BIOMES } from "./biomes.js";
import { roundRect as rr } from "./utils.js";

const ICE = "#c6ced6";
const OBST = "#5a5e68";
const SAFE_FILL = "rgba(120, 200, 140, 0.22)";
const SAFE_BORDER = "rgba(70, 150, 90, 0.85)";
const ENEMY = "#e24b4a";
const PLAYER = "#ffd166";
const INK = "#14110e";

// Draw the scaled world into a rect.
function renderInto(ctx, rx, ry, rw, rh, data, opts) {
  const { world, player, enemies, camera } = data;
  const scale = Math.min(rw / world.width, rh / world.height);
  const cw = world.width * scale;
  const ch = world.height * scale;
  const ox = rx + (rw - cw) / 2;
  const oy = ry + (rh - ch) / 2;
  const mx = (wx) => ox + wx * scale;
  const my = (wy) => oy + wy * scale;

  ctx.save();
  ctx.beginPath();
  ctx.rect(ox, oy, cw, ch);
  ctx.clip();

  // Biome-coloured ground.
  ctx.fillStyle = ICE;
  ctx.fillRect(ox, oy, cw, ch);
  const cell = 9;
  for (let sx = 0; sx < cw; sx += cell) {
    for (let sy = 0; sy < ch; sy += cell) {
      const pal = BIOMES[world.biomeAt(sx / scale, sy / scale)].ground[0];
      ctx.fillStyle = `rgb(${pal[0]},${pal[1]},${pal[2]})`;
      ctx.fillRect(ox + sx, oy + sy, cell + 1, cell + 1);
    }
  }

  // Safe camp + towns (all safe zones render as green havens).
  ctx.lineWidth = 1.5;
  for (const z of world.safeZones) {
    ctx.fillStyle = SAFE_FILL;
    ctx.fillRect(mx(z.x), my(z.y), z.w * scale, z.h * scale);
    ctx.strokeStyle = SAFE_BORDER;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(mx(z.x), my(z.y), z.w * scale, z.h * scale);
    ctx.setLineDash([]);
  }
  // A marker dot at each town centre.
  ctx.fillStyle = SAFE_BORDER;
  for (const t of world.towns) {
    ctx.beginPath();
    ctx.arc(mx(t.cx), my(t.cy), 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Obstacles.
  ctx.fillStyle = OBST;
  for (const o of world.obstacles) {
    ctx.beginPath();
    ctx.arc(mx(o.x), my(o.y), Math.max(1.5, o.r * scale), 0, Math.PI * 2);
    ctx.fill();
  }

  // Creatures.
  if (opts.showEnemies) {
    ctx.fillStyle = ENEMY;
    for (const e of enemies) {
      ctx.beginPath();
      ctx.arc(mx(e.x), my(e.y), Math.max(2, e.r * scale), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Current view rectangle.
  if (opts.viewRect && camera) {
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 1;
    ctx.strokeRect(mx(camera.x), my(camera.y), data.viewW * scale, data.viewH * scale);
  }

  // Player marker (arrow pointing where the penguin aims).
  const s = opts.playerSize || 5;
  ctx.save();
  ctx.translate(mx(player.x), my(player.y));
  ctx.rotate(player.facing);
  ctx.beginPath();
  ctx.moveTo(s, 0);
  ctx.lineTo(-s * 0.7, s * 0.7);
  ctx.lineTo(-s * 0.7, -s * 0.7);
  ctx.closePath();
  ctx.fillStyle = PLAYER;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.restore();

  ctx.restore();

  // Frame.
  ctx.strokeStyle = "rgba(40,44,58,0.7)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(ox, oy, cw, ch);
}

export function drawMap(ctx, mode, data) {
  if (mode === "corner") {
    const rw = 192;
    const rh = rw * (data.world.height / data.world.width);
    const rx = data.viewW - rw - 18;
    const ry = 58;
    ctx.fillStyle = "rgba(12,16,26,0.55)";
    rr(ctx, rx - 6, ry - 6, rw + 12, rh + 12, 8);
    ctx.fill();
    renderInto(ctx, rx, ry, rw, rh, data, { showEnemies: true, viewRect: true, playerSize: 4.5 });
    return;
  }

  if (mode === "full") {
    const w = data.viewW;
    const h = data.viewH;
    ctx.fillStyle = "rgba(8,10,18,0.62)";
    ctx.fillRect(0, 0, w, h);

    const s = Math.min((w * 0.74) / data.world.width, (h * 0.74) / data.world.height);
    const cw = data.world.width * s;
    const ch = data.world.height * s;
    const rx = (w - cw) / 2;
    const ry = (h - ch) / 2;

    ctx.fillStyle = "rgba(14,18,28,0.92)";
    rr(ctx, rx - 16, ry - 46, cw + 32, ch + 78, 12);
    ctx.fill();
    ctx.strokeStyle = "rgba(120,140,170,0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#e6ecf4";
    ctx.font = "600 18px -apple-system, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Map", rx - 2, ry - 20);
    ctx.fillStyle = "#aeb8c6";
    ctx.font = "500 12px -apple-system, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("M to close", rx + cw + 2, ry - 22);

    renderInto(ctx, rx, ry, cw, ch, data, { showEnemies: true, viewRect: true, playerSize: 7 });

    // Camp + town labels.
    const z = data.world.safeZone;
    ctx.fillStyle = "rgba(190,240,205,0.95)";
    ctx.font = "600 12px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(z.name, rx + (z.x + z.w / 2) * s, ry + (z.y + z.h / 2) * s);
    ctx.fillStyle = "rgba(160,225,180,0.92)";
    ctx.font = "600 11px -apple-system, sans-serif";
    for (const t of data.world.towns) {
      ctx.fillText(`${t.name} · T${t.tier}`, rx + t.cx * s, ry + t.cy * s);
    }

    // Legend.
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = "500 12px -apple-system, sans-serif";
    let legX = rx;
    const legY = ry + ch + 22;
    const items = [
      [PLAYER, "You"],
      [ENEMY, "Creatures"],
      ["rgba(120,200,140,0.95)", "Camp / towns"],
    ];
    for (const [c, t] of items) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(legX + 5, legY, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#c4ccd6";
      ctx.fillText(t, legX + 16, legY);
      legX += 30 + ctx.measureText(t).width + 18;
    }
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
  }
}
