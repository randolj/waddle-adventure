// Immediate-mode inventory + shop overlay. Drawing and click handling happen
// together in render(); the caller pauses the game while this is open.

import { RARITIES, SLOTS, SLOT_NAMES, WEAPON_TYPE_NAMES, sellValue } from "./items.js";
import { roundRect as rr } from "./utils.js";

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

function trim(v) {
  return Math.round(v * 100) / 100;
}

// Per-slot accent — the icon-disc tint + the row's type tag — so item categories
// (weapon vs armor vs cloak vs trinket vs relic) read apart at a glance.
const SLOT_TINT = { weapon: "#e8b35a", armor: "#8fb7ff", cloak: "#c4a6ff", trinket: "#7fe0c0", relic: "#ef9f27" };
function slotTint(item) {
  return SLOT_TINT[item.slot] || "#9aa6b1";
}
function slotTag(item) {
  return item.slot === "weapon" ? (WEAPON_TYPE_NAMES[item.weaponType] || "Weapon").toUpperCase() : (SLOT_NAMES[item.slot] || item.slot).toUpperCase();
}
function withAlpha(hex, a) {
  const h = hex.replace("#", "");
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}

// Truncate text with an ellipsis to fit maxW (uses the current ctx.font).
function clipText(ctx, str, maxW) {
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
function drawItemIcon(ctx, cx, cy, s, item) {
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

export class InventoryUI {
  constructor() {
    this.open = false;
    this.mode = "inventory";
    this.shop = null;
    this.shopTab = "buy";
    this.scroll = 0; // item-list scroll offset (px)
  }

  isOpen() {
    return this.open;
  }
  openInventory() {
    this.open = true;
    this.mode = "inventory";
    this.scroll = 0;
  }
  openShop(stock, title = "Camp shop") {
    this.open = true;
    this.mode = "shop";
    this.shop = stock;
    this.shopTitle = title;
    this.shopTab = "buy";
    this.scroll = 0;
  }
  close() {
    this.open = false;
  }

  render(ctx, w, h, player, input) {
    const mx = input.mouseX;
    const my = input.mouseY;
    const clicked = input.consumeClick();
    const hit = (x, y, bw, bh) => mx >= x && mx <= x + bw && my >= y && my <= y + bh;

    ctx.fillStyle = "rgba(8,10,18,0.66)";
    ctx.fillRect(0, 0, w, h);

    const pw = Math.min(720, w - 48);
    const ph = Math.min(520, h - 48);
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
    ctx.font = "600 20px -apple-system, sans-serif";
    ctx.fillText(this.mode === "shop" ? this.shopTitle || "Shop" : "Inventory", px + 22, py + 34);

    // Coins.
    ctx.textAlign = "right";
    ctx.font = "700 16px -apple-system, sans-serif";
    ctx.fillStyle = "#ffd166";
    ctx.fillText(`◉ ${player.coins}`, px + pw - 46, py + 33);
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
      return;
    }

    // Stats strip.
    const s = player.stats;
    const dashTxt = s.dashEnabled ? `${Math.round(s.dashSpeed * s.dashTime)}px` : "—";
    const stats = [
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
    const stripY = py + 50;
    const boxW = (pw - 44) / stats.length;
    stats.forEach((st, i) => {
      const bx = px + 22 + i * boxW;
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      rr(ctx, bx, stripY, boxW - 8, 38, 6);
      ctx.fill();
      ctx.textAlign = "left";
      ctx.fillStyle = "#8b97ab";
      ctx.font = "600 10px -apple-system, sans-serif";
      ctx.fillText(st[0].toUpperCase(), bx + 10, stripY + 15);
      ctx.fillStyle = "#e9eef6";
      ctx.font = "700 15px -apple-system, sans-serif";
      ctx.fillText(String(st[1]), bx + 10, stripY + 31);
    });

    const contentY = py + 104;
    const contentH = ph - 104 - 18;

    // --- Left: equipment slots (responsive width) ---
    const colW = Math.max(150, Math.min(218, pw * 0.34));
    const slotGap = 10;
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
      ctx.font = "600 11px -apple-system, sans-serif";
      ctx.fillText(SLOT_NAMES[slot].toUpperCase(), sx + 14, sy + 20);

      if (item) {
        drawItemIcon(ctx, sx + 24, sy + slotH - 22, 15, item);
        ctx.fillStyle = RARITIES[item.rarity].color;
        ctx.font = "600 14px -apple-system, sans-serif";
        ctx.fillText(clipText(ctx, item.name, colW - 56), sx + 44, sy + slotH - 24);
        ctx.fillStyle = "#7e8aa0";
        ctx.font = "500 10px -apple-system, sans-serif";
        ctx.fillText("click to unequip", sx + 44, sy + slotH - 10);
        if (clicked && hovered) player.unequip(slot);
      } else {
        ctx.fillStyle = "#5d6678";
        ctx.font = "italic 13px -apple-system, sans-serif";
        ctx.fillText("— empty —", sx + 14, sy + slotH - 18);
      }
    });

    // --- Right: item list (inventory / shop buy / shop sell) ---
    const listX = px + 22 + colW + 18;
    const listW = pw - (colW + 18) - 44;
    const isShop = this.mode === "shop";
    let listTop = contentY;

    // Buy / Sell tabs (shop only).
    if (isShop) {
      const tw = 80;
      [["buy", "Buy"], ["sell", "Sell"]].forEach(([key, label], i) => {
        const tx = listX + i * (tw + 8);
        const active = this.shopTab === key;
        ctx.fillStyle = active ? "rgba(255,209,102,0.18)" : "rgba(255,255,255,0.05)";
        rr(ctx, tx, contentY, tw, 26, 6);
        ctx.fill();
        ctx.strokeStyle = active ? "#ffd166" : "rgba(255,255,255,0.12)";
        ctx.lineWidth = active ? 1.5 : 1;
        ctx.stroke();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = active ? "#ffd166" : "#8b97ab";
        ctx.font = "600 13px -apple-system, sans-serif";
        ctx.fillText(label, tx + tw / 2, contentY + 14);
        if (clicked && hit(tx, contentY, tw, 26)) {
          this.shopTab = key;
          this.scroll = 0;
        }
      });
      ctx.textBaseline = "alphabetic";
      listTop = contentY + 36;
    }

    const view = !isShop ? "inv" : this.shopTab; // "inv" | "buy" | "sell"
    const rows = view === "buy" ? this.shop : player.inventory.map((it) => ({ item: it }));
    const listH = contentY + contentH - listTop;
    const rowH = 40;
    const gap = 6;
    const textMaxW = listW - 46 - 64; // leave room for the right-side label
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
      ctx.font = "600 14px -apple-system, sans-serif";
      ctx.fillText(clipText(ctx, item.name, textMaxW), listX + 46, ry + 16);
      // Line 2: slot-type tag (slot color) + the mod summary.
      const tag = slotTag(item);
      ctx.font = "700 10px -apple-system, sans-serif";
      ctx.fillStyle = tint;
      ctx.fillText(tag, listX + 46, ry + 31);
      const tagW = ctx.measureText(tag).width;
      ctx.fillStyle = "#8b97ab";
      ctx.font = "500 11px -apple-system, sans-serif";
      ctx.fillText(clipText(ctx, modsSummary(item), textMaxW - tagW - 12), listX + 46 + tagW + 10, ry + 31);
      ctx.globalAlpha = 1;

      ctx.textAlign = "right";
      if (view === "buy") {
        if (sold) {
          ctx.fillStyle = "#5d6678";
          ctx.font = "600 12px -apple-system, sans-serif";
          ctx.fillText("sold", rlx, ry + 25);
        } else {
          const afford = player.coins >= entry.price;
          ctx.fillStyle = afford ? "#ffd166" : "#9a5d5d";
          ctx.font = "700 14px -apple-system, sans-serif";
          ctx.fillText(`◉ ${entry.price}`, rlx, ry + 25);
          if (clicked && hovered && afford) {
            player.coins -= entry.price;
            player.addItem(item);
            entry.sold = true;
          }
        }
      } else if (view === "sell") {
        ctx.fillStyle = "#ffd166";
        ctx.font = "700 14px -apple-system, sans-serif";
        ctx.fillText(`+◉ ${sellValue(item)}`, rlx, ry + 17);
        ctx.fillStyle = equipped ? "#7CFC9B" : "#7e8aa0";
        ctx.font = "600 10px -apple-system, sans-serif";
        ctx.fillText(equipped ? "equipped" : "sell", rlx, ry + 33);
        if (clicked && hovered) {
          player.coins += sellValue(item);
          player.removeItem(item);
        }
      } else if (!(item.slot in player.equipped)) {
        // Non-equippable (e.g. a sealed relic).
        ctx.fillStyle = "#ef9f27";
        ctx.font = "600 10px -apple-system, sans-serif";
        ctx.fillText("SEALED", listX + listW - 12, ry + 25);
      } else if (item.classes && !item.classes.includes(player.class)) {
        // Class-locked armor for a different class.
        ctx.fillStyle = "#c77";
        ctx.font = "600 10px -apple-system, sans-serif";
        ctx.fillText(`${item.classes.map((c) => c[0].toUpperCase() + c.slice(1)).join("/")} only`, listX + listW - 12, ry + 25);
      } else {
        ctx.fillStyle = equipped ? "#7CFC9B" : "#7e8aa0";
        ctx.font = "600 10px -apple-system, sans-serif";
        ctx.fillText(equipped ? "EQUIPPED" : "equip", listX + listW - 12, ry + 25);
        if (clicked && hovered) {
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
      ctx.font = "500 14px -apple-system, sans-serif";
      ctx.fillText(view === "sell" ? "No items to sell." : "Nothing here yet.", listX + listW / 2, listTop + 40);
    }

    // Footer hint.
    ctx.textAlign = "left";
    ctx.fillStyle = "#5d6678";
    ctx.font = "500 12px -apple-system, sans-serif";
    const footer =
      view === "buy"
        ? "Click an item to buy · E or X to close"
        : view === "sell"
          ? "Click an item to sell · E or X to close"
          : "Click an item to equip/unequip · I or X to close";
    ctx.fillText(footer, px + 22, py + ph - 12);

    // Tooltip for the hovered list item.
    if (hoveredItem) this.drawTooltip(ctx, hoveredItem.item, hoveredItem.x, hoveredItem.y, w, h);

    // Click outside the panel closes.
    if (clicked && !hit(px, py, pw, ph)) this.close();

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  drawTooltip(ctx, item, mx, my, w, h) {
    const rc = RARITIES[item.rarity].color;
    const qStr = item.quality ? `  ·  Q${item.quality}%` : "";
    const typeStr = item.weaponType ? WEAPON_TYPE_NAMES[item.weaponType] + " · " : "";
    // Each line: [text, color, font].
    const lines = [
      [item.name, rc, "600 13px -apple-system, sans-serif"],
      [`${typeStr}${RARITIES[item.rarity].name} ${SLOT_NAMES[item.slot]}${qStr}`, "#8b97ab", "500 11px -apple-system, sans-serif"],
      [item.desc, "#cdd5e2", "italic 11px -apple-system, sans-serif"],
      [modsSummary(item), "#9be29a", "600 11px -apple-system, sans-serif"],
    ];
    if (item.classes) {
      lines.push([`${item.classes.map((c) => c[0].toUpperCase() + c.slice(1)).join(" / ")} only`, "#d39", "600 11px -apple-system, sans-serif"]);
    }
    for (const af of item.affixes || []) {
      lines.push([`✦ ${af.label}`, "#c8a8ff", "600 11px -apple-system, sans-serif"]);
    }

    let tw = 0;
    for (const [t, , f] of lines) {
      ctx.font = f;
      tw = Math.max(tw, ctx.measureText(t).width);
    }
    const bw = tw + 24;
    const bh = 16 + lines.length * 17;
    let bx = mx + 16;
    let by = my + 16;
    if (bx + bw > w - 8) bx = mx - bw - 16;
    if (by + bh > h - 8) by = h - bh - 8;
    rr(ctx, bx, by, bw, bh, 8);
    ctx.fillStyle = "rgba(12,16,26,0.98)";
    ctx.fill();
    ctx.strokeStyle = rc;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.textAlign = "left";
    let ty = by + 18;
    for (const [t, c, f] of lines) {
      ctx.fillStyle = c;
      ctx.font = f;
      ctx.fillText(t, bx + 12, ty);
      ty += 17;
    }
  }
}
