// Immediate-mode overlay for the camp Quartermaster: spend shards on permanent
// upgrades. Mirrors inventory.js — drawing + click handling happen together in
// render(); the caller pauses the game while it's open.
//
// THREE responsive layouts (the dailyui.js pattern — reflow, don't shrink):
//  - desktop:            2-col × 5-row card grid (ref 940×560), the original design
//  - compact landscape:  5-col × 2-row mini-cards (ref 940×330) — a landscape phone
//                        scaled the tall ref to ~0.52 (7px text); the wide ref holds ~0.88
//  - portrait:           a single-column 10-row list (ref 420×700) — cards-across is
//                        unreadable at portrait widths (~0.40 scale before)

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
    const portrait = h > w;
    const compact = !portrait && h < 480;
    const fit = fitScale(ctx, w, h, portrait ? 420 : 940, portrait ? 700 : compact ? 330 : 560, input);
    w = fit.w;
    h = fit.h;
    const mx = fit.mx;
    const my = fit.my;
    const clicked = input.consumeClick();
    const hit = (x, y, bw, bh) => mx >= x && mx <= x + bw && my >= y && my <= y + bh;

    const pw = Math.min(portrait ? 400 : 900, w - (portrait ? 20 : 48));
    const ph = Math.min(portrait ? 664 : compact ? 314 : 520, h - (compact ? 12 : 32));
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
    ctx.font = `600 ${compact ? 17 : 20}px Fredoka, -apple-system, sans-serif`;
    ctx.fillText("Quartermaster", px + 22, py + (compact ? 28 : 34));
    ctx.fillStyle = "#8b97ab";
    ctx.font = "500 12px Fredoka, -apple-system, sans-serif";
    const sub = portrait ? "Permanent upgrades — paid in shards." : "Permanent upgrades — paid in shards, kept forever.";
    ctx.fillText(sub, px + 22, py + (compact ? 44 : 52));

    // Shard balance.
    ctx.textAlign = "right";
    ctx.font = "700 17px Fredoka, -apple-system, sans-serif";
    ctx.fillStyle = "#7fd2ff";
    ctx.fillText(`✦ ${getShards()}`, px + pw - 46, py + (compact ? 28 : 34));

    // Close button.
    const cb = { x: px + pw - 36, y: py + (compact ? 12 : 16), w: 22, h: 22 };
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

    const listX = px + (portrait ? 12 : 22);
    const listW = pw - (portrait ? 24 : 44);

    // Draws a Buy/MAXED button and returns true when a purchase should fire.
    const buyButton = (bx, by, bw, bh, u, lvl, cost, affordable, font) => {
      const maxed = lvl >= u.max;
      const hovered = hit(bx, by, bw, bh);
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
      rr(ctx, bx, by, bw, bh, 7);
      ctx.fill();
      if (!maxed && affordable) {
        ctx.strokeStyle = "rgba(120,230,160,0.5)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = txt;
      ctx.font = font;
      ctx.fillText(maxed ? label : `Buy  ${label}`, bx + bw / 2, by + bh / 2 + 1);
      ctx.textBaseline = "alphabetic";
      return clicked && hovered && !maxed && affordable;
    };
    const clip = (txt, maxW) => {
      if (ctx.measureText(txt).width <= maxW) return txt;
      while (txt.length && ctx.measureText(txt + "…").width > maxW) txt = txt.slice(0, -1);
      return txt + "…";
    };
    const purchase = (u) => {
      if (!buyUpgrade(u.id)) return;
      // Stat upgrades feed the player's cached metaBonus — refresh it now so the
      // purchase takes effect immediately (not just on the next page load).
      player.metaBonus = metaBonuses();
      player.recomputeStats();
    };

    UPGRADES.forEach((u, idx) => {
      const lvl = levelOf(u.id);
      const cost = nextCost(u.id);
      const affordable = canBuy(u.id);

      if (portrait) {
        // One full-width row per upgrade: name + effect line left, button right.
        const rowH = 52;
        const ry = py + 60 + idx * (rowH + 6);
        ctx.fillStyle = "rgba(255,255,255,0.04)";
        rr(ctx, listX, ry, listW, rowH, 8);
        ctx.fill();
        ctx.fillStyle = u.color;
        rr(ctx, listX, ry, 4, rowH, 8);
        ctx.fill();
        ctx.textAlign = "left";
        ctx.fillStyle = u.color;
        ctx.font = "700 14px Fredoka, -apple-system, sans-serif";
        ctx.fillText(clip(u.name, listW - 130), listX + 14, ry + 21);
        ctx.fillStyle = "#cdd5e2";
        ctx.font = "500 11px Fredoka, -apple-system, sans-serif";
        ctx.fillText(clip(`${u.perLevel}  ·  lvl ${lvl}/${u.max}`, listW - 130), listX + 14, ry + 39);
        if (buyButton(listX + listW - 106, ry + 8, 96, 36, u, lvl, cost, affordable, "700 13px Fredoka, -apple-system, sans-serif")) purchase(u);
      } else if (compact) {
        // 5 mini-cards across × 2 rows: name, effect, pips, full-width button.
        const gap = 10;
        const colW = (listW - gap * 4) / 5;
        const cardH = 118;
        const rx = listX + (idx % 5) * (colW + gap);
        const ry = py + 54 + Math.floor(idx / 5) * (cardH + 8);
        ctx.fillStyle = "rgba(255,255,255,0.04)";
        rr(ctx, rx, ry, colW, cardH, 8);
        ctx.fill();
        ctx.fillStyle = u.color;
        rr(ctx, rx, ry, colW, 3, 2);
        ctx.fill();
        ctx.textAlign = "left";
        ctx.fillStyle = u.color;
        ctx.font = "700 12px Fredoka, -apple-system, sans-serif";
        ctx.fillText(clip(u.name, colW - 20), rx + 10, ry + 22);
        ctx.fillStyle = "#cdd5e2";
        ctx.font = "500 10px Fredoka, -apple-system, sans-serif";
        ctx.fillText(clip(u.perLevel, colW - 20), rx + 10, ry + 38);
        const pipGap = Math.min(11, (colW - 24) / Math.max(1, u.max - 1));
        for (let i = 0; i < u.max; i++) {
          ctx.beginPath();
          ctx.arc(rx + 13 + i * pipGap, ry + 52, 3, 0, Math.PI * 2);
          ctx.fillStyle = i < lvl ? u.color : "rgba(255,255,255,0.15)";
          ctx.fill();
        }
        if (buyButton(rx + 8, ry + cardH - 36, colW - 16, 28, u, lvl, cost, affordable, "700 11px Fredoka, -apple-system, sans-serif")) purchase(u);
      } else {
        // Desktop: the original two-column card grid (10 upgrades × 64px rows overflow
        // a single column; 5×2 fits the panel with room for the footer).
        const rowH = 64;
        const gap = 8;
        const colW = (listW - 12) / 2;
        const rx = listX + (idx % 2) * (colW + 12);
        const ry = py + 76 + Math.floor(idx / 2) * (rowH + gap);
        ctx.fillStyle = "rgba(255,255,255,0.04)";
        rr(ctx, rx, ry, colW, rowH, 8);
        ctx.fill();
        ctx.fillStyle = u.color;
        rr(ctx, rx, ry, 4, rowH, 8);
        ctx.fill();
        ctx.textAlign = "left";
        ctx.fillStyle = u.color;
        ctx.font = "700 15px Fredoka, -apple-system, sans-serif";
        ctx.fillText(u.name, rx + 16, ry + 23);
        ctx.fillStyle = "#cdd5e2";
        ctx.font = "500 12px Fredoka, -apple-system, sans-serif";
        ctx.fillText(clip(u.perLevel + (lvl > 0 ? `  ·  now ${u.desc(lvl)}` : ""), colW - 148), rx + 16, ry + 42);
        const pipGap = 13;
        for (let i = 0; i < u.max; i++) {
          ctx.beginPath();
          ctx.arc(rx + 18 + i * pipGap, ry + 54, 4, 0, Math.PI * 2);
          ctx.fillStyle = i < lvl ? u.color : "rgba(255,255,255,0.15)";
          ctx.fill();
        }
        if (buyButton(rx + colW - 120, ry + (rowH - 40) / 2, 110, 40, u, lvl, cost, affordable, "700 14px Fredoka, -apple-system, sans-serif")) purchase(u);
      }
    });

    // Footer hint (dropped in compact — no vertical room; shortened in portrait).
    if (!compact) {
      ctx.textAlign = "left";
      ctx.fillStyle = "#6b7689";
      ctx.font = "500 12px Fredoka, -apple-system, sans-serif";
      const foot = portrait ? "Earn shards by descending in dungeons." : "Earn shards by descending in dungeons — kept even if you fall.  E or X to close.";
      ctx.fillText(foot, listX, py + ph - 14);
    }

    // Click outside closes.
    if (clicked && !hit(px, py, pw, ph)) this.close();

    fit.done();
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }
}
