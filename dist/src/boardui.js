// Immediate-mode Mission Board overlay — review + claim bounties. Mirrors metaui.js:
// render + input together each frame while the sim is paused; the caller passes an `api`
// (claim/reroll) so the coin/save/toast side-effects stay in main.js.
//
// THREE responsive layouts (the metaui/dailyui pattern — reflow, don't shrink):
//  - desktop:           the original 668×560 ref with 72px rows (unchanged)
//  - compact landscape: a squat 668×330 ref — a landscape phone scaled the tall
//                       ref to ~0.52 (7px text); squat rows keep all 4 on-screen
//  - portrait:          a 420×640 ref — each bounty a tall two-line card with a
//                       full-width bar and a thumb-height button strip

import { getBounties, getCores, getDaily, dailyResetHours } from "./meta.js";
import { roundRect as rr, fitScale } from "./utils.js";

// Ellipsis-clip a string to maxW at the current ctx font (the metaui.js helper).
function clipTo(ctx, txt, maxW) {
  if (ctx.measureText(txt).width <= maxW) return txt;
  while (txt.length && ctx.measureText(txt + "…").width > maxW) txt = txt.slice(0, -1);
  return txt + "…";
}

export class BoardUI {
  constructor() {
    this.open = false;
  }
  isOpen() {
    return this.open;
  }
  openBoard() {
    this.open = true;
  }
  close() {
    this.open = false;
  }
  toggle() {
    this.open = !this.open;
  }

  render(ctx, w, h, player, input, api) {
    ctx.fillStyle = "rgba(8,10,18,0.66)";
    ctx.fillRect(0, 0, w, h);
    const portrait = h > w;
    const compact = !portrait && h < 480;
    const fit = fitScale(ctx, w, h, portrait ? 420 : 668, portrait ? 640 : compact ? 330 : 560, input);
    w = fit.w;
    h = fit.h;
    const mx = fit.mx;
    const my = fit.my;
    const clicked = input.consumeClick();
    const hit = (x, y, bw, bh) => mx >= x && mx <= x + bw && my >= y && my <= y + bh;

    const pw = Math.min(portrait ? 400 : 620, w - (portrait ? 20 : 48));
    const ph = portrait ? Math.min(610, h - 24) : compact ? Math.min(316, h - 14) : Math.min(520, h - 48);
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
    ctx.fillText("Mission Board", px + (portrait ? 16 : 22), py + (portrait ? 32 : compact ? 26 : 34));
    if (!compact) {
      ctx.fillStyle = "#8b97ab";
      ctx.font = "500 12px Fredoka, -apple-system, sans-serif";
      const sub = portrait
        ? clipTo(ctx, "Bounties pay Frost Cores — claim completed ones here.", pw - 32)
        : "Bounties pay Frost Cores just for playing — claim a completed one here.";
      ctx.fillText(sub, px + (portrait ? 16 : 22), py + (portrait ? 50 : 52));
    }

    // Frost Core balance.
    ctx.textAlign = "right";
    ctx.font = "700 17px Fredoka, -apple-system, sans-serif";
    ctx.fillStyle = "#bfe8ff";
    ctx.fillText(`✺ ${getCores()}`, px + pw - 46, py + (portrait ? 32 : compact ? 26 : 34));

    // Close button.
    const cb = { x: px + pw - 36, y: py + (portrait ? 14 : compact ? 11 : 16), w: 22, h: 22 };
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
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      return;
    }

    // Bounty rows: the daily (highlighted) first, then the 3 rotating bounties.
    const listX = px + (portrait ? 12 : 22);
    const listW = pw - (portrait ? 24 : 44);
    const rowH = portrait ? 116 : compact ? 58 : 72;
    const gap = portrait ? 8 : compact ? 6 : 9;
    let ry = py + (portrait ? 62 : compact ? 44 : 74);
    const rowFn = portrait ? this.drawRowPortrait : compact ? this.drawRowCompact : this.drawRow;
    const daily = getDaily();
    if (daily) {
      rowFn.call(this, ctx, daily, listX, ry, listW, rowH, hit, clicked, api, true);
      ry += rowH + gap;
    }
    for (const b of getBounties()) {
      rowFn.call(this, ctx, b, listX, ry, listW, rowH, hit, clicked, api, false);
      ry += rowH + gap;
    }

    // Footer (dropped in compact — no vertical room; shortened in portrait).
    if (!compact) {
      ctx.fillStyle = "#6b7689";
      ctx.font = "500 12px Fredoka, -apple-system, sans-serif";
      if (portrait) {
        ctx.fillText(clipTo(ctx, "The daily pays more and resets each day.  Un-started bounties can be rerolled.", listW), listX, py + ph - 12);
      } else {
        ctx.fillText("The daily pays more and resets each day.  Un-started bounties can be rerolled.  E or X to close.", px + 22, py + ph - 14);
      }
    }

    // Click outside closes.
    if (clicked && !hit(px, py, pw, ph)) this.close();

    fit.done();
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  // One bounty row — used for the daily (highlighted, no reroll) + the 3 rotating bounties.
  drawRow(ctx, b, listX, ry, listW, rowH, hit, clicked, api, daily) {
    ctx.fillStyle = daily ? "rgba(255,209,102,0.09)" : "rgba(255,255,255,0.04)";
    rr(ctx, listX, ry, listW, rowH, 8);
    ctx.fill();
    if (daily) {
      ctx.strokeStyle = "rgba(255,209,102,0.5)";
      ctx.lineWidth = 1.5;
      rr(ctx, listX, ry, listW, rowH, 8);
      ctx.stroke();
    }
    ctx.fillStyle = b.color;
    rr(ctx, listX, ry, 4, rowH, 8);
    ctx.fill();

    // Label (+ a gold DAILY badge).
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    let lx = listX + 16;
    if (daily) {
      ctx.font = "800 12px Fredoka, -apple-system, sans-serif";
      const bw = ctx.measureText("★ DAILY").width + 14;
      ctx.fillStyle = "#ffd166";
      rr(ctx, lx, ry + 11, bw, 16, 5);
      ctx.fill();
      ctx.fillStyle = "#3a2c08";
      ctx.fillText("★ DAILY", lx + 7, ry + 22);
      lx += bw + 8;
    }
    ctx.fillStyle = b.color;
    ctx.font = "700 15px Fredoka, -apple-system, sans-serif";
    ctx.fillText(b.label, lx, ry + 23);
    ctx.fillStyle = "#cdd5e2";
    ctx.font = "500 12px Fredoka, -apple-system, sans-serif";
    let reward = `Reward:  ✺ ${b.cores} Cores   ·   ◉ ${b.coins} coins`;
    if (daily) reward += `   ·   resets in ~${dailyResetHours()}h`;
    ctx.fillText(reward, listX + 16, ry + 42);

    // Progress bar.
    const barX = listX + 16;
    const barY = ry + 52;
    const barW = listW - 210;
    const barH = 8;
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    rr(ctx, barX, barY, barW, barH, 4);
    ctx.fill();
    const frac = Math.min(1, b.prog / b.goal);
    ctx.fillStyle = b.done ? "#7CFC9B" : b.color;
    rr(ctx, barX, barY, Math.max(0, barW * frac), barH, 4);
    ctx.fill();
    ctx.fillStyle = "#8b97ab";
    ctx.font = "600 12px Fredoka, -apple-system, sans-serif";
    ctx.fillText(`${b.prog} / ${b.goal}`, barX + barW + 8, barY + 8);

    // Right button: Claimed ✓ (daily) / Claim / In progress (+ Reroll on un-started regular bounties).
    const btnW = 112;
    const btnH = 34;
    const btnX = listX + listW - btnW - 12;
    const btnY = ry + (rowH - btnH) / 2;
    const hov = hit(btnX, btnY, btnW, btnH);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (daily && b.claimed) {
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      rr(ctx, btnX, btnY, btnW, btnH, 7);
      ctx.fill();
      ctx.fillStyle = "#7CFC9B";
      ctx.font = "700 12px Fredoka, -apple-system, sans-serif";
      ctx.fillText("Claimed ✓", btnX + btnW / 2, btnY + btnH / 2 + 1);
    } else if (b.done) {
      ctx.fillStyle = hov ? "#3b8f5a" : "rgba(90,200,130,0.22)";
      rr(ctx, btnX, btnY, btnW, btnH, 7);
      ctx.fill();
      ctx.strokeStyle = "rgba(120,230,160,0.5)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = hov ? "#ffffff" : "#9be8b6";
      ctx.font = "700 13px Fredoka, -apple-system, sans-serif";
      ctx.fillText(`Claim  ✺${b.cores}`, btnX + btnW / 2, btnY + btnH / 2 + 1);
      if (clicked && hov && api) api.claim(b);
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      rr(ctx, btnX, btnY, btnW, btnH, 7);
      ctx.fill();
      ctx.fillStyle = "#6b7689";
      ctx.font = "700 12px Fredoka, -apple-system, sans-serif";
      ctx.fillText("In progress", btnX + btnW / 2, btnY + btnH / 2 + 1);
      if (!daily && b.prog === 0) {
        const rW = 66;
        const rH = 20;
        const rX = btnX - rW - 8;
        const rYy = ry + (rowH - rH) / 2;
        const rhov = hit(rX, rYy, rW, rH);
        ctx.fillStyle = rhov ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.05)";
        rr(ctx, rX, rYy, rW, rH, 5);
        ctx.fill();
        ctx.fillStyle = "#9aa6b1";
        ctx.font = "600 12px Fredoka, -apple-system, sans-serif";
        ctx.fillText("↻ Reroll", rX + rW / 2, rYy + rH / 2 + 1);
        if (clicked && rhov && api) api.reroll(b);
      }
    }
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
  }

  // PORTRAIT row — a tall two-line card: badge + label + progress count up top,
  // reward line, a full-width bar, then a thumb-height (38px) button strip.
  // Same guards as drawRow: claim only when b.done; reroll only on un-started
  // regular bounties; the claimed daily shows a passive Claimed ✓.
  drawRowPortrait(ctx, b, listX, ry, listW, rowH, hit, clicked, api, daily) {
    ctx.fillStyle = daily ? "rgba(255,209,102,0.09)" : "rgba(255,255,255,0.04)";
    rr(ctx, listX, ry, listW, rowH, 8);
    ctx.fill();
    if (daily) {
      ctx.strokeStyle = "rgba(255,209,102,0.5)";
      ctx.lineWidth = 1.5;
      rr(ctx, listX, ry, listW, rowH, 8);
      ctx.stroke();
    }
    ctx.fillStyle = b.color;
    rr(ctx, listX, ry, 4, rowH, 8);
    ctx.fill();

    const cx = listX + 14;
    const cw = listW - 28;

    // Line 1: gold ★ DAILY badge + label left, progress count right.
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    let lx = cx;
    if (daily) {
      ctx.font = "800 12px Fredoka, -apple-system, sans-serif";
      const bw = ctx.measureText("★ DAILY").width + 14;
      ctx.fillStyle = "#ffd166";
      rr(ctx, lx, ry + 13, bw, 16, 5);
      ctx.fill();
      ctx.fillStyle = "#3a2c08";
      ctx.fillText("★ DAILY", lx + 7, ry + 24);
      lx += bw + 8;
    }
    ctx.font = "600 12px Fredoka, -apple-system, sans-serif";
    const progTxt = `${b.prog} / ${b.goal}`;
    const progW = ctx.measureText(progTxt).width;
    ctx.textAlign = "right";
    ctx.fillStyle = "#8b97ab";
    ctx.fillText(progTxt, cx + cw, ry + 25);
    ctx.textAlign = "left";
    ctx.fillStyle = b.color;
    ctx.font = "700 15px Fredoka, -apple-system, sans-serif";
    ctx.fillText(clipTo(ctx, b.label, cx + cw - progW - 10 - lx), lx, ry + 25);

    // Line 2: reward (+ the daily reset timer).
    ctx.fillStyle = "#cdd5e2";
    ctx.font = "500 12px Fredoka, -apple-system, sans-serif";
    let reward = `Reward:  ✺ ${b.cores} Cores   ·   ◉ ${b.coins} coins`;
    if (daily) reward += `   ·   resets in ~${dailyResetHours()}h`;
    ctx.fillText(clipTo(ctx, reward, cw), cx, ry + 44);

    // Full-width progress bar.
    const barY = ry + 52;
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    rr(ctx, cx, barY, cw, 10, 5);
    ctx.fill();
    const frac = Math.min(1, b.prog / b.goal);
    ctx.fillStyle = b.done ? "#7CFC9B" : b.color;
    rr(ctx, cx, barY, Math.max(0, cw * frac), 10, 5);
    ctx.fill();

    // Button strip under the bar.
    const sy = ry + 70;
    const sh = 38;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (daily && b.claimed) {
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      rr(ctx, cx, sy, cw, sh, 8);
      ctx.fill();
      ctx.fillStyle = "#7CFC9B";
      ctx.font = "700 13px Fredoka, -apple-system, sans-serif";
      ctx.fillText("Claimed ✓", cx + cw / 2, sy + sh / 2 + 1);
    } else if (b.done) {
      const hov = hit(cx, sy, cw, sh);
      ctx.fillStyle = hov ? "#3b8f5a" : "rgba(90,200,130,0.22)";
      rr(ctx, cx, sy, cw, sh, 8);
      ctx.fill();
      ctx.strokeStyle = "rgba(120,230,160,0.5)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = hov ? "#ffffff" : "#9be8b6";
      ctx.font = "700 14px Fredoka, -apple-system, sans-serif";
      ctx.fillText(`Claim  ✺${b.cores}`, cx + cw / 2, sy + sh / 2 + 1);
      if (clicked && hov && api) api.claim(b);
    } else if (!daily && b.prog === 0) {
      // Passive status left + a thumb-sized Reroll button right.
      const rw = 128;
      const iw = cw - rw - 8;
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      rr(ctx, cx, sy, iw, sh, 8);
      ctx.fill();
      ctx.fillStyle = "#6b7689";
      ctx.font = "700 12px Fredoka, -apple-system, sans-serif";
      ctx.fillText("In progress", cx + iw / 2, sy + sh / 2 + 1);
      const rx = cx + cw - rw;
      const rhov = hit(rx, sy, rw, sh);
      ctx.fillStyle = rhov ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.05)";
      rr(ctx, rx, sy, rw, sh, 8);
      ctx.fill();
      ctx.fillStyle = "#9aa6b1";
      ctx.font = "600 13px Fredoka, -apple-system, sans-serif";
      ctx.fillText("↻ Reroll", rx + rw / 2, sy + sh / 2 + 1);
      if (clicked && rhov && api) api.reroll(b);
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      rr(ctx, cx, sy, cw, sh, 8);
      ctx.fill();
      ctx.fillStyle = "#6b7689";
      ctx.font = "700 12px Fredoka, -apple-system, sans-serif";
      ctx.fillText("In progress", cx + cw / 2, sy + sh / 2 + 1);
    }
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
  }

  // COMPACT-LANDSCAPE row — one squat 58px line: label + reward + short bar on
  // the left, thumb-height (38px) buttons on the right, so all 4 rows fit the
  // 330-tall ref without scrolling. Same guards as drawRow.
  drawRowCompact(ctx, b, listX, ry, listW, rowH, hit, clicked, api, daily) {
    ctx.fillStyle = daily ? "rgba(255,209,102,0.09)" : "rgba(255,255,255,0.04)";
    rr(ctx, listX, ry, listW, rowH, 8);
    ctx.fill();
    if (daily) {
      ctx.strokeStyle = "rgba(255,209,102,0.5)";
      ctx.lineWidth = 1.5;
      rr(ctx, listX, ry, listW, rowH, 8);
      ctx.stroke();
    }
    ctx.fillStyle = b.color;
    rr(ctx, listX, ry, 4, rowH, 8);
    ctx.fill();

    const btnW = 104;
    const btnH = 38;
    const btnX = listX + listW - btnW - 10;
    const btnY = ry + (rowH - btnH) / 2;
    const textW = listW - 214; // stays clear of the reroll+claim cluster

    // Label line (+ badge).
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    let lx = listX + 14;
    if (daily) {
      ctx.font = "800 12px Fredoka, -apple-system, sans-serif";
      const bw = ctx.measureText("★ DAILY").width + 14;
      ctx.fillStyle = "#ffd166";
      rr(ctx, lx, ry + 8, bw, 16, 5);
      ctx.fill();
      ctx.fillStyle = "#3a2c08";
      ctx.fillText("★ DAILY", lx + 7, ry + 19);
      lx += bw + 8;
    }
    ctx.fillStyle = b.color;
    ctx.font = "700 13px Fredoka, -apple-system, sans-serif";
    ctx.fillText(clipTo(ctx, b.label, listX + 14 + textW - lx), lx, ry + 20);

    // Reward line (+ the daily reset timer).
    ctx.fillStyle = "#cdd5e2";
    ctx.font = "500 12px Fredoka, -apple-system, sans-serif";
    let reward = `✺ ${b.cores}   ·   ◉ ${b.coins}`;
    if (daily) reward += `   ·   resets in ~${dailyResetHours()}h`;
    ctx.fillText(clipTo(ctx, reward, textW), listX + 14, ry + 37);

    // Short progress bar + count.
    const barX = listX + 14;
    const barY = ry + 44;
    const barW = textW - 78;
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    rr(ctx, barX, barY, barW, 7, 3.5);
    ctx.fill();
    const frac = Math.min(1, b.prog / b.goal);
    ctx.fillStyle = b.done ? "#7CFC9B" : b.color;
    rr(ctx, barX, barY, Math.max(0, barW * frac), 7, 3.5);
    ctx.fill();
    ctx.fillStyle = "#8b97ab";
    ctx.font = "600 12px Fredoka, -apple-system, sans-serif";
    ctx.fillText(`${b.prog} / ${b.goal}`, barX + barW + 8, barY + 7);

    // Right-side buttons.
    const hov = hit(btnX, btnY, btnW, btnH);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (daily && b.claimed) {
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      rr(ctx, btnX, btnY, btnW, btnH, 7);
      ctx.fill();
      ctx.fillStyle = "#7CFC9B";
      ctx.font = "700 12px Fredoka, -apple-system, sans-serif";
      ctx.fillText("Claimed ✓", btnX + btnW / 2, btnY + btnH / 2 + 1);
    } else if (b.done) {
      ctx.fillStyle = hov ? "#3b8f5a" : "rgba(90,200,130,0.22)";
      rr(ctx, btnX, btnY, btnW, btnH, 7);
      ctx.fill();
      ctx.strokeStyle = "rgba(120,230,160,0.5)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = hov ? "#ffffff" : "#9be8b6";
      ctx.font = "700 13px Fredoka, -apple-system, sans-serif";
      ctx.fillText(`Claim  ✺${b.cores}`, btnX + btnW / 2, btnY + btnH / 2 + 1);
      if (clicked && hov && api) api.claim(b);
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      rr(ctx, btnX, btnY, btnW, btnH, 7);
      ctx.fill();
      ctx.fillStyle = "#6b7689";
      ctx.font = "700 12px Fredoka, -apple-system, sans-serif";
      ctx.fillText("In progress", btnX + btnW / 2, btnY + btnH / 2 + 1);
      if (!daily && b.prog === 0) {
        const rW = 76;
        const rX = btnX - rW - 8;
        const rhov = hit(rX, btnY, rW, btnH);
        ctx.fillStyle = rhov ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.05)";
        rr(ctx, rX, btnY, rW, btnH, 7);
        ctx.fill();
        ctx.fillStyle = "#9aa6b1";
        ctx.font = "600 12px Fredoka, -apple-system, sans-serif";
        ctx.fillText("↻ Reroll", rX + rW / 2, btnY + btnH / 2 + 1);
        if (clicked && rhov && api) api.reroll(b);
      }
    }
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
  }
}
