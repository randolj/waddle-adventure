// HUD + overlay rendering pulled out of main.js. Every function takes the
// per-frame `view` bundle built in main.js render() and destructures what it
// needs (over-destructuring is harmless). World-space draws (projectiles,
// pickups, portals, ambient, spawners, chain target) are called inside the
// camera transform; the rest are screen-space.

import { roundRect } from "./utils.js";
import { BIOMES } from "./biomes.js";
import { depthColor, dungeonConfig, FINAL_DEPTH } from "./dungeon.js";
import { WEAPON_TYPE_NAMES, RARITIES, RARITY_ORDER, recommendedPower, itemPower } from "./items.js";
import { getShards, shardsForRun, hasWon, getDeepest } from "./meta.js";
import { drawItemIcon, slotTint, slotTag, withAlpha, clipText } from "./inventory.js";

const CLASS_HUD_COLOR = { drifter: "#5be3a0", warden: "#e0a64b", auralist: "#7fb0ff" };

export function drawProjectiles(view) {
  const { ctx, w, h, player, scene, dungeon, world, pickups, projectiles, portals, kills, mapMode, banner, toasts, combo, comboTimer, spawners, ambient, input, onRun, runDeepest, fxClock } = view;
  for (const p of projectiles) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(0, 0, p.r + 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = p.color;
    ctx.strokeStyle = "#14110e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.beginPath();
    ctx.arc(-p.r * 0.3, -p.r * 0.3, p.r * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export function drawAmbient(view) {
  const { ctx, w, h, player, scene, dungeon, world, pickups, projectiles, portals, kills, mapMode, banner, toasts, combo, comboTimer, spawners, ambient, input, onRun, runDeepest, fxClock } = view;
  for (const p of ambient) {
    const a = Math.min(1, p.life / 1.2) * Math.min(1, (p.maxLife - p.life) / 0.5 + 0.3);
    ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function drawLowHpVignette(view) {
  const { ctx, w, h, player, scene, dungeon, world, pickups, projectiles, portals, kills, mapMode, banner, toasts, combo, comboTimer, spawners, ambient, input, onRun, runDeepest, fxClock } = view;
  const frac = player.hp / player.maxHp;
  if (player.dead || frac > 0.3) return;
  const intensity = (0.3 - frac) / 0.3; // 0..1
  const pulse = 0.55 + 0.45 * Math.sin(fxClock * 5);
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, `rgba(180,20,30,${0.18 + intensity * 0.4 * pulse})`);
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
}

export function drawSpawners(view) {
  const { ctx, w, h, player, scene, dungeon, world, pickups, projectiles, portals, kills, mapMode, banner, toasts, combo, comboTimer, spawners, ambient, input, onRun, runDeepest, fxClock } = view;
  for (const s of spawners) {
    const p = 1 - s.t / 0.6;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.globalAlpha = 0.35 + 0.4 * Math.abs(Math.sin(fxClock * 12));
    ctx.strokeStyle = "#e24b4a";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, 6 + p * 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = "#e24b4a";
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export function drawChainTarget(view) {
  const { ctx, w, h, player, scene, dungeon, world, pickups, projectiles, portals, kills, mapMode, banner, toasts, combo, comboTimer, spawners, ambient, input, onRun, runDeepest, fxClock } = view;
  if (player.chainWindow <= 0 || !player.chainTarget || player.chainTarget.dead) return;
  const e = player.chainTarget;
  const pulse = 0.6 + 0.4 * Math.sin(fxClock * 10);
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.strokeStyle = `rgba(127,227,255,${0.55 + 0.35 * pulse})`;
  ctx.lineWidth = 2.5;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.arc(0, 0, e.r + 9 + pulse * 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

export function drawDamageIndicator(view) {
  const { ctx, w, h, player, scene, dungeon, world, pickups, projectiles, portals, kills, mapMode, banner, toasts, combo, comboTimer, spawners, ambient, input, onRun, runDeepest, fxClock } = view;
  if (player.hurtTimer <= 0) return;
  const a = Math.min(1, player.hurtTimer) * 0.8;
  const ang = player.hurtDir;
  const rx = Math.min(w, h) * 0.42;
  ctx.save();
  ctx.translate(w / 2 + Math.cos(ang) * rx, h / 2 + Math.sin(ang) * rx);
  ctx.rotate(ang);
  ctx.globalAlpha = a;
  ctx.fillStyle = "#ff4d4d";
  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.lineTo(-10, -14);
  ctx.lineTo(-10, 14);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function drawCombo(view) {
  const { ctx, w, h, player, scene, dungeon, world, pickups, projectiles, portals, kills, mapMode, banner, toasts, combo, comboTimer, spawners, ambient, input, onRun, runDeepest, fxClock } = view;
  if (combo < 2) return;
  const x = w / 2;
  const y = 132;
  const tier = combo >= 15 ? "#ff5d5d" : combo >= 8 ? "#ff9a3a" : combo >= 4 ? "#ffd166" : "#e9eef6";
  const scale = 1 + Math.min(0.5, combo * 0.02);
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${Math.round(22 * scale)}px -apple-system, sans-serif`;
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(10,8,16,0.7)";
  ctx.strokeText(`${combo}× COMBO`, x, y);
  ctx.fillStyle = tier;
  ctx.fillText(`${combo}× COMBO`, x, y);
  const bw = 96;
  const frac = Math.max(0, comboTimer / 2.6);
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  roundRect(ctx, x - bw / 2, y + 16, bw, 5, 2);
  ctx.fill();
  ctx.fillStyle = tier;
  roundRect(ctx, x - bw / 2, y + 16, bw * frac, 5, 2);
  ctx.fill();
  ctx.restore();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

export function drawPortals(view) {
  const { ctx, w, h, player, scene, dungeon, world, pickups, projectiles, portals, kills, mapMode, banner, toasts, combo, comboTimer, spawners, ambient, input, onRun, runDeepest, fxClock } = view;
  for (const p of portals) {
    if (scene === "dungeon" && p.room && p.room !== dungeon.currentRoom) continue;
    ctx.save();
    ctx.translate(p.x, p.y);
    const pulse = 0.5 + 0.5 * Math.sin(player.scarfWave);
    ctx.fillStyle = "rgba(120,220,255,0.22)";
    ctx.beginPath();
    ctx.arc(0, 0, p.r + pulse * 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#7fe3ff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, p.r * 0.66, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#bff0ff";
    ctx.font = "700 11px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(p.label, 0, -p.r - 8);
    ctx.textAlign = "left";
    ctx.restore();
  }
}

export function drawPickups(view) {
  const { ctx, w, h, player, scene, dungeon, world, pickups, projectiles, portals, kills, mapMode, banner, toasts, combo, comboTimer, spawners, ambient, input, onRun, runDeepest, fxClock } = view;
  for (const p of pickups) {
    const bob = Math.sin(p.t * 4) * 3;
    ctx.save();
    ctx.translate(p.x, p.y + bob);
    ctx.fillStyle = "rgba(20,24,34,0.18)";
    ctx.beginPath();
    ctx.ellipse(0, 8 - bob, 9, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    if (p.kind === "coin") {
      ctx.fillStyle = "#f4c531";
      ctx.strokeStyle = "#9a6e12";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ffe27a";
      ctx.beginPath();
      ctx.arc(-2, -2, 2.4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const it = p.item;
      const col = RARITIES[it.rarity].color;
      const rIdx = RARITY_ORDER.indexOf(it.rarity);
      // Glow.
      ctx.globalAlpha = 0.32;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(0, 0, 17, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      // Pulsing ring for rare+ so good drops shout.
      if (rIdx >= 2) {
        const pulse = 0.5 + 0.5 * Math.sin(p.t * 4);
        ctx.globalAlpha = 0.4 + 0.4 * pulse;
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 17 + pulse * 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      // Diamond.
      ctx.fillStyle = col;
      ctx.strokeStyle = "#14110e";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -9);
      ctx.lineTo(8, 0);
      ctx.lineTo(0, 10);
      ctx.lineTo(-8, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Floating name + power label so dropped gear can't be missed.
      const nm = it.name;
      const pw = "⚡" + itemPower(it);
      ctx.font = "700 11px -apple-system, sans-serif";
      const nmW = ctx.measureText(nm).width;
      ctx.font = "700 10px -apple-system, sans-serif";
      const pwW = ctx.measureText(pw).width;
      const totalW = nmW + 8 + pwW;
      const ly = -24;
      ctx.fillStyle = "rgba(8,10,18,0.8)";
      roundRect(ctx, -totalW / 2 - 8, ly - 10, totalW + 16, 20, 6);
      ctx.fill();
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      roundRect(ctx, -totalW / 2 - 8, ly - 10, totalW + 16, 20, 6);
      ctx.stroke();
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = "700 11px -apple-system, sans-serif";
      ctx.fillStyle = col;
      ctx.fillText(nm, -totalW / 2, ly);
      ctx.font = "700 10px -apple-system, sans-serif";
      ctx.fillStyle = "#ffd27a";
      ctx.fillText(pw, -totalW / 2 + nmW + 8, ly);
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";
    }
    ctx.restore();
  }
}

export function drawPrompt(view, text, color) {
  const { ctx, w, h } = view;
  ctx.textAlign = "center";
  ctx.font = "600 16px -apple-system, sans-serif";
  const tw = ctx.measureText(text).width;
  ctx.fillStyle = "rgba(10,12,20,0.7)";
  roundRect(ctx, w / 2 - tw / 2 - 16, h - 92, tw + 32, 34, 8);
  ctx.fill();
  ctx.fillStyle = color || "#ffd166";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h - 74);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

export function drawEntranceTooltip(view, dg) {
  const { ctx, w, h, input, player } = view;
  const depth = dg.tierIndex + 1;
  const cfg = dungeonConfig(depth);
  const biome = BIOMES[dg.biome];
  const col = depthColor(depth);
  const recP = recommendedPower(depth);
  const lines = [
    [`${biome.name}`, col, "700 15px"],
    [`Depth ${depth}  ·  ${cfg.roomCount} rooms + boss (${biome.boss.name})`, "#cdd5e2", "500 12px"],
    [`Power ~${recP}  ·  you ${player.power}`, player.power >= recP ? "#9be29a" : "#ff9a9a", "700 12px"],
    [`Enemies:  HP ×${cfg.hpMult.toFixed(1)}   DMG ×${cfg.dmgMult.toFixed(1)}`, "#ff9a9a", "600 12px"],
    [`Reward:  ${cfg.reward.coins[0]}–${cfg.reward.coins[1]} coins, ${cfg.reward.items} item(s)${cfg.reward.relic ? " + Relic" : ""}`, "#9be29a", "600 12px"],
    [`Descend in-run for deeper levels →`, "#8fb7ff", "500 11px"],
  ];
  let bw = 0;
  for (const [t, , f] of lines) {
    ctx.font = `${f} -apple-system, sans-serif`;
    bw = Math.max(bw, ctx.measureText(t).width);
  }
  bw += 24;
  const bh = 18 + lines.length * 19;
  let bx = input.mouseX + 18;
  let by = input.mouseY + 18;
  if (bx + bw > w - 8) bx = input.mouseX - bw - 18;
  if (by + bh > h - 8) by = h - bh - 8;
  roundRect(ctx, bx, by, bw, bh, 8);
  ctx.fillStyle = "rgba(12,16,26,0.97)";
  ctx.fill();
  ctx.strokeStyle = col;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  let ly = by + 22;
  for (const [t, c, f] of lines) {
    ctx.fillStyle = c;
    ctx.font = `${f} -apple-system, sans-serif`;
    ctx.fillText(t, bx + 12, ly);
    ly += 19;
  }
}

export function drawBossBar(view) {
  const { ctx, w, h, player, scene, dungeon, world, pickups, projectiles, portals, kills, mapMode, banner, toasts, combo, comboTimer, spawners, ambient, input, onRun, runDeepest, fxClock } = view;
  const b = dungeon && dungeon.boss;
  if (!b || b.dead) return;
  const bw = Math.min(460, w * 0.6);
  const bh = 16;
  const x = (w - bw) / 2;
  const y = 22;
  ctx.fillStyle = "rgba(10,12,20,0.62)";
  roundRect(ctx, x - 6, y - 22, bw + 12, bh + 30, 8);
  ctx.fill();
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffd166";
  ctx.font = "700 13px -apple-system, sans-serif";
  ctx.fillText(`${(b.name || "Guardian").toUpperCase()} — Depth ${dungeon.depth}`, w / 2, y - 7);
  ctx.fillStyle = "#3a2630";
  roundRect(ctx, x, y, bw, bh, 4);
  ctx.fill();
  ctx.fillStyle = "#e24b4a";
  roundRect(ctx, x, y, bw * (b.hp / b.maxHp), bh, 4);
  ctx.fill();
  ctx.textAlign = "left";
}

// Mini room grid (top-right) showing discovered dungeon rooms.
export function drawRoomMap(view) {
  const { ctx, w, h, player, scene, dungeon, world, pickups, projectiles, portals, kills, mapMode, banner, toasts, combo, comboTimer, spawners, ambient, input, onRun, runDeepest, fxClock } = view;
  const rooms = dungeon.rooms;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const r of rooms) {
    if (!r.seen) continue;
    minX = Math.min(minX, r.gx);
    maxX = Math.max(maxX, r.gx);
    minY = Math.min(minY, r.gy);
    maxY = Math.max(maxY, r.gy);
  }
  if (!isFinite(minX)) return;
  const cell = 16;
  const gap = 3;
  const cols = maxX - minX + 1;
  const rowsN = maxY - minY + 1;
  const panelW = cols * (cell + gap) + gap;
  const panelH = rowsN * (cell + gap) + gap;
  const px = w - panelW - 16;
  const py = 64;
  ctx.fillStyle = "rgba(12,16,26,0.6)";
  roundRect(ctx, px - 6, py - 6, panelW + 12, panelH + 12, 8);
  ctx.fill();
  for (const r of rooms) {
    if (!r.seen) continue;
    const cx = px + (r.gx - minX) * (cell + gap) + gap;
    const cy = py + (r.gy - minY) * (cell + gap) + gap;
    let col;
    if (r === dungeon.currentRoom) col = "#ffd166";
    else if (r.type === "boss") col = r.cleared ? "#7a5a5a" : "#e24b4a";
    else if (r.type === "treasure") col = "#e0b84a";
    else if (r.type === "heal") col = "#6fdc8c";
    else if (r.type === "start") col = "#7fe3ff";
    else col = r.cleared ? "#5db85d" : "#6a7080";
    ctx.fillStyle = col;
    roundRect(ctx, cx, cy, cell, cell, 3);
    ctx.fill();
    if (r === dungeon.currentRoom) {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      roundRect(ctx, cx, cy, cell, cell, 3);
      ctx.stroke();
    }
    const mark = r.type === "boss" ? "B" : r.type === "treasure" ? "$" : r.type === "heal" ? "+" : "";
    if (mark) {
      ctx.fillStyle = "#1a1620";
      ctx.font = "700 9px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(mark, cx + cell / 2, cy + cell / 2 + 1);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }
  }
}

export function drawToasts(view) {
  const { ctx, w, h, player, scene, dungeon, world, pickups, projectiles, portals, kills, mapMode, banner, toasts, combo, comboTimer, spawners, ambient, input, onRun, runDeepest, fxClock } = view;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  toasts.forEach((t, i) => {
    const y = h * 0.38 - i * 28;
    const alpha = Math.min(1, t.t / 0.6);
    ctx.globalAlpha = alpha;
    ctx.font = "600 16px -apple-system, sans-serif";
    const tw = ctx.measureText(t.text).width;
    ctx.fillStyle = "rgba(10,12,20,0.6)";
    roundRect(ctx, w / 2 - tw / 2 - 12, y - 13, tw + 24, 26, 6);
    ctx.fill();
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, w / 2, y + 1);
    ctx.globalAlpha = 1;
  });
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

// Gear-acquired cards — a richer "you got loot" popup, visually distinct from coin toasts.
// Stacks bottom-center (a loot feed), each card showing the item icon, type, name + rarity, and power.
export function drawItemPickups(view) {
  const { ctx, w, h, itemPickups } = view;
  if (!itemPickups || !itemPickups.length) return;
  const LIFE = 3.4;
  const cw = 290;
  const ch = 56;
  const baseY = h - 150; // sits above the controls hint, clear of toasts/combo up top
  const shown = itemPickups.slice(-4); // cap the stack
  shown.forEach((entry, idx) => {
    const item = entry.item;
    const rc = (RARITIES[item.rarity] && RARITIES[item.rarity].color) || "#cfd6e6";
    const rIdx = RARITY_ORDER.indexOf(item.rarity);
    const life = entry.t;
    const fadeIn = Math.min(1, (LIFE - life) / 0.16);
    const fadeOut = Math.min(1, life / 0.45);
    const alpha = Math.max(0, Math.min(fadeIn, fadeOut));
    if (alpha <= 0) return;
    const stack = shown.length - 1 - idx; // 0 = newest (bottom)
    const cy = baseY - stack * (ch + 9) - (1 - fadeIn) * 12; // newest rises into place
    const x0 = w / 2 - cw / 2;
    const y0 = cy - ch / 2;
    ctx.save();
    ctx.globalAlpha = alpha;
    // Rarity glow for rare+ — makes a good drop pop.
    if (rIdx >= 2) {
      ctx.shadowColor = rc;
      ctx.shadowBlur = 16;
    }
    ctx.fillStyle = "rgba(12,15,24,0.92)";
    roundRect(ctx, x0, y0, cw, ch, 11);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Rarity-tinted border + a thicker accent stripe down the left edge.
    ctx.strokeStyle = rc;
    ctx.lineWidth = 1.5;
    roundRect(ctx, x0 + 0.75, y0 + 0.75, cw - 1.5, ch - 1.5, 10);
    ctx.stroke();
    ctx.fillStyle = rc;
    roundRect(ctx, x0 + 4, y0 + 8, 4, ch - 16, 2);
    ctx.fill();
    // Slot-tinted icon disc + the real inventory icon (consistent with the bag).
    const ix = x0 + 34;
    const iy = cy;
    const tint = slotTint(item);
    ctx.fillStyle = withAlpha(tint, 0.22);
    ctx.beginPath();
    ctx.arc(ix, iy, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = withAlpha(tint, 0.6);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    drawItemIcon(ctx, ix, iy, 15, item);
    // Text column.
    const tx = x0 + 62;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#93a0b6";
    ctx.font = "700 9px -apple-system, sans-serif";
    ctx.fillText("✦ ACQUIRED · " + slotTag(item), tx, cy - 9);
    ctx.fillStyle = rc;
    ctx.font = "800 16px -apple-system, sans-serif";
    ctx.fillText(clipText(ctx, item.name, cw - 62 - 56), tx, cy + 9);
    ctx.fillStyle = "#aeb8cc";
    ctx.font = "700 10px -apple-system, sans-serif";
    ctx.fillText((RARITIES[item.rarity] && RARITIES[item.rarity].name) || "", tx, cy + 22);
    // Power, right-aligned in amber to echo the HUD power readout.
    ctx.textAlign = "right";
    ctx.fillStyle = "#ffd27a";
    ctx.font = "800 14px -apple-system, sans-serif";
    ctx.fillText("⚡" + itemPower(item), x0 + cw - 16, cy + 6);
    ctx.restore();
  });
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

export function drawBanner(view) {
  const { ctx, w, h, player, scene, dungeon, world, pickups, projectiles, portals, kills, mapMode, banner, toasts, combo, comboTimer, spawners, ambient, input, onRun, runDeepest, fxClock } = view;
  if (!banner) return;
  const alpha = Math.min(1, banner.t / 0.5);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = "center";
  ctx.font = "600 22px -apple-system, sans-serif";
  const tw = ctx.measureText(banner.text).width;
  ctx.fillStyle = "rgba(10,12,20,0.6)";
  roundRect(ctx, w / 2 - tw / 2 - 18, 64, tw + 36, 40, 8);
  ctx.fill();
  ctx.fillStyle = banner.safe ? "#9be29a" : "#ffd166";
  ctx.textBaseline = "middle";
  ctx.fillText(banner.text, w / 2, 85);
  ctx.restore();
  ctx.textAlign = "left";
}

export function drawHud(view) {
  const { ctx, w, h, player, scene, dungeon, world, pickups, projectiles, portals, kills, mapMode, banner, toasts, combo, comboTimer, spawners, ambient, input, onRun, runDeepest, fxClock } = view;
  const bw = 240;
  const bh = 18;
  const x = 20;
  const y = 20;
  ctx.fillStyle = "rgba(10,16,32,0.55)";
  roundRect(ctx, x - 4, y - 4, bw + 8, bh + 8, 6);
  ctx.fill();
  ctx.fillStyle = "#3a4256";
  roundRect(ctx, x, y, bw, bh, 4);
  ctx.fill();
  const frac = player.hp / player.maxHp;
  ctx.fillStyle = frac > 0.3 ? "#ff5d73" : "#ff2e4d";
  roundRect(ctx, x, y, bw * frac, bh, 4);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "600 12px -apple-system, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText(`${Math.ceil(player.hp)} / ${player.maxHp}`, x + 8, y + bh / 2 + 1);

  if (player.healing) {
    ctx.fillStyle = "#7CFC9B";
    ctx.font = "700 12px -apple-system, sans-serif";
    ctx.fillText("✚ healing", x + bw + 12, y + bh / 2 + 1);
  }

  const dw = bw;
  const dh = 7;
  const dy = y + bh + 8;
  if (player.stats.dashEnabled) {
    ctx.fillStyle = "#2b3550";
    roundRect(ctx, x, dy, dw, dh, 3);
    ctx.fill();
    const charge = player.dashCharge;
    ctx.fillStyle = charge >= 1 ? "#5be3ff" : "rgba(91,227,255,0.5)";
    roundRect(ctx, x, dy, dw * charge, dh, 3);
    ctx.fill();
    ctx.fillStyle = charge >= 1 ? "#bdeeff" : "#7d8aa6";
    ctx.font = "700 10px -apple-system, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText("DASH", x + dw + 8, dy + dh / 2 + 1);
  }

  ctx.textBaseline = "alphabetic";
  if (scene === "dungeon") {
    const cleared = dungeon.rooms.filter((r) => r.cleared && r.type !== "start").length;
    const total = dungeon.rooms.filter((r) => r.type !== "start").length;
    ctx.font = "700 11px -apple-system, sans-serif";
    ctx.fillStyle = depthColor(dungeon.depth);
    ctx.fillText(`${dungeon.biome.name.toUpperCase()} D${dungeon.depth}  ·  ROOMS ${cleared}/${total}`, x, dy + dh + 16);
    if (onRun) {
      ctx.fillStyle = "#ff9a6f";
      ctx.font = "700 10px -apple-system, sans-serif";
      ctx.fillText("⚠ LOOT AT RISK — EXTRACT TO KEEP IT", x, dy + dh + 31);
    }
  } else {
    const zone = world.safeZoneAt(player.x, player.y);
    ctx.font = "700 11px -apple-system, sans-serif";
    let label;
    let off;
    if (zone) {
      ctx.fillStyle = "#6fb46f";
      label = `${zone.name.toUpperCase()} — SAFE`;
      off = 130;
    } else {
      const tier = world.tierAt(player.x, player.y);
      ctx.fillStyle = depthColor(tier + 1); // danger color cues higher-tier areas
      label = `WILDS · T${tier}`;
      off = 88;
    }
    ctx.fillText(label, x, dy + dh + 16);
    ctx.fillStyle = "#7d8aa6";
    ctx.font = "600 11px -apple-system, sans-serif";
    ctx.fillText(`M: map (${mapMode})`, x + off, dy + dh + 16);
  }
  ctx.fillStyle = CLASS_HUD_COLOR[player.class] || "#9aa6b1";
  ctx.font = "700 11px -apple-system, sans-serif";
  ctx.fillText(`${player.class[0].toUpperCase() + player.class.slice(1)} · ${WEAPON_TYPE_NAMES[player.weaponType] || "Unarmed"}`, x, dy + dh + 31 + (scene === "dungeon" && onRun ? 15 : 0));

  // Campaign goal tracker (overworld only).
  if (scene === "overworld") {
    ctx.font = "700 11px -apple-system, sans-serif";
    if (hasWon()) {
      ctx.fillStyle = "#bfe3ff";
      ctx.fillText("✦ CHAMPION — the Heart of Winter is stilled", x, dy + dh + 46);
    } else {
      ctx.fillStyle = "#8fb7ff";
      ctx.fillText(`GOAL · reach Depth ${FINAL_DEPTH}  (deepest ${getDeepest()})`, x, dy + dh + 46);
    }
  }

  ctx.textAlign = "right";
  ctx.font = "700 16px -apple-system, sans-serif";
  ctx.fillStyle = "#1b2236";
  ctx.fillText(`Slain: ${kills}`, w - 20, 30);
  ctx.fillStyle = "#caa12a";
  ctx.fillText(`◉ ${player.coins}`, w - 20, 52);
  ctx.fillStyle = "#5aa8cc";
  ctx.fillText(`✦ ${getShards()}`, w - 20, 74);
  // Power Level — the looter-shooter chase number.
  ctx.fillStyle = "#ffd27a";
  ctx.font = "800 18px -apple-system, sans-serif";
  ctx.fillText(`⚡ ${player.power}`, w - 20, 100);
  if (player.godMode) {
    ctx.fillStyle = "#7CFC9B";
    ctx.font = "700 12px -apple-system, sans-serif";
    ctx.fillText("GOD", w - 20, 120);
  }
  ctx.textAlign = "left";
}

export function drawGameOver(view) {
  const { ctx, w, h, player, scene, dungeon, world, pickups, projectiles, portals, kills, mapMode, banner, toasts, combo, comboTimer, spawners, ambient, input, onRun, runDeepest, fxClock } = view;
  ctx.fillStyle = "rgba(8, 12, 24, 0.6)";
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = "center";
  ctx.fillStyle = "#fff";
  ctx.font = "700 48px -apple-system, sans-serif";
  ctx.fillText("The penguin has fallen", w / 2, h / 2 - 40);

  if (onRun) {
    // Died mid-run: the loot is forfeit, but the shards carry over.
    const gained = shardsForRun(runDeepest, false);
    ctx.font = "600 20px -apple-system, sans-serif";
    ctx.fillStyle = "#ff9a6f";
    ctx.fillText(`Run lost at Depth ${runDeepest} — unbanked loot forfeit`, w / 2, h / 2 + 2);
    ctx.fillStyle = "#7fd2ff";
    ctx.font = "600 17px -apple-system, sans-serif";
    ctx.fillText(`+${gained} ✦ shards salvaged (kept forever)`, w / 2, h / 2 + 30);
    ctx.fillStyle = "#cdd7ee";
    ctx.font = "500 16px -apple-system, sans-serif";
    ctx.fillText("Click or press R — return to camp", w / 2, h / 2 + 60);
  } else {
    ctx.font = "500 20px -apple-system, sans-serif";
    ctx.fillStyle = "#cdd7ee";
    ctx.fillText(`Creatures slain: ${kills}  —  click or press R to return to camp`, w / 2, h / 2 + 12);
  }
  ctx.textAlign = "left";
}

// Win screen — shown after the final boss (Heart of Winter) falls.
export function drawVictory(view) {
  const { ctx, w, h, runDeepest } = view;
  ctx.fillStyle = "rgba(8, 16, 30, 0.74)";
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = "center";
  ctx.fillStyle = "#bfe3ff";
  ctx.font = "700 30px -apple-system, sans-serif";
  ctx.fillText("✦  VICTORY  ✦", w / 2, h / 2 - 92);
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 46px -apple-system, sans-serif";
  ctx.fillText("The Heart of Winter is stilled", w / 2, h / 2 - 40);
  ctx.fillStyle = "#cdd7ee";
  ctx.font = "500 19px -apple-system, sans-serif";
  ctx.fillText(`You descended to Depth ${runDeepest} and ended the long cold.`, w / 2, h / 2 + 6);
  ctx.fillStyle = "#9be29a";
  ctx.font = "600 17px -apple-system, sans-serif";
  ctx.fillText("Your loot is secured — you return to camp a Champion.", w / 2, h / 2 + 40);
  ctx.fillStyle = "#7d8aa6";
  ctx.font = "500 15px -apple-system, sans-serif";
  ctx.fillText("The depths remain open. Click or press E to continue.", w / 2, h / 2 + 72);
  ctx.textAlign = "left";
}

// Charge indicator while holding R to recall to camp (overworld).
export function drawRecall(view) {
  const { ctx, w, h, recallTimer, recallHold } = view;
  if (!recallTimer || recallTimer <= 0) return;
  const frac = Math.min(1, recallTimer / recallHold);
  const cx = w / 2;
  const cy = h - 132;
  const bw = 200;
  const bh = 8;
  ctx.fillStyle = "rgba(10,12,20,0.72)";
  roundRect(ctx, cx - bw / 2 - 14, cy - 26, bw + 28, 48, 10);
  ctx.fill();
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#bff0ff";
  ctx.font = "600 13px -apple-system, sans-serif";
  ctx.fillText("Hold R — returning to camp…", cx, cy - 6);
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  roundRect(ctx, cx - bw / 2, cy + 4, bw, bh, 4);
  ctx.fill();
  ctx.fillStyle = "#7fe3ff";
  roundRect(ctx, cx - bw / 2, cy + 4, bw * frac, bh, 4);
  ctx.fill();
  ctx.textAlign = "left";
}
