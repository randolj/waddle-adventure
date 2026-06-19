// Enemy rendering, mixed onto Enemy.prototype (so methods run with this=Enemy),
// the same way playerart.js was split out of player.js.
//
// One blobby silhouette, tuned per-type by the viz fields (aspect / spikeLen /
// legs / eyeCount / eyeScale / feature) + behavior tells (charge streaks, bomber
// fuse-glow, summon sigil, shield arc, healer aura/beam) so archetypes read
// distinctly without bespoke per-creature art.

const INK = "#140f1c";

export function applyEnemyArt(Enemy) {
  Object.assign(Enemy.prototype, {
    // Soft ground shadow, kept on the floor as the body bobs.
    drawShadow(ctx, r, aspect, bob) {
      ctx.fillStyle = "rgba(20, 24, 38, 0.26)";
      ctx.beginPath();
      ctx.ellipse(0, r * 0.85 - bob, r * 0.95 * aspect, r * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
    },

    // World-space HP bar (after the body transform is restored). Width tracks the
    // aspect-stretched body so wide creatures aren't under-barred.
    drawHpBar(ctx) {
      if (this.isBoss || this.hp >= this.maxHp || this.dead) return;
      const r = this.r;
      const aw = r * this.aspect;
      ctx.fillStyle = "rgba(10,12,20,0.55)";
      ctx.fillRect(this.x - aw, this.y - r * 2.1, aw * 2, 5);
      ctx.fillStyle = "#8be29a";
      ctx.fillRect(this.x - aw, this.y - r * 2.1, aw * 2 * (this.hp / this.maxHp), 5);
    },

    draw(ctx) {
      const r = this.r;
      const aspect = this.aspect;
      const bob = Math.sin(this.wobble) * (this.isBoss ? 3 : 2);
      const telegraph = this.bossState === "telegraph" || (this.charger && this.chargeState === "telegraph");
      const flash = this.hurtFlash > 0 || telegraph;
      const chilled = this.chillTimer > 0 && !flash;

      ctx.save();
      ctx.translate(this.x, this.y + bob);

      // Healer aura sits beneath the body.
      if (this.healer && !flash) {
        const pulse = 0.5 + 0.5 * Math.sin(this.wobble * 0.6);
        ctx.fillStyle = `rgba(150, 240, 180, ${0.05 + pulse * 0.05})`;
        ctx.beginPath();
        ctx.arc(0, 0, r * (1.7 + pulse * 0.25), 0, Math.PI * 2);
        ctx.fill();
      }

      this.drawShadow(ctx, r, aspect, bob);
      ctx.lineJoin = "round";

      // Spider legs (behind the body).
      if (this.legs) this.drawLegs(ctx, r, aspect);

      // Charge wind-up streaks point back along the charge line.
      if (telegraph && (this.charger || this.isBoss)) {
        const back = Math.atan2(this.chargeDy, this.chargeDx) + Math.PI;
        ctx.strokeStyle = "rgba(255, 120, 90, 0.7)";
        ctx.lineWidth = 3;
        for (let i = 1; i <= 3; i++) {
          ctx.beginPath();
          ctx.moveTo(Math.cos(back) * r * (1.1 + i * 0.35), Math.sin(back) * r * (1.1 + i * 0.35));
          ctx.lineTo(Math.cos(back) * r * (1.5 + i * 0.35), Math.sin(back) * r * (1.5 + i * 0.35));
          ctx.stroke();
        }
      }

      // Spikes.
      if (this.spikeLen > 0) {
        ctx.strokeStyle = INK;
        ctx.lineWidth = this.isBoss ? 3 : 2;
        for (const s of this.spikes) {
          const a = s.a + Math.sin(this.wobble * 0.5) * 0.05;
          const ca = Math.cos(a);
          const sa = Math.sin(a);
          const bx = ca * r * 0.7 * aspect;
          const by = sa * r * 0.7;
          const len = r * (0.7 + (s.len - 0.7) * this.spikeLen);
          const tx = ca * len * aspect;
          const ty = sa * len;
          const px = Math.cos(a + Math.PI / 2) * r * s.w;
          const py = Math.sin(a + Math.PI / 2) * r * s.w;
          ctx.fillStyle = flash ? "#ffffff" : "#b9c9e6";
          ctx.beginPath();
          ctx.moveTo(bx + px, by + py);
          ctx.lineTo(tx, ty);
          ctx.lineTo(bx - px, by - py);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }

      // Body outline (horizontally scaled by aspect).
      const n = this.outline.length;
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const idx = i % n;
        const a = (idx / n) * Math.PI * 2;
        const rad = r * this.outline[idx];
        const px = Math.cos(a) * rad * aspect;
        const py = Math.sin(a) * rad;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      // Bomber glows hotter as its fuse burns down.
      let bodyCol = this.color;
      if (this.bomber && this.fuseT > 0) {
        const f = 1 - this.fuseT / this.fuseTime;
        const blink = Math.sin(this.wobble * (6 + f * 22)) > 0;
        bodyCol = blink ? "#ff7a4a" : this.color;
      }
      ctx.fillStyle = flash ? (telegraph ? "#ffd0d0" : "#ffffff") : bodyCol;
      ctx.fill();
      if (chilled) {
        ctx.fillStyle = "rgba(150,210,255,0.34)";
        ctx.fill();
      }
      ctx.lineWidth = this.isBoss ? 3.5 : 2.5;
      ctx.strokeStyle = chilled ? "#9fd8ff" : INK;
      ctx.stroke();

      if (!flash) {
        ctx.save();
        ctx.clip();
        ctx.fillStyle = "rgba(20,16,28,0.4)";
        ctx.beginPath();
        ctx.ellipse(r * 0.3, r * 0.45, r * 1.1, r * 0.9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(200, 215, 240, 0.4)";
        for (const s of this.specks) {
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          ctx.fill();
        }
        // Splitter shows the seam it cleaves along.
        if (this.feature === "seam") {
          ctx.strokeStyle = "rgba(15,25,18,0.55)";
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(0, -r);
          ctx.lineTo(0, r);
          ctx.stroke();
        }
        ctx.restore();
      }

      // Bomber fuse blast ring tell.
      if (this.bomber && this.fuseT > 0 && !flash) {
        const f = 1 - this.fuseT / this.fuseTime;
        ctx.strokeStyle = `rgba(255, 140, 70, ${0.25 + 0.45 * f})`;
        ctx.lineWidth = 2 + 2 * f;
        ctx.beginPath();
        ctx.arc(0, 0, r * (1.25 + 0.35 * Math.sin(this.wobble * 8)), 0, Math.PI * 2);
        ctx.stroke();
      }

      // Magic casters get a hovering rune.
      if (this.magic && !flash) {
        ctx.strokeStyle = "rgba(190, 150, 255, 0.8)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, -r * 1.5, r * 0.3, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Feature crown / emblem.
      this.drawFeature(ctx, r, aspect, flash);

      // Boss horns.
      if (this.isBoss) {
        ctx.fillStyle = flash ? "#fff" : "#1c1620";
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2;
        for (const sx of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(sx * r * 0.35, -r * 0.8);
          ctx.lineTo(sx * r * 0.62, -r * 1.45);
          ctx.lineTo(sx * r * 0.7, -r * 0.7);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }

      this.drawEyes(ctx, r, aspect, flash);

      // Heal beam to the ally being mended (tracks the live ally).
      if (this.healBeam && !this.healBeam.target.dead) {
        const bx = this.healBeam.target.x - this.x;
        const by = this.healBeam.target.y - (this.y + bob);
        ctx.strokeStyle = `rgba(150, 245, 180, ${0.6 * (this.healBeam.t / 0.35)})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.2);
        ctx.lineTo(bx, by);
        ctx.stroke();
        ctx.fillStyle = "rgba(190, 255, 210, 0.9)";
        ctx.beginPath();
        ctx.arc(bx, by, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
      this.drawHpBar(ctx);
    },

    drawLegs(ctx, r, aspect) {
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      for (const sx of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const ang = (0.5 + i * 0.5) * sx;
          const wig = Math.sin(this.wobble + i) * 0.12;
          const ox = sx * r * 0.6 * aspect;
          const oy = -r * 0.1 + i * r * 0.4;
          ctx.beginPath();
          ctx.moveTo(ox, oy);
          ctx.lineTo(ox + Math.cos(ang + wig) * r * 0.9, oy + Math.abs(Math.sin(ang)) * r * 0.5 + r * 0.3);
          ctx.stroke();
        }
      }
      ctx.lineCap = "butt";
    },

    drawEyes(ctx, r, aspect, flash) {
      const ey = -r * 0.08;
      const ox = r * 0.32 * aspect;
      const out = r * 0.26 * this.eyeScale;
      const inn = r * 0.13 * this.eyeScale;
      const pts = this.eyeCount === 1 ? [[0, ey]] : this.eyeCount === 3 ? [[-ox, ey], [ox, ey], [0, ey - r * 0.34]] : [[-ox, ey], [ox, ey]];
      ctx.fillStyle = INK;
      for (const [px, py] of pts) {
        ctx.beginPath();
        ctx.arc(px, py, out, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = flash ? "#ff5d5d" : this.eyeColor;
      for (const [px, py] of pts) {
        ctx.beginPath();
        ctx.arc(px + 0.02 * r, py + 0.02 * r, inn, 0, Math.PI * 2);
        ctx.fill();
      }
    },

    drawFeature(ctx, r, aspect, flash) {
      switch (this.feature) {
        case "horns": {
          // Brute: upward horns. Charger: horns rake forward along its facing.
          ctx.fillStyle = flash ? "#fff" : "#efe6d6";
          ctx.strokeStyle = INK;
          ctx.lineWidth = 2;
          const fwd = this.hornUp ? -Math.PI / 2 : this.facing;
          for (const side of [-0.5, 0.5]) {
            const baseA = fwd + side;
            const bx = Math.cos(baseA) * r * 0.7 * aspect;
            const by = Math.sin(baseA) * r * 0.7 - r * 0.2;
            const tx = bx + Math.cos(fwd) * r * 0.95;
            const ty = by + Math.sin(fwd) * r * 0.95 - r * 0.1;
            ctx.beginPath();
            ctx.moveTo(bx, by);
            ctx.quadraticCurveTo(bx + Math.cos(fwd) * r * 0.4, by + Math.sin(fwd) * r * 0.4 - r * 0.3, tx, ty);
            ctx.lineTo(bx + Math.cos(baseA) * r * 0.3, by + Math.sin(baseA) * r * 0.3);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          }
          break;
        }
        case "fuse": {
          ctx.strokeStyle = flash ? "#fff" : "#2a2018";
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(0, -r * 0.9);
          ctx.quadraticCurveTo(r * 0.3, -r * 1.4, r * 0.1, -r * 1.6);
          ctx.stroke();
          ctx.fillStyle = this.fuseT > 0 && Math.sin(this.wobble * 18) > 0 ? "#fff0b0" : "#ff9a3a";
          ctx.beginPath();
          ctx.arc(r * 0.1, -r * 1.65, 3.2, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case "sigil": {
          const y = -r * 1.7;
          const rad = r * (0.5 + (this.summonPulse > 0 ? 0.2 : 0));
          ctx.strokeStyle = flash ? "#fff" : `rgba(150, 190, 255, ${this.summonPulse > 0 ? 0.95 : 0.7})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, y, rad, 0, Math.PI * 2);
          ctx.stroke();
          for (let i = 0; i < 6; i++) {
            const a = this.wobble * 0.5 + (i / 6) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * rad, y + Math.sin(a) * rad);
            ctx.lineTo(Math.cos(a) * rad * 1.35, y + Math.sin(a) * rad * 1.35);
            ctx.stroke();
          }
          break;
        }
        case "cross": {
          ctx.fillStyle = flash ? "#fff" : "#eafff0";
          ctx.strokeStyle = "rgba(40,120,80,0.8)";
          ctx.lineWidth = 1.5;
          const a = r * 0.16;
          const b = r * 0.42;
          ctx.beginPath();
          ctx.rect(-a, -b, a * 2, b * 2);
          ctx.rect(-b, -a, b * 2, a * 2);
          ctx.fill();
          break;
        }
        case "shield": {
          ctx.save();
          ctx.rotate(this.facing);
          const lit = this.blockFlash > 0;
          ctx.strokeStyle = lit ? "#ffffff" : "#aeb8c6";
          ctx.lineWidth = lit ? 7 : 5;
          ctx.beginPath();
          ctx.arc(r * 0.55, 0, r * 1.05, -this.shieldArc, this.shieldArc);
          ctx.stroke();
          ctx.strokeStyle = INK;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          if (lit) {
            ctx.strokeStyle = `rgba(180, 220, 255, ${this.blockFlash / 0.16})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(r * 0.55, 0, r * 1.25, -this.shieldArc, this.shieldArc);
            ctx.stroke();
          }
          ctx.restore();
          break;
        }
        case "nozzle": {
          ctx.fillStyle = flash ? "#fff" : "#3a4424";
          ctx.beginPath();
          ctx.ellipse(0, r * 0.55, r * 0.26, r * 0.18, 0, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
      }
    },
  });
}
