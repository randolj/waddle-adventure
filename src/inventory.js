// Immediate-mode inventory + shop overlay. Drawing and click handling happen
// together in render(); the caller pauses the game while this is open.

import { RARITIES, SLOTS, SLOT_NAMES, sellValue } from "./items.js";

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
};

function trim(v) {
  return Math.round(v * 100) / 100;
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
      if (k === "dashEnabled") parts.push("grants dash");
      continue;
    }
    parts.push(`${v > 0 ? "+" : ""}${trim(v)} ${MOD_LABEL[k] || k}`);
  }
  return parts.join("  ");
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawItemIcon(ctx, cx, cy, s, item) {
  const col = item.color || "#aaa";
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineJoin = "round";
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#14110e";
  if (item.slot === "weapon") {
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
  } else if (item.slot === "cloak") {
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
  } else {
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
  ctx.restore();
}

export class InventoryUI {
  constructor() {
    this.open = false;
    this.mode = "inventory";
    this.shop = null;
    this.shopTab = "buy";
  }

  isOpen() {
    return this.open;
  }
  openInventory() {
    this.open = true;
    this.mode = "inventory";
  }
  openShop(stock) {
    this.open = true;
    this.mode = "shop";
    this.shop = stock;
    this.shopTab = "buy";
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
    ctx.fillText(this.mode === "shop" ? "Camp shop" : "Inventory", px + 22, py + 34);

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
      ["Range", s.attackRange],
      ["Atk/s", trim(1 / s.attackCooldown)],
      ["Move", s.moveSpeed],
      ["Dash", dashTxt],
      ["Max HP", player.maxHp],
    ];
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
    const slotH = (contentH - 24) / 3;
    SLOTS.forEach((slot, i) => {
      const sx = px + 22;
      const sy = contentY + i * (slotH + 12);
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
        if (clicked && hit(tx, contentY, tw, 26)) this.shopTab = key;
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

    ctx.save();
    ctx.beginPath();
    ctx.rect(listX, listTop, listW, listH);
    ctx.clip();
    rows.forEach((entry, i) => {
      const item = entry.item;
      const ry = listTop + i * (rowH + gap);
      if (ry > listTop + listH) return;
      const hovered = hit(listX, ry, listW, rowH);
      if (hovered) hoveredItem = { item, x: mx, y: my };
      const equipped = player.isEquipped(item);
      const sold = entry.sold;
      const rlx = listX + listW - 14;

      ctx.fillStyle = sold ? "rgba(255,255,255,0.02)" : hovered ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.05)";
      rr(ctx, listX, ry, listW, rowH, 8);
      ctx.fill();
      ctx.fillStyle = RARITIES[item.rarity].color;
      ctx.globalAlpha = sold ? 0.4 : 1;
      rr(ctx, listX, ry, 4, rowH, 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      drawItemIcon(ctx, listX + 26, ry + rowH / 2, 14, item);

      ctx.textAlign = "left";
      ctx.fillStyle = sold ? "#5d6678" : RARITIES[item.rarity].color;
      ctx.font = "600 14px -apple-system, sans-serif";
      ctx.fillText(clipText(ctx, item.name, textMaxW), listX + 46, ry + 17);
      ctx.fillStyle = "#8b97ab";
      ctx.font = "500 11px -apple-system, sans-serif";
      ctx.fillText(clipText(ctx, modsSummary(item), textMaxW), listX + 46, ry + 32);

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
    const lines = [item.name, `${RARITIES[item.rarity].name} ${SLOT_NAMES[item.slot]}`, item.desc, modsSummary(item)];
    ctx.font = "500 12px -apple-system, sans-serif";
    let tw = 0;
    for (const l of lines) tw = Math.max(tw, ctx.measureText(l).width);
    const bw = tw + 24;
    const bh = 18 + lines.length * 17;
    let bx = mx + 16;
    let by = my + 16;
    if (bx + bw > w - 8) bx = mx - bw - 16;
    if (by + bh > h - 8) by = h - bh - 8;
    rr(ctx, bx, by, bw, bh, 8);
    ctx.fillStyle = "rgba(12,16,26,0.98)";
    ctx.fill();
    ctx.strokeStyle = RARITIES[item.rarity].color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.textAlign = "left";
    ctx.fillStyle = RARITIES[item.rarity].color;
    ctx.font = "600 13px -apple-system, sans-serif";
    ctx.fillText(lines[0], bx + 12, by + 18);
    ctx.fillStyle = "#8b97ab";
    ctx.font = "500 11px -apple-system, sans-serif";
    ctx.fillText(lines[1], bx + 12, by + 35);
    ctx.fillStyle = "#cdd5e2";
    ctx.font = "italic 11px -apple-system, sans-serif";
    ctx.fillText(lines[2], bx + 12, by + 52);
    ctx.fillStyle = "#9be29a";
    ctx.font = "600 11px -apple-system, sans-serif";
    ctx.fillText(lines[3], bx + 12, by + 69);
  }
}
