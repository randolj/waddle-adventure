// Immediate-mode inventory + shop overlay. Drawing and click handling happen
// together in render(); the caller pauses the game while this is open.

import { RARITIES, SLOTS, SLOT_NAMES, WEAPON_TYPE_NAMES, WEAPON_TRAITS, traitForItem, sellValue, itemPower } from "./items.js";
import { roundRect as rr, fitScale } from "./utils.js";

const MOD_LABEL = {
  meleeDamage: "dmg",
  attackRange: "range",
  attackCooldown: "atk speed",
  knockback: "knockback",
  attackArc: "arc",
  moveSpeed: "move",
  maxHp: "max HP",
  dashSpeed: "dash spd",
  dashTime: "dash length",
  dashRest: "dash cd",
  iframeAfter: "dash i-frames",
  dsHitIframe: "strike i-frames",
  critChance: "crit",
  lifesteal: "lifesteal",
  damageReduction: "dmg resist",
  projSpeed: "proj speed",
  projR: "proj size",
  hitCount: "hits/swing",
  windup: "windup",
  heavy: "heavy",
  frostTouch: "frost",
};

// Mods stored as 0..1 fractions are shown as percentages.
const PCT_MODS = new Set(["critChance", "lifesteal", "damageReduction"]);
// Stats where a LOWER value is the upgrade (faster attacks, shorter dash cooldown,
// less mace wind-up).
const LOWER_BETTER = new Set(["attackCooldown", "dashRest", "windup"]);

function trim(v) {
  return Math.round(v * 100) / 100;
}

// Per-slot accent — the icon-disc tint + the row's type tag — so item categories
// (weapon vs armor vs cloak vs trinket vs relic) read apart at a glance.
const SLOT_TINT = { weapon: "#e8b35a", armor: "#8fb7ff", cloak: "#c4a6ff", trinket: "#7fe0c0", relic: "#ef9f27" };
// Inventory grouping: weapons (by type) → armor → cloak → trinket → relic.
const SLOT_ORDER = { weapon: 0, armor: 1, cloak: 2, trinket: 3, relic: 4 };
const WTYPE_ORDER = { sword: 0, mace: 1, dagger: 2, bow: 3, staff: 4 };
export function slotTint(item) {
  return SLOT_TINT[item.slot] || "#9aa6b1";
}
export function slotTag(item) {
  return item.slot === "weapon" ? (WEAPON_TYPE_NAMES[item.weaponType] || "Weapon").toUpperCase() : (SLOT_NAMES[item.slot] || item.slot).toUpperCase();
}
export function withAlpha(hex, a) {
  const h = hex.replace("#", "");
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}

// Truncate text with an ellipsis to fit maxW (uses the current ctx.font).
export function clipText(ctx, str, maxW) {
  if (ctx.measureText(str).width <= maxW) return str;
  let s = str;
  while (s.length && ctx.measureText(s + "…").width > maxW) s = s.slice(0, -1);
  return s + "…";
}

function modsSummary(item) {
  const parts = [];
  for (const [k, v] of Object.entries(item.mods)) {
    if (typeof v === "boolean") {
      if (!v) continue;
      if (k === "dashEnabled") parts.push("grants dash");
      else if (k === "heavy") parts.push("heavy");
      else if (k === "frostTouch") parts.push("frost (chills)");
      continue;
    }
    if (PCT_MODS.has(k)) parts.push(`${v > 0 ? "+" : ""}${Math.round(v * 100)}% ${MOD_LABEL[k] || k}`);
    else parts.push(`${v > 0 ? "+" : ""}${trim(v)} ${MOD_LABEL[k] || k}`);
  }
  return parts.join("  ");
}

// Icon dispatch — each item's silhouette reflects its kind: a weapon's archetype
// (sword/mace/dagger/bow/staff), armor, cloak, or trinket.
export function drawItemIcon(ctx, cx, cy, s, item) {
  const col = item.color || "#aaa";
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineJoin = "round";
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#14110e";
  if (item.slot === "weapon") {
    const wt = item.weaponType || "sword";
    if (wt === "mace") iconMace(ctx, s, col);
    else if (wt === "dagger") iconDaggers(ctx, s, col);
    else if (wt === "bow") iconBow(ctx, s, col);
    else if (wt === "staff") iconStaff(ctx, s, col);
    else iconSword(ctx, s, col);
  } else if (item.slot === "armor") {
    iconArmor(ctx, s, col);
  } else if (item.slot === "cloak") {
    iconCloak(ctx, s, col);
  } else {
    iconGem(ctx, s, col);
  }
  ctx.restore();
}

function iconSword(ctx, s, col) {
  ctx.rotate(-Math.PI / 4);
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(-2, -s * 0.55);
  ctx.lineTo(2, -s * 0.55);
  ctx.lineTo(3, s * 0.12);
  ctx.lineTo(0, s * 0.26);
  ctx.lineTo(-3, s * 0.12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#b7913f";
  ctx.fillRect(-s * 0.24, s * 0.12, s * 0.48, 4);
  ctx.strokeRect(-s * 0.24, s * 0.12, s * 0.48, 4);
  ctx.fillStyle = "#5c3517";
  ctx.fillRect(-2, s * 0.16, 4, s * 0.3);
  ctx.strokeRect(-2, s * 0.16, 4, s * 0.3);
}

function iconMace(ctx, s, col) {
  // Shaft + a round spiked head.
  ctx.strokeStyle = "#5c3517";
  ctx.lineWidth = Math.max(2, s * 0.16);
  ctx.beginPath();
  ctx.moveTo(s * 0.32, s * 0.5);
  ctx.lineTo(-s * 0.12, -s * 0.1);
  ctx.stroke();
  ctx.strokeStyle = "#14110e";
  ctx.lineWidth = 1.5;
  const hx = -s * 0.2;
  const hy = -s * 0.22;
  const hr = s * 0.3;
  ctx.fillStyle = "#cfd6e0";
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(hx + Math.cos(a) * hr, hy + Math.sin(a) * hr);
    ctx.lineTo(hx + Math.cos(a) * (hr + s * 0.16), hy + Math.sin(a) * (hr + s * 0.16));
    ctx.lineTo(hx + Math.cos(a + 0.4) * hr, hy + Math.sin(a + 0.4) * hr);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(hx, hy, hr, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function iconDaggers(ctx, s, col) {
  // Two crossed short blades.
  for (const dir of [-1, 1]) {
    ctx.save();
    ctx.translate(dir * s * 0.16, 0);
    ctx.rotate((dir * Math.PI) / 7);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(-1.6, -s * 0.4);
    ctx.lineTo(1.6, -s * 0.4);
    ctx.lineTo(2, s * 0.06);
    ctx.lineTo(0, s * 0.18);
    ctx.lineTo(-2, s * 0.06);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#5c3517";
    ctx.fillRect(-s * 0.12, s * 0.06, s * 0.24, 3);
    ctx.strokeRect(-s * 0.12, s * 0.06, s * 0.24, 3);
    ctx.restore();
  }
}

function iconBow(ctx, s, col) {
  // A drawn bow with a string and nocked arrow.
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(2, s * 0.16);
  ctx.beginPath();
  ctx.arc(s * 0.2, 0, s * 0.5, Math.PI * 0.62, Math.PI * 1.38);
  ctx.stroke();
  ctx.strokeStyle = "rgba(240,245,255,0.85)";
  ctx.lineWidth = 1;
  const ay = Math.sin(Math.PI * 0.62) * s * 0.5;
  ctx.beginPath();
  ctx.moveTo(s * 0.2 + Math.cos(Math.PI * 0.62) * s * 0.5, -ay);
  ctx.lineTo(s * 0.2 + Math.cos(Math.PI * 0.62) * s * 0.5, ay);
  ctx.stroke();
  ctx.strokeStyle = "#b7913f";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-s * 0.42, 0);
  ctx.lineTo(s * 0.42, 0);
  ctx.stroke();
  ctx.fillStyle = "#e6edf6";
  ctx.beginPath();
  ctx.moveTo(s * 0.5, 0);
  ctx.lineTo(s * 0.34, -s * 0.12);
  ctx.lineTo(s * 0.34, s * 0.12);
  ctx.closePath();
  ctx.fill();
}

function iconStaff(ctx, s, col) {
  // Rod + glowing orb.
  ctx.strokeStyle = "#6a4a28";
  ctx.lineWidth = Math.max(2, s * 0.16);
  ctx.beginPath();
  ctx.moveTo(s * 0.12, s * 0.5);
  ctx.lineTo(-s * 0.06, -s * 0.18);
  ctx.stroke();
  ctx.save();
  ctx.shadowColor = "#9fd8ff";
  ctx.shadowBlur = 6;
  ctx.fillStyle = col === "#aaa" ? "#bfe8ff" : col;
  ctx.strokeStyle = "#14110e";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(-s * 0.1, -s * 0.34, s * 0.26, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.beginPath();
  ctx.arc(-s * 0.18, -s * 0.42, s * 0.08, 0, Math.PI * 2);
  ctx.fill();
}

function iconArmor(ctx, s, col) {
  // A breastplate.
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(-s * 0.42, -s * 0.34);
  ctx.quadraticCurveTo(0, -s * 0.5, s * 0.42, -s * 0.34);
  ctx.lineTo(s * 0.3, s * 0.36);
  ctx.lineTo(0, s * 0.5);
  ctx.lineTo(-s * 0.3, s * 0.36);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "rgba(20,17,14,0.5)";
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.4);
  ctx.lineTo(0, s * 0.44);
  ctx.stroke();
}

function iconCloak(ctx, s, col) {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(-s * 0.5, -s * 0.18);
  ctx.quadraticCurveTo(0, -s * 0.4, s * 0.5, -s * 0.16);
  ctx.lineTo(s * 0.5, s * 0.02);
  ctx.quadraticCurveTo(0, -s * 0.2, -s * 0.5, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(s * 0.22, -s * 0.08);
  ctx.lineTo(s * 0.46, s * 0.46);
  ctx.lineTo(s * 0.16, s * 0.36);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function iconGem(ctx, s, col) {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.45);
  ctx.lineTo(s * 0.36, -s * 0.04);
  ctx.lineTo(0, s * 0.45);
  ctx.lineTo(-s * 0.36, -s * 0.04);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.beginPath();
  ctx.moveTo(-s * 0.36, -s * 0.04);
  ctx.lineTo(s * 0.36, -s * 0.04);
  ctx.stroke();
}

// Tiny padlock glyph for the per-item lock toggle (drawn — emoji fonts vary too much).
// `closed` = locked (shackle down + gold), open = a lifted shackle.
function drawLockIcon(ctx, x, y, s, color, closed) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  if (closed) ctx.arc(x + s / 2, y + s * 0.42, s * 0.3, Math.PI, 0);
  else ctx.arc(x + s * 0.30, y + s * 0.40, s * 0.3, Math.PI, -Math.PI * 0.25);
  ctx.stroke();
  ctx.fillStyle = color;
  rr(ctx, x, y + s * 0.42, s, s * 0.58, 2);
  ctx.fill();
}

export class InventoryUI {
  constructor() {
    this.open = false;
    this.mode = "inventory";
    this.shop = null;
    this.shopTab = "buy";
    this.scroll = 0; // item-list scroll offset (px)
    this.filter = "all"; // gear-category filter tab: "all" | one of SLOTS
  }

  isOpen() {
    return this.open;
  }
  openInventory() {
    this.open = true;
    this.mode = "inventory";
    this.scroll = 0;
    this.filter = "all";
  }
  openShop(stock, title = "Camp shop") {
    this.open = true;
    this.mode = "shop";
    this.shop = stock;
    this.shopTitle = title;
    this.shopTab = "buy";
    this.scroll = 0;
    this.filter = "all";
  }
  close() {
    this.open = false;
  }

  render(ctx, w, h, player, input, shopApi) {
    // Dim the whole real screen, then scale the fixed-size panel to fit any viewport
    // (so the bag fits portrait/landscape phones). Pointer coords map into ref space.
    ctx.fillStyle = "rgba(8,10,18,0.66)";
    ctx.fillRect(0, 0, w, h);
    // Three layouts (the dailyui/metaui pattern — reflow, don't shrink):
    //  - desktop:           the original 768×560 two-column design, pixel-identical
    //  - compact landscape: a squat 768×340 ref — the same two-column skeleton with a
    //                       slimmer equip column + shorter rows (a landscape phone
    //                       scaled the tall ref to ~0.52 → ~7px text)
    //  - portrait:          a 420×680 ref — equipped gear as a strip across the top,
    //                       then full-width rows (side-by-side columns are unreadable
    //                       at portrait widths)
    const portrait = h > w;
    const compact = !portrait && h < 480;
    const phone = portrait || compact;
    const fit = fitScale(ctx, w, h, portrait ? 420 : 768, portrait ? 680 : compact ? 340 : 560, input);
    w = fit.w;
    h = fit.h;
    const mx = fit.mx;
    const my = fit.my;
    const clicked = input.consumeClick();
    const hit = (x, y, bw, bh) => mx >= x && mx <= x + bw && my >= y && my <= y + bh;

    const pw = Math.min(portrait ? 404 : compact ? 744 : 720, w - (portrait ? 16 : compact ? 24 : 48));
    const ph = Math.min(portrait ? 664 : compact ? 328 : 520, h - (portrait ? 16 : compact ? 12 : 48));
    const px = (w - pw) / 2;
    const py = (h - ph) / 2;
    rr(ctx, px, py, pw, ph, 14);
    ctx.fillStyle = "rgba(18,22,32,0.97)";
    ctx.fill();
    ctx.strokeStyle = "rgba(120,140,170,0.3)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Header.
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillStyle = "#e9eef6";
    ctx.font = `600 ${compact ? 17 : 20}px Fredoka, -apple-system, sans-serif`;
    ctx.fillText(this.mode === "shop" ? this.shopTitle || "Shop" : "Inventory", px + 22, py + (compact ? 26 : 34));

    // Coins.
    ctx.textAlign = "right";
    ctx.font = "700 16px Fredoka, -apple-system, sans-serif";
    ctx.fillStyle = "#ffd166";
    ctx.fillText(`◉ ${player.coins}`, px + pw - (phone ? 56 : 46), py + (compact ? 25 : 33));
    // Close button (a 36px thumb target on phones).
    const cbS = phone ? 36 : 22;
    const cb = { x: px + pw - (phone ? 46 : 36), y: py + (phone ? 8 : 16), w: cbS, h: cbS };
    ctx.fillStyle = hit(cb.x, cb.y, cb.w, cb.h) ? "rgba(255,90,90,0.9)" : "rgba(255,255,255,0.12)";
    rr(ctx, cb.x, cb.y, cb.w, cb.h, 5);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 2;
    const gi = phone ? 12 : 6;
    ctx.beginPath();
    ctx.moveTo(cb.x + gi, cb.y + gi);
    ctx.lineTo(cb.x + cb.w - gi, cb.y + cb.h - gi);
    ctx.moveTo(cb.x + cb.w - gi, cb.y + gi);
    ctx.lineTo(cb.x + gi, cb.y + cb.h - gi);
    ctx.stroke();
    if (clicked && hit(cb.x, cb.y, cb.w, cb.h)) {
      this.close();
      fit.done();
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      return;
    }

    // Stats strip.
    const s = player.stats;
    const dashTxt = s.dashEnabled ? `${Math.round(s.dashSpeed * s.dashTime)}px` : "—";
    const stats = [
      ["⚡ Power", player.power],
      ["Damage", s.meleeDamage],
      ["Crit", `${Math.round((s.critChance || 0) * 100)}%`],
      ["Range", s.attackRange],
      ["Atk/s", trim(1 / s.attackCooldown)],
      ["Move", s.moveSpeed],
      ["Dash", dashTxt],
      ["Max HP", player.maxHp],
    ];
    if (s.lifesteal > 0) stats.push(["Lifesteal", `${Math.round(s.lifesteal * 100)}%`]);
    if (s.damageReduction > 0) stats.push(["Resist", `${Math.round(s.damageReduction * 100)}%`]);
    const stripY = py + (portrait ? 48 : compact ? 44 : 50);
    if (portrait) {
      // PORTRAIT: 5 boxes across × 2 rows — a single row of 8-10 is unreadable at 420.
      const sbw = (pw - 24) / 5;
      stats.forEach((st, i) => {
        const bx = px + 12 + (i % 5) * sbw;
        const byy = stripY + Math.floor(i / 5) * 40;
        const isPwr = st[0] === "⚡ Power";
        ctx.fillStyle = isPwr ? "rgba(255,210,122,0.13)" : "rgba(255,255,255,0.05)";
        rr(ctx, bx, byy, sbw - 6, 34, 6);
        ctx.fill();
        ctx.textAlign = "left";
        ctx.fillStyle = isPwr ? "#d8b06a" : "#8b97ab";
        ctx.font = "600 12px Fredoka, -apple-system, sans-serif";
        // The "⚡ " prefix doesn't fit the narrow portrait tiles — the gold tint already
        // marks the Power box, so the glyph is dropped rather than clipping to "POW…".
        ctx.fillText(clipText(ctx, st[0].replace("⚡ ", "").toUpperCase(), sbw - 18), bx + 8, byy + 14);
        ctx.fillStyle = isPwr ? "#ffd27a" : "#e9eef6";
        ctx.font = "700 14px Fredoka, -apple-system, sans-serif";
        ctx.fillText(String(st[1]), bx + 8, byy + 29);
      });
    } else {
      const boxW = (pw - 44) / stats.length;
      stats.forEach((st, i) => {
        const bx = px + 22 + i * boxW;
        const isPwr = st[0] === "⚡ Power";
        ctx.fillStyle = isPwr ? "rgba(255,210,122,0.13)" : "rgba(255,255,255,0.05)";
        rr(ctx, bx, stripY, boxW - 8, compact ? 34 : 38, 6);
        ctx.fill();
        ctx.textAlign = "left";
        ctx.fillStyle = isPwr ? "#d8b06a" : "#8b97ab";
        ctx.font = "600 12px Fredoka, -apple-system, sans-serif";
        const lbl = st[0].toUpperCase();
        ctx.fillText(compact ? clipText(ctx, lbl, boxW - 16) : lbl, bx + 10, stripY + (compact ? 14 : 15));
        ctx.fillStyle = isPwr ? "#ffd27a" : "#e9eef6";
        ctx.font = `700 ${compact ? 14 : 15}px Fredoka, -apple-system, sans-serif`;
        ctx.fillText(String(st[1]), bx + 10, stripY + (compact ? 29 : 31));
      });
    }

    // Top of the equip column + list (desktop/compact), or of the list area alone
    // (portrait, where the equip strip sits between the stats grid and the list).
    const contentY = py + (portrait ? 208 : compact ? 86 : 104);
    const contentH = ph - (portrait ? 208 + 26 : compact ? 86 + 16 : 104 + 18);

    // --- Equipment: a horizontal strip of slot boxes (portrait) or the left column ---
    let colW = 0;
    if (portrait) {
      const eqY = py + 130;
      const eqH = 70;
      const eg = 6;
      const ew = (pw - 24 - eg * (SLOTS.length - 1)) / SLOTS.length;
      SLOTS.forEach((slot, i) => {
        const sx = px + 12 + i * (ew + eg);
        const item = player.equipped[slot];
        const hovered = hit(sx, eqY, ew, eqH);
        ctx.fillStyle = hovered && item ? "rgba(255,90,90,0.14)" : "rgba(255,255,255,0.04)";
        rr(ctx, sx, eqY, ew, eqH, 8);
        ctx.fill();
        ctx.strokeStyle = item ? RARITIES[item.rarity].color : "rgba(255,255,255,0.12)";
        ctx.lineWidth = item ? 1.5 : 1;
        ctx.stroke();

        ctx.textAlign = "center";
        ctx.fillStyle = "#7e8aa0";
        ctx.font = "600 12px Fredoka, -apple-system, sans-serif";
        ctx.fillText(clipText(ctx, SLOT_NAMES[slot].toUpperCase(), ew - 8), sx + ew / 2, eqY + 16);

        if (item) {
          drawItemIcon(ctx, sx + ew / 2, eqY + 38, 13, item);
          ctx.fillStyle = RARITIES[item.rarity].color;
          ctx.font = "600 12px Fredoka, -apple-system, sans-serif";
          ctx.fillText(clipText(ctx, item.name, ew - 8), sx + ew / 2, eqY + 62);
          if (clicked && hovered) player.unequip(slot); // tap an equipped piece = unequip
        } else {
          ctx.fillStyle = "#5d6678";
          ctx.font = "italic 12px Fredoka, -apple-system, sans-serif";
          ctx.fillText("—", sx + ew / 2, eqY + 44);
        }
      });
      ctx.textAlign = "left";
    } else {
      // --- Left: equipment slots (responsive width; slimmer on compact landscape) ---
      colW = compact ? 150 : Math.max(150, Math.min(218, pw * 0.34));
      const slotGap = compact ? 6 : 10;
      const slotH = (contentH - slotGap * (SLOTS.length - 1)) / SLOTS.length;
      SLOTS.forEach((slot, i) => {
        const sx = px + 22;
        const sy = contentY + i * (slotH + slotGap);
        const item = player.equipped[slot];
        const hovered = hit(sx, sy, colW, slotH);
        ctx.fillStyle = hovered && item ? "rgba(255,90,90,0.14)" : "rgba(255,255,255,0.04)";
        rr(ctx, sx, sy, colW, slotH, 8);
        ctx.fill();
        ctx.strokeStyle = item ? RARITIES[item.rarity].color : "rgba(255,255,255,0.12)";
        ctx.lineWidth = item ? 1.5 : 1;
        ctx.stroke();

        ctx.textAlign = "left";
        ctx.fillStyle = "#7e8aa0";
        ctx.font = "600 12px Fredoka, -apple-system, sans-serif";
        ctx.fillText(SLOT_NAMES[slot].toUpperCase(), sx + 14, sy + (compact ? 14 : 20));

        if (item) {
          if (compact) {
            drawItemIcon(ctx, sx + 16, sy + slotH - 13, 10, item);
            ctx.fillStyle = RARITIES[item.rarity].color;
            ctx.font = "600 12px Fredoka, -apple-system, sans-serif";
            ctx.fillText(clipText(ctx, item.name, colW - 40), sx + 28, sy + slotH - 9);
          } else {
            drawItemIcon(ctx, sx + 24, sy + slotH - 22, 15, item);
            ctx.fillStyle = RARITIES[item.rarity].color;
            ctx.font = "600 14px Fredoka, -apple-system, sans-serif";
            ctx.fillText(clipText(ctx, item.name, colW - 56), sx + 44, sy + slotH - 24);
            ctx.fillStyle = "#7e8aa0";
            ctx.font = "500 12px Fredoka, -apple-system, sans-serif";
            ctx.fillText("click to unequip", sx + 44, sy + slotH - 10);
          }
          if (clicked && hovered) player.unequip(slot);
        } else {
          ctx.fillStyle = "#5d6678";
          ctx.font = compact ? "italic 12px Fredoka, -apple-system, sans-serif" : "italic 13px Fredoka, -apple-system, sans-serif";
          ctx.fillText("— empty —", sx + 14, sy + slotH - (compact ? 9 : 18));
        }
      });
    }

    // --- Right: item list (inventory / shop buy / shop sell); full-width on portrait ---
    const listX = portrait ? px + 12 : px + 22 + colW + 18;
    const listW = portrait ? pw - 24 : pw - (colW + 18) - 44;
    const isShop = this.mode === "shop";
    let listTop = contentY;

    // Buy / Sell tabs (shop only) — full-width thumb targets on portrait.
    if (isShop) {
      const th = phone ? 36 : 26;
      const tw = portrait ? (listW - 8) / 2 : 80;
      [["buy", "Buy"], ["sell", "Sell"]].forEach(([key, label], i) => {
        const tx = listX + i * (tw + 8);
        const active = this.shopTab === key;
        ctx.fillStyle = active ? "rgba(255,209,102,0.18)" : "rgba(255,255,255,0.05)";
        rr(ctx, tx, contentY, tw, th, 6);
        ctx.fill();
        ctx.strokeStyle = active ? "#ffd166" : "rgba(255,255,255,0.12)";
        ctx.lineWidth = active ? 1.5 : 1;
        ctx.stroke();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = active ? "#ffd166" : "#8b97ab";
        ctx.font = "600 13px Fredoka, -apple-system, sans-serif";
        ctx.fillText(label, tx + tw / 2, contentY + th / 2 + 1);
        if (clicked && hit(tx, contentY, tw, th)) {
          this.shopTab = key;
          this.scroll = 0;
        }
      });
      ctx.textBaseline = "alphabetic";
      listTop = contentY + th + (phone ? 8 : 10);
    }

    // Category filter tabs — quick sorting by gear type (All / Weapon / Armor / ...).
    {
      const tabs = [["all", "All"], ...SLOTS.map((s) => [s, SLOT_NAMES[s]])];
      const tg = 6;
      const fth = phone ? 36 : 24;
      const ftw = (listW - tg * (tabs.length - 1)) / tabs.length;
      ctx.textBaseline = "middle";
      tabs.forEach(([key, label], i) => {
        const tx = listX + i * (ftw + tg);
        const active = this.filter === key;
        ctx.fillStyle = active ? "rgba(127,210,255,0.16)" : "rgba(255,255,255,0.05)";
        rr(ctx, tx, listTop, ftw, fth, 6);
        ctx.fill();
        ctx.strokeStyle = active ? "#7fd2ff" : "rgba(255,255,255,0.12)";
        ctx.lineWidth = active ? 1.5 : 1;
        ctx.stroke();
        ctx.textAlign = "center";
        ctx.fillStyle = active ? "#7fd2ff" : "#8b97ab";
        ctx.font = "600 12px Fredoka, -apple-system, sans-serif";
        ctx.fillText(phone ? clipText(ctx, label, ftw - 6) : label, tx + ftw / 2, listTop + fth / 2 + 1);
        if (clicked && hit(tx, listTop, ftw, fth)) {
          this.filter = key;
          this.scroll = 0;
        }
      });
      ctx.textBaseline = "alphabetic";
      listTop += fth + 8;
    }

    const view = !isShop ? "inv" : this.shopTab; // "inv" | "buy" | "sell"

    // --- PREMIUM CRATE (shop Buy view): one high-rarity item per day, unsealed via a
    // rewarded ad. Drawn as a golden feature row above the stock; clicking hands off to
    // main.js (closes the shop + opens the ad offer). Hidden once claimed today.
    const premium = view === "buy" && shopApi && shopApi.premium ? shopApi.premium() : null;
    if (premium) {
      const ph2 = 46;
      const hovP = my >= listTop && my <= listTop + ph2 && hit(listX, listTop, listW, ph2);
      ctx.fillStyle = hovP ? "rgba(255,209,102,0.22)" : "rgba(255,209,102,0.12)";
      rr(ctx, listX, listTop, listW, ph2, 8);
      ctx.fill();
      ctx.strokeStyle = "#ffd166";
      ctx.lineWidth = 1.5;
      rr(ctx, listX, listTop, listW, ph2, 8);
      ctx.stroke();
      // Icon disc + item preview.
      const tintP = slotTint(premium);
      ctx.fillStyle = withAlpha(tintP, 0.2);
      rr(ctx, listX + 11, listTop + ph2 / 2 - 15, 30, 30, 9);
      ctx.fill();
      drawItemIcon(ctx, listX + 26, listTop + ph2 / 2, 14, premium);
      ctx.textAlign = "left";
      ctx.fillStyle = RARITIES[premium.rarity].color;
      ctx.font = "600 14px Fredoka, -apple-system, sans-serif";
      ctx.fillText(clipText(ctx, premium.name, listW - 200), listX + 46, listTop + 19);
      ctx.fillStyle = "#ffd166";
      ctx.font = `700 ${phone ? 12 : 11}px Fredoka, -apple-system, sans-serif`;
      ctx.fillText("PREMIUM CRATE · today only", listX + 46, listTop + 35);
      // Right side: a small camcorder glyph + "watch a video".
      ctx.textAlign = "right";
      ctx.fillStyle = hovP ? "#ffe9b0" : "#ffd166";
      ctx.font = "700 12px Fredoka, -apple-system, sans-serif";
      ctx.fillText("watch a video", listX + listW - 12, listTop + ph2 / 2 + 4);
      const vw = 14;
      const vx = listX + listW - 12 - ctx.measureText("watch a video").width - vw - 8;
      const vy = listTop + ph2 / 2 - 5;
      ctx.fillStyle = hovP ? "#ffe9b0" : "#ffd166";
      rr(ctx, vx, vy, vw * 0.72, 10, 2.5);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(vx + vw * 0.72 + 2, vy + 2.4);
      ctx.lineTo(vx + vw, vy);
      ctx.lineTo(vx + vw, vy + 10);
      ctx.lineTo(vx + vw * 0.72 + 2, vy + 7.6);
      ctx.closePath();
      ctx.fill();
      ctx.textAlign = "left";
      if (clicked && hovP) shopApi.claimPremium();
      listTop += ph2 + 8;
    }

    let rows = view === "buy" ? this.shop.slice() : player.inventory.map((it) => ({ item: it }));
    if (this.filter !== "all") rows = rows.filter((r) => r.item.slot === this.filter);
    // Group by slot (weapons by type), best power first within each group.
    rows.sort((a, b) => {
      const A = a.item;
      const B = b.item;
      const sa = SLOT_ORDER[A.slot] ?? 9;
      const sb = SLOT_ORDER[B.slot] ?? 9;
      if (sa !== sb) return sa - sb;
      if (A.slot === "weapon") {
        const wa = WTYPE_ORDER[A.weaponType] ?? 9;
        const wb = WTYPE_ORDER[B.weaponType] ?? 9;
        if (wa !== wb) return wa - wb;
      }
      return itemPower(B) - itemPower(A);
    });
    const listH = contentY + contentH - listTop;
    const rowH = portrait ? 44 : compact ? 38 : 40;
    const gap = 6;
    // Per-mode text baselines inside a row (desktop values = the original constants).
    const nameY = portrait ? 18 : compact ? 15 : 16;
    const l2Y = portrait ? 34 : compact ? 30 : 31;
    const midY = rowH / 2 + 5; // single right-hand action label (ry+25 on desktop)
    const sellY1 = portrait ? 19 : compact ? 16 : 17;
    const sellY2 = portrait ? 36 : compact ? 31 : 33;
    const textMaxW = listW - 46 - 100; // leave room for the right-side label + the lock toggle
    let hoveredItem = null;

    // Scroll the list when it overflows: wheel adjusts the offset, clamped so the
    // last row is always reachable (clamp again in case the list just shrank).
    const totalH = rows.length ? rows.length * (rowH + gap) - gap : 0;
    const maxScroll = Math.max(0, totalH - listH);
    const wheel = input.consumeWheel();
    if (maxScroll > 0 && wheel) this.scroll += wheel;
    this.scroll = Math.max(0, Math.min(this.scroll, maxScroll));
    const scroll = this.scroll;

    ctx.save();
    ctx.beginPath();
    ctx.rect(listX, listTop, listW, listH);
    ctx.clip();
    rows.forEach((entry, i) => {
      const item = entry.item;
      const ry = listTop + i * (rowH + gap) - scroll;
      if (ry + rowH < listTop || ry > listTop + listH) return; // cull off-screen rows (visual + clicks)
      // Only hover/click rows whose mouse position is inside the list viewport.
      const hovered = my >= listTop && my <= listTop + listH && hit(listX, ry, listW, rowH);
      if (hovered) hoveredItem = { item, x: mx, y: my };
      const equipped = player.isEquipped(item);
      const sold = entry.sold;
      const locked = item.classes && !item.classes.includes(player.class); // off-class gear you can't equip
      const rlx = listX + listW - 14;

      // Thin divider between item-type groups (weapons | armor | cloak | ...).
      if (i > 0 && rows[i - 1].item.slot !== item.slot) {
        ctx.fillStyle = "rgba(255,255,255,0.09)";
        ctx.fillRect(listX + 6, ry - gap / 2, listW - 12, 1);
      }

      ctx.fillStyle = sold ? "rgba(255,255,255,0.02)" : hovered ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.05)";
      rr(ctx, listX, ry, listW, rowH, 8);
      ctx.fill();
      ctx.fillStyle = RARITIES[item.rarity].color;
      ctx.globalAlpha = sold || locked ? 0.4 : 1;
      rr(ctx, listX, ry, 4, rowH, 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Slot-tinted disc behind the icon — color-codes the category.
      const tint = slotTint(item);
      ctx.fillStyle = withAlpha(tint, locked ? 0.08 : 0.18);
      rr(ctx, listX + 11, ry + rowH / 2 - 15, 30, 30, 9);
      ctx.fill();
      ctx.strokeStyle = withAlpha(tint, locked ? 0.25 : 0.55);
      ctx.lineWidth = 1;
      rr(ctx, listX + 11, ry + rowH / 2 - 15, 30, 30, 9);
      ctx.stroke();

      // Off-class rows are darkened so it's obvious you can't use them.
      ctx.globalAlpha = locked ? 0.45 : 1;
      drawItemIcon(ctx, listX + 26, ry + rowH / 2, 14, item);

      ctx.textAlign = "left";
      ctx.fillStyle = sold ? "#5d6678" : RARITIES[item.rarity].color;
      ctx.font = "600 14px Fredoka, -apple-system, sans-serif";
      ctx.fillText(clipText(ctx, item.name, textMaxW), listX + 46, ry + nameY);
      // Line 2: slot-type tag + item power (⚡) + the mod summary.
      const tag = slotTag(item);
      ctx.font = "700 12px Fredoka, -apple-system, sans-serif";
      ctx.fillStyle = tint;
      ctx.fillText(tag, listX + 46, ry + l2Y);
      let lx2 = listX + 46 + ctx.measureText(tag).width + 8;
      const pwTxt = "⚡" + itemPower(item);
      ctx.fillStyle = "#d8b06a";
      ctx.fillText(pwTxt, lx2, ry + l2Y);
      lx2 += ctx.measureText(pwTxt).width + 8;
      ctx.fillStyle = "#8b97ab";
      ctx.font = "500 12px Fredoka, -apple-system, sans-serif";
      ctx.fillText(clipText(ctx, modsSummary(item), Math.max(8, listX + 46 + textMaxW - lx2)), lx2, ry + l2Y);
      ctx.globalAlpha = 1;

      // Per-item LOCK toggle (owned items only) — a locked item can't be sold at the shop.
      // Checked BEFORE the row's own click action so toggling never equips/sells.
      let lockClick = false;
      if (view !== "buy") {
        const lkX = listX + listW - 92;
        const lkY = ry + rowH / 2 - 8;
        const ls = phone ? 11 : 5; // ~36px touch slop on phones (desktop unchanged)
        const lkHov = hovered && mx >= lkX - ls && mx <= lkX + 14 + ls && my >= lkY - ls && my <= lkY + 14 + ls;
        drawLockIcon(ctx, lkX, lkY, 13, item.locked ? "#ffd166" : lkHov ? "#aab6cc" : "rgba(255,255,255,0.22)", !!item.locked);
        if (clicked && lkHov) {
          item.locked = !item.locked;
          lockClick = true;
        }
      }

      ctx.textAlign = "right";
      if (view === "buy") {
        if (sold) {
          ctx.fillStyle = "#5d6678";
          ctx.font = "600 12px Fredoka, -apple-system, sans-serif";
          ctx.fillText("sold", rlx, ry + midY);
        } else {
          const afford = player.coins >= entry.price;
          ctx.fillStyle = afford ? "#ffd166" : "#9a5d5d";
          ctx.font = "700 14px Fredoka, -apple-system, sans-serif";
          ctx.fillText(`◉ ${entry.price}`, rlx, ry + midY);
          if (clicked && hovered && afford) {
            player.coins -= entry.price;
            player.addItem(item);
            entry.sold = true;
          }
        }
      } else if (view === "sell") {
        if (item.locked) {
          // Locked gear is sale-proof — unlock it (padlock) to sell.
          ctx.fillStyle = "#7e8aa0";
          ctx.font = "600 12px Fredoka, -apple-system, sans-serif";
          ctx.fillText("locked", rlx, ry + midY);
        } else {
          ctx.fillStyle = "#ffd166";
          ctx.font = "700 14px Fredoka, -apple-system, sans-serif";
          ctx.fillText(`+◉ ${sellValue(item)}`, rlx, ry + sellY1);
          ctx.fillStyle = equipped ? "#7CFC9B" : "#7e8aa0";
          ctx.font = "600 12px Fredoka, -apple-system, sans-serif";
          ctx.fillText(equipped ? "equipped" : "sell", rlx, ry + sellY2);
          if (clicked && hovered && !lockClick) {
            player.coins += sellValue(item);
            player.removeItem(item);
          }
        }
      } else if (!(item.slot in player.equipped)) {
        // Non-equippable (e.g. a sealed relic).
        ctx.fillStyle = "#ef9f27";
        ctx.font = "600 12px Fredoka, -apple-system, sans-serif";
        ctx.fillText("SEALED", listX + listW - 12, ry + midY);
      } else if (item.classes && !item.classes.includes(player.class)) {
        // Class-locked armor for a different class.
        ctx.fillStyle = "#c77";
        ctx.font = "600 12px Fredoka, -apple-system, sans-serif";
        ctx.fillText(`${item.classes.map((c) => c[0].toUpperCase() + c.slice(1)).join("/")} only`, listX + listW - 12, ry + midY);
      } else {
        ctx.fillStyle = equipped ? "#7CFC9B" : "#7e8aa0";
        ctx.font = "600 12px Fredoka, -apple-system, sans-serif";
        ctx.fillText(equipped ? "EQUIPPED" : "equip", listX + listW - 12, ry + midY);
        if (clicked && hovered && !lockClick) {
          if (equipped) player.unequip(item.slot);
          else player.equip(item);
        }
      }
    });
    ctx.restore();

    // Scrollbar in the right gutter when the list overflows.
    if (maxScroll > 0) {
      const sbX = listX + listW + 6;
      ctx.fillStyle = "rgba(255,255,255,0.07)";
      rr(ctx, sbX, listTop, 5, listH, 2);
      ctx.fill();
      const thumbH = Math.max(28, (listH / totalH) * listH);
      const thumbY = listTop + (listH - thumbH) * (scroll / maxScroll);
      ctx.fillStyle = "rgba(255,255,255,0.28)";
      rr(ctx, sbX, thumbY, 5, thumbH, 2);
      ctx.fill();
    }

    if (rows.length === 0) {
      ctx.textAlign = "center";
      ctx.fillStyle = "#5d6678";
      ctx.font = "500 14px Fredoka, -apple-system, sans-serif";
      ctx.fillText(view === "sell" ? "No items to sell." : "Nothing here yet.", listX + listW / 2, listTop + 40);
    }

    // Footer hint (shorter phrasing on portrait; clipped so it can never overflow).
    ctx.textAlign = "left";
    ctx.fillStyle = "#5d6678";
    ctx.font = "500 12px Fredoka, -apple-system, sans-serif";
    const footer = portrait
      ? view === "buy"
        ? "Tap an item to buy"
        : view === "sell"
          ? "Tap to sell · padlock = keep"
          : "Tap to equip · padlock = keep"
      : view === "buy"
        ? "Click an item to buy · E or X to close"
        : view === "sell"
          ? "Click an item to sell · padlock = keep (can't be sold) · E or X to close"
          : "Click an item to equip/unequip · padlock = protect from selling · I or X to close";
    ctx.fillText(phone ? clipText(ctx, footer, pw - 44) : footer, px + (portrait ? 12 : 22), py + ph - 12);

    // Tooltip for the hovered list item (with a compare-vs-equipped block).
    // On portrait it pins to the bottom of the panel instead of chasing the pointer.
    if (hoveredItem) this.drawTooltip(ctx, hoveredItem.item, hoveredItem.x, hoveredItem.y, w, h, player, portrait ? { px, py, pw, ph } : null, compact);

    // Click outside the panel closes.
    if (clicked && !hit(px, py, pw, ph)) this.close();

    fit.done();
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  // `mini` (compact landscape): a short-viewport card — flavor/affix lines are dropped
  // and the compare list capped, so the tooltip never swallows the squat panel.
  drawTooltip(ctx, item, mx, my, w, h, player, panel, mini) {
    const rc = RARITIES[item.rarity].color;
    const qStr = item.quality ? `  ·  Q${item.quality}%` : "";
    const typeStr = item.weaponType ? WEAPON_TYPE_NAMES[item.weaponType] + " · " : "";
    // Each line: [text, color, font].
    const lines = [
      [item.name, rc, "600 13px Fredoka, -apple-system, sans-serif"],
      [`${typeStr}${RARITIES[item.rarity].name} ${SLOT_NAMES[item.slot]}${qStr}`, "#8b97ab", "500 12px Fredoka, -apple-system, sans-serif"],
      [`⚡ Power ${itemPower(item)}`, "#ffd27a", "700 12px Fredoka, -apple-system, sans-serif"],
    ];
    if (!mini) lines.push([item.desc, "#cdd5e2", "italic 12px Fredoka, -apple-system, sans-serif"]);
    lines.push([modsSummary(item), "#9be29a", "600 12px Fredoka, -apple-system, sans-serif"]);
    // Weapon identity — the special trait, called out so it reads as more than stats.
    const trait = traitForItem(item);
    if (trait && WEAPON_TRAITS[trait]) {
      const t = WEAPON_TRAITS[trait];
      lines.push([`✦ ${t.name.toUpperCase()} — ${t.desc}`, "#ffd27a", "700 12px Fredoka, -apple-system, sans-serif"]);
    }
    if (item.classes) {
      lines.push([`${item.classes.map((c) => c[0].toUpperCase() + c.slice(1)).join(" / ")} only`, "#d39", "600 12px Fredoka, -apple-system, sans-serif"]);
    }
    if (!mini) {
      for (const af of item.affixes || []) {
        lines.push([`✦ ${af.label}`, "#c8a8ff", "600 12px Fredoka, -apple-system, sans-serif"]);
      }
    }

    // Compare vs the currently-equipped item of this slot (upgrade-at-a-glance).
    const eq = player && item.slot in player.equipped ? player.equipped[item.slot] : null;
    const canUse = !item.classes || (player && item.classes.includes(player.class));
    if (eq && eq !== item && canUse) {
      const dPow = itemPower(item) - itemPower(eq);
      lines.push([`— vs ${eq.name} —`, "#7e8aa0", "600 12px Fredoka, -apple-system, sans-serif"]);
      lines.push([`⚡ Power  ${dPow >= 0 ? "+" : ""}${dPow}`, dPow >= 0 ? "#7CFC9B" : "#ff7a7a", "700 12px Fredoka, -apple-system, sans-serif"]);
      const deltaLines = [];
      const keys = new Set([...Object.keys(item.mods), ...Object.keys(eq.mods)]);
      for (const k of keys) {
        const a = item.mods[k];
        const b = eq.mods[k];
        if (typeof a === "boolean" || typeof b === "boolean") {
          const av = !!a;
          const bv = !!b;
          if (av === bv) continue;
          deltaLines.push([`${av ? "▲ +" : "▼ −"}${MOD_LABEL[k] || k}`, av ? "#7CFC9B" : "#ff7a7a", "600 12px Fredoka, -apple-system, sans-serif"]);
          continue;
        }
        const d = (a || 0) - (b || 0);
        if (Math.abs(d) < 0.001) continue;
        const up = LOWER_BETTER.has(k) ? d < 0 : d > 0;
        const label = MOD_LABEL[k] || k;
        const txt = PCT_MODS.has(k) ? `${d > 0 ? "+" : ""}${Math.round(d * 100)}% ${label}` : `${d > 0 ? "+" : ""}${trim(d)} ${label}`;
        deltaLines.push([`${up ? "▲" : "▼"} ${txt}`, up ? "#7CFC9B" : "#ff7a7a", "600 12px Fredoka, -apple-system, sans-serif"]);
      }
      // Mini mode shows only the biggest few deltas — the power delta above is the verdict.
      if (mini && deltaLines.length > 3) {
        lines.push(...deltaLines.slice(0, 3));
        lines.push([`…and ${deltaLines.length - 3} more changes`, "#7e8aa0", "600 12px Fredoka, -apple-system, sans-serif"]);
      } else {
        lines.push(...deltaLines);
      }
    }

    let tw = 0;
    for (const [t, , f] of lines) {
      ctx.font = f;
      tw = Math.max(tw, ctx.measureText(t).width);
    }
    const bw = Math.min(tw + 24, w - 16); // never wider than the viewport (lines clip below)
    const bh = 16 + lines.length * 17;
    // Pathologically long compare lists (rare) shrink to fit rather than spill off-canvas.
    const sc = Math.min(1, (h - 16) / bh);
    const dw = bw * sc;
    const dh = bh * sc;
    let bx = mx + 16;
    let by = my + 16;
    if (bx + dw > w - 8) bx = mx - dw - 16;
    if (by + dh > h - 8) by = h - dh - 8;
    if (panel) {
      // Portrait: pin the tooltip to the bottom of the panel like a sheet, so the
      // tapped row's compare card lands somewhere predictable and fully on-screen.
      bx = panel.px + (panel.pw - dw) / 2;
      by = panel.py + panel.ph - dh - 8;
    }
    bx = Math.max(8, Math.min(bx, w - dw - 8));
    by = Math.max(8, Math.min(by, h - dh - 8));
    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(sc, sc);
    rr(ctx, 0, 0, bw, bh, 8);
    ctx.fillStyle = "rgba(12,16,26,0.98)";
    ctx.fill();
    ctx.strokeStyle = rc;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.textAlign = "left";
    let ty = 18;
    for (const [t, c, f] of lines) {
      ctx.fillStyle = c;
      ctx.font = f;
      ctx.fillText(clipText(ctx, t, bw - 24), 12, ty);
      ty += 17;
    }
    ctx.restore();
  }
}
