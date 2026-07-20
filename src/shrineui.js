// Immediate-mode Frost Shrine overlay — choose 1 of 3 dive blessings. Opened by
// main.js when the player presses E at a shrine POI; the chosen blessing is granted
// (a run-scoped dive buff) via the `api` and the shrine is marked cleared. Mirrors
// boardui.js/forgeui.js: render + input together each frame, fitScale-responsive,
// input.consumeClick() once. Side-effects (grant/clear/save/toast) live in main.js.
//
// THREE responsive layouts (the dailyui/metaui pattern — REFLOW, don't shrink):
//  - desktop:           3 cards across on the original 620×440 ref (pixel-identical)
//  - compact landscape: 3 across on a squat 620×310 ref — a landscape phone scaled
//                       the 440-tall ref to ~0.66 (8px text); the squat ref holds ~0.94
//  - portrait:          stacked full-width rows on a 420×620 ref (~0.89 on a phone)

import { roundRect as rr, fitScale } from "./utils.js";

export class ShrineUI {
  constructor() {
    this.open = false;
    this.poi = null;
    this.choices = [];
  }
  isOpen() {
    return this.open;
  }
  openShrine(poi, choices) {
    this.open = true;
    this.poi = poi;
    this.choices = choices || [];
  }
  close() {
    this.open = false;
    this.poi = null;
    this.choices = [];
  }

  render(ctx, w, h, player, input, api) {
    ctx.fillStyle = "rgba(8,10,18,0.7)";
    ctx.fillRect(0, 0, w, h);
    const portrait = h > w;
    const compact = !portrait && h < 480;
    const fit = fitScale(ctx, w, h, portrait ? 420 : 620, portrait ? 620 : compact ? 310 : 440, input);
    w = fit.w;
    h = fit.h;
    const mx = fit.mx;
    const my = fit.my;
    const clicked = input.consumeClick();
    const hit = (x, y, bw, bh) => mx >= x && mx <= x + bw && my >= y && my <= y + bh;
    const clip = (txt, maxW) => {
      txt = String(txt);
      if (ctx.measureText(txt).width <= maxW) return txt;
      while (txt.length && ctx.measureText(txt + "…").width > maxW) txt = txt.slice(0, -1);
      return txt + "…";
    };

    const pw = Math.min(portrait ? 400 : 584, w - (portrait ? 20 : 40));
    const ph = Math.min(portrait ? 592 : compact ? 286 : 404, h - (portrait || compact ? 24 : 40));
    const px = (w - pw) / 2;
    const py = (h - ph) / 2;
    rr(ctx, px, py, pw, ph, 14);
    ctx.fillStyle = "rgba(16,20,30,0.98)";
    ctx.fill();
    ctx.strokeStyle = "rgba(150,200,240,0.42)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Header (the Field Kit vendor swaps the title + copy — kept in every mode).
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    const isKit = this.poi && this.poi.fieldKit;
    ctx.fillStyle = isKit ? "#d98fff" : "#bfe8ff";
    ctx.font = (compact ? "600 18px" : "600 20px") + " Fredoka, -apple-system, sans-serif";
    ctx.fillText(isKit ? "Field Kit" : "Frost Shrine", px + 22, py + (compact ? 28 : 34));
    ctx.fillStyle = "#8b97ab";
    ctx.font = "500 12px Fredoka, -apple-system, sans-serif";
    const subFull = isKit ? "Buy ONE blessing with run coins — they're at risk, and it fades when this dive ends." : "Choose a blessing — it empowers you now and fades when your next dive ends.";
    const subShort = isKit ? "Buy ONE blessing with run coins — fades when the dive ends." : "Choose a blessing — it fades when your next dive ends.";
    ctx.fillText(portrait || compact ? clip(portrait ? subShort : subFull, pw - 44) : subFull, px + 22, py + (compact ? 46 : 54));

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

    // Blessing cards.
    const n = Math.max(1, this.choices.length);
    let chosen = null;
    if (portrait) {
      // PORTRAIT: stacked full-width rows — orb left, name + effect beside it, cost
      // top-right, and a full-width Choose/Buy strip (a 40px thumb target) at the bottom.
      const gap = 12;
      const cardX = px + 16;
      const cardW = pw - 32;
      const cy0 = py + 70;
      const cardH = (ph - 110 - gap * (n - 1)) / n;
      this.choices.forEach((c, i) => {
        const y = cy0 + i * (cardH + gap);
        const hov = hit(cardX, y, cardW, cardH);
        ctx.fillStyle = hov ? "rgba(191,232,255,0.14)" : "rgba(255,255,255,0.05)";
        rr(ctx, cardX, y, cardW, cardH, 10);
        ctx.fill();
        ctx.strokeStyle = c.color;
        ctx.lineWidth = hov ? 2 : 1;
        ctx.stroke();

        // Glowing orb icon.
        ctx.shadowColor = c.color;
        ctx.shadowBlur = hov ? 18 : 9;
        ctx.fillStyle = c.color;
        ctx.beginPath();
        ctx.arc(cardX + 38, y + 46, 17, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Priced choices (the in-dungeon Field Kit) show their coin cost; a card the
        // player can't afford greys out (main.js also re-checks before granting).
        const priced = c.cost != null;
        const afford = !priced || (player && player.coins >= c.cost);

        // Name + effect.
        ctx.textAlign = "left";
        ctx.fillStyle = "#e9eef6";
        ctx.font = "700 16px Fredoka, -apple-system, sans-serif";
        ctx.fillText(clip(c.label, cardW - 84 - (priced ? 66 : 0)), cardX + 70, y + 40);
        ctx.fillStyle = "#aeb8c6";
        ctx.font = "600 12px Fredoka, -apple-system, sans-serif";
        ctx.fillText(clip(c.text, cardW - 84), cardX + 70, y + 62);

        if (priced) {
          ctx.textAlign = "right";
          ctx.fillStyle = afford ? "#ffd166" : "#9a5d5d";
          ctx.font = "700 13px Fredoka, -apple-system, sans-serif";
          ctx.fillText(`◉ ${c.cost}`, cardX + cardW - 14, y + 40);
        }

        // Choose/Buy strip.
        const bw = cardW - 28;
        const bh = 40;
        const bx = cardX + 14;
        const by = y + cardH - 52;
        ctx.globalAlpha = afford ? 1 : 0.45;
        ctx.fillStyle = hov && afford ? "#3b6f9a" : "rgba(191,232,255,0.14)";
        rr(ctx, bx, by, bw, bh, 8);
        ctx.fill();
        ctx.fillStyle = "#dff1ff";
        ctx.font = "700 14px Fredoka, -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(priced ? (afford ? "Buy" : "Too pricey") : "Choose", cardX + cardW / 2, by + bh / 2 + 1);
        ctx.textBaseline = "alphabetic";
        ctx.textAlign = "left";
        ctx.globalAlpha = 1;

        if (clicked && hov && afford) chosen = c;
      });
    } else {
      // DESKTOP + COMPACT: cards across. Compact trims vertical padding + the orb so
      // everything fits the squat ref with no font under 12px; desktop is untouched.
      const gap = 14;
      const cardW = (pw - 44 - gap * (n - 1)) / n;
      const cardH = ph - (compact ? 90 : 132);
      const cy0 = py + (compact ? 60 : 78);
      this.choices.forEach((c, i) => {
        const x = px + 22 + i * (cardW + gap);
        const hov = hit(x, cy0, cardW, cardH);
        ctx.fillStyle = hov ? "rgba(191,232,255,0.14)" : "rgba(255,255,255,0.05)";
        rr(ctx, x, cy0, cardW, cardH, 10);
        ctx.fill();
        ctx.strokeStyle = c.color;
        ctx.lineWidth = hov ? 2 : 1;
        ctx.stroke();

        // Glowing orb icon.
        ctx.shadowColor = c.color;
        ctx.shadowBlur = hov ? 18 : 9;
        ctx.fillStyle = c.color;
        ctx.beginPath();
        ctx.arc(x + cardW / 2, cy0 + (compact ? 30 : 46), compact ? 12 : 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Name + effect.
        ctx.textAlign = "center";
        ctx.fillStyle = "#e9eef6";
        ctx.font = (compact ? "700 14px" : "700 16px") + " Fredoka, -apple-system, sans-serif";
        ctx.fillText(compact ? clip(c.label, cardW - 12) : c.label, x + cardW / 2, cy0 + (compact ? 58 : 92));
        ctx.fillStyle = "#aeb8c6";
        ctx.font = "600 12px Fredoka, -apple-system, sans-serif";
        ctx.fillText(compact ? clip(c.text, cardW - 12) : c.text, x + cardW / 2, cy0 + (compact ? 78 : 116));

        // Priced choices (the in-dungeon Field Kit) show their coin cost; a card the
        // player can't afford greys out (main.js also re-checks before granting).
        const priced = c.cost != null;
        const afford = !priced || (player && player.coins >= c.cost);
        if (priced) {
          ctx.fillStyle = afford ? "#ffd166" : "#9a5d5d";
          ctx.font = (compact ? "700 12px" : "700 13px") + " Fredoka, -apple-system, sans-serif";
          ctx.fillText(`◉ ${c.cost}`, x + cardW / 2, cy0 + (compact ? 96 : 138));
        }

        // Choose button.
        const bw = cardW - 28;
        const bh = compact ? 36 : 30;
        const bx = x + 14;
        const by = cy0 + cardH - (compact ? 44 : 42);
        ctx.globalAlpha = afford ? 1 : 0.45;
        ctx.fillStyle = hov && afford ? "#3b6f9a" : "rgba(191,232,255,0.14)";
        rr(ctx, bx, by, bw, bh, 7);
        ctx.fill();
        ctx.fillStyle = "#dff1ff";
        ctx.font = "700 12px Fredoka, -apple-system, sans-serif";
        ctx.textBaseline = "middle";
        ctx.fillText(priced ? (afford ? "Buy" : "Too pricey") : "Choose", x + cardW / 2, by + bh / 2 + 1);
        ctx.textBaseline = "alphabetic";
        ctx.textAlign = "left";
        ctx.globalAlpha = 1;

        if (clicked && hov && afford) chosen = c;
      });
    }

    // Footer.
    ctx.fillStyle = "#6b7689";
    ctx.font = "500 12px Fredoka, -apple-system, sans-serif";
    const foot = portrait || compact ? "Pick one — or close to leave it for later." : "Pick one — or close to leave the shrine for later.  E or X to close.";
    ctx.fillText(portrait || compact ? clip(foot, pw - 44) : foot, px + 22, py + ph - (compact ? 12 : 14));

    // Click outside closes (leaving the shrine un-spent — the cached trio re-shows).
    const outside = clicked && !hit(px, py, pw, ph);
    fit.done();
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";

    // Fire the side-effect AFTER fit.done() so the transform is popped first.
    if (chosen && api) api.choose(this.poi, chosen);
    else if (outside) this.close();
  }
}
