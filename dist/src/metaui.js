// Immediate-mode overlay for the camp Quartermaster: spend shards on permanent
// upgrades. Mirrors inventory.js — drawing + click handling happen together in
// render(); the caller pauses the game while it's open.

import { UPGRADES, getShards, levelOf, nextCost, canBuy, buyUpgrade, metaBonuses } from "./meta.js";
import { roundRect as rr, fitScale } from "./utils.js";

export class MetaUI {
  constructor() {
    this.open = false;
  }
  isOpen() {
    return this.open;
  }
  openMeta() {
    this.open = true;
  }
  close() {
    this.open = false;
  }
  toggle() {
    this.open = !this.open;
  }

  render(ctx, w, h, player, input) {
    // Dim the real screen, then scale the fixed panel to fit any phone viewport.
    ctx.fillStyle = "rgba(8,10,18,0.66)";
    ctx.fillRect(0, 0, w, h);
    const fit = fitScale(ctx, w, h, 668, 560, input);
    w = fit.w;
    h = fit.h;
    const mx = fit.mx;
    const my = fit.my;
    const clicked = input.consumeClick();
    const hit = (x, y, bw, bh) => mx >= x && mx <= x + bw && my >= y && my <= y + bh;

    const pw = Math.min(620, w - 48);
    const ph = Math.min(520, h - 48);
    const px = (w - pw) / 2;
    const py = (h - ph) / 2;
    rr(ctx, px, py, pw, ph, 14);
    ctx.fillStyle = "rgba(16,20,30,0.98)";
    ctx.fill();
    ctx.strokeStyle = "rgba(140,170,210,0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Header.
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillStyle = "#e9eef6";
    ctx.font = "600 20px -apple-system, sans-serif";
    ctx.fillText("Quartermaster", px + 22, py + 34);
    ctx.fillStyle = "#8b97ab";
    ctx.font = "500 12px -apple-system, sans-serif";
    ctx.fillText("Permanent upgrades — paid in shards, kept forever.", px + 22, py + 52);

    // Shard balance.
    ctx.textAlign = "right";
    ctx.font = "700 17px -apple-system, sans-serif";
    ctx.fillStyle = "#7fd2ff";
    ctx.fillText(`✦ ${getShards()}`, px + pw - 46, py + 34);

    // Close button.
    const cb = { x: px + pw - 36, y: py + 16, w: 22, h: 22 };
    ctx.fillStyle = hit(cb.x, cb.y, cb.w, cb.h) ? "rgba(255,90,90,0.9)" : "rgba(255,255,255,0.12)";
    rr(ctx, cb.x, cb.y, cb.w, cb.h, 5);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cb.x + 6, cb.y + 6);
    ctx.lineTo(cb.x + 16, cb.y + 16);
    ctx.moveTo(cb.x + 16, cb.y + 6);
    ctx.lineTo(cb.x + 6, cb.y + 16);
    ctx.stroke();
    if (clicked && hit(cb.x, cb.y, cb.w, cb.h)) {
      this.close();
      fit.done();
      return;
    }

    const listX = px + 22;
    const listW = pw - 44;

    // Upgrade rows.
    const rowH = 64;
    const gap = 8;
    let ry = py + 76;
    for (const u of UPGRADES) {
      const lvl = levelOf(u.id);
      const maxed = lvl >= u.max;
      const cost = nextCost(u.id);
      const affordable = canBuy(u.id);

      // Row background.
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      rr(ctx, listX, ry, listW, rowH, 8);
      ctx.fill();
      // Left accent stripe in the upgrade's color.
      ctx.fillStyle = u.color;
      rr(ctx, listX, ry, 4, rowH, 8);
      ctx.fill();

      // Name + current effect.
      ctx.textAlign = "left";
      ctx.fillStyle = u.color;
      ctx.font = "700 15px -apple-system, sans-serif";
      ctx.fillText(u.name, listX + 16, ry + 23);
      ctx.fillStyle = "#cdd5e2";
      ctx.font = "500 12px -apple-system, sans-serif";
      ctx.fillText(u.perLevel + (lvl > 0 ? `  ·  now ${u.desc(lvl)}` : ""), listX + 16, ry + 42);

      // Pip meter for levels.
      const pipR = 4;
      const pipGap = 13;
      const pipY = ry + 54;
      for (let i = 0; i < u.max; i++) {
        ctx.beginPath();
        ctx.arc(listX + 18 + i * pipGap, pipY, pipR, 0, Math.PI * 2);
        ctx.fillStyle = i < lvl ? u.color : "rgba(255,255,255,0.15)";
        ctx.fill();
      }

      // Buy button (right side).
      const btnW = 118;
      const btnH = 40;
      const btnX = listX + listW - btnW - 12;
      const btnY = ry + (rowH - btnH) / 2;
      const hovered = hit(btnX, btnY, btnW, btnH);
      let label, fill, txt;
      if (maxed) {
        label = "MAXED";
        fill = "rgba(120,200,140,0.18)";
        txt = "#8fe3a8";
      } else if (affordable) {
        label = `✦ ${cost}`;
        fill = hovered ? "#3b8f5a" : "rgba(90,200,130,0.22)";
        txt = hovered ? "#ffffff" : "#9be8b6";
      } else {
        label = `✦ ${cost}`;
        fill = "rgba(255,255,255,0.05)";
        txt = "#6b7689";
      }
      ctx.fillStyle = fill;
      rr(ctx, btnX, btnY, btnW, btnH, 7);
      ctx.fill();
      if (!maxed && affordable) {
        ctx.strokeStyle = "rgba(120,230,160,0.5)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = txt;
      ctx.font = "700 14px -apple-system, sans-serif";
      ctx.fillText(maxed ? label : `Buy  ${label}`, btnX + btnW / 2, btnY + btnH / 2 + 1);
      ctx.textBaseline = "alphabetic";

      if (clicked && hovered && !maxed && affordable && buyUpgrade(u.id)) {
        // Vigor/Edge feed the player's cached metaBonus — refresh it now so the
        // purchase takes effect immediately (not just on the next page load).
        player.metaBonus = metaBonuses();
        player.recomputeStats();
      }

      ry += rowH + gap;
    }

    // Footer hint.
    ctx.textAlign = "left";
    ctx.fillStyle = "#6b7689";
    ctx.font = "500 11px -apple-system, sans-serif";
    ctx.fillText("Earn shards by descending in dungeons — kept even if you fall.  E or X to close.", listX, py + ph - 14);

    // Click outside closes.
    if (clicked && !hit(px, py, pw, ph)) this.close();

    fit.done();
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }
}
