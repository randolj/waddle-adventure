// Title screen: logo, per-class character profiles (create / play / delete),
// a shared stash to transfer items between characters, plus How to Play and
// class descriptions. Immediate-mode canvas UI like the other overlays — drawing
// and click handling happen together in render(); the caller is in scene "menu".

import { CLASSES, CLASS_NAMES, RARITIES, SLOT_NAMES, WEAPON_TYPE_NAMES } from "./items.js";
import { BODY_PALETTE } from "./player.js";
import { roundRect as rr, fitScale } from "./utils.js";
import { getChars, getChar, hasChar, deleteChar, getShards, getStash, stashAdd, stashTake, saveChar } from "./meta.js";

// Design size of the title screen; smaller/portrait viewports scale it down to fit.
const MENU_W = 860;
const MENU_H = 620;

const CLASS_INFO = {
  drifter: {
    role: "Skirmisher",
    color: "#5be3a0",
    tag: "Fast · crit · dash duelist",
    starter: "Starts with Daggers",
    desc: "Lives in the dash. High crit and move speed, low HP. The classic in-and-out duelist — its dash is the one you already know, and it chains strikes between targets. Starts with fast Daggers (each sub-hit rolls crit).",
  },
  warden: {
    role: "Bruiser",
    color: "#e0a64b",
    tag: "Tanky · armor · lifesteal",
    starter: "Starts with a Mace",
    desc: "Wades into the swarm and soaks hits. The only source of base damage-reduction and bonus HP, and its dash plows THROUGH enemies, dealing contact damage. Starts with a heavy Mace; pairs with lifesteal.",
  },
  auralist: {
    role: "Frost caster",
    color: "#7fb0ff",
    tag: "Crit · cooldown · chill",
    starter: "Starts with a Staff",
    desc: "Controls space with frost. High crit and attack speed; every hit chills (slows) enemies, and its dash is a frost-blink that bursts cold (no lunge). Starts with a homing frost Staff; pairs with bows.",
  },
};

const HOWTO = [
  ["Move", "WASD — dash with Space (needs a cloak)"],
  ["Attack", "Click toward the cursor. Weapon type changes how you hit:"],
  ["", "Sword=arc · Mace=heavy smash · Daggers=flurry · Bow/Staff=ranged"],
  ["Dash-strike", "Attack right after a dash for a stronger lunge (melee only)"],
  ["Chain", "Aim at an enemy just after a hit to dash to it"],
  ["Gear", "I = inventory. Stats come entirely from equipped gear (4 slots)"],
  ["Camp", "Heal in the safe camp. E = shop / Elder (relics) / Quartermaster (upgrades)"],
  ["Dungeons", "Enter a wilds portal to dive. It's a RUN: loot is at risk."],
  ["Extract", "Beat the boss → Exit banks your loot, or Descend dives deeper"],
  ["Death", "Die in a dungeon and you forfeit unbanked loot — but keep shards"],
  ["Shards", "Permanent currency. Spend at the Quartermaster on account-wide upgrades"],
];

export class MenuScreen {
  constructor() {
    this.mode = "main"; // main | howto | classes | stash
    this.stashChar = null; // class selected in the stash view
    this.confirmDelete = null;
    this.t = 0;
    this.wheel = 0; // wheel delta for this frame
    this.stashScroll = { bag: 0, stash: 0 }; // scroll offsets for the two columns
  }

  // A compact penguin portrait in the class palette (mirrors the in-game art).
  drawPenguin(ctx, x, y, s, cls) {
    const pal = BODY_PALETTE[cls] || BODY_PALETTE.drifter;
    ctx.save();
    ctx.translate(x, y);
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#14110e";
    // Feet.
    ctx.fillStyle = "#d9821c";
    ctx.lineWidth = 2;
    for (const fx of [-s * 0.42, s * 0.42]) {
      ctx.beginPath();
      ctx.ellipse(fx, s * 1.02, s * 0.34, s * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    // Body.
    ctx.fillStyle = pal.base;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.78, s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Belly.
    ctx.fillStyle = pal.belly;
    ctx.beginPath();
    ctx.ellipse(0, s * 0.22, s * 0.46, s * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
    // Class accent (matches each class's starting armor style).
    if (cls === "drifter") {
      ctx.strokeStyle = "#7fae8a";
      ctx.lineWidth = s * 0.14;
      ctx.beginPath();
      ctx.moveTo(-s * 0.4, -s * 0.4);
      ctx.lineTo(s * 0.3, s * 0.22);
      ctx.moveTo(s * 0.4, -s * 0.4);
      ctx.lineTo(-s * 0.3, s * 0.22);
      ctx.stroke();
      ctx.fillStyle = "#cdb24a";
      ctx.strokeStyle = "#14110e";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, -s * 0.06, s * 0.09, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (cls === "warden") {
      ctx.fillStyle = "#9aa6b4";
      ctx.strokeStyle = "#14110e";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-s * 0.44, -s * 0.04);
      ctx.lineTo(s * 0.44, -s * 0.04);
      ctx.lineTo(s * 0.36, s * 0.2);
      ctx.lineTo(-s * 0.36, s * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (cls === "auralist") {
      const cy = -s * 1.5;
      ctx.save();
      ctx.shadowColor = "#9fd8ff";
      ctx.shadowBlur = 8;
      ctx.fillStyle = "#bfe8ff";
      ctx.strokeStyle = "#3a5f86";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, cy - s * 0.3);
      ctx.lineTo(s * 0.18, cy);
      ctx.lineTo(0, cy + s * 0.3);
      ctx.lineTo(-s * 0.18, cy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    // Eyes.
    ctx.fillStyle = "#f3efe6";
    ctx.beginPath();
    ctx.arc(-s * 0.26, -s * 0.5, s * 0.18, 0, Math.PI * 2);
    ctx.arc(s * 0.26, -s * 0.5, s * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#14110e";
    ctx.beginPath();
    ctx.arc(-s * 0.22, -s * 0.5, s * 0.09, 0, Math.PI * 2);
    ctx.arc(s * 0.3, -s * 0.5, s * 0.09, 0, Math.PI * 2);
    ctx.fill();
    // Beak.
    ctx.fillStyle = "#d9821c";
    ctx.strokeStyle = "#14110e";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-s * 0.16, -s * 0.32);
    ctx.lineTo(s * 0.16, -s * 0.32);
    ctx.lineTo(0, -s * 0.14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  drawLogo(ctx, cx, top) {
    // Aurora-badge emblem with a sword penguin, then the wordmark.
    const by = top + 60;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, by, 58, 0, Math.PI * 2);
    ctx.fillStyle = "#15294a";
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#0a1626";
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, by, 58, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = "rgba(75,227,176,0.7)";
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(cx - 60, by - 30);
    ctx.quadraticCurveTo(cx, by - 52, cx + 60, by - 26);
    ctx.stroke();
    ctx.strokeStyle = "rgba(176,108,255,0.55)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(cx - 60, by - 8);
    ctx.quadraticCurveTo(cx + 4, by - 34, cx + 60, by - 4);
    ctx.stroke();
    ctx.fillStyle = "#e9f3ff";
    ctx.beginPath();
    ctx.ellipse(cx, by + 52, 70, 26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Mini sword penguin.
    this.drawPenguin(ctx, cx, by + 6, 26, "drifter");
    // A little raised sword.
    ctx.save();
    ctx.translate(cx + 18, by - 2);
    ctx.rotate(-0.7);
    ctx.fillStyle = "#cfe0f0";
    ctx.strokeStyle = "#14110e";
    ctx.lineWidth = 1.6;
    ctx.fillRect(-2, -34, 4, 34);
    ctx.strokeRect(-2, -34, 4, 34);
    ctx.fillStyle = "#b7913f";
    ctx.fillRect(-7, -2, 14, 5);
    ctx.strokeRect(-7, -2, 14, 5);
    ctx.restore();
    ctx.restore();

    // Wordmark.
    ctx.textAlign = "center";
    ctx.font = "900 52px 'Arial Black', -apple-system, sans-serif";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#0c2236";
    ctx.strokeText("Waddle's Quest", cx, by + 132);
    ctx.fillStyle = "#eef7ff";
    ctx.fillText("Waddle's Quest", cx, by + 132);
    ctx.font = "700 14px -apple-system, sans-serif";
    ctx.fillStyle = "#8fb6d6";
    ctx.fillText("A   P E N G U I N   R O G U E L I T E", cx, by + 158);
    ctx.textAlign = "left";
  }

  render(ctx, w, h, input, api) {
    const realW = w;
    const realH = h;
    const clicked = input.consumeClick();
    this.wheel = input.consumeWheel ? input.consumeWheel() : 0;

    // Icy backdrop fills the real screen.
    const g = ctx.createLinearGradient(0, 0, 0, realH);
    g.addColorStop(0, "#0e1d33");
    g.addColorStop(0.55, "#15294a");
    g.addColorStop(1, "#0c1726");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, realW, realH);
    for (let i = 0; i < 40; i++) {
      const sx = (i * 197.3) % realW;
      const sy = ((i * 113.7 + this.t * 14) % (realH + 20)) - 10;
      ctx.fillStyle = "rgba(220,238,255,0.18)";
      ctx.beginPath();
      ctx.arc(sx, sy, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Scale the menu to fit smaller / portrait viewports; desktop renders 1:1.
    let fit = null;
    let mx = input.mouseX;
    let my = input.mouseY;
    if (realW < MENU_W || realH < MENU_H) {
      fit = fitScale(ctx, realW, realH, MENU_W, MENU_H, input);
      w = fit.w;
      h = fit.h;
      mx = fit.mx;
      my = fit.my;
    }

    const hit = (x, y, bw, bh) => mx >= x && mx <= x + bw && my >= y && my <= y + bh;
    const btn = (x, y, bw, bh, label, color, on, sub) => {
      const hov = hit(x, y, bw, bh);
      ctx.fillStyle = hov ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.06)";
      rr(ctx, x, y, bw, bh, 8);
      ctx.fill();
      ctx.strokeStyle = hov ? color : "rgba(255,255,255,0.18)";
      ctx.lineWidth = hov ? 2 : 1;
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      ctx.font = "700 14px -apple-system, sans-serif";
      ctx.fillText(label, x + bw / 2, y + (sub ? bh / 2 - 2 : bh / 2 + 5));
      if (sub) {
        ctx.fillStyle = "#8b97ab";
        ctx.font = "500 10px -apple-system, sans-serif";
        ctx.fillText(sub, x + bw / 2, y + bh / 2 + 13);
      }
      ctx.textAlign = "left";
      return clicked && hov;
    };

    const cx = w / 2;
    if (this.mode === "main") this.renderMain(ctx, w, h, cx, hit, btn, clicked, api);
    else if (this.mode === "howto") this.renderText(ctx, w, h, cx, hit, btn, "How to Play", api);
    else if (this.mode === "classes") this.renderClasses(ctx, w, h, cx, hit, btn);
    else if (this.mode === "stash") this.renderStash(ctx, w, h, cx, hit, btn, clicked);

    if (fit) fit.done();

    // Shards (account-wide) — always shown in the real top-right corner.
    ctx.textAlign = "right";
    ctx.font = "700 16px -apple-system, sans-serif";
    ctx.fillStyle = "#7fd2ff";
    ctx.fillText(`✦ ${getShards()}`, realW - 22, 30);
    ctx.textAlign = "left";
  }

  renderMain(ctx, w, h, cx, hit, btn, clicked, api) {
    this.drawLogo(ctx, cx, 24);

    // Three character cards.
    const cardW = Math.min(230, (w - 120) / 3);
    const gap = 24;
    const totalW = cardW * 3 + gap * 2;
    const startX = cx - totalW / 2;
    const cardY = 250;
    const cardH = 250;
    CLASSES.forEach((cls, i) => {
      const x = startX + i * (cardW + gap);
      const info = CLASS_INFO[cls];
      const has = hasChar(cls);
      const ch = getChar(cls);
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      rr(ctx, x, cardY, cardW, cardH, 12);
      ctx.fill();
      ctx.strokeStyle = info.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      this.drawPenguin(ctx, x + cardW / 2, cardY + 78, 30, cls);

      ctx.textAlign = "center";
      ctx.fillStyle = info.color;
      ctx.font = "700 18px -apple-system, sans-serif";
      ctx.fillText(CLASS_NAMES[cls], x + cardW / 2, cardY + 132);
      ctx.fillStyle = "#9aa6b1";
      ctx.font = "600 11px -apple-system, sans-serif";
      ctx.fillText(info.role.toUpperCase(), x + cardW / 2, cardY + 150);
      ctx.fillStyle = "#cdd5e2";
      ctx.font = "500 11px -apple-system, sans-serif";
      ctx.fillText(info.tag, x + cardW / 2, cardY + 168);

      if (has) {
        const items = (ch.items || []).length;
        ctx.fillStyle = "#7e8aa0";
        ctx.font = "500 11px -apple-system, sans-serif";
        ctx.fillText(`◉ ${ch.coins || 0}   ·   ${items} items`, x + cardW / 2, cardY + 188);
      } else {
        ctx.fillStyle = info.color;
        ctx.font = "600 10px -apple-system, sans-serif";
        ctx.fillText(info.starter, x + cardW / 2, cardY + 188);
      }
      ctx.textAlign = "left";

      const by = cardY + cardH - 50;
      if (!has) {
        if (btn(x + 16, by, cardW - 32, 34, "Create", info.color)) api.onPlay(cls);
      } else if (this.confirmDelete === cls) {
        if (btn(x + 16, by, (cardW - 40) / 2, 34, "Delete?", "#ff7a7a")) {
          deleteChar(cls);
          this.confirmDelete = null;
        }
        if (btn(x + 24 + (cardW - 40) / 2, by, (cardW - 40) / 2, 34, "Keep", "#9aa6b1")) this.confirmDelete = null;
      } else {
        if (btn(x + 16, by, cardW - 86, 34, "Play", info.color)) api.onPlay(cls);
        if (btn(x + cardW - 62, by, 46, 34, "Del", "#9a6b6b")) this.confirmDelete = cls;
      }
    });

    // Footer buttons.
    const fy = h - 70;
    const fbw = 170;
    const fgap = 16;
    const fx = cx - (fbw * 3 + fgap * 2) / 2;
    if (btn(fx, fy, fbw, 42, "How to Play", "#cdd5e2")) this.mode = "howto";
    if (btn(fx + fbw + fgap, fy, fbw, 42, "Classes", "#cdd5e2")) this.mode = "classes";
    if (btn(fx + (fbw + fgap) * 2, fy, fbw, 42, "Stash / Transfer", "#7fd2ff")) {
      this.stashChar = CLASSES.find((c) => hasChar(c)) || null;
      this.stashScroll = { bag: 0, stash: 0 };
      this.mode = "stash";
    }
  }

  panelFrame(ctx, w, h, cx, title, hit, btn) {
    const pw = Math.min(760, w - 80);
    const ph = Math.min(520, h - 120);
    const px = cx - pw / 2;
    const py = (h - ph) / 2;
    ctx.fillStyle = "rgba(14,22,38,0.96)";
    rr(ctx, px, py, pw, ph, 14);
    ctx.fill();
    ctx.strokeStyle = "rgba(140,170,210,0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.textAlign = "left";
    ctx.fillStyle = "#e9eef6";
    ctx.font = "700 22px -apple-system, sans-serif";
    ctx.fillText(title, px + 26, py + 38);
    if (btn(px + pw - 110, py + 16, 92, 30, "Back", "#cdd5e2")) this.mode = "main";
    return { px, py, pw, ph };
  }

  renderText(ctx, w, h, cx, hit, btn, title, api) {
    const { px, py, pw } = this.panelFrame(ctx, w, h, cx, title, hit, btn);
    let y = py + 78;
    for (const [k, v] of HOWTO) {
      if (k) {
        ctx.fillStyle = "#7fd2ff";
        ctx.font = "700 13px -apple-system, sans-serif";
        ctx.fillText(k, px + 26, y);
      }
      ctx.fillStyle = "#cdd5e2";
      ctx.font = "500 13px -apple-system, sans-serif";
      ctx.fillText(v, px + 130, y);
      y += k ? 30 : 22;
    }
  }

  renderClasses(ctx, w, h, cx, hit, btn) {
    const { px, py, pw } = this.panelFrame(ctx, w, h, cx, "The three castes", hit, btn);
    let y = py + 80;
    for (const cls of CLASSES) {
      const info = CLASS_INFO[cls];
      this.drawPenguin(ctx, px + 60, y + 18, 26, cls);
      ctx.textAlign = "left";
      ctx.fillStyle = info.color;
      ctx.font = "700 17px -apple-system, sans-serif";
      ctx.fillText(`${CLASS_NAMES[cls]}`, px + 110, y);
      ctx.fillStyle = "#9aa6b1";
      ctx.font = "600 12px -apple-system, sans-serif";
      ctx.fillText(info.role + " · " + info.tag, px + 110, y + 18);
      ctx.fillStyle = "#cdd5e2";
      ctx.font = "500 12.5px -apple-system, sans-serif";
      this.wrap(ctx, info.desc, px + 110, y + 40, pw - 150, 17);
      y += 132;
    }
  }

  wrap(ctx, text, x, y, maxW, lh) {
    const words = text.split(" ");
    let line = "";
    for (const word of words) {
      const test = line ? line + " " + word : word;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, y);
        line = word;
        y += lh;
      } else line = test;
    }
    if (line) ctx.fillText(line, x, y);
  }

  // Transfer items between a character's bag and the shared stash.
  moveToStash(cls, item) {
    const ch = getChar(cls);
    if (!ch) return;
    ch.items = (ch.items || []).filter((it) => it.uid !== item.uid);
    if (ch.equipped) {
      for (const slot of Object.keys(ch.equipped)) if (ch.equipped[slot] === item.uid) ch.equipped[slot] = null;
    }
    saveChar(cls, ch);
    stashAdd(item);
  }
  moveToChar(cls, item) {
    const ch = getChar(cls);
    if (!ch) return;
    const taken = stashTake(item.uid);
    if (!taken) return;
    ch.items = ch.items || [];
    ch.items.push(taken);
    saveChar(cls, ch);
  }

  renderStash(ctx, w, h, cx, hit, btn, clicked) {
    const { px, py, pw, ph } = this.panelFrame(ctx, w, h, cx, "Stash & transfer", hit, btn);
    const created = CLASSES.filter((c) => hasChar(c));
    if (created.length === 0) {
      ctx.fillStyle = "#9aa6b1";
      ctx.font = "500 14px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Create a character first, then deposit gear here to share between them.", cx, py + ph / 2);
      ctx.textAlign = "left";
      return;
    }
    if (!this.stashChar || !hasChar(this.stashChar)) this.stashChar = created[0];

    // Character tabs.
    let tx = px + 26;
    for (const c of created) {
      const tw = 96;
      const active = this.stashChar === c;
      ctx.fillStyle = active ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)";
      rr(ctx, tx, py + 58, tw, 28, 6);
      ctx.fill();
      ctx.strokeStyle = active ? CLASS_INFO[c].color : "rgba(255,255,255,0.15)";
      ctx.lineWidth = active ? 2 : 1;
      ctx.stroke();
      ctx.fillStyle = active ? CLASS_INFO[c].color : "#9aa6b1";
      ctx.font = "700 12px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(CLASS_NAMES[c], tx + tw / 2, py + 76);
      ctx.textAlign = "left";
      if (clicked && hit(tx, py + 58, tw, 28) && this.stashChar !== c) {
        this.stashChar = c;
        this.stashScroll.bag = 0;
      }
      tx += tw + 8;
    }

    const colY = py + 100;
    const colH = ph - 100 - 18;
    const colW = (pw - 26 * 2 - 24) / 2;
    const leftX = px + 26;
    const rightX = leftX + colW + 24;

    // Column headers.
    ctx.font = "700 12px -apple-system, sans-serif";
    ctx.fillStyle = "#cdd5e2";
    ctx.textAlign = "left";
    ctx.fillText(`${CLASS_NAMES[this.stashChar]}'s bag  →  deposit`, leftX, colY - 6);
    ctx.fillStyle = "#7fd2ff";
    ctx.fillText("Shared stash  →  withdraw", rightX, colY - 6);

    const ch = getChar(this.stashChar);
    this.itemColumn(ctx, leftX, colY, colW, colH, ch.items || [], ch, hit, clicked, (it) => this.moveToStash(this.stashChar, it), "bag");
    this.itemColumn(ctx, rightX, colY, colW, colH, getStash(), null, hit, clicked, (it) => this.moveToChar(this.stashChar, it), "stash");
  }

  itemColumn(ctx, x, y, cw, colH, items, owner, hit, clicked, onClick, scrollKey) {
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    rr(ctx, x, y, cw, colH, 8);
    ctx.fill();
    const rowH = 30;
    const max = Math.floor((colH - 8) / rowH);
    const maxStart = Math.max(0, items.length - max);
    // Wheel-scroll the column the cursor is over.
    if (this.wheel && hit(x, y, cw, colH)) {
      this.stashScroll[scrollKey] = (this.stashScroll[scrollKey] || 0) + (this.wheel > 0 ? 1 : -1);
    }
    let off = Math.max(0, Math.min(maxStart, this.stashScroll[scrollKey] || 0));
    this.stashScroll[scrollKey] = off;

    for (let i = off; i < Math.min(items.length, off + max); i++) {
      const it = items[i];
      const ry = y + 4 + (i - off) * rowH;
      const hov = hit(x + 4, ry, cw - 8, rowH - 2);
      if (hov) {
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        rr(ctx, x + 4, ry, cw - 8, rowH - 2, 5);
        ctx.fill();
      }
      const eq = owner && owner.equipped && Object.values(owner.equipped).includes(it.uid);
      ctx.fillStyle = RARITIES[it.rarity].color;
      ctx.font = "600 12px -apple-system, sans-serif";
      ctx.textAlign = "left";
      const tag = it.weaponType ? WEAPON_TYPE_NAMES[it.weaponType] : SLOT_NAMES[it.slot] || "";
      ctx.fillText(`${it.name}`, x + 12, ry + 14);
      ctx.fillStyle = "#7e8aa0";
      ctx.font = "500 10px -apple-system, sans-serif";
      ctx.fillText(`${tag}${eq ? " · equipped" : ""}`, x + 12, ry + 25);
      if (clicked && hov) onClick(it);
    }
    if (items.length === 0) {
      ctx.fillStyle = "#5d6678";
      ctx.font = "italic 12px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("— empty —", x + cw / 2, y + 26);
      ctx.textAlign = "left";
    } else if (maxStart > 0) {
      // Scroll affordance — how many are hidden above / below.
      ctx.fillStyle = "#7e8aa0";
      ctx.font = "600 10px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`scroll ⬍  ·  ${off} above / ${items.length - off - Math.min(max, items.length - off)} below`, x + cw / 2, y + colH - 6);
      ctx.textAlign = "left";
    }
  }
}
