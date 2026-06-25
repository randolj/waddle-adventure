// Procedural sound effects via WebAudio — no asset files. Lazily created and
// resumed on the first user interaction (autoplay policy).

let actx = null;
let master = null;
let muted = false; // the player's own mute toggle
let autoMuted = false; // ad break / tab hidden — independent of the player's toggle
let portalMuted = false; // the portal player's mute setting (CrazyGames settings.muteAudio)
const VOL = 0.32;

function silent() {
  return muted || autoMuted || portalMuted;
}
function applyGain() {
  if (master) master.gain.value = silent() ? 0 : VOL;
}

function getCtx() {
  if (!actx) {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    master = actx.createGain();
    master.gain.value = silent() ? 0 : VOL;
    master.connect(actx.destination);
  }
  return actx;
}

export function resumeAudio() {
  const c = getCtx();
  if (c.state === "suspended") c.resume();
}
export function toggleMute() {
  muted = !muted;
  applyGain();
  return muted;
}
export function isMuted() {
  return muted;
}
// Silence audio for an ad / hidden tab without touching the player's mute preference.
export function setAutoMute(on) {
  autoMuted = !!on;
  applyGain();
}
// Honor the portal player's mute setting (CrazyGames settings.muteAudio).
export function setPortalMute(on) {
  portalMuted = !!on;
  applyGain();
}

function ready() {
  return !silent() && actx && actx.state === "running";
}

function tone(freq, dur, type = "sine", peak = 0.3, slideTo = null, delay = 0) {
  if (!ready()) return;
  const c = actx;
  const t0 = c.currentTime + delay;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.03);
}

function noise(dur, peak, filter = "bandpass", freq = 1500, sweepTo = null) {
  if (!ready()) return;
  const c = actx;
  const t0 = c.currentTime;
  const n = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = filter;
  f.frequency.setValueAtTime(freq, t0);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f);
  f.connect(g);
  g.connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.03);
}

export const sfx = {
  swing() {
    noise(0.15, 0.16, "bandpass", 1100, 2800);
  },
  hit(crit) {
    tone(crit ? 540 : 340, 0.11, "square", crit ? 0.26 : 0.2, crit ? 920 : 520);
    noise(0.07, 0.16, "highpass", 1600);
  },
  dashStrike() {
    tone(700, 0.18, "sawtooth", 0.26, 220);
    noise(0.18, 0.2, "bandpass", 1500, 420);
  },
  kill(boss) {
    tone(boss ? 90 : 170, boss ? 0.5 : 0.2, "sawtooth", 0.28, boss ? 40 : 70);
    noise(boss ? 0.4 : 0.16, boss ? 0.28 : 0.2, "lowpass", boss ? 600 : 1300, 200);
  },
  dash() {
    noise(0.2, 0.18, "bandpass", 600, 2200);
  },
  chain() {
    tone(820, 0.12, "triangle", 0.22, 1500);
  },
  hurt() {
    tone(150, 0.2, "square", 0.28, 60);
    noise(0.12, 0.18, "lowpass", 700);
  },
  coin() {
    tone(880, 0.07, "square", 0.18);
    tone(1320, 0.09, "square", 0.18, null, 0.06);
  },
  item() {
    tone(523, 0.1, "triangle", 0.2);
    tone(784, 0.12, "triangle", 0.2, null, 0.08);
    tone(1046, 0.14, "triangle", 0.2, null, 0.16);
  },
  enterDungeon() {
    tone(220, 0.4, "sawtooth", 0.22, 110);
  },
  decode() {
    tone(660, 0.18, "sine", 0.24, 990);
    tone(990, 0.26, "sine", 0.24, 1320, 0.12);
  },
};
