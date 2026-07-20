// Daily Supply Drop CALENDAR — the retention popup. Shows the 7-day streak ladder
// (claimed ✓ / TODAY glowing / future dimmed / Day 7 a dashed MYSTERY "?"), with one
// big Claim button. Immediate-mode like every other overlay: drawing + input together
// in render(); the caller pauses the sim while open. Opens automatically once per
// session for players past their first dungeon (main.js), and from the camp crate's E.
// Side-effects (the actual grant + the rewarded double) stay in main.js via api.claim().

import { roundRect as rr, fitScale } from "./utils.js";
import { dailyDropRewardFor, dailyDropNextStreak, dailyDropClaimable, dailyDropStreak } from "./meta.js";

export class DailyUI {
  constructor() {
    this.open = false;
  }
  isOpen() {
    return this.open;
  }
  openDaily() {
    this.open = true;
  }
  close() {
    this.open = false;
  }

  render(ctx, w, h, player, input, api) {
    ctx.fillStyle = "rgba(8,10,18,0.7)";
    ctx.fillRect(0, 0, w, h);
    // Three layouts: desktop (7 cards across), SHORT landscape phones (same but a
    // squatter ref so nothing scales tiny/clips), and PORTRAIT (a vertical 7-row
    // list — 7 cards across is unreadable at portrait widths).
    const portrait = h > w;
    const compact = !portrait && h < 480;
    const fit = fitScale(ctx, w, h, portrait ? 420 : 860, portrait ? 660 : compact ? 340 : 470, input);
    w = fit.w;
    h = fit.h;
    const mx = fit.mx;
    const my = fit.my;
    const clicked = input.consumeClick();
    const hit = (x, y, bw, bh) => mx >= x && mx <= x + bw && my >= y && my <= y + bh;

    const pw = Math.min(portrait ? 400 : 820, w - 24);
    const ph = Math.min(portrait ? 640 : compact ? 324 : 430, h - 24);
    const px = (w - pw) / 2;
    const py = (h - ph) / 2;
    rr(ctx, px, py, pw, ph, 14);
    ctx.fillStyle = "rgba(16,20,30,0.98)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,209,102,0.4)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Header.
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffd166";
    ctx.font = (compact ? "800 20px" : "800 24px") + " Fredoka, -apple-system, sans-serif";
    ctx.fillText("DAILY SUPPLY DROP", px + pw / 2, py + (compact ? 32 : 40));
    ctx.fillStyle = "#aeb8c6";
    ctx.font = "500 13px Fredoka, -apple-system, sans-serif";
    const subText = portrait ? "Return daily — miss a day and the streak resets." : "Return each day and the drop grows — miss a day and the streak resets.";
    ctx.fillText(subText, px + pw / 2, py + (compact ? 50 : 62));

    // Close button.
    const cb = { x: px + pw - 36, y: py + 14, w: 22, h: 22 };
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

    // The 7-day ladder. `today` = the streak day the NEXT claim lands on (cycles weekly
    // past day 7, so long streaks keep a live calendar + a repeating Day-7 mystery).
    const next = dailyDropNextStreak();
    const claimable = dailyDropClaimable();
    const today = ((next - 1) % 7) + 1;
    const weekBase = next - today; // streak value at "Day 0" of the shown week
    if (portrait) {
      // PORTRAIT: a vertical 7-row list — day left, rewards centre, status right.
      const rowH = 58;
      const rGap = 7;
      const ry0 = py + 66;
      for (let d = 1; d <= 7; d++) {
        const y = ry0 + (d - 1) * (rowH + rGap);
        const isToday = d === today;
        const done = d < today || (d === today && !claimable);
        const mystery = d === 7;
        const r = dailyDropRewardFor(weekBase + d);
        ctx.globalAlpha = done ? 0.55 : isToday ? 1 : 0.8;
        ctx.fillStyle = isToday ? "rgba(255,209,102,0.14)" : "rgba(255,255,255,0.045)";
        rr(ctx, px + 16, y, pw - 32, rowH, 9);
        ctx.fill();
        if (mystery && !done) {
          ctx.setLineDash([6, 5]);
          ctx.strokeStyle = "#c98fff";
        } else {
          ctx.strokeStyle = isToday ? "#ffd166" : "rgba(255,255,255,0.14)";
        }
        ctx.lineWidth = isToday ? 2.5 : 1.5;
        if (isToday) {
          ctx.shadowColor = "#ffd166";
          ctx.shadowBlur = 10;
        }
        rr(ctx, px + 16, y, pw - 32, rowH, 9);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.setLineDash([]);
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillStyle = isToday ? "#ffd166" : mystery ? "#c98fff" : "#8b97ab";
        ctx.font = "800 14px Fredoka, -apple-system, sans-serif";
        ctx.fillText(isToday ? "TODAY" : `DAY ${d}`, px + 30, y + rowH / 2 + 1);
        if (mystery) {
          ctx.fillStyle = done ? "#6b7689" : "#c98fff";
          ctx.font = "800 22px Fredoka, -apple-system, sans-serif";
          ctx.fillText("?", px + 116, y + rowH / 2 + 1);
          ctx.font = "700 12px Fredoka, -apple-system, sans-serif";
          ctx.fillText("MYSTERY + everything", px + 140, y + rowH / 2 + 1);
        } else {
          ctx.font = "700 14px Fredoka, -apple-system, sans-serif";
          ctx.fillStyle = "#ffd166";
          ctx.fillText(`◉ ${r.coins}`, px + 112, y + rowH / 2 + 1);
          ctx.fillStyle = "#7fd2ff";
          ctx.fillText(`✦ ${r.shards}`, px + 196, y + rowH / 2 + 1);
          ctx.fillStyle = "#7fc8e6";
          ctx.fillText(`✺ ${r.cores}`, px + 268, y + rowH / 2 + 1);
        }
        if (done) {
          ctx.textAlign = "right";
          ctx.fillStyle = "#7CFC9B";
          ctx.font = "800 18px Fredoka, -apple-system, sans-serif";
          ctx.fillText("✓", px + pw - 28, y + rowH / 2 + 1);
        }
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.globalAlpha = 1;
      }
    } else {
      // LANDSCAPE: 7 cards across (squatter cards in compact so everything fits).
      const gap = 10;
      const cardW = (pw - 44 - gap * 6) / 7;
      const cardH = compact ? 158 : 190;
      const cy0 = py + (compact ? 62 : 84);
      const l1 = compact ? 52 : 66;
      const l2 = compact ? 76 : 92;
      const l3 = compact ? 100 : 118;
      for (let d = 1; d <= 7; d++) {
        const x = px + 22 + (d - 1) * (cardW + gap);
        const isToday = d === today;
        const done = d < today || (d === today && !claimable);
        const mystery = d === 7;
        const r = dailyDropRewardFor(weekBase + d);
        ctx.globalAlpha = done ? 0.55 : isToday ? 1 : 0.75;
        ctx.fillStyle = isToday ? "rgba(255,209,102,0.14)" : "rgba(255,255,255,0.045)";
        rr(ctx, x, cy0, cardW, cardH, 10);
        ctx.fill();
        if (mystery && !done) {
          ctx.setLineDash([6, 5]);
          ctx.strokeStyle = "#c98fff";
        } else {
          ctx.strokeStyle = isToday ? "#ffd166" : "rgba(255,255,255,0.14)";
        }
        ctx.lineWidth = isToday ? 2.5 : 1.5;
        if (isToday) {
          ctx.shadowColor = "#ffd166";
          ctx.shadowBlur = 14;
        }
        rr(ctx, x, cy0, cardW, cardH, 10);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.setLineDash([]);
        ctx.textAlign = "center";
        ctx.fillStyle = isToday ? "#ffd166" : mystery ? "#c98fff" : "#8b97ab";
        ctx.font = "800 13px Fredoka, -apple-system, sans-serif";
        ctx.fillText(isToday ? "TODAY" : `DAY ${d}`, x + cardW / 2, cy0 + 22);
        if (mystery) {
          ctx.fillStyle = done ? "#6b7689" : "#c98fff";
          ctx.font = (compact ? "800 34px" : "800 44px") + " Fredoka, -apple-system, sans-serif";
          ctx.fillText("?", x + cardW / 2, cy0 + (compact ? 72 : 92));
          ctx.font = "700 11px Fredoka, -apple-system, sans-serif";
          ctx.fillText("MYSTERY", x + cardW / 2, cy0 + (compact ? 96 : 118));
          ctx.fillStyle = "#8b97ab";
          ctx.font = "500 10px Fredoka, -apple-system, sans-serif";
          ctx.fillText("+ everything", x + cardW / 2, cy0 + (compact ? 112 : 134));
          if (!compact) ctx.fillText("below", x + cardW / 2, cy0 + 146);
        } else {
          ctx.font = "700 14px Fredoka, -apple-system, sans-serif";
          ctx.fillStyle = "#ffd166";
          ctx.fillText(`◉ ${r.coins}`, x + cardW / 2, cy0 + l1);
          ctx.fillStyle = "#7fd2ff";
          ctx.fillText(`✦ ${r.shards}`, x + cardW / 2, cy0 + l2);
          ctx.fillStyle = "#7fc8e6";
          ctx.fillText(`✺ ${r.cores}`, x + cardW / 2, cy0 + l3);
        }
        if (done) {
          ctx.fillStyle = "#7CFC9B";
          ctx.font = "800 18px Fredoka, -apple-system, sans-serif";
          ctx.fillText("✓", x + cardW / 2, cy0 + cardH - 14);
        }
        ctx.globalAlpha = 1;
      }
    }

    // Claim button (or the come-back line once today is taken).
    const bw = portrait ? pw - 60 : 300;
    const bh = compact ? 42 : 48;
    const bx = px + pw / 2 - bw / 2;
    const by = py + ph - (compact ? 54 : 68);
    if (claimable) {
      const hov = hit(bx, by, bw, bh);
      ctx.fillStyle = hov ? "#e6ac3c" : "#c98f28";
      rr(ctx, bx, by, bw, bh, 11);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "#1a1206";
      ctx.font = "800 17px Fredoka, -apple-system, sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText(`Claim Day ${today}`, bx + bw / 2, by + bh / 2 + 1);
      ctx.textBaseline = "alphabetic";
      if (clicked && hov && api && api.claim) {
        this.close();
        fit.done();
        ctx.textAlign = "left";
        api.claim(); // grant + rewarded-double flow live in main.js
        return;
      }
    } else {
      ctx.fillStyle = "#8b97ab";
      ctx.font = "600 14px Fredoka, -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`Day ${dailyDropStreak()} claimed — come back tomorrow to keep the streak!`, px + pw / 2, by + 30);
    }

    // Click outside closes.
    if (clicked && !hit(px, py, pw, ph)) this.close();

    fit.done();
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }
}
