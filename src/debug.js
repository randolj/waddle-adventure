// Debug overlay — toggle with the backtick (`) key. Gives coins/items, spawns
// enemies, warps to dungeons, etc. Immediate-mode like the inventory overlay.

import { ITEM_TEMPLATES, RARITIES } from "./items.js";
import { ENEMY_TYPES } from "./enemy.js";
import { DUNGEON_TIERS, tierColor } from "./dungeon.js";

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export class DebugMenu {
  constructor() {
    this.open_ = false;
  }
  isOpen() {
    return this.open_;
  }
  open() {
    this.open_ = true;
  }
  close() {
    this.open_ = false;
  }
  toggle() {
    this.open_ = !this.open_;
  }

  render(ctx, w, h, player, input, api) {
    const mx = input.mouseX;
    const my = input.mouseY;
    const clicked = input.consumeClick();
    const hit = (x, y, bw, bh) => mx >= x && mx <= x + bw && my >= y && my <= y + bh;

    ctx.fillStyle = "rgba(8,10,18,0.72)";
    ctx.fillRect(0, 0, w, h);

    const pw = Math.min(760, w - 28);
    const ph = Math.min(660, h - 24);
    const px = (w - pw) / 2;
    const py = (h - ph) / 2;
    rr(ctx, px, py, pw, ph, 14);
    ctx.fillStyle = "rgba(16,20,30,0.98)";
    ctx.fill();
    ctx.strokeStyle = "rgba(120,140,170,0.3)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillStyle = "#e9eef6";
    ctx.font = "600 20px -apple-system, sans-serif";
    ctx.fillText("Debug menu", px + 20, py + 34);

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

    const pad = 20;
    const rowH = 30;
    const btnH = 26;
    const gap = 7;
    let cx = px + pad;
    let cy = py + 52;
    let started = false;

    const section = (title) => {
      cx = px + pad;
      if (started) cy += rowH; // clear the previous section's last button row
      started = true;
      ctx.fillStyle = "#7e8aa0";
      ctx.font = "700 11px -apple-system, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(title.toUpperCase(), cx, cy + 10);
      cy += 18;
    };

    const button = (label, color, onClick) => {
      ctx.font = "600 12px -apple-system, sans-serif";
      const bw = ctx.measureText(label).width + 20;
      if (cx + bw > px + pw - pad) {
        cx = px + pad;
        cy += rowH;
      }
      const x = cx;
      const y = cy;
      const hovered = hit(x, y, bw, btnH);
      ctx.fillStyle = hovered ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.06)";
      rr(ctx, x, y, bw, btnH, 6);
      ctx.fill();
      ctx.strokeStyle = color || "rgba(255,255,255,0.2)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = color || "#cdd5e2";
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillText(label, x + bw / 2, y + btnH / 2 + 1);
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";
      if (clicked && hovered && onClick) onClick();
      cx += bw + gap;
    };

    section("Coins & status");
    button("+100", "#ffd166", () => api.giveCoins(100));
    button("+1000", "#ffd166", () => api.giveCoins(1000));
    button("+10000", "#ffd166", () => api.giveCoins(10000));
    button("Full heal", "#7CFC9B", () => api.fullHeal());
    button(`God mode: ${api.godMode ? "ON" : "OFF"}`, api.godMode ? "#7CFC9B" : "#9aa6b1", () => api.toggleGod());
    button(`Sound: ${api.muted ? "OFF" : "ON"}`, api.muted ? "#9aa6b1" : "#7fd6ff", () => api.toggleMute());

    section("Inventory");
    button("Equip legendaries", "#ef9f27", () => api.equipLegendaries());
    button("Give Sealed Relic", "#ef9f27", () => api.giveRelic());
    button("Clear inventory", "#ff7a7a", () => api.clearInventory());

    section("World");
    button("Kill all enemies", "#ff7a7a", () => api.killAll());
    button("Complete dungeon", "#7fe3ff", () => api.completeDungeon());
    button("Teleport to camp", "#9be29a", () => api.toCamp());

    section("Spawn enemy");
    for (const type of Object.keys(ENEMY_TYPES)) button(type, "#cdd5e2", () => api.spawnEnemy(type));

    section("Enter dungeon");
    DUNGEON_TIERS.forEach((t, i) => button(`T${t.tier}`, tierColor(t.tier), () => api.enterDungeon(i)));

    for (const slot of ["weapon", "cloak", "trinket"]) {
      section(`Give ${slot}`);
      for (const t of ITEM_TEMPLATES.filter((x) => x.slot === slot)) {
        button(t.name, RARITIES[t.rarity].color, () => api.giveItem(t));
      }
    }

    ctx.fillStyle = "#5d6678";
    ctx.font = "500 12px -apple-system, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Click a button to apply · ` or X to close", px + 20, py + ph - 12);

    if (clicked && !hit(px, py, pw, ph)) this.close();

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }
}
