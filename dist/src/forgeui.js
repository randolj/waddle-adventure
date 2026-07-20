// Immediate-mode Forge overlay — spend Frost Cores (+ coins) to forge a trait-legendary
// of a chosen archetype, temper an item's power, or reroll its affixes. Mirrors metaui.js
// + reuses the inventory icon helpers. Side-effects (spend/craft/save) live in main.js via `api`.

import { getCores } from "./meta.js";
import { roundRect as rr, fitScale } from "./utils.js";
import { WEAPON_TYPE_NAMES, WEAPON_TRAITS, RARITIES, itemPower } from "./items.js";
import { drawItemIcon, slotTint, clipText } from "./inventory.js";

const COST = { forge: { cores: 24, coins: 120 }, temper: { cores: 6, coins: 60 }, reroll: { cores: 4, coins: 40 } };
// Each archetype's legendary identity (so the forge buttons advertise what you're making).
const ARCH = [
  { wt: "sword", trait: "cleave" },
  { wt: "mace", trait: "quake" },
  { wt: "dagger", trait: "execute" },
  { wt: "bow", trait: "multishot" },
  { wt: "staff", trait: "chain" },
];

export class ForgeUI {
  constructor() {
    this.open = false;
    this.tab = "forge"; // forge | temper | reroll
    this.scroll = 0;
  }
  isOpen() {
    return this.open;
  }
  openForge() {
    this.open = true;
    this.tab = "forge";
    this.scroll = 0;
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
    // Three layouts (the dailyui/metaui pattern — reflow, don't shrink):
    //  - desktop:           the original 720×560 ref, pixel-identical
    //  - compact landscape: a squat 720×330 ref (landscape phones scaled the tall
    //                       ref to ~0.52 → 7px text; the squat ref holds ~0.88)
    //  - portrait:          a 420×660 ref — stacked full-width rows
    const portrait = h > w;
    const compact = !portrait && h < 480;
    const mode = portrait ? "portrait" : compact ? "compact" : "desktop";
    const fit = fitScale(ctx, w, h, portrait ? 420 : 720, portrait ? 660 : compact ? 330 : 560, input);
    w = fit.w;
    h = fit.h;
    const mx = fit.mx;
    const my = fit.my;
    const clicked = input.consumeClick();
    const hit = (x, y, bw, bh) => mx >= x && mx <= x + bw && my >= y && my <= y + bh;

    const pw = Math.min(portrait ? 400 : compact ? 700 : 680, w - (portrait || compact ? 20 : 48));
    const ph = Math.min(portrait ? 640 : compact ? 316 : 520, h - (portrait ? 20 : compact ? 12 : 48));
    const px = (w - pw) / 2;
    const py = (h - ph) / 2;
    rr(ctx, px, py, pw, ph, 14);
    ctx.fillStyle = "rgba(16,20,30,0.98)";
    ctx.fill();
    ctx.strokeStyle = "rgba(140,170,210,0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Header + balances.
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillStyle = "#e9eef6";
    ctx.font = `600 ${compact ? 17 : 20}px Fredoka, -apple-system, sans-serif`;
    ctx.fillText("The Forge", px + 22, py + (compact ? 28 : 34));
    ctx.textAlign = "right";
    ctx.font = "700 15px Fredoka, -apple-system, sans-serif";
    ctx.fillStyle = "#ffd166";
    ctx.fillText(`◉ ${player.coins}`, px + pw - 120, py + (compact ? 27 : 33));
    ctx.fillStyle = "#bfe8ff";
    ctx.fillText(`✺ ${getCores()}`, px + pw - 46, py + (compact ? 27 : 33));

    // Close button (36px thumb target on phones; desktop keeps the original 22px).
    const cbS = portrait || compact ? 36 : 22;
    const cb = {
      x: px + pw - (portrait || compact ? 44 : 36),
      y: py + (portrait ? 8 : compact ? 4 : 14),
      w: cbS,
      h: cbS,
    };
    ctx.fillStyle = hit(cb.x, cb.y, cb.w, cb.h) ? "rgba(255,90,90,0.9)" : "rgba(255,255,255,0.12)";
    rr(ctx, cb.x, cb.y, cb.w, cb.h, 5);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 2;
    const xi = cbS === 22 ? 6 : 12; // desktop X strokes stay at the original +6..+16
    ctx.beginPath();
    ctx.moveTo(cb.x + xi, cb.y + xi);
    ctx.lineTo(cb.x + cbS - xi, cb.y + cbS - xi);
    ctx.moveTo(cb.x + cbS - xi, cb.y + xi);
    ctx.lineTo(cb.x + xi, cb.y + cbS - xi);
    ctx.stroke();
    if (clicked && hit(cb.x, cb.y, cb.w, cb.h)) {
      this.close();
      fit.done();
      return;
    }

    // Tabs (short labels + taller thumb targets on phones; desktop unchanged —
    // tabY + tabH/2 lands on the original py+66 label baseline).
    const tabs = portrait
      ? [["forge", "Forge"], ["temper", "Temper"], ["reroll", "Reroll"]]
      : [["forge", "Forge Legendary"], ["temper", "Temper"], ["reroll", "Reroll Affixes"]];
    const tabW = portrait ? (pw - 44 - 16) / 3 : 132;
    const tabY = py + (portrait ? 46 : compact ? 44 : 52);
    const tabH = portrait || compact ? 36 : 28;
    let tx = px + 22;
    for (const [key, label] of tabs) {
      const active = this.tab === key;
      ctx.fillStyle = active ? "rgba(191,232,255,0.16)" : "rgba(255,255,255,0.05)";
      rr(ctx, tx, tabY, tabW, tabH, 6);
      ctx.fill();
      ctx.strokeStyle = active ? "#bfe8ff" : "rgba(255,255,255,0.12)";
      ctx.lineWidth = active ? 1.5 : 1;
      ctx.stroke();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = active ? "#bfe8ff" : "#8b97ab";
      ctx.font = "600 12px Fredoka, -apple-system, sans-serif";
      ctx.fillText(label, tx + tabW / 2, tabY + tabH / 2);
      if (clicked && hit(tx, tabY, tabW, tabH)) {
        this.tab = key;
        this.scroll = 0;
      }
      tx += tabW + 8;
    }
    ctx.textBaseline = "alphabetic";

    const contentTop = portrait ? 94 : compact ? 84 : 96;
    const contentY = py + contentTop;
    const contentH = ph - contentTop - (portrait ? 28 : compact ? 24 : 30);

    if (this.tab === "forge") this.renderForge(ctx, px, contentY, pw, contentH, player, hit, clicked, api, mode);
    else this.renderItemList(ctx, px, contentY, pw, contentH, player, input, hit, clicked, api, mx, my, mode);

    // Footer.
    ctx.textAlign = "left";
    ctx.fillStyle = "#6b7689";
    ctx.font = "500 12px Fredoka, -apple-system, sans-serif";
    const foot = this.tab === "forge" ? "Forge a legendary of your chosen weapon — its identity trait is guaranteed." : this.tab === "temper" ? "Temper raises an item's power and stat bonuses." : "Reroll an item's affixes for a fresh set.";
    const footText = `${foot}   E or X to close.`;
    ctx.fillText(portrait || compact ? clipText(ctx, footText, pw - 44) : footText, px + 22, py + ph - 12);

    if (clicked && !hit(px, py, pw, ph)) this.close();
    fit.done();
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  // Forge tab — five archetype cards. Desktop keeps the original 2-column grid;
  // portrait stacks full-width cards; compact landscape lays 5 mini-cards across
  // (the metaui.js compact pattern).
  renderForge(ctx, px, cy, pw, ch, player, hit, clicked, api, mode) {
    const cores = getCores();
    const can = cores >= COST.forge.cores && player.coins >= COST.forge.coins;
    if (mode === "portrait") {
      // 5 full-width cards stacked (5×88 + 4×10 = 480 ≤ the 518px content area).
      const cardW = pw - 44;
      const cardH = 88;
      ARCH.forEach((a, i) => {
        const x = px + 22;
        const y = cy + i * (cardH + 10);
        const hov = hit(x, y, cardW, cardH);
        ctx.fillStyle = hov && can ? "rgba(191,232,255,0.12)" : "rgba(255,255,255,0.05)";
        rr(ctx, x, y, cardW, cardH, 9);
        ctx.fill();
        ctx.strokeStyle = can ? "rgba(203,178,74,0.6)" : "rgba(255,255,255,0.1)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.globalAlpha = can ? 1 : 0.5;
        ctx.textAlign = "left";
        ctx.fillStyle = "#ef9f27";
        ctx.font = "700 15px Fredoka, -apple-system, sans-serif";
        ctx.fillText(WEAPON_TYPE_NAMES[a.wt], x + 14, y + 25);
        const tr = WEAPON_TRAITS[a.trait];
        ctx.fillStyle = "#ffd27a";
        ctx.font = "700 12px Fredoka, -apple-system, sans-serif";
        ctx.fillText(clipText(ctx, `✦ ${tr.name}`, cardW - 28), x + 14, y + 47);
        ctx.fillStyle = "#9aa6b1";
        ctx.font = "500 12px Fredoka, -apple-system, sans-serif";
        ctx.fillText(clipText(ctx, tr.desc, cardW - 28), x + 14, y + 70);
        ctx.textAlign = "right";
        ctx.fillStyle = "#bfe8ff";
        ctx.font = "700 12px Fredoka, -apple-system, sans-serif";
        ctx.fillText(`✺${COST.forge.cores}  ◉${COST.forge.coins}`, x + cardW - 12, y + 25);
        ctx.globalAlpha = 1;
        ctx.textAlign = "left";
        if (clicked && hov && api) api.forge(a.wt);
      });
      return;
    }
    if (mode === "compact") {
      // 5 mini-cards across — the whole card is the tap target.
      const gap = 10;
      const cardW = (pw - 44 - gap * 4) / 5;
      const cardH = Math.min(150, ch);
      ARCH.forEach((a, i) => {
        const x = px + 22 + i * (cardW + gap);
        const y = cy;
        const hov = hit(x, y, cardW, cardH);
        ctx.fillStyle = hov && can ? "rgba(191,232,255,0.12)" : "rgba(255,255,255,0.05)";
        rr(ctx, x, y, cardW, cardH, 9);
        ctx.fill();
        ctx.strokeStyle = can ? "rgba(203,178,74,0.6)" : "rgba(255,255,255,0.1)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.globalAlpha = can ? 1 : 0.5;
        ctx.textAlign = "left";
        ctx.fillStyle = "#ef9f27";
        ctx.font = "700 13px Fredoka, -apple-system, sans-serif";
        ctx.fillText(clipText(ctx, WEAPON_TYPE_NAMES[a.wt], cardW - 20), x + 10, y + 22);
        const tr = WEAPON_TRAITS[a.trait];
        ctx.fillStyle = "#ffd27a";
        ctx.font = "700 12px Fredoka, -apple-system, sans-serif";
        ctx.fillText(clipText(ctx, `✦ ${tr.name}`, cardW - 20), x + 10, y + 44);
        ctx.fillStyle = "#9aa6b1";
        ctx.font = "500 12px Fredoka, -apple-system, sans-serif";
        ctx.fillText(clipText(ctx, tr.desc, cardW - 20), x + 10, y + 64);
        ctx.fillStyle = "#bfe8ff";
        ctx.font = "700 12px Fredoka, -apple-system, sans-serif";
        ctx.fillText(`✺${COST.forge.cores} ◉${COST.forge.coins}`, x + 10, y + cardH - 14);
        ctx.globalAlpha = 1;
        if (clicked && hov && api) api.forge(a.wt);
      });
      return;
    }
    // Desktop — the original 2-column grid, untouched.
    const cardW = (pw - 44 - 16) / 2;
    const cardH = 64;
    ARCH.forEach((a, i) => {
      const col = i % 2;
      const rowi = Math.floor(i / 2);
      const x = px + 22 + col * (cardW + 16);
      const y = cy + rowi * (cardH + 12);
      const hov = hit(x, y, cardW, cardH);
      ctx.fillStyle = hov && can ? "rgba(191,232,255,0.12)" : "rgba(255,255,255,0.05)";
      rr(ctx, x, y, cardW, cardH, 9);
      ctx.fill();
      ctx.strokeStyle = can ? "rgba(203,178,74,0.6)" : "rgba(255,255,255,0.1)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.globalAlpha = can ? 1 : 0.5;
      ctx.textAlign = "left";
      ctx.fillStyle = "#ef9f27";
      ctx.font = "700 15px Fredoka, -apple-system, sans-serif";
      ctx.fillText(WEAPON_TYPE_NAMES[a.wt], x + 14, y + 24);
      ctx.fillStyle = "#ffd27a";
      ctx.font = "700 12px Fredoka, -apple-system, sans-serif";
      const tr = WEAPON_TRAITS[a.trait];
      ctx.fillText(`✦ ${tr.name}`, x + 14, y + 42);
      ctx.fillStyle = "#9aa6b1";
      ctx.font = "500 12px Fredoka, -apple-system, sans-serif";
      ctx.fillText(tr.desc, x + 14, y + 56);
      // cost, top-right
      ctx.textAlign = "right";
      ctx.fillStyle = "#bfe8ff";
      ctx.font = "700 12px Fredoka, -apple-system, sans-serif";
      ctx.fillText(`✺${COST.forge.cores}  ◉${COST.forge.coins}`, x + cardW - 12, y + 22);
      ctx.globalAlpha = 1;
      ctx.textAlign = "left";
      if (clicked && hov && api) api.forge(a.wt);
    });
  }

  // Temper / Reroll tabs — a scrollable inventory list with a per-row cost button.
  // Phone modes keep the same list, just reflowed: thumb-size (36px) buttons and
  // per-mode row heights; desktop geometry untouched.
  renderItemList(ctx, px, cy, pw, ch, player, input, hit, clicked, api, mx, my, mode) {
    const phone = mode === "portrait" || mode === "compact";
    const cost = COST[this.tab];
    const cores = getCores();
    const listX = px + (mode === "portrait" ? 16 : 22);
    const listW = pw - (mode === "portrait" ? 32 : 44);
    const rowH = mode === "portrait" ? 48 : mode === "compact" ? 40 : 44;
    const gap = 6;
    const rows = player.inventory.filter((it) => it.slot in player.equipped || it.affixes); // equippable gear
    const totalH = rows.length ? rows.length * (rowH + gap) - gap : 0;
    const maxScroll = Math.max(0, totalH - ch);
    const wheel = input.consumeWheel();
    if (maxScroll > 0 && wheel) this.scroll += wheel;
    this.scroll = Math.max(0, Math.min(this.scroll, maxScroll));

    ctx.save();
    ctx.beginPath();
    ctx.rect(listX, cy, listW, ch);
    ctx.clip();
    rows.forEach((item, i) => {
      const ry = cy + i * (rowH + gap) - this.scroll;
      if (ry + rowH < cy || ry > cy + ch) return;
      const btnW = 96;
      const btnH = phone ? 36 : 30;
      const btnX = listX + listW - btnW - 10;
      const btnY = ry + (rowH - btnH) / 2;
      const hov = my >= cy && my <= cy + ch && hit(btnX, btnY, btnW, btnH);
      const can = cores >= cost.cores && player.coins >= cost.coins;

      ctx.fillStyle = "rgba(255,255,255,0.05)";
      rr(ctx, listX, ry, listW, rowH, 8);
      ctx.fill();
      // icon disc
      const tint = slotTint(item);
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      rr(ctx, listX + 8, ry + rowH / 2 - 14, 28, 28, 8);
      ctx.fill();
      drawItemIcon(ctx, listX + 22, ry + rowH / 2, 13, item);
      // name + power
      ctx.textAlign = "left";
      ctx.fillStyle = RARITIES[item.rarity].color;
      ctx.font = "600 13px Fredoka, -apple-system, sans-serif";
      ctx.fillText(clipText(ctx, item.name, listW - (phone ? 158 : 200)), listX + 44, ry + (mode === "portrait" ? 20 : mode === "compact" ? 17 : 19));
      ctx.fillStyle = "#d8b06a";
      ctx.font = "700 12px Fredoka, -apple-system, sans-serif";
      ctx.fillText(`⚡ ${itemPower(item)}`, listX + 44, ry + (mode === "portrait" ? 36 : mode === "compact" ? 32 : 33));
      // cost button
      ctx.fillStyle = hov && can ? "#3b6f9a" : "rgba(191,232,255,0.14)";
      rr(ctx, btnX, btnY, btnW, btnH, 6);
      ctx.fill();
      ctx.globalAlpha = can ? 1 : 0.5;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = can ? "#dff1ff" : "#6b7689";
      ctx.font = "700 12px Fredoka, -apple-system, sans-serif";
      ctx.fillText(`✺${cost.cores} ◉${cost.coins}`, btnX + btnW / 2, btnY + btnH / 2 + 1);
      ctx.textBaseline = "alphabetic";
      ctx.globalAlpha = 1;
      if (clicked && hov && api) {
        if (this.tab === "temper") api.temper(item);
        else api.reroll(item);
      }
    });
    ctx.restore();
    if (rows.length === 0) {
      ctx.textAlign = "center";
      ctx.fillStyle = "#5d6678";
      ctx.font = "500 14px Fredoka, -apple-system, sans-serif";
      ctx.fillText("No gear to work on yet.", listX + listW / 2, cy + 40);
      ctx.textAlign = "left";
    }
  }
}
