// Procedural creepy soundtrack, synced to timeline.js. Writes soundtrack.wav (48k stereo).
const fs = require('fs');
const path = require('path');
const TL = require('./timeline.js');

const SR = 48000, N = Math.floor(SR * TL.DUR);
const L = new Float32Array(N), R = new Float32Array(N), SEND = new Float32Array(N);
const TAU = Math.PI * 2;
let seed = 7;
const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const noise = () => rand() * 2 - 1;
const at = (t) => Math.floor(t * SR);
function put(i, v, pan = 0, send = 0) {
  if (i < 0 || i >= N) return;
  L[i] += v * Math.min(1, 1 - pan); R[i] += v * Math.min(1, 1 + pan); SEND[i] += v * send;
}
const seg = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));

// ---- bed: detuned drone + tritone + wind
{
  let lp = 0, lp2 = 0;
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    let lvl = 0.55 + 0.45 * Math.sin(TAU * 0.07 * t);
    if (t > 11.4 && t < 15.4) lvl *= 1.5;
    if (t > 26.8) lvl *= 1.35;
    const env = seg(t, 0, 0.02) * (1 - seg(t, 29.3, 29.9));
    const d = 0.05 * (Math.sin(TAU * 41.2 * t) + 0.7 * Math.sin(TAU * 82.4 * t + 0.4 * Math.sin(TAU * 0.11 * t)) + 0.35 * Math.sin(TAU * 58.27 * t));
    const d2 = 0.05 * (Math.sin(TAU * 41.45 * t) + 0.7 * Math.sin(TAU * 82.9 * t) + 0.35 * Math.sin(TAU * 58.5 * t + 1));
    lp += 0.004 * (noise() - lp); lp2 += (0.002 + 0.002 * Math.sin(TAU * 0.13 * t)) * (noise() - lp2);
    const wind = (lp * 0.9 + lp2 * 1.2) * 0.9;
    const v = env * lvl;
    L[i] += v * (d + wind); R[i] += v * (d2 + wind * 0.9);
    // tinnitus whine in the creepy sections
    const wl = (t < 3 ? 1 : 0) + (t > 11.4 && t < 15.4 ? 1 : 0) + (t > 26.8 ? 0.8 : 0);
    if (wl) { const w = 0.006 * wl * env * Math.sin(TAU * (2637 * t + 0.8 * Math.sin(TAU * 5.3 * t))); L[i] += w; R[i] += w * 0.6; }
  }
}
// ---- heartbeat
TL.HEART.forEach((t0, k) => {
  const amp = k % 2 ? 0.5 : 0.75; let ph = 0;
  for (let j = 0; j < SR * 0.3; j++) {
    const s = j / SR, f = 62 - 26 * s / 0.3; ph += TAU * f / SR;
    put(at(t0) + j, Math.sin(ph) * Math.exp(-s * 18) * (1 - Math.exp(-s * 500)) * amp, 0, 0.1);
  }
});
// ---- glitch bursts on cuts
TL.CUTS.forEach((t0, k) => {
  const dur = 0.12 + rand() * 0.12, pan = rand() * 1.4 - 0.7; let hold = 0, hc = 0, sq = 200 + rand() * 1800, ph = 0;
  for (let j = 0; j < SR * dur; j++) {
    if (hc-- <= 0) { hold = noise(); hc = 4 + Math.floor(rand() * 40); }
    if (j % 960 === 0) sq = 150 + rand() * 2200;
    ph += sq / SR;
    const env = Math.min(1, j / 100) * (1 - j / (SR * dur));
    put(at(t0) + j, (hold * 0.6 + (ph % 1 < 0.5 ? 0.25 : -0.25)) * env * 0.32, pan, 0.2);
  }
});
// ---- typing clicks
for (const T of [TL.TYPE1, TL.TYPE2]) {
  for (let c = 0; c < T.text.length; c++) {
    const t0 = T.t0 + (c / T.text.length) * (T.t1 - T.t0) + rand() * 0.008, pan = rand() * 0.6 - 0.3;
    let prev = 0;
    for (let j = 0; j < SR * 0.012; j++) { const n = noise(); put(at(t0) + j, (n - prev) * Math.exp(-j / (SR * 0.0025)) * 0.16, pan); prev = n; }
  }
}
// ---- mouse clicks (down + up)
for (const t0 of TL.CLICKS) for (const [o, a] of [[0, 0.45], [0.075, 0.25]]) {
  let prev = 0;
  for (let j = 0; j < SR * 0.01; j++) { const n = noise(); put(at(t0 + o) + j, ((n - prev) * 0.7 + Math.sin(TAU * 2800 * j / SR) * 0.5) * Math.exp(-j / (SR * 0.0012)) * a, 0.15); prev = n; }
}
// ---- tones
function tone(t0, freqs, dur, amp, decay, send = 0.4, pan = 0, shape = 'sin') {
  freqs.forEach((f, k) => {
    for (let j = 0; j < SR * dur; j++) {
      const s = j / SR, p = (f * s) % 1;
      const w = shape === 'sq' ? (p < 0.5 ? 1 : -1) * 0.5 : Math.sin(TAU * f * s) + 0.15 * Math.sin(TAU * f * 2.01 * s);
      put(at(t0) + j, w * amp * Math.exp(-s * decay) * Math.min(1, j / 200), pan + (k - freqs.length / 2) * 0.1, send);
    }
  });
}
tone(TL.AGREE, [523.25, 659.25, 783.99, 1046.5], 2.0, 0.05, 2.2, 0.7);
TL.BLIPS.forEach((t0, i) => tone(t0, [440 * Math.pow(2, (i * 2) / 12)], 0.4, 0.09, 9, 0.5, (i % 2 ? 0.3 : -0.3)));
TL.DENY.forEach((t0) => tone(t0, [92, 97.5], 0.3, 0.13, 6, 0.1, 0, 'sq'));
TL.VOTES.forEach((t0, i) => tone(t0, i === TL.VOTE_NO ? [233] : [880, 1318.5], 0.25, i === TL.VOTE_NO ? 0.1 : 0.05, 12, 0.4, (i - 2) * 0.3, i === TL.VOTE_NO ? 'sq' : 'sin'));
tone(TL.CONSENSUS, [392, 493.88, 587.33, 783.99], 2.0, 0.05, 1.8, 0.7);
// ---- chaos: dissonant swarm
for (let v = 0; v < 9; v++) {
  const f0 = 120 + rand() * 700, pan = rand() * 1.6 - 0.8, vib = 3 + rand() * 9; let ph = 0;
  for (let j = 0; j < SR * 1.8; j++) {
    const s = j / SR; ph += TAU * f0 * (1 + 0.03 * Math.sin(TAU * vib * s)) / SR;
    const env = Math.min(1, s / 0.05) * (1 - s / 1.8);
    put(at(TL.CHAOS) + j, (Math.sin(ph) + 0.4 * Math.sin(ph * 2.03)) * env * 0.025, pan, 0.3);
  }
}
// ---- the turn: growl, then a cat hiss
{
  let lp = 0, ph = 0;
  for (let j = 0; j < SR * 0.6; j++) {
    const s = j / SR; ph += TAU * 68 / SR; lp += 0.05 * (noise() - lp);
    const env = Math.min(1, s / 0.1) * (1 - s / 0.6);
    put(at(TL.TURN) + j, (lp * 2 * (0.5 + 0.5 * Math.sin(TAU * 31 * s)) + 0.3 * ((ph / TAU) % 1 - 0.5)) * env * 0.35, 0, 0.3);
  }
  let prev = 0, hp = 0;
  for (let j = 0; j < SR * 0.7; j++) {
    const s = j / SR, n = noise(); hp = n - prev; prev = n;
    const env = Math.min(1, s / 0.03) * Math.exp(-s * 3.5);
    put(at(TL.HISS) + j, hp * env * 0.22 * (0.8 + 0.2 * Math.sin(TAU * 47 * s)), Math.sin(s * 6) * 0.4, 0.4);
  }
}
// ---- riser + impact
{
  const [a, b] = TL.RISER; let lp = 0, ph = 0;
  for (let j = 0; j < SR * (b - a); j++) {
    const s = j / SR, p = s / (b - a); lp += (0.01 + 0.3 * p * p) * (noise() - lp);
    ph += TAU * (150 + 1250 * p * p) / SR;
    put(at(a) + j, (lp * 0.5 + Math.sin(ph) * 0.06) * p * p * 0.6, Math.sin(s * 9) * 0.3 * p, 0.3);
  }
  let ph2 = 0, lp2 = 0;
  for (let j = 0; j < SR * 2.8; j++) {
    const s = j / SR; ph2 += TAU * (30 + 30 * Math.exp(-s * 6)) / SR; lp2 += 0.12 * (noise() - lp2);
    put(at(TL.IMPACT) + j, Math.sin(ph2) * Math.exp(-s * 1.6) * 0.75 + lp2 * Math.exp(-s * 5) * 0.5, 0, 0.6);
  }
}
// ---- final pad (E minor + F#), slow tremolo
for (const [f, p] of [[164.81, -0.4], [196, 0.3], [246.94, -0.2], [369.99, 0.4], [82.41, 0]]) {
  for (let j = 0; j < SR * 3.2; j++) {
    const s = j / SR, t = TL.IMPACT + s;
    const env = Math.min(1, s / 0.6) * (1 - seg(t, 29.2, 29.85)) * (0.75 + 0.25 * Math.sin(TAU * 4 * s + f));
    put(at(TL.IMPACT) + j, (Math.sin(TAU * f * s) + 0.25 * Math.sin(TAU * f * 3.003 * s)) * env * 0.035, p, 0.6);
  }
}
// ---- CRT power-off zap
for (let j = 0; j < SR * 0.35; j++) { const s = j / SR; put(at(29.45) + j, Math.sin(TAU * (900 - 2400 * s) * s) * Math.exp(-s * 9) * 0.12, 0, 0.3); }

// ================= eyes: blink / open sounds =================
// same hash as main.js so the chaotic blinks land on the exact frames
function rndv(a, b = 0, c = 0) { const x = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453; return x - Math.floor(x); }
// wet eyelid: pitched "tock" + filtered moist noise + soft thud
function blink(t0, amp, pan = 0, pitch = 1) {
  let lp = 0, lp2 = 0, ph = 0;
  for (let j = 0; j < SR * 0.09; j++) {
    const s = j / SR;
    ph += TAU * (1500 * pitch * Math.exp(-s * 90) + 380 * pitch) / SR;
    const n = noise(); lp += 0.35 * (n - lp); lp2 += 0.08 * (lp - lp2);
    const v = Math.sin(ph) * Math.exp(-s * 160) * 0.8 + (lp - lp2) * Math.exp(-s * 70) * 1.6 + Math.sin(TAU * 110 * pitch * s) * Math.exp(-s * 55) * 0.5;
    put(at(t0) + j, v * amp, pan, 0.25);
  }
}
// 100 eyes in perfect sync: a tight crowd of blinks, spread across the stereo field by column
function crowd(t0, amp) {
  for (let i = 0; i < 100; i++) blink(t0 + rndv(i, 91) * 0.006, amp / 45, ((i % 20) - 9.5) / 11, 0.92 + rndv(i, 92) * 0.16);
}
blink(TL.EYE_OPEN + 0.01, 0.55, 0, 0.7);
blink(TL.BLINK1, 0.45, 0, 0.85); blink(TL.BLINK1 + 0.12, 0.3, 0, 0.95);
crowd(TL.SYNC_OPEN, 1.0);
crowd(TL.SYNC_BLINK, 0.8); crowd(TL.SYNC_BLINK + 0.14, 0.5);
// synced gaze shifts: all eyes move together -> one soft swish
TL.SYNC_GAZE.forEach((t0, k) => {
  let lp = 0;
  for (let j = 0; j < SR * 0.18; j++) { const s = j / SR; lp += (0.05 + 0.4 * s) * (noise() - lp); put(at(t0) + j, lp * Math.sin(Math.PI * s / 0.18) * 0.5, k ? -0.6 : 0.6, 0.2); }
});
// chaos: the SAME blink events the renderer draws, now out of sync, everywhere
{
  let n = 0;
  for (let i = 0; i < 100; i++) {
    const off = rndv(i, 9) * 3, col = i % 20;
    for (let k = Math.floor(off); k <= Math.floor(1.8 * 6 + off); k++) {
      const ts = TL.CHAOS + Math.max(0, (k - off) / 6);
      if (ts >= TL.CHAOS + 1.8 || (i === TL.IRIS.node && ts > TL.IRIS.z0 - 0.25)) continue;
      if (rndv(i, k, 5) > 0.82) {
        const fade = 1 - seg(ts, TL.IRIS.z0, TL.IRIS.cut);
        blink(ts + rndv(i, k, 33) * 0.02, 0.16 * fade, (col - 9.5) / 10, 0.7 + rndv(i, k, 34) * 0.7); n++;
      }
    }
  }
  console.log('chaos blinks', n);
}
// ================= transitions =================
// fur wipe: growing rustle that peaks at the cut, then retracts
for (const w of TL.WIPES) {
  let lp = 0, hp = 0, prev = 0, crack = 0;
  for (let j = 0; j < SR * 0.95; j++) {
    const t = w - 0.45 + j / SR;
    const c = t < w ? Math.pow(seg(t, w - 0.45, w), 1.6) : 1 - seg(t, w, w + 0.5);
    const n = noise(); hp = n - prev; prev = n; lp += 0.25 * (hp - lp);
    if (rand() < 0.004 * c) crack = 1;
    crack *= 0.97;
    put(at(w - 0.45) + j, (lp * 0.9 + noise() * crack * 0.6) * c * 0.32, Math.sin(t * 7) * 0.5, 0.35);
  }
  blink(w, 0.25, 0, 0.6);
}
// dive into the pupil: falling pitch + closing filter, then a deep wet "gulp" when we pass through
{
  const { z0, cut } = TL.IRIS; let ph = 0, lp = 0;
  for (let j = 0; j < SR * (cut - z0); j++) {
    const s = j / SR, p = s / (cut - z0);
    ph += TAU * (520 * Math.pow(0.1, p)) / SR; lp += (0.2 * (1 - p) + 0.01) * (noise() - lp);
    put(at(z0) + j, (Math.sin(ph) * 0.25 + lp * 0.6) * p * p, 0, 0.4);
  }
  blink(cut, 0.9, 0, 0.32);
  let ph2 = 0;
  for (let j = 0; j < SR * 0.8; j++) { const s = j / SR; ph2 += TAU * (45 + 40 * Math.exp(-s * 10)) / SR; put(at(cut) + j, Math.sin(ph2) * Math.exp(-s * 4) * 0.55, 0, 0.3); }
}
// opening hook: sub hit on frame 1
{
  let ph = 0, lp = 0;
  for (let j = 0; j < SR * 1.2; j++) {
    const s = j / SR; ph += TAU * (34 + 50 * Math.exp(-s * 14)) / SR; lp += 0.15 * (noise() - lp);
    put(j, Math.sin(ph) * Math.exp(-s * 3) * 0.7 + lp * Math.exp(-s * 12) * 0.35, 0, 0.5);
  }
}

// ---- reverb (Schroeder) on the send bus
{
  const combs = [1557, 1617, 1491, 1422, 1277, 1356].map((d) => ({ d: Math.round(d * SR / 44100), buf: null, i: 0, fb: 0.84, lp: 0 }));
  combs.forEach((c) => (c.buf = new Float32Array(c.d)));
  const aps = [556, 441, 341].map((d) => ({ d: Math.round(d * SR / 44100), buf: new Float32Array(Math.round(d * SR / 44100)), i: 0 }));
  for (let i = 0; i < N; i++) {
    const x = SEND[i] * 0.25; let y = 0;
    for (const c of combs) { const o = c.buf[c.i]; c.lp = o * 0.7 + c.lp * 0.3; c.buf[c.i] = x + c.lp * c.fb; c.i = (c.i + 1) % c.d; y += o; }
    for (const a of aps) { const o = a.buf[a.i]; const v = y + o * 0.5; a.buf[a.i] = v; a.i = (a.i + 1) % a.d; y = o - v * 0.5; }
    L[i] += y * 0.55; R[i] += (i > 30 ? y : 0) * 0.5;
  }
}

// ---- master: soft clip, normalize, write 16-bit WAV
let peak = 0;
for (let i = 0; i < N; i++) { L[i] = Math.tanh(L[i] * 1.2); R[i] = Math.tanh(R[i] * 1.2); peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
const g = 0.92 / peak;
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * g)) * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * g)) * 32767), 46 + i * 4);
}
fs.writeFileSync(path.join(__dirname, 'soundtrack.wav'), buf);
console.log('wrote soundtrack.wav', (N / SR).toFixed(1) + 's', 'peak', peak.toFixed(3));
