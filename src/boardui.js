// Immediate-mode Mission Board overlay — review + claim bounties. Mirrors metaui.js:
// render + input together each frame while the sim is paused; the caller passes an `api`
// (claim/reroll) so the coin/save/toast side-effects stay in main.js.

import { getBounties, getCores } from "./meta.js";
import { roundRect as rr, fitScale } from "./utils.js";

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
    ctx.fillText("Mission Board", px + 22, py + 34);
    ctx.fillStyle = "#8b97ab";
    ctx.font = "500 12px -apple-system, sans-serif";
    ctx.fillText("Bounties pay Frost Cores just for playing — claim a completed one here.", px + 22, py + 52);

    // Frost Core balance.
    ctx.textAlign = "right";
    ctx.font = "700 17px -apple-system, sans-serif";
    ctx.fillStyle = "#bfe8ff";
    ctx.fillText(`✺ ${getCores()}`, px + pw - 46, py + 34);

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

    // Bounty rows.
    const listX = px + 22;
    const listW = pw - 44;
    const rowH = 78;
    const gap = 10;
    let ry = py + 76;
    for (const b of getBounties()) {
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      rr(ctx, listX, ry, listW, rowH, 8);
      ctx.fill();
      ctx.fillStyle = b.color;
      rr(ctx, listX, ry, 4, rowH, 8);
      ctx.fill();

      ctx.textAlign = "left";
      ctx.fillStyle = b.color;
      ctx.font = "700 15px -apple-system, sans-serif";
      ctx.fillText(b.label, listX + 16, ry + 24);
      ctx.fillStyle = "#cdd5e2";
      ctx.font = "500 12px -apple-system, sans-serif";
      ctx.fillText(`Reward:  ✺ ${b.cores} Frost Cores   ·   ◉ ${b.coins} coins`, listX + 16, ry + 44);

      // Progress bar.
      const barX = listX + 16;
      const barY = ry + 56;
      const barW = listW - 200;
      const barH = 8;
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      rr(ctx, barX, barY, barW, barH, 4);
      ctx.fill();
      const frac = Math.min(1, b.prog / b.goal);
      ctx.fillStyle = b.done ? "#7CFC9B" : b.color;
      rr(ctx, barX, barY, Math.max(0, barW * frac), barH, 4);
      ctx.fill();
      ctx.fillStyle = "#8b97ab";
      ctx.font = "600 11px -apple-system, sans-serif";
      ctx.fillText(`${b.prog} / ${b.goal}`, barX + barW + 8, barY + 8);

      // Right: Claim button when done, else "In progress" (+ a Reroll on un-started).
      const btnW = 112;
      const btnH = 38;
      const btnX = listX + listW - btnW - 12;
      const btnY = ry + (rowH - btnH) / 2;
      const hov = hit(btnX, btnY, btnW, btnH);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (b.done) {
        ctx.fillStyle = hov ? "#3b8f5a" : "rgba(90,200,130,0.22)";
        rr(ctx, btnX, btnY, btnW, btnH, 7);
        ctx.fill();
        ctx.strokeStyle = "rgba(120,230,160,0.5)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = hov ? "#ffffff" : "#9be8b6";
        ctx.font = "700 13px -apple-system, sans-serif";
        ctx.fillText(`Claim  ✺${b.cores}`, btnX + btnW / 2, btnY + btnH / 2 + 1);
        if (clicked && hov && api) api.claim(b);
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.05)";
        rr(ctx, btnX, btnY, btnW, btnH, 7);
        ctx.fill();
        ctx.fillStyle = "#6b7689";
        ctx.font = "700 12px -apple-system, sans-serif";
        ctx.fillText("In progress", btnX + btnW / 2, btnY + btnH / 2 + 1);
        if (b.prog === 0) {
          const rW = 66;
          const rH = 20;
          const rX = btnX - rW - 8;
          const rYy = ry + (rowH - rH) / 2;
          const rhov = hit(rX, rYy, rW, rH);
          ctx.fillStyle = rhov ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.05)";
          rr(ctx, rX, rYy, rW, rH, 5);
          ctx.fill();
          ctx.fillStyle = "#9aa6b1";
          ctx.font = "600 10px -apple-system, sans-serif";
          ctx.fillText("↻ Reroll", rX + rW / 2, rYy + rH / 2 + 1);
          if (clicked && rhov && api) api.reroll(b);
        }
      }
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";
      ry += rowH + gap;
    }

    // Footer.
    ctx.fillStyle = "#6b7689";
    ctx.font = "500 11px -apple-system, sans-serif";
    ctx.fillText("Progress ticks up as you play.  Un-started bounties can be rerolled.  E or X to close.", px + 22, py + ph - 14);

    // Click outside closes.
    if (clicked && !hit(px, py, pw, ph)) this.close();

    fit.done();
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }
}
