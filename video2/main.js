'use strict';
// GenVM — "clean premium" cut. Swiss-grid kinetic type, colour-block transitions, 120 BPM.
// Pure function of time: renderFrame(t) draws the same frame in preview and export.

const W = 1920, H = 1080, FPS = TL.FPS, DUR = TL.DUR;
const PINK = '#ff87ff', PURPLE = '#dc00ff', CYAN = '#00fff7';
const INK = '#120a1f', PAPER = '#f6f3fb', MUTED = '#8a8299';
const M = 140; // page margin

const cv = document.getElementById('c');
const out = cv.getContext('2d');
const mk = (w = W, h = H) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const sc = mk(), S = sc.getContext('2d');
const bufA = mk(), A = bufA.getContext('2d');
const bufB = mk(), B = bufB.getContext('2d');

// ---------------------------------------------------------------- math
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (t, a, b) => clamp((t - a) / (b - a));
const eox = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const eo3 = (t) => 1 - Math.pow(1 - t, 3);
const eio3 = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const eiox = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2);
const eback = (t) => { const c1 = 1.6, c3 = c1 + 1; return t <= 0 ? 0 : 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const TAU = Math.PI * 2;
function rnd(a, b = 0, c = 0) { const x = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453; return x - Math.floor(x); }
const hexCache = {};
function rgba(hex, a) {
  let c = hexCache[hex];
  if (!c) { const n = parseInt(hex.slice(1), 16); c = hexCache[hex] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}
const beat = (t) => Math.max(0, t - TL.MUSIC_IN) * TL.BPM / 60;
function pulseAt(t, list, len) { let p = 0; for (const k of list) { const d = t - k; if (d >= 0 && d < len) p = Math.max(p, 1 - d / len); } return p; }

// ---------------------------------------------------------------- assets
const logoImg = new Image(); logoImg.src = 'assets/logo.jpg';
const charImg = new Image(); charImg.src = 'assets/character.png';
let logoMask, logoBox, front;
const tintCache = {};
let grain, vignette;

function prepLogo() {
  const c = mk(400, 400), x = c.getContext('2d');
  x.drawImage(logoImg, 0, 0, 400, 400);
  const d = x.getImageData(0, 0, 400, 400);
  let x0 = 400, y0 = 400, x1 = 0, y1 = 0;
  for (let y = 0; y < 400; y++) for (let xx = 0; xx < 400; xx++) {
    const i = (y * 400 + xx) * 4, a = 255 - (d.data[i] + d.data[i + 1] + d.data[i + 2]) / 3;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = 255; d.data[i + 3] = a > 30 ? Math.min(255, a * 1.15) : 0;
    if (a > 128) { x0 = Math.min(x0, xx); x1 = Math.max(x1, xx); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  x.putImageData(d, 0, 0); logoMask = c;
  logoBox = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, h: y1 - y0 };
}
function tinted(key, fill) {
  if (tintCache[key]) return tintCache[key];
  const c = mk(400, 400), x = c.getContext('2d');
  x.drawImage(logoMask, 0, 0); x.globalCompositeOperation = 'source-in';
  x.fillStyle = typeof fill === 'function' ? fill(x) : fill; x.fillRect(0, 0, 400, 400);
  return (tintCache[key] = c);
}
function logo(ctx, cx, cy, h, key, fill, alpha = 1) {
  const s = h / logoBox.h;
  ctx.save(); ctx.globalAlpha *= alpha;
  ctx.drawImage(tinted(key, fill), cx - logoBox.cx * s, cy - logoBox.cy * s, 400 * s, 400 * s);
  ctx.restore();
}
function prepChar() {
  // front view = left-most figure on the turnaround sheet
  const w = charImg.width, h = charImg.height, c = mk(w, h), x = c.getContext('2d');
  x.drawImage(charImg, 0, 0);
  const d = x.getImageData(0, 0, w, h).data, col = new Uint32Array(w);
  for (let y = 0; y < h; y += 2) for (let xx = 0; xx < w; xx++) if (d[(y * w + xx) * 4 + 3] > 24) col[xx]++;
  let a = -1, b = -1, gap = 0;
  for (let xx = 0; xx < w; xx++) {
    if (col[xx] > 40) { if (a < 0) a = xx; b = xx; gap = 0; } else if (a >= 0 && ++gap > 60) break;
  }
  let y0 = h, y1 = 0;
  for (let y = 0; y < h; y += 2) {
    let n = 0; for (let xx = a; xx <= b; xx += 2) if (d[(y * w + xx) * 4 + 3] > 24) n++;
    if (n > 20 && n < (b - a) / 2 * 0.95) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  const vw = b - a + 1, vh = y1 - y0 + 1;
  front = mk(vw, vh); front.getContext('2d').drawImage(charImg, a, y0, vw, vh, 0, 0, vw, vh);
}
function prepFx() {
  grain = mk(960, 540);
  const x = grain.getContext('2d'), id = x.createImageData(960, 540);
  for (let i = 0; i < id.data.length; i += 4) { const v = Math.floor(rnd(i, 3.1) * 255); id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
  x.putImageData(id, 0, 0);
  vignette = out.createRadialGradient(W / 2, H / 2, 500, W / 2, H / 2, 1200);
  vignette.addColorStop(0, 'rgba(0,0,0,0)'); vignette.addColorStop(1, 'rgba(0,0,0,0.2)');
}

// ---------------------------------------------------------------- drawing helpers
function rr(ctx, x, y, w, h, r, fill, stroke, lw = 2) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
function txt(ctx, str, x, y, font, fill, align = 'left', base = 'alphabetic') {
  ctx.font = font; ctx.textAlign = align; ctx.textBaseline = base; ctx.fillStyle = fill; ctx.fillText(str, x, y);
}
function grad(ctx, x0, x1, stops) {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  return g;
}
// masked slide-up reveal (the classic editorial text move)
function reveal(ctx, str, x, y, size, weight, fill, p, align = 'left', exitP = 0) {
  if (p <= 0 || exitP >= 1) return 0;
  ctx.font = `${weight} ${size}px Sora`;
  const w = ctx.measureText(str).width;
  const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  ctx.save(); ctx.beginPath(); ctx.rect(x0 - 30, y - size * 1.02, w + 60, size * 1.4); ctx.clip();
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = fill === 'grad' ? grad(ctx, x0, x0 + w, [PINK, PURPLE, CYAN]) : fill === 'gradDark' ? grad(ctx, x0, x0 + w, [PURPLE, PINK]) : fill;
  ctx.fillText(str, x0, y + (1 - eox(p)) * size * 1.3 - eiox(exitP) * size * 1.3);
  ctx.restore();
  return w;
}
function label(ctx, str, x, y, col, p, align = 'left') {
  if (p <= 0) return;
  ctx.save(); ctx.globalAlpha *= eo3(p);
  ctx.font = '500 20px JB'; ctx.textAlign = align; ctx.textBaseline = 'middle';
  const w = ctx.measureText(str).width, x0 = align === 'center' ? x - w / 2 : x;
  ctx.fillStyle = col; ctx.fillRect(x0, y - 1, 26 * eo3(p), 2);
  ctx.fillText(str, x + (align === 'center' ? 20 : 40), y);
  ctx.restore();
}
function cursorShape(ctx, x, y, press) {
  ctx.save(); ctx.translate(x, y); const s = 1.75 * (1 - press * 0.14); ctx.scale(s, s);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 24.5); ctx.lineTo(6, 19); ctx.lineTo(10.4, 28.6); ctx.lineTo(14, 27); ctx.lineTo(9.8, 17.8); ctx.lineTo(17.4, 17.8); ctx.closePath();
  ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3;
  ctx.fillStyle = '#111'; ctx.fill(); ctx.shadowColor = 'transparent';
  ctx.lineWidth = 1.6; ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.restore();
}
function cursorPos(track, t) {
  if (t <= track[0][0]) return [track[0][1], track[0][2]];
  for (let i = 0; i < track.length - 1; i++) {
    const a = track[i], b = track[i + 1];
    if (t <= b[0]) {
      const p = eio3(seg(t, a[0], b[0])), dx = b[1] - a[1], dy = b[2] - a[2], arc = Math.sin(p * Math.PI) * 0.1;
      return [lerp(a[1], b[1], p) - dy * arc, lerp(a[2], b[2], p) + dx * arc];
    }
  }
  const l = track[track.length - 1]; return [l[1], l[2]];
}
function drawCursor(ctx, track, t, alpha = 1) {
  if (alpha <= 0) return;
  ctx.save(); ctx.globalAlpha *= alpha;
  for (const c of track.filter((k) => k[3])) {
    const d = t - c[0]; if (d < 0 || d > 0.5) continue;
    const p = eo3(d / 0.5);
    ctx.strokeStyle = rgba(PURPLE, 1 - p); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(c[1], c[2], 10 + 60 * p, 0, TAU); ctx.stroke();
  }
  const [x, y] = cursorPos(track, t);
  cursorShape(ctx, x, y, pulseAt(t, track.filter((k) => k[3]).map((k) => k[0]), 0.12));
  ctx.restore();
}
function dotGrid(ctx, col, t, a = 0.08) {
  ctx.fillStyle = rgba(col, a);
  const off = (t * 12) % 48;
  for (let y = -48 + off; y < H + 48; y += 48) for (let x = 24; x < W; x += 48) ctx.fillRect(x, y, 2.5, 2.5);
}
function inkBg(ctx, t) {
  ctx.fillStyle = INK; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 2; i++) {
    const x = W * (0.25 + 0.5 * i + 0.08 * Math.sin(t * 0.4 + i * 2)), y = H * (0.4 + 0.15 * Math.cos(t * 0.3 + i));
    const g = ctx.createRadialGradient(x, y, 0, x, y, 900);
    g.addColorStop(0, rgba(i ? '#00a5a0' : PURPLE, 0.16)); g.addColorStop(1, rgba(INK, 0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  dotGrid(ctx, '#ffffff', t, 0.05);
}
function paperBg(ctx, t) { ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H); dotGrid(ctx, INK, t, 0.07); }
function check(ctx, x, y, s, col, lw = 4) {
  ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(x - s * 0.45, y); ctx.lineTo(x - s * 0.12, y + s * 0.33); ctx.lineTo(x + s * 0.48, y - s * 0.32); ctx.stroke(); ctx.restore();
}
function cross(ctx, x, y, s, col, lw = 4) {
  ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - s * 0.35, y - s * 0.35); ctx.lineTo(x + s * 0.35, y + s * 0.35); ctx.moveTo(x + s * 0.35, y - s * 0.35); ctx.lineTo(x - s * 0.35, y + s * 0.35); ctx.stroke(); ctx.restore();
}

// ================================================================ SCENES (each draws onto ctx)
// 00 — brand sting (frame 0 is the thumbnail: fully composed)
function sting(ctx, t) {
  ctx.fillStyle = PURPLE; ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(960, 420, 0, 960, 420, 900);
  g.addColorStop(0, rgba(PINK, 0.55)); g.addColorStop(1, rgba(PURPLE, 0)); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // expanding rings
  for (let k = 0; k < 4; k++) {
    const p = ((t * 0.9 + k * 0.25) % 1);
    ctx.strokeStyle = rgba('#ffffff', 0.22 * (1 - p)); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(960, 400, 180 + p * 700, 0, TAU); ctx.stroke();
  }
  const z = 1 + 0.05 * eo3(seg(t, 0, 1.5));
  ctx.save(); ctx.translate(960, 540); ctx.scale(z, z); ctx.translate(-960, -540);
  ctx.save(); ctx.shadowColor = rgba(INK, 0.35); ctx.shadowBlur = 50; ctx.shadowOffsetY = 18;
  logo(ctx, 960, 360, 300, 'white', '#ffffff'); ctx.restore();
  txt(ctx, 'GenVM', 960, 690, '800 150px Sora', '#ffffff', 'center');
  txt(ctx, 'Blockchains love determinism. Reality doesn’t.', 960, 790, '600 38px Sora', rgba('#ffffff', 0.92), 'center');
  ctx.font = '500 22px JB'; ctx.letterSpacing = '4px';
  txt(ctx, 'GENLAYER  ·  INTELLIGENT CONTRACTS', 960, 870, '500 22px JB', rgba(INK, 0.75), 'center');
  ctx.letterSpacing = '0px';
  ctx.restore();
}

// 01 — the rule: determinism + 100 nodes in sync
const GRID = [];
for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) GRID.push({ r, c, i: r * 10 + c, x: 1096 + c * 70, y: 228 + r * 70 });
const FLIP_COLS = [PURPLE, CYAN, PINK, PURPLE];
function intro(ctx, t) {
  paperBg(ctx, t);
  label(ctx, '01 — THE RULE', M, 236, PURPLE, seg(t, 1.6, 1.9));
  reveal(ctx, 'Blockchains', M, 400, 124, 800, INK, seg(t, 1.6, 2.2));
  reveal(ctx, 'love', M, 535, 124, 800, INK, seg(t, 2.0, 2.6));
  reveal(ctx, 'determinism.', M, 670, 124, 800, 'gradDark', seg(t, 2.5, 3.1));
  reveal(ctx, 'Run the same smart contract on 100 nodes —', M, 800, 34, 400, rgba(INK, 0.75), seg(t, 3.0, 3.6));
  reveal(ctx, 'everyone reaches the exact same result.', M, 848, 34, 600, INK, seg(t, 3.25, 3.85));
  // tiles
  let ci = -1; for (const f of TL.SYNC_FLIP) if (t >= f) ci++;
  for (const g of GRID) {
    const d0 = 2.55 + (g.r + g.c) * 0.022, a = eback(seg(t, d0, d0 + 0.4));
    if (a <= 0) continue;
    let sx = 1, col = '#ddd6e8';
    if (ci >= 0) {
      const f = TL.SYNC_FLIP[ci], fp = seg(t, f, f + 0.22);
      col = fp < 0.5 && ci > 0 ? FLIP_COLS[ci - 1] : fp < 0.5 ? '#ddd6e8' : FLIP_COLS[ci];
      sx = Math.abs(Math.cos(fp * Math.PI));
    }
    ctx.save(); ctx.translate(g.x + 27, g.y + 27); ctx.scale(a * sx, a);
    rr(ctx, -27, -27, 54, 54, 12, col);
    if (ci === 3 && t > TL.SYNC_FLIP[3] + 0.11) check(ctx, 0, 1, 26, '#ffffff', 4);
    ctx.restore();
  }
  if (t > 3.55) {
    const p = eo3(seg(t, 3.55, 3.9));
    ctx.save(); ctx.globalAlpha = p;
    txt(ctx, '100 / 100 nodes agree', 1096, 970, '800 30px Sora', INK);
    txt(ctx, 'result 0x7a3f…c91e', 1780, 970, '500 22px JB', MUTED, 'right');
    ctx.restore();
  }
}

// 02 — the problem: what if the contract needs the real world? (cursor #1)
const CAPS = [['AI', 'Call an LLM'], ['www', 'Read a webpage'], ['{ }', 'Analyze unstructured data'], ['Aa', 'Interpret natural language'], ['◎', 'Judge the real world']];
function toggles(ctx, t) {
  inkBg(ctx, t);
  label(ctx, '02 — THE PROBLEM', M, 300, CYAN, seg(t, 5.65, 5.95));
  reveal(ctx, 'But what happens', M, 430, 84, 800, '#ffffff', seg(t, 5.75, 6.35));
  reveal(ctx, 'when a contract', M, 530, 84, 800, '#ffffff', seg(t, 6.0, 6.6));
  reveal(ctx, 'needs to:', M, 630, 84, 800, 'grad', seg(t, 6.25, 6.85));
  // card
  const cp = eox(seg(t, 5.7, 6.4));
  ctx.save(); ctx.translate((1 - cp) * 700, 0);
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 30;
  rr(ctx, 1000, 280, 780, 640, 28, PAPER); ctx.restore();
  txt(ctx, 'Contract capabilities', 1040, 334, '600 26px Sora', INK);
  txt(ctx, 'intelligent_contract.py', 1740, 334, '500 18px JB', MUTED, 'right');
  ctx.fillStyle = rgba(INK, 0.08); ctx.fillRect(1040, 352, 700, 2);
  const clicks = TL.CURSOR1.filter((k) => k[3]).map((k) => k[0]);
  CAPS.forEach(([ic, lab], i) => {
    const y = 392 + i * 94, rp = eox(seg(t, 5.95 + i * 0.07, 6.55 + i * 0.07));
    const on = seg(t, clicks[i], clicks[i] + 0.25);
    ctx.save(); ctx.globalAlpha = rp; ctx.translate((1 - rp) * 80, 0);
    rr(ctx, 1040, y - 20, 44, 44, 12, on > 0 ? INK : '#e7e1f0');
    txt(ctx, ic, 1062, y + 2, '800 15px JB', on > 0 ? CYAN : INK, 'center', 'middle');
    txt(ctx, lab, 1104, y + 2, '600 27px Sora', INK, 'left', 'middle');
    // switch
    const k = eback(on);
    rr(ctx, 1650, y - 19, 70, 38, 19, on > 0 ? grad(ctx, 1650, 1720, [PURPLE, PINK]) : '#d6cfe2');
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(1669 + 32 * k, y, 15, 0, TAU); ctx.fill(); ctx.restore();
    ctx.restore();
  });
  // run button
  const hov = seg(t, 8.85, 9.05), hit = seg(t, 9.25, 9.4);
  rr(ctx, 1040, 812, 700, 64, 16, hov > 0 ? grad(ctx, 1040, 1740, [PURPLE, PINK]) : INK);
  txt(ctx, '▶  Run on 100 nodes', 1390, 846, '600 26px Sora', '#ffffff', 'center', 'middle');
  if (hit > 0) { ctx.fillStyle = rgba('#ffffff', 0.5 * (1 - hit)); ctx.beginPath(); ctx.roundRect(1040, 812, 700, 64, 16); ctx.fill(); }
  ctx.restore();
  drawCursor(ctx, TL.CURSOR1, t);
}

// 03 — non-determinism: the same 100 tiles, now disagreeing
const CHAOS_COLS = [PURPLE, CYAN, PINK, INK, '#c9c1d8'];
const ANS = ['TRUE', 'FALSE', '0.73', 'MAYBE', 'NULL', '61%', '??', 'YES'];
function chaos(ctx, t) {
  paperBg(ctx, t);
  label(ctx, '03 — NON-DETERMINISM', M, 236, PINK, seg(t, 9.6, 9.9));
  const w = reveal(ctx, 'Perfect', M, 400, 124, 800, INK, seg(t, 9.55, 10.1));
  reveal(ctx, 'determinism', M, 535, 124, 800, INK, seg(t, 9.7, 10.25));
  // strike-through
  const sp = eox(seg(t, 10.15, 10.55));
  if (sp > 0) {
    ctx.font = '800 124px Sora'; const ww = ctx.measureText('determinism').width;
    ctx.fillStyle = PINK; ctx.fillRect(M - 10, 492, (ww + 20) * sp, 16);
  }
  reveal(ctx, 'becomes', M, 670, 124, 800, 'gradDark', seg(t, 10.3, 10.85));
  reveal(ctx, 'much harder.', M, 805, 124, 800, 'gradDark', seg(t, 10.45, 11.0));
  for (const g of GRID) {
    const step = Math.floor((t - 9.5) * 4 + rnd(g.i, 4) * 4);
    const fp = ((t - 9.5) * 4 + rnd(g.i, 4) * 4) % 1;
    const sx = Math.abs(Math.cos(clamp(fp * 3) * Math.PI));
    const col = CHAOS_COLS[Math.floor(rnd(g.i, step, 1) * CHAOS_COLS.length)];
    const rot = (rnd(g.i, step, 2) - 0.5) * 0.5 * seg(t, 9.6, 10.2);
    const jx = (rnd(g.i, step, 3) - 0.5) * 12 * seg(t, 9.6, 10.2);
    ctx.save(); ctx.translate(g.x + 27 + jx, g.y + 27); ctx.rotate(rot); ctx.scale(sx, 1);
    rr(ctx, -27, -27, 54, 54, 12, col);
    if (rnd(g.i, step, 5) > 0.75) txt(ctx, ANS[Math.floor(rnd(g.i, step, 6) * ANS.length)], 0, 1, '800 12px JB', col === INK ? '#fff' : INK, 'center', 'middle');
    ctx.restore();
  }
  const n = 12 + Math.floor(rnd(Math.floor(t * 8), 9) * 30);
  txt(ctx, `${n} / 100 nodes agree`, 1096, 970, '800 30px Sora', PINK);
  txt(ctx, 'result: ???', 1780, 970, '500 22px JB', MUTED, 'right');
}

// 04 — enter GenVM (character)
const CHIPS = ['LLM', 'Web', 'Data', 'Language'];
function genvm(ctx, t) {
  inkBg(ctx, t);
  // marquee outline type
  ctx.save(); ctx.font = '800 330px Sora'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.strokeStyle = rgba('#ffffff', 0.07); ctx.lineWidth = 2;
  const mw = ctx.measureText('GenVM  ').width, ox = -((t - 11.5) * 180) % mw;
  for (let k = -1; k < 4; k++) ctx.strokeText('GenVM  ', ox + k * mw, 560);
  ctx.restore();
  // disc
  const dp = eback(seg(t, 11.55, 12.05));
  const cg = ctx.createLinearGradient(620, 200, 620, 920); cg.addColorStop(0, PINK); cg.addColorStop(1, PURPLE);
  ctx.save(); ctx.translate(620, 560); ctx.scale(dp, dp);
  ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(0, 0, 360, 0, TAU); ctx.fill();
  ctx.strokeStyle = rgba(CYAN, 0.6); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 400, -Math.PI / 2, -Math.PI / 2 + TAU * eo3(seg(t, 11.8, 12.6))); ctx.stroke();
  ctx.restore();
  // character rises in, then floats
  const rise = eox(seg(t, 11.7, 12.4)), bob = Math.sin((t - 11.5) * 2.4) * 10;
  const ch = 720, s = ch / front.height;
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, 920 + 140 * rise); ctx.clip();
  ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 25;
  ctx.drawImage(front, 620 - front.width * s / 2, 930 - ch + (1 - rise) * 800 + bob, front.width * s, ch);
  ctx.restore();
  // orbiting chips
  CHIPS.forEach((c, i) => {
    const a = (t - 11.5) * 0.6 + i * TAU / 4, ap = eback(seg(t, 12.3 + i * 0.1, 12.7 + i * 0.1));
    if (ap <= 0) return;
    const x = 620 + Math.cos(a) * 470, y = 560 + Math.sin(a) * 300;
    ctx.save(); ctx.translate(x, y); ctx.scale(ap, ap);
    ctx.font = '600 22px Sora'; const w = ctx.measureText(c).width + 44;
    rr(ctx, -w / 2, -22, w, 44, 22, rgba(INK, 0.85), rgba(CYAN, 0.7), 2);
    txt(ctx, c, 0, 1, '600 22px Sora', '#fff', 'center', 'middle'); ctx.restore();
  });
  label(ctx, '04 — ENTER GENVM', 1130, 330, CYAN, seg(t, 11.9, 12.2));
  reveal(ctx, 'This is where', 1130, 440, 56, 600, '#ffffff', seg(t, 12.0, 12.6));
  reveal(ctx, 'GenVM', 1124, 630, 168, 800, 'grad', seg(t, 12.25, 12.85));
  reveal(ctx, 'becomes interesting.', 1130, 750, 56, 600, '#ffffff', seg(t, 12.5, 13.1));
  reveal(ctx, 'The execution environment behind', 1130, 840, 30, 400, rgba('#ffffff', 0.7), seg(t, 13.0, 13.6));
  reveal(ctx, 'GenLayer’s Intelligent Contracts.', 1130, 882, 30, 600, CYAN, seg(t, 13.15, 13.75));
}

// 05 — compare (split screen)
const IC = ['Contract', 'Web / AI interaction', 'Reasoning', 'Independent validation', 'Consensus', 'On-chain result'];
function compare(ctx, t) {
  paperBg(ctx, t);
  ctx.save(); ctx.beginPath(); ctx.rect(960, 0, 960, H); ctx.clip(); inkBg(ctx, t); ctx.restore();
  // title straddling the split: ink on the left, white on the right
  for (const [x0, col] of [[0, INK], [960, '#ffffff']]) {
    ctx.save(); ctx.beginPath(); ctx.rect(x0, 0, 960, H); ctx.clip();
    reveal(ctx, 'Think about the difference.', 960, 130, 64, 800, col, seg(t, 15.15, 15.75), 'center');
    ctx.restore();
  }
  // left: traditional
  label(ctx, 'TRADITIONAL SMART CONTRACT', 480, 230, MUTED, seg(t, 15.3, 15.6), 'center');
  ['Code', 'Execute', 'Same result'].forEach((l, i) => {
    const a = eback(seg(t, 15.4 + i * 0.15, 15.75 + i * 0.15)); if (a <= 0) return;
    const y = 370 + i * 170;
    ctx.save(); ctx.translate(480, y); ctx.scale(a, a);
    rr(ctx, -190, -42, 380, 84, 42, '#ffffff', rgba(INK, 0.15), 2);
    txt(ctx, l, 0, 2, '600 32px Sora', INK, 'center', 'middle'); ctx.restore();
    if (i < 2 && a >= 1) { ctx.fillStyle = rgba(INK, 0.3); ctx.fillRect(479, y + 50, 2, 70); }
  });
  txt(ctx, 'Deterministic. Predictable.', 480, 900, '400 28px Sora', rgba(INK, 0.55 * seg(t, 15.9, 16.2)), 'center');
  // right: intelligent contract
  label(ctx, 'INTELLIGENT CONTRACT', 1440, 230, CYAN, seg(t, 15.5, 15.8), 'center');
  const st = TL.COMPARE_STEPS, yy = (i) => 300 + i * 110;
  // connector line + travelling dot
  const lp = seg(t, st[0], st[5]);
  ctx.fillStyle = rgba('#ffffff', 0.12); ctx.fillRect(1439, yy(0), 2, yy(5) - yy(0));
  const ly = lerp(yy(0), yy(5), lp);
  const lg = ctx.createLinearGradient(0, yy(0), 0, yy(5)); lg.addColorStop(0, PINK); lg.addColorStop(1, CYAN);
  ctx.fillStyle = lg; ctx.fillRect(1438, yy(0), 4, ly - yy(0));
  if (lp > 0 && lp < 1) { ctx.save(); ctx.shadowColor = CYAN; ctx.shadowBlur = 25; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(1440, ly, 9, 0, TAU); ctx.fill(); ctx.restore(); }
  IC.forEach((l, i) => {
    const ap = eback(seg(t, 15.6 + i * 0.05, 15.95 + i * 0.05)); if (ap <= 0) return;
    const on = seg(t, st[i], st[i] + 0.2), y = yy(i);
    ctx.save(); ctx.translate(1440, y); ctx.scale(ap * (1 + 0.06 * Math.sin(on * Math.PI)), ap);
    const fill = on <= 0 ? INK : i === 5 ? CYAN : grad(ctx, -230, 230, [PURPLE, PINK]);
    rr(ctx, -230, -36, 460, 72, 36, fill, on <= 0 ? rgba('#ffffff', 0.25) : null, 2);
    txt(ctx, String(i + 1).padStart(2, '0'), -200, 1, '500 18px JB', on <= 0 ? rgba('#ffffff', 0.4) : i === 5 ? rgba(INK, 0.6) : rgba('#ffffff', 0.8), 'left', 'middle');
    txt(ctx, l, 12, 2, '600 28px Sora', on <= 0 ? rgba('#ffffff', 0.55) : i === 5 ? INK : '#ffffff', 'center', 'middle');
    ctx.restore();
  });
  // vs badge
  const vp = eback(seg(t, 15.5, 15.85));
  if (vp > 0) {
    ctx.save(); ctx.translate(960, 560); ctx.scale(vp, vp);
    ctx.fillStyle = PURPLE; ctx.beginPath(); ctx.arc(0, 0, 44, 0, TAU); ctx.fill();
    txt(ctx, 'vs', 0, 2, '800 30px Sora', '#fff', 'center', 'middle'); ctx.restore();
  }
}

// 06 — consensus (cursor #2)
const VAL = [[430, 520], [560, 850], [960, 880], [1360, 850], [1490, 520]];
function consensus(ctx, t) {
  paperBg(ctx, t);
  label(ctx, '05 — CONSENSUS', M, 170, PURPLE, seg(t, 19.6, 19.9));
  const sw = seg(t, 21.2, 21.5);
  reveal(ctx, 'One AI answer isn’t truth.', M, 270, 64, 800, INK, seg(t, 19.7, 20.3), 'left', sw);
  reveal(ctx, 'Validators decide — together.', M, 270, 64, 800, 'gradDark', seg(t, 21.4, 22.0));
  const cons = t >= TL.CONSENSUS, cpop = eback(seg(t, TL.CONSENSUS, TL.CONSENSUS + 0.35));
  // connectors
  VAL.forEach(([x, y], i) => {
    const p = eo3(seg(t, 21.1 + i * 0.06, 21.45 + i * 0.06)); if (p <= 0) return;
    const no = i === TL.VOTE_NO && t >= TL.VOTES[i];
    ctx.save(); ctx.setLineDash([8, 10]); ctx.lineDashOffset = -t * 60; ctx.strokeStyle = rgba(no ? PINK : PURPLE, 0.6); ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(lerp(x, 960, p), lerp(y, 600, p)); ctx.stroke(); ctx.restore();
  });
  // card
  const ca = eox(seg(t, 19.7, 20.2));
  ctx.save(); ctx.translate(0, (1 - ca) * 60); ctx.globalAlpha = ca;
  ctx.save(); ctx.shadowColor = rgba(PURPLE, cons ? 0.0 : 0.25); ctx.shadowBlur = 60; ctx.shadowOffsetY = 25;
  if (cons) { ctx.shadowColor = rgba('#00b3ad', 0.5); }
  rr(ctx, 640, 450, 640, 300, 26, INK, cons ? CYAN : null, 4); ctx.restore();
  txt(ctx, 'LLM RESPONSE', 680, 500, '500 18px JB', PINK);
  txt(ctx, 'node 0x3f…a1', 1240, 500, '500 18px JB', rgba('#ffffff', 0.4), 'right');
  txt(ctx, '“Team A won the match.”', 960, 590, '600 44px Sora', '#ffffff', 'center', 'middle');
  const clicked = t >= TL.CURSOR2[1][0];
  if (!clicked) {
    const hov = seg(t, 20.3, 20.45);
    rr(ctx, 790, 658, 340, 64, 32, hov > 0 ? grad(ctx, 790, 1130, [PURPLE, PINK]) : PAPER);
    txt(ctx, 'Accept as final', 960, 691, '600 26px Sora', hov > 0 ? '#fff' : INK, 'center', 'middle');
  } else if (!cons) {
    const mp = eback(seg(t, 20.5, 20.8));
    ctx.save(); ctx.translate(960, 690); ctx.scale(mp, 1);
    rr(ctx, -250, -32, 500, 64, 32, rgba(PINK, 0.18), PINK, 2); ctx.restore();
    if (mp > 0.6) {
      txt(ctx, 'Needs independent validation', 985, 691, '600 24px Sora', PINK, 'center', 'middle');
      ctx.save(); ctx.translate(745, 690); ctx.rotate(t * 8); ctx.strokeStyle = PINK; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU * 0.7); ctx.stroke(); ctx.restore();
    }
  } else {
    ctx.save(); ctx.translate(960, 690); ctx.scale(cpop, cpop);
    rr(ctx, -270, -32, 540, 64, 32, CYAN);
    txt(ctx, '✓  Consensus 4/5 · on-chain', 0, 1, '600 26px Sora', INK, 'center', 'middle'); ctx.restore();
  }
  ctx.restore();
  // validators
  VAL.forEach(([x, y], i) => {
    const a = eback(seg(t, 20.9 + i * 0.06, 21.3 + i * 0.06)); if (a <= 0) return;
    ctx.save(); ctx.translate(x, y); ctx.scale(a, a);
    ctx.save(); ctx.shadowColor = rgba(PURPLE, 0.35); ctx.shadowBlur = 30; ctx.shadowOffsetY = 12;
    const g = ctx.createLinearGradient(0, -62, 0, 62); g.addColorStop(0, PINK); g.addColorStop(1, PURPLE);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 62, 0, TAU); ctx.fill(); ctx.restore();
    logo(ctx, 0, 0, 58, 'white', '#ffffff');
    const vt = TL.VOTES[i];
    if (t >= vt) {
      const vp = eback(seg(t, vt, vt + 0.25)), no = i === TL.VOTE_NO;
      ctx.save(); ctx.translate(46, -46); ctx.scale(vp, vp);
      ctx.fillStyle = no ? PINK : CYAN; ctx.beginPath(); ctx.arc(0, 0, 22, 0, TAU); ctx.fill();
      ctx.strokeStyle = PAPER; ctx.lineWidth = 4; ctx.stroke();
      no ? cross(ctx, 0, 0, 22, INK, 4) : check(ctx, 0, 1, 22, INK, 4); ctx.restore();
    }
    ctx.restore();
    txt(ctx, `Validator ${i + 1}`, x, y + 92, '600 18px Sora', rgba(INK, 0.6 * a), 'center');
  });
  drawCursor(ctx, TL.CURSOR2, t, 1 - seg(t, 20.95, 21.25));
}

// 07 — why it matters (four beat-cut cards)
const WHY = [
  [PURPLE, '#ffffff', 'AI isn’t always', 'deterministic.', CYAN],
  [INK, '#ffffff', 'Web data', 'changes.', PINK],
  [PINK, INK, 'Language is', 'ambiguous.', '#ffffff'],
  [CYAN, INK, 'Reality isn’t', 'a boolean.', PURPLE],
];
function whyCard(ctx, t, i) {
  const [bgc, fg, l1, l2, acc] = WHY[i], t0 = TL.WHY[i];
  ctx.fillStyle = bgc; ctx.fillRect(0, 0, W, H);
  dotGrid(ctx, fg === INK ? INK : '#ffffff', t, 0.08);
  // big outlined index
  ctx.save(); ctx.font = '800 560px Sora'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  ctx.strokeStyle = rgba(fg === INK ? INK : '#ffffff', 0.12); ctx.lineWidth = 3;
  ctx.strokeText(`0${i + 1}`, W - 80 + (1 - eox(seg(t, t0, t0 + 0.6))) * 200, 560); ctx.restore();
  label(ctx, `06 — WHY IT MATTERS  /  0${i + 1}`, M, 330, fg, seg(t, t0, t0 + 0.2));
  reveal(ctx, l1, M, 520, 140, 800, fg, seg(t, t0 + 0.02, t0 + 0.45));
  reveal(ctx, l2, M, 680, 140, 800, acc, seg(t, t0 + 0.1, t0 + 0.55));
  // tiny motif under the text
  ctx.save(); ctx.globalAlpha = eo3(seg(t, t0 + 0.25, t0 + 0.5));
  if (i === 0) ['0.73', '0.71', '0.76'].forEach((v, k) => { rr(ctx, M + k * 130, 760, 112, 46, 23, null, fg, 2); txt(ctx, v, M + 56 + k * 130, 784, '500 20px JB', fg, 'center', 'middle'); });
  if (i === 1) { txt(ctx, '200 OK → 404 → 200 OK (different)', M, 790, '500 24px JB', rgba(fg, 0.7)); }
  if (i === 2) { txt(ctx, '“bank”  →  money?  river?', M, 790, '500 26px JB', fg); }
  if (i === 3) ['true', 'false', 'it depends'].forEach((v, k) => { rr(ctx, M + k * 170, 760, k === 2 ? 190 : 150, 46, 23, k === 2 ? fg : null, fg, 2); txt(ctx, v, M + (k === 2 ? 95 : 75) + k * 170, 784, '500 20px JB', k === 2 ? bgc : fg, 'center', 'middle'); });
  ctx.restore();
}
function why(ctx, t) {
  const i = clamp(Math.floor((t - TL.WHY[0]) / 0.75), 0, 3);
  // quick push between cards
  const d = t - TL.WHY[i];
  if (i > 0 && d < 0.16) {
    const p = eo3(d / 0.16);
    ctx.save(); ctx.translate(-p * W * 0.3, 0); whyCard(ctx, t, i - 1); ctx.restore();
    ctx.save(); ctx.translate((1 - p) * W, 0); whyCard(ctx, t, i); ctx.restore();
  } else whyCard(ctx, t, i);
}

// 08 — outro
function outro(ctx, t) {
  inkBg(ctx, t);
  const g = ctx.createRadialGradient(960, 380, 0, 960, 380, 700);
  g.addColorStop(0, rgba(PURPLE, 0.45)); g.addColorStop(1, rgba(INK, 0)); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (const bt of [26.5, 27.5, 28.5, 29.5]) {
    const p = seg(t, bt, bt + 1.2); if (p <= 0 || p >= 1) continue;
    ctx.strokeStyle = rgba(CYAN, 0.3 * (1 - p)); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(960, 380, 170 + eo3(p) * 600, 0, TAU); ctx.stroke();
  }
  const lp = eback(seg(t, 26.55, 27.05));
  ctx.save(); ctx.translate(960, 380); ctx.scale(lp, lp); ctx.translate(-960, -380);
  ctx.save(); ctx.shadowColor = rgba(PINK, 0.6); ctx.shadowBlur = 60;
  logo(ctx, 960, 380, 300, 'grad', (x) => { const gg = x.createLinearGradient(0, 0, 0, 400); gg.addColorStop(0, PINK); gg.addColorStop(1, PURPLE); return gg; });
  ctx.restore(); ctx.restore();
  reveal(ctx, 'GenVM', 960, 700, 150, 800, '#ffffff', seg(t, 26.9, 27.5), 'center');
  reveal(ctx, 'Execution built for AI, Web data & uncertainty.', 960, 790, 38, 400, rgba('#ffffff', 0.8), seg(t, 27.3, 27.9), 'center');
  const mp = eo3(seg(t, 27.7, 28.1));
  ctx.save(); ctx.globalAlpha = mp; ctx.letterSpacing = '4px';
  txt(ctx, 'GENLAYER  ·  INTELLIGENT CONTRACTS', 960, 870, '500 22px JB', CYAN, 'center');
  ctx.letterSpacing = '0px'; ctx.restore();
  // the mascot pops up to say bye
  const cp = eback(seg(t, 28.0, 28.5)), ch = 300, s = ch / front.height;
  if (cp > 0) {
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
    ctx.translate(1700, 1080 + 20 - cp * ch * 0.95 + Math.sin(t * 3) * 6); ctx.rotate(-0.08 + Math.sin(t * 2.2) * 0.03);
    ctx.drawImage(front, -front.width * s / 2, 0, front.width * s, ch); ctx.restore();
  }
}

// ---------------------------------------------------------------- scene routing + transitions
const SC = TL.SCENES;
const ORDER = [['sting', sting], ['intro', intro], ['toggles', toggles], ['chaos', chaos], ['genvm', genvm], ['compare', compare], ['consensus', consensus], ['why', why], ['outro', outro]];
const THEME = { sting: 'dark', intro: 'light', toggles: 'dark', chaos: 'light', genvm: 'dark', compare: 'split', consensus: 'light', why: 'card', outro: 'dark' };
function sceneAt(t) { for (const [k, fn] of ORDER) if (t >= SC[k][0] && t < SC[k][1]) return [k, fn]; return ORDER[ORDER.length - 1]; }
function draw(ctx, fn, t) { ctx.save(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; fn(ctx, t); ctx.restore(); }

function panels(ctx, t, T) {
  const cols = [PINK, PURPLE, CYAN], sk = 260, hw = 1.1 * W;
  for (let k = 0; k < 3; k++) {
    const st = T - 0.3 - (2 - k) * 0.06, p = seg(t, st, st + 0.6);
    if (p <= 0 || p >= 1) continue;
    const cx = lerp(-1.6 * W, 2.6 * W, eio3(p));
    ctx.fillStyle = cols[k]; ctx.beginPath();
    ctx.moveTo(cx - hw + sk, 0); ctx.lineTo(cx + hw + sk, 0); ctx.lineTo(cx + hw - sk, H); ctx.lineTo(cx - hw - sk, H); ctx.closePath(); ctx.fill();
  }
}
function compose(t) {
  const [name, fn] = sceneAt(t);
  // sting splits open (top half up, bottom half down)
  if (t >= 1.25 && t < 1.85) {
    const p = eiox(seg(t, 1.25, 1.85));
    draw(S, intro, t);
    draw(A, sting, Math.min(t, 1.5));
    S.drawImage(bufA, 0, 0, W, H / 2, 0, -p * H / 2, W, H / 2);
    S.drawImage(bufA, 0, H / 2, W, H / 2, 0, H / 2 + p * H / 2, W, H / 2);
    return 'light';
  }
  // iris out of the RUN button
  const IR = TL.IRIS;
  if (t >= IR.t - 0.25 && t < IR.t + 0.35) {
    draw(S, toggles, t);
    draw(A, chaos, t);
    const r = 2300 * eiox(seg(t, IR.t - 0.25, IR.t + 0.35));
    S.save(); S.beginPath(); S.arc(IR.x, IR.y, Math.max(0.1, r), 0, TAU); S.clip(); S.drawImage(bufA, 0, 0); S.restore();
    S.strokeStyle = PURPLE; S.lineWidth = 6; S.beginPath(); S.arc(IR.x, IR.y, Math.max(0.1, r), 0, TAU); S.stroke();
    return t < IR.t ? 'dark' : 'light';
  }
  // vertical push genvm -> compare
  if (t >= TL.PUSH - 0.3 && t < TL.PUSH + 0.3) {
    const p = eiox(seg(t, TL.PUSH - 0.3, TL.PUSH + 0.3));
    draw(A, genvm, t); draw(B, compare, t);
    S.drawImage(bufA, 0, -p * H); S.drawImage(bufB, 0, (1 - p) * H);
    return p < 0.5 ? 'dark' : 'split';
  }
  // iris into outro (ink circle from centre over the last card)
  if (t >= TL.OUTRO_HIT - 0.25 && t < TL.OUTRO_HIT + 0.3) {
    draw(S, why, Math.min(t, 26.49));
    draw(A, outro, t);
    const r = 1200 * eiox(seg(t, TL.OUTRO_HIT - 0.25, TL.OUTRO_HIT + 0.3));
    S.save(); S.beginPath(); S.arc(960, 540, Math.max(0.1, r), 0, TAU); S.clip(); S.drawImage(bufA, 0, 0); S.restore();
    return 'dark';
  }
  draw(S, fn, t);
  for (const T of TL.PANEL_WIPES) if (t > T - 0.45 && t < T + 0.35) panels(S, t, T);
  return THEME[name];
}
function chrome(t, theme) {
  if (t < 1.4 || t > 26.4) return;
  const ink = theme === 'light' || theme === 'split' || (theme === 'card' && t >= 25.0);
  const inkR = theme === 'light' || (theme === 'card' && t >= 25.0);
  const fg = ink ? INK : '#ffffff';
  out.save();
  logo(out, M + 14, 74, 30, ink ? 'ink' : 'white', ink ? INK : '#ffffff');
  txt(out, 'GenVM', M + 42, 84, '600 22px Sora', fg);
  const [name] = sceneAt(t), idx = ORDER.findIndex((o) => o[0] === name);
  txt(out, `${String(idx).padStart(2, '0')} / 08`, W - M, 84, '500 20px JB', rgba(inkR ? INK : '#ffffff', 0.6), 'right');
  // progress bar
  out.fillStyle = rgba(inkR ? INK : '#ffffff', 0.12); out.fillRect(M, H - 60, W - 2 * M, 3);
  out.fillStyle = grad(out, M, W - M, [PINK, PURPLE, CYAN]); out.fillRect(M, H - 60, (W - 2 * M) * (t / DUR), 3);
  out.restore();
}
function renderFrame(t) {
  t = clamp(t, 0, DUR - 1e-6);
  const theme = compose(t);
  out.globalCompositeOperation = 'source-over'; out.globalAlpha = 1;
  out.drawImage(sc, 0, 0);
  chrome(t, theme);
  // subtle film finish
  out.globalCompositeOperation = 'overlay'; out.globalAlpha = 0.06;
  out.drawImage(grain, (Math.floor(t * 30) % 4) * -4, 0, W + 16, H);
  out.globalCompositeOperation = 'source-over'; out.globalAlpha = 1;
  out.fillStyle = vignette; out.fillRect(0, 0, W, H);
  if (t > 29.55) { out.fillStyle = `rgba(0,0,0,${eo3(seg(t, 29.55, 29.95))})`; out.fillRect(0, 0, W, H); }
}
window.renderFrame = renderFrame;

// ---------------------------------------------------------------- boot
const params = new URLSearchParams(location.search);
const waitImg = (im) => (im.complete && im.naturalWidth ? Promise.resolve() : new Promise((r, j) => { im.onload = r; im.onerror = j; }));
Promise.all([
  waitImg(logoImg), waitImg(charImg),
  document.fonts.load('800 40px Sora'), document.fonts.load('600 40px Sora'), document.fonts.load('400 40px Sora'),
  document.fonts.load('500 40px JB'), document.fonts.load('800 40px JB'),
]).then(() => {
  prepLogo(); prepChar(); prepFx();
  window.READY = true;
  if (params.has('render')) return;
  const snd = document.getElementById('snd'), btn = document.getElementById('play');
  const t0 = performance.now();
  const loop = () => { renderFrame(!snd.paused ? snd.currentTime : ((performance.now() - t0) / 1000) % DUR); requestAnimationFrame(loop); };
  btn.hidden = false;
  btn.onclick = () => { btn.hidden = true; snd.currentTime = 0; snd.loop = true; snd.play().catch(() => {}); };
  loop();
});
