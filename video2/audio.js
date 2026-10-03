// Music + UI sound design for the clean cut. 120 BPM, A minor (Am–F–C–G), synced to timeline.js.
const fs = require('fs');
const path = require('path');
const TL = require('./timeline.js');

const SR = 48000, N = Math.floor(SR * TL.DUR), TAU = Math.PI * 2;
const L = new Float32Array(N), R = new Float32Array(N), SEND = new Float32Array(N), MUS = new Float32Array(N * 2);
let seed = 11;
const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const noise = () => rand() * 2 - 1;
const at = (t) => Math.floor(t * SR);
const seg = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
// music bus (gets sidechained) vs fx bus (UI sounds, never ducked)
function putM(i, v, pan = 0, send = 0) { if (i < 0 || i >= N) return; MUS[i * 2] += v * Math.min(1, 1 - pan); MUS[i * 2 + 1] += v * Math.min(1, 1 + pan); SEND[i] += v * send; }
function putF(i, v, pan = 0, send = 0) { if (i < 0 || i >= N) return; L[i] += v * Math.min(1, 1 - pan); R[i] += v * Math.min(1, 1 + pan); SEND[i] += v * send; }

const BEAT = 60 / TL.BPM, T0 = TL.MUSIC_IN;
const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]; // Am F C G
const ROOTS = [45, 41, 48, 43];
const chordAt = (t) => Math.floor(Math.max(0, t - T0) / (BEAT * 4)) % 4;
const inChaos = (t) => t >= 9.5 && t < 11.5;

// ---------------- drums
const kicks = [];
for (let t = T0; t < 29.0; t += BEAT) {
  if (t >= 19.5 && t < 20.5) continue; // breathe for the cursor moment
  if (inChaos(t) && Math.round((t - T0) / BEAT) % 2) continue; // half-time in chaos
  if (t >= 25.9 && t < 26.5) continue; // gap before the drop
  kicks.push(t);
}
function kick(t0, amp = 0.9) {
  let ph = 0;
  for (let j = 0; j < SR * 0.35; j++) {
    const s = j / SR; ph += TAU * (45 + 110 * Math.exp(-s * 28)) / SR;
    putF(at(t0) + j, (Math.sin(ph) * Math.exp(-s * 7) + (j < 60 ? noise() * 0.3 : 0)) * amp, 0, 0.02);
  }
}
kicks.forEach((t) => kick(t));
function hat(t0, amp = 0.12, open = false) {
  let prev = 0, hp = 0;
  for (let j = 0; j < SR * (open ? 0.18 : 0.045); j++) {
    const s = j / SR, n = noise(); hp = 0.85 * (hp + n - prev); prev = n;
    putF(at(t0) + j, hp * Math.exp(-s * (open ? 18 : 90)) * amp, 0.25, 0.05);
  }
}
function clap(t0, amp = 0.35) {
  let lp = 0;
  for (let j = 0; j < SR * 0.25; j++) {
    const s = j / SR; lp += 0.35 * (noise() - lp);
    const env = (s < 0.01 ? 1 : 0.6) * Math.exp(-s * 18) * (1 + 0.6 * (s < 0.03 ? Math.sin(s * 600) : 0));
    putF(at(t0) + j, (noise() - lp) * env * amp, -0.1, 0.3);
  }
}
for (let t = T0; t < 29.0; t += BEAT / 2) {
  const k = Math.round((t - T0) / (BEAT / 2));
  if (t >= 19.5 && t < 20.5) continue;
  if (k % 2 === 1) hat(t, inChaos(t) ? 0.06 : 0.11, k % 8 === 7);
  if (k % 4 === 2 && !inChaos(t) && t < 25.9) clap(t);
}
// snare roll into the drop
for (let k = 0; k < 12; k++) { const t = 25.75 + k * (0.75 / 12); clap(t, 0.08 + 0.25 * (k / 12)); }

// ---------------- bass (8ths, sidechained), detuned/wobbly during chaos
for (let t = T0; t < 29.0; t += BEAT / 2) {
  if (t >= 19.5 && t < 20.5) continue;
  const root = ROOTS[chordAt(t)] - 12 + (Math.round((t - T0) / (BEAT / 2)) % 4 === 3 ? 12 : 0);
  const chaosOff = inChaos(t) ? (rand() - 0.5) * 1.6 : 0;
  let ph = 0, lp = 0;
  for (let j = 0; j < SR * BEAT / 2 * 0.9; j++) {
    const s = j / SR, f = mtof(root + chaosOff) * (inChaos(t) ? 1 + 0.03 * Math.sin(TAU * 7 * s) : 1);
    ph = (ph + f / SR) % 1;
    lp += (0.06 + 0.12 * Math.exp(-s * 20)) * ((ph * 2 - 1) - lp);
    putM(at(t) + j, (lp * 0.9 + Math.sin(TAU * ph) * 0.5) * Math.min(1, j / 80) * Math.exp(-s * 3) * 0.32, 0, 0);
  }
}
// ---------------- pad (chord, slow attack) from 1.5
for (let bar = 0; T0 + bar * BEAT * 4 < 30; bar++) {
  const t0 = T0 + bar * BEAT * 4, ch = CHORDS[bar % 4], dur = BEAT * 4 + 0.3;
  ch.forEach((m, k) => {
    for (const det of [-0.08, 0.08]) {
      let ph = 0, lp = 0;
      for (let j = 0; j < SR * dur && at(t0) + j < N; j++) {
        const s = j / SR, t = t0 + s; ph = (ph + mtof(m + det) / SR) % 1;
        lp += 0.03 * ((ph * 2 - 1) - lp);
        const lvl = t >= 26.5 ? 1.3 : t >= 11.5 && t < 15 ? 1.0 : 0.7;
        putM(at(t0) + j, lp * Math.min(1, s / 0.25) * Math.min(1, (dur - s) / 0.3) * 0.05 * lvl, det * 4, 0.5);
      }
    }
  });
}
// ---------------- arp (16ths) in the GenVM scene and the outro
function pluck(t0, m, amp, pan = 0) {
  let ph = 0, lp = 0;
  for (let j = 0; j < SR * 0.3; j++) {
    const s = j / SR; ph = (ph + mtof(m) / SR) % 1;
    lp += (0.05 + 0.5 * Math.exp(-s * 30)) * ((ph < 0.5 ? 1 : -1) - lp);
    putM(at(t0) + j, lp * Math.exp(-s * 12) * amp, pan, 0.35);
  }
}
for (let t = 11.5; t < 29.0; t += BEAT / 4) {
  if (!(t < 15.0 || t >= 26.5)) continue;
  const k = Math.round((t - T0) / (BEAT / 4)), ch = CHORDS[chordAt(t)];
  pluck(t, ch[k % 3] + 12 + (k % 8 >= 4 ? 12 : 0), 0.07, k % 2 ? 0.35 : -0.35);
}

// ---------------- sidechain the music bus to the kicks, then mix in
for (let i = 0; i < N; i++) {
  const t = i / SR; let duck = 1;
  for (let k = kicks.length - 1; k >= 0; k--) { const d = t - kicks[k]; if (d >= 0) { duck = 1 - 0.65 * Math.exp(-d * 9); break; } }
  L[i] += MUS[i * 2] * duck; R[i] += MUS[i * 2 + 1] * duck;
}

// ================= SFX
function whoosh(t0, dur, amp, panFrom = -0.8, panTo = 0.8, up = true) {
  let lp = 0, lp2 = 0;
  for (let j = 0; j < SR * dur; j++) {
    const s = j / SR, p = s / dur, env = Math.sin(Math.PI * Math.pow(p, up ? 0.7 : 1.3));
    const c = 0.01 + 0.25 * (up ? p : 1 - p);
    lp += c * (noise() - lp); lp2 += c * 0.5 * (lp - lp2);
    putF(at(t0) + j, (lp - lp2 * 0.5) * env * amp, panFrom + (panTo - panFrom) * p, 0.3);
  }
}
function blip(t0, f, amp, dur = 0.12, pan = 0, send = 0.3, shape = 'sin') {
  for (let j = 0; j < SR * dur; j++) {
    const s = j / SR, ph = f * s;
    const w = shape === 'sq' ? ((ph % 1) < 0.5 ? 0.6 : -0.6) : Math.sin(TAU * ph) + 0.2 * Math.sin(TAU * ph * 2);
    putF(at(t0) + j, w * Math.min(1, j / 40) * Math.exp(-s * (6 / dur)) * amp, pan, send);
  }
}
function click(t0, amp = 0.4) {
  for (const [o, a, f] of [[0, 1, 3200], [0.065, 0.55, 2600]]) {
    let prev = 0;
    for (let j = 0; j < SR * 0.012; j++) { const s = j / SR, n = noise(); putF(at(t0 + o) + j, ((n - prev) * 0.6 + Math.sin(TAU * f * s)) * Math.exp(-s * 900) * a * amp, 0.2, 0.05); prev = n; }
  }
}
function chime(t0, notes, amp = 0.06, dur = 1.6) { notes.forEach((m, k) => blip(t0 + k * 0.035, mtof(m), amp, dur, (k - notes.length / 2) * 0.2, 0.6)); }
function hit(t0, amp = 0.8) {
  let ph = 0, lp = 0;
  for (let j = 0; j < SR * 1.6; j++) {
    const s = j / SR; ph += TAU * (38 + 80 * Math.exp(-s * 18)) / SR; lp += 0.2 * (noise() - lp);
    putF(at(t0) + j, Math.sin(ph) * Math.exp(-s * 2.8) * amp + lp * Math.exp(-s * 9) * 0.35 * amp, 0, 0.5);
  }
}

// opening: hit + bright stab (frame 1 grabs attention), shimmer riser into the groove
hit(0.0, 0.85);
chime(0.0, [69, 72, 76, 81, 84], 0.07, 2.2);
{ let lp = 0; for (let j = 0; j < SR * 1.25; j++) { const s = j / SR, p = s / 1.25; lp += (0.02 + 0.3 * p * p) * (noise() - lp); putF(at(0.25) + j, (noise() - lp) * p * p * 0.18, Math.sin(s * 5) * 0.5, 0.4); } }
whoosh(1.25, 0.6, 0.45, 0, 0, false); // split
// cursor clicks + toggles (rising)
TL.CLICKS.forEach((t) => click(t));
TL.CURSOR1.filter((k) => k[3]).slice(0, 5).forEach((k, i) => { blip(k[0] + 0.02, mtof(76 + i * 2), 0.09, 0.14, 0.3); blip(k[0] + 0.09, mtof(83 + i * 2), 0.06, 0.18, 0.3); });
// panel wipes, iris, push, outro iris
TL.PANEL_WIPES.forEach((T) => whoosh(T - 0.42, 0.75, 0.55));
whoosh(TL.IRIS.t - 0.25, 0.6, 0.5, 0.4, -0.2);
whoosh(TL.PUSH - 0.3, 0.6, 0.45, 0, 0, false);
// sync flips (all 100 tiles in one go = one tight pluck chord)
TL.SYNC_FLIP.forEach((t, i) => chime(t, CHORDS[i % 4].map((m) => m + 12), 0.05, 0.5));
chime(TL.SYNC_FLIP[3] + 0.12, [76, 81, 88], 0.05, 1.2);
// chaos: tiles flipping out of sync = scattered ticks
for (let k = 0; k < 60; k++) { const t = 9.55 + rand() * 1.9; blip(t, 900 + rand() * 2600, 0.035, 0.05, rand() * 1.6 - 0.8, 0.2); }
// reveals of the big titles: soft low thumps
[1.6, 2.0, 2.5, 5.75, 9.55, 12.25, 15.15, 19.7, 21.4].forEach((t) => blip(t, 70, 0.25, 0.18, 0, 0.1));
// compare steps (ascending)
TL.COMPARE_STEPS.forEach((t, i) => blip(t, mtof(69 + [0, 3, 5, 7, 10, 12][i]), 0.1, 0.22, 0.3, 0.4));
// validator pops, votes, consensus
[20.9, 20.96, 21.02, 21.08, 21.14].forEach((t, i) => blip(t, mtof(84 + i), 0.05, 0.08, (i - 2) * 0.35));
TL.VOTES.forEach((t, i) => i === TL.VOTE_NO ? blip(t, 180, 0.12, 0.2, (i - 2) * 0.35, 0.1, 'sq') : blip(t, mtof(88), 0.08, 0.18, (i - 2) * 0.35));
chime(TL.CONSENSUS, [69, 73, 76, 81], 0.07, 1.8);
// why cards: a stab on every card
TL.WHY.forEach((t, i) => { chime(t, CHORDS[i].map((m) => m + 12), 0.06, 0.35); whoosh(t - 0.05, 0.22, 0.3, 0.6, -0.6); });
// riser + drop into the outro
{ const [a, b] = [25.0, 26.5]; let lp = 0, ph = 0; for (let j = 0; j < SR * (b - a); j++) { const s = j / SR, p = s / (b - a); lp += (0.02 + 0.35 * p * p) * (noise() - lp); ph += TAU * (200 + 900 * p * p) / SR; putF(at(a) + j, ((noise() - lp) * 0.25 + Math.sin(ph) * 0.05) * p * p, 0, 0.4); } }
hit(TL.OUTRO_HIT, 1.0);
chime(TL.OUTRO_HIT, [57, 64, 69, 72, 76, 81], 0.06, 2.8);
chime(28.0, [88, 93], 0.04, 0.6); // mascot pop
// final ring-out
chime(29.0, [45, 57, 64, 69, 72], 0.05, 1.0);

// ---------------- reverb on the send bus
{
  const combs = [1557, 1617, 1491, 1422, 1277, 1356].map((d) => { const n = Math.round(d * SR / 44100); return { n, buf: new Float32Array(n), i: 0, lp: 0 }; });
  const aps = [556, 441, 341].map((d) => { const n = Math.round(d * SR / 44100); return { n, buf: new Float32Array(n), i: 0 }; });
  for (let i = 0; i < N; i++) {
    const x = SEND[i] * 0.2; let y = 0;
    for (const c of combs) { const o = c.buf[c.i]; c.lp = o * 0.6 + c.lp * 0.4; c.buf[c.i] = x + c.lp * 0.82; c.i = (c.i + 1) % c.n; y += o; }
    for (const a of aps) { const o = a.buf[a.i], v = y + o * 0.5; a.buf[a.i] = v; a.i = (a.i + 1) % a.n; y = o - v * 0.5; }
    L[i] += y * 0.5; R[i] += (i > 40 ? y : 0) * 0.46;
  }
}
// ---------------- master: fade, glue, normalize, write
let peak = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR, f = 1 - seg(t, 29.4, 30);
  L[i] = Math.tanh(L[i] * 1.1 * f); R[i] = Math.tanh(R[i] * 1.1 * f);
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const g = 0.93 / peak, buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * g)) * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * g)) * 32767), 46 + i * 4);
}
fs.writeFileSync(path.join(__dirname, 'soundtrack.wav'), buf);
console.log('wrote soundtrack.wav', 'peak', peak.toFixed(3));
