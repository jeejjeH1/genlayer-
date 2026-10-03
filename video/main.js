'use strict';
// GenVM — 30s motion piece. Everything is a pure function of time t (seconds),
// so the same frame renders identically in the live preview and the offline export.

const W = 1920, H = 1080, FPS = TL.FPS, DUR = TL.DUR;
const PINK = '#ff87ff', PURPLE = '#dc00ff', CYAN = '#00fff7', BG = '#040108';

const cv = document.getElementById('c');
const out = cv.getContext('2d');
const mk = (w = W, h = H) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const sc = mk(), S = sc.getContext('2d');
const tR = mk(), TR = tR.getContext('2d');
const tB = mk(), TB = tB.getContext('2d');

// ---------------------------------------------------------------- math
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (t, a, b) => clamp((t - a) / (b - a));
const eo3 = (t) => 1 - Math.pow(1 - t, 3);
const eo5 = (t) => 1 - Math.pow(1 - t, 5);
const eio3 = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const eback = (t) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const TAU = Math.PI * 2;
function rnd(a, b = 0, c = 0) { const x = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453; return x - Math.floor(x); }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(rnd(xi, yi), rnd(xi + 1, yi), u), lerp(rnd(xi, yi + 1), rnd(xi + 1, yi + 1), u), v);
}
const hexCache = {};
function rgba(hex, a) {
  let c = hexCache[hex];
  if (!c) { const n = parseInt(hex.slice(1), 16); c = hexCache[hex] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}
const pad = (n) => String(n).padStart(2, '0');
// random glitch/flicker steps at 30Hz even when rendering at 60fps (smooth motion, no strobing)
const fr = (t) => Math.floor(t * 30);
function pulseAt(t, list, len) { let p = 0; for (const k of list) { const d = t - k; if (d >= 0 && d < len) p = Math.max(p, 1 - d / len); } return p; }
function brandGrad(ctx, x0, x1, y = 0) {
  const g = ctx.createLinearGradient(x0, y, x1, y);
  g.addColorStop(0, PINK); g.addColorStop(0.5, PURPLE); g.addColorStop(1, CYAN);
  return g;
}

// ---------------------------------------------------------------- assets
const logoImg = new Image(); logoImg.src = 'assets/logo.jpg';
const charImg = new Image(); charImg.src = 'assets/character.png';
let logoMask, logoBox, logoPts = [];
const views = [];
const tintCache = {};
const grains = [];
let scanPat, vignette;

function prepLogo() {
  const c = mk(400, 400), x = c.getContext('2d');
  x.drawImage(logoImg, 0, 0, 400, 400);
  const d = x.getImageData(0, 0, 400, 400);
  let x0 = 400, y0 = 400, x1 = 0, y1 = 0;
  const dark = [];
  for (let y = 0; y < 400; y++) for (let xx = 0; xx < 400; xx++) {
    const i = (y * 400 + xx) * 4;
    const a = 255 - (d.data[i] + d.data[i + 1] + d.data[i + 2]) / 3;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = 255;
    d.data[i + 3] = a > 30 ? Math.min(255, a * 1.15) : 0;
    if (a > 128) { dark.push(xx, y); x0 = Math.min(x0, xx); x1 = Math.max(x1, xx); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  x.putImageData(d, 0, 0);
  logoMask = c;
  logoBox = { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
  const n = dark.length / 2;
  for (let k = 0; k < 4200; k++) {
    const j = Math.floor(rnd(k, 3.3) * n);
    logoPts.push({ x: dark[j * 2] + rnd(k, 1) - 0.5, y: dark[j * 2 + 1] + rnd(k, 2) - 0.5, s: k });
  }
}
function tinted(img, key, fill) {
  if (tintCache[key]) return tintCache[key];
  const c = mk(img.width, img.height), x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = typeof fill === 'function' ? fill(x, img.width, img.height) : fill;
  x.fillRect(0, 0, img.width, img.height);
  return (tintCache[key] = c);
}
function prepChar() {
  const w = charImg.width, h = charImg.height;
  const c = mk(w, h), x = c.getContext('2d');
  x.drawImage(charImg, 0, 0);
  const d = x.getImageData(0, 0, w, h).data;
  const isInk = (i) => d[i + 3] > 24 && (d[i] + d[i + 1] + d[i + 2] > 30 || d[i + 3] < 250);
  const col = new Uint32Array(w);
  for (let y = 0; y < h; y += 2) for (let xx = 0; xx < w; xx++) if (isInk((y * w + xx) * 4)) col[xx]++;
  const clusters = [];
  let start = -1, gap = 0;
  for (let xx = 0; xx < w; xx++) {
    if (col[xx] > 40) { if (start < 0) start = xx; gap = 0; }
    else if (start >= 0) { gap++; if (gap > 60) { clusters.push([start, xx - gap]); start = -1; gap = 0; } }
  }
  if (start >= 0) clusters.push([start, w - 1]);
  for (const [a, b] of clusters.filter((k) => k[1] - k[0] > 300)) {
    let y0 = h, y1 = 0;
    for (let y = 0; y < h; y += 2) {
      let n = 0; for (let xx = a; xx <= b; xx += 2) if (isInk((y * w + xx) * 4)) n++;
      if (n > 20 && n < (b - a) / 2 * 0.95) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
    const vw = b - a + 1, vh = y1 - y0 + 1;
    const vc = mk(vw, vh);
    vc.getContext('2d').drawImage(charImg, a, y0, vw, vh, 0, 0, vw, vh);
    views.push({ c: vc, w: vw, h: vh, src: [a, y0] });
  }
  console.log('views', JSON.stringify(views.map((v) => [v.src, v.w, v.h])));
}
function prepFx() {
  for (let k = 0; k < 8; k++) {
    const c = mk(960, 540), x = c.getContext('2d'), id = x.createImageData(960, 540);
    for (let i = 0; i < id.data.length; i += 4) { const v = Math.floor(rnd(i, k, 0.37) * 255); id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
    x.putImageData(id, 0, 0); grains.push(c);
  }
  const p = mk(4, 4), px = p.getContext('2d');
  px.fillStyle = 'rgba(0,0,0,0.28)'; px.fillRect(0, 2, 4, 2);
  scanPat = out.createPattern(p, 'repeat');
  vignette = out.createRadialGradient(W / 2, H / 2, 380, W / 2, H / 2, 1180);
  vignette.addColorStop(0, 'rgba(0,0,0,0)'); vignette.addColorStop(1, 'rgba(0,0,0,0.88)');
}

// ---------------------------------------------------------------- fur
// Hair-like strands swaying in a noise field. Roots: {x,y,a,l,c}
const edgeRoots = [];
for (let i = 0; i < 2800; i++) {
  const side = i % 4, u = rnd(i, 1);
  let x, y, a;
  if (side === 0) { x = u * W; y = -10; a = Math.PI / 2; }
  else if (side === 1) { x = W + 10; y = u * H; a = Math.PI; }
  else if (side === 2) { x = u * W; y = H + 10; a = -Math.PI / 2; }
  else { x = -10; y = u * H; a = 0; }
  edgeRoots.push({ x, y, a: a + (rnd(i, 2) - 0.5) * 1.3, l: 30 + Math.pow(rnd(i, 3), 2) * 260, c: Math.floor(rnd(i, 4) * 3) });
}
const fieldRoots = [];
for (let i = 0; i < 2600; i++) fieldRoots.push({ x: rnd(i, 11) * W, y: rnd(i, 12) * H, a: rnd(i, 13) * TAU, l: 18 + rnd(i, 14) * 70, c: Math.floor(rnd(i, 15) * 3) });

function strands(ctx, roots, t, o = {}) {
  const alpha = o.alpha ?? 0.5, lenMul = o.lenMul ?? 1, sway = o.sway ?? 1.6, sc2 = o.scale ?? 0.0035, sp = o.speed ?? 0.35;
  const cols = o.cols || [PURPLE, PINK, CYAN];
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineWidth = o.width ?? 1.4; ctx.lineCap = 'round';
  for (let ci = 0; ci < cols.length; ci++) {
    ctx.strokeStyle = cols[ci]; ctx.globalAlpha = alpha * (ci === 2 ? 0.55 : 1);
    ctx.beginPath();
    for (const r of roots) {
      if (r.c !== ci) continue;
      const L = r.l * lenMul; if (L < 1) continue;
      const n = vnoise(r.x * sc2 + t * sp, r.y * sc2 - t * sp * 0.7);
      const a = r.a + (n - 0.5) * sway;
      const a2 = a + (vnoise(r.x * sc2 * 2 + 9, r.y * sc2 * 2 + t * sp * 1.5) - 0.5) * sway * 1.3;
      const mx = r.x + Math.cos(a) * L * 0.5, my = r.y + Math.sin(a) * L * 0.5;
      ctx.moveTo(r.x, r.y);
      ctx.quadraticCurveTo(mx, my, mx + Math.cos(a2) * L * 0.5, my + Math.sin(a2) * L * 0.5);
    }
    ctx.stroke();
  }
  ctx.restore();
}
function rectRoots(cx, cy, w, h, n, seed, len = 26) {
  const r = [];
  for (let i = 0; i < n; i++) {
    const u = rnd(i, seed) * 2 * (w + h);
    let x, y, a;
    if (u < w) { x = cx - w / 2 + u; y = cy - h / 2; a = -Math.PI / 2; }
    else if (u < w + h) { x = cx + w / 2; y = cy - h / 2 + (u - w); a = 0; }
    else if (u < 2 * w + h) { x = cx + w / 2 - (u - w - h); y = cy + h / 2; a = Math.PI / 2; }
    else { x = cx - w / 2; y = cy + h / 2 - (u - 2 * w - h); a = Math.PI; }
    r.push({ x, y, a: a + (rnd(i, seed + 1) - 0.5) * 1.2, l: len * (0.4 + rnd(i, seed + 2)), c: Math.floor(rnd(i, seed + 3) * 3) });
  }
  return r;
}

// ---------------------------------------------------------------- drawing helpers
function bg(t, k = 1) {
  S.globalCompositeOperation = 'source-over'; S.globalAlpha = 1;
  S.fillStyle = BG; S.fillRect(0, 0, W, H);
  for (let i = 0; i < 3; i++) {
    const x = W * (0.1 + 0.8 * vnoise(i * 3.1, t * 0.18)), y = H * (0.1 + 0.8 * vnoise(i * 7.3 + 2, t * 0.14));
    const g = S.createRadialGradient(x, y, 0, x, y, 760);
    g.addColorStop(0, rgba(i === 1 ? '#4a0070' : '#2a0040', 0.55 * k)); g.addColorStop(1, 'rgba(0,0,0,0)');
    S.fillStyle = g; S.fillRect(0, 0, W, H);
  }
}
function text(ctx, str, x, y, font, fill, align = 'center', glow = 0, glowCol) {
  ctx.font = font; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillStyle = fill;
  if (glow) { ctx.shadowColor = glowCol || (typeof fill === 'string' ? fill : PURPLE); ctx.shadowBlur = glow; }
  ctx.fillText(str, x, y); ctx.shadowBlur = 0;
}
function gtext(ctx, str, x, y, font, fill, amt, seed, align = 'center', glow = 0) {
  ctx.font = font; ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (amt > 0.01) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= Math.min(1, amt);
    ctx.fillStyle = PINK; ctx.fillText(str, x - amt * 16 * (0.4 + rnd(seed, 1)), y + amt * 6 * (rnd(seed, 2) - 0.5));
    ctx.fillStyle = CYAN; ctx.fillText(str, x + amt * 16 * (0.4 + rnd(seed, 3)), y - amt * 6 * (rnd(seed, 4) - 0.5));
    ctx.restore();
  }
  text(ctx, str, x, y, font, fill, align, glow, PURPLE);
}
// rich text: parts [[str,color],...], typed up to n chars
function rich(ctx, parts, x, y, font, size, { n = Infinity, align = 'center', glow = 0, caret = false, t = 0 } = {}) {
  ctx.font = font; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const full = parts.map((p) => p[0]).join('');
  const tw = ctx.measureText(full).width;
  let cx = align === 'center' ? x - tw / 2 : align === 'right' ? x - tw : x;
  let rem = n;
  for (const [s, col] of parts) {
    if (rem <= 0) break;
    const sub = s.slice(0, rem); rem -= s.length;
    ctx.fillStyle = col;
    if (glow) { ctx.shadowColor = col; ctx.shadowBlur = glow; }
    ctx.fillText(sub, cx, y); ctx.shadowBlur = 0;
    cx += ctx.measureText(sub).width;
  }
  if (caret && Math.floor(t * 5) % 2 === 0) { ctx.fillStyle = PINK; ctx.fillRect(cx + 8, y - size * 0.42, size * 0.48, size * 0.84); }
  return cx;
}
// angular cat-eye (left eye, local units), mirrored for the right one
function eyePath(ctx) {
  ctx.beginPath();
  ctx.moveTo(-78, -48); ctx.lineTo(72, 2);
  ctx.quadraticCurveTo(80, 62, 8, 64);
  ctx.quadraticCurveTo(-80, 62, -78, -48);
  ctx.closePath();
}
function face(ctx, x, y, s, { open = 1, col = CYAN, glow = 50, mouth = true, alpha = 1, look = 0 } = {}) {
  if (alpha <= 0.001) return;
  ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(x, y); ctx.scale(s, s);
  for (const side of [-1, 1]) {
    ctx.save(); ctx.translate(side * 135 + look * 14, 0); ctx.scale(side === -1 ? 1 : -1, Math.max(0.04, open));
    eyePath(ctx); ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = glow; ctx.fill(); ctx.shadowBlur = 0;
    ctx.save(); eyePath(ctx); ctx.clip();
    ctx.strokeStyle = 'rgba(0,0,0,0.42)'; ctx.lineWidth = 2.2; ctx.beginPath();
    for (let g = -90; g < 90; g += 9) { ctx.moveTo(g, -80); ctx.lineTo(g, 80); ctx.moveTo(-90, g); ctx.lineTo(90, g); }
    ctx.stroke(); ctx.restore(); ctx.restore();
  }
  if (mouth) {
    ctx.beginPath(); ctx.moveTo(-95, 150); ctx.quadraticCurveTo(-48, 205, 0, 158); ctx.quadraticCurveTo(48, 205, 95, 150);
    ctx.lineWidth = 16; ctx.lineCap = 'round'; ctx.strokeStyle = col; ctx.shadowColor = col; ctx.shadowBlur = glow; ctx.stroke();
  }
  ctx.restore();
}
// tiny cat-eye used as a "node" / validator
function eyeNode(ctx, x, y, r, open, gx, gy, col, ring) {
  ctx.save(); ctx.translate(x, y);
  ctx.strokeStyle = ring; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r + 7, 0, TAU); ctx.stroke();
  if (open < 0.06) {
    ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath();
    ctx.moveTo(-r * 0.85, 0); ctx.quadraticCurveTo(0, r * 0.38, r * 0.85, 0); ctx.stroke(); ctx.restore(); return;
  }
  const ry = r * 0.78 * open;
  ctx.beginPath(); ctx.ellipse(0, 0, r, ry, 0, 0, TAU); ctx.fillStyle = '#0c0416'; ctx.fill();
  ctx.save(); ctx.clip();
  const px = gx * r * 0.45, py = gy * r * 0.3;
  ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 16;
  ctx.beginPath(); ctx.arc(px, py, r * 0.5, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
  ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(px, py, r * 0.1, r * 0.38, 0, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 0, r, ry, 0, 0, TAU); ctx.stroke();
  ctx.restore();
}
function cursorShape(ctx, x, y, press, alpha) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y);
  const s = 1.9 * (1 - press * 0.16); ctx.scale(s, s);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 25); ctx.lineTo(6, 19.6); ctx.lineTo(10.6, 29.4); ctx.lineTo(14.2, 27.8); ctx.lineTo(9.8, 18.4); ctx.lineTo(17.6, 18.4); ctx.closePath();
  ctx.shadowColor = PURPLE; ctx.shadowBlur = 22; ctx.fillStyle = '#fff'; ctx.fill(); ctx.shadowBlur = 0;
  ctx.lineWidth = 1.3; ctx.strokeStyle = '#000'; ctx.stroke();
  ctx.restore();
}
function cursorPos(track, t) {
  if (t <= track[0][0]) return [track[0][1], track[0][2]];
  for (let i = 0; i < track.length - 1; i++) {
    const a = track[i], b = track[i + 1];
    if (t <= b[0]) {
      const p = eio3(seg(t, a[0], b[0]));
      const dx = b[1] - a[1], dy = b[2] - a[2], arc = Math.sin(p * Math.PI) * 0.12;
      return [lerp(a[1], b[1], p) - dy * arc, lerp(a[2], b[2], p) + dx * arc];
    }
  }
  const l = track[track.length - 1]; return [l[1], l[2]];
}
function drawCursor(track, t, alpha = 1) {
  const clicks = track.filter((k) => k[3]).map((k) => k[0]);
  // creepy echo trail
  for (let k = 4; k >= 1; k--) { const [gx, gy] = cursorPos(track, t - k * 0.035); cursorShape(S, gx, gy, 0, alpha * 0.1 * (5 - k)); }
  for (const c of clicks) {
    const d = t - c; if (d < 0 || d > 0.55) continue;
    const [cx, cy] = cursorPos(track, c), p = eo3(d / 0.55);
    S.save(); S.strokeStyle = rgba(CYAN, (1 - p) * alpha); S.lineWidth = 4 * (1 - p) + 1;
    S.beginPath(); S.arc(cx, cy, 8 + 90 * p, 0, TAU); S.stroke();
    S.strokeStyle = rgba(PINK, (1 - p) * 0.7 * alpha); S.beginPath(); S.arc(cx, cy, 4 + 55 * p, 0, TAU); S.stroke(); S.restore();
  }
  const [x, y] = cursorPos(track, t);
  cursorShape(S, x, y, pulseAt(t, clicks, 0.13), alpha);
}
function hud(t, label, status) {
  S.save(); S.globalAlpha = 1; S.font = '500 18px JB'; S.textBaseline = 'middle';
  const m = 44, b = 28;
  S.strokeStyle = rgba(PURPLE, 0.7); S.lineWidth = 2; S.beginPath();
  S.moveTo(m, m + b); S.lineTo(m, m); S.lineTo(m + b, m);
  S.moveTo(W - m - b, m); S.lineTo(W - m, m); S.lineTo(W - m, m + b);
  S.moveTo(m, H - m - b); S.lineTo(m, H - m); S.lineTo(m + b, H - m);
  S.moveTo(W - m - b, H - m); S.lineTo(W - m, H - m); S.lineTo(W - m, H - m - b); S.stroke();
  S.fillStyle = rgba(PINK, 0.8); S.textAlign = 'left'; S.fillText('GENLAYER // GENVM', m + 16, m + 18);
  const tc = `T+00:${pad(Math.floor(t))}:${pad(Math.floor(t * FPS) % FPS)}`;
  S.textAlign = 'right'; S.fillText(tc, W - m - 16, m + 18);
  if (Math.floor(t * 2) % 2 === 0) { S.fillStyle = PINK; S.beginPath(); S.arc(W - m - 30 - S.measureText(tc).width, m + 18, 6, 0, TAU); S.fill(); }
  S.textAlign = 'left'; S.fillStyle = rgba(CYAN, 0.75); S.fillText(label, m + 16, H - m - 18);
  S.textAlign = 'right'; S.fillStyle = 'rgba(255,255,255,0.5)'; S.fillText(status, W - m - 16, H - m - 18);
  S.restore();
}
function drawLogo(ctx, cx, cy, h, fill, key, alpha = 1, glow = 0) {
  const s = h / logoBox.h, img = tinted(logoMask, key, fill);
  ctx.save(); ctx.globalAlpha *= alpha;
  if (glow) { ctx.shadowColor = PURPLE; ctx.shadowBlur = glow; }
  ctx.drawImage(img, cx - logoBox.cx * s, cy - logoBox.cy * s, 400 * s, 400 * s);
  ctx.restore();
}
function drawView(i, cx, bottomY, h, { alpha = 1, rot = 0, filter = 'none', glow = 0, glowCol = PURPLE, flip = false } = {}) {
  const v = views[i]; if (!v) return 0;
  const s = h / v.h;
  S.save(); S.globalAlpha *= alpha; S.translate(cx, bottomY); S.rotate(rot); if (flip) S.scale(-1, 1);
  S.filter = filter; if (glow) { S.shadowColor = glowCol; S.shadowBlur = glow; }
  S.drawImage(v.c, -v.w * s / 2, -v.h * s, v.w * s, v.h * s);
  S.restore(); S.filter = 'none';
  return s;
}

// ================================================================ SCENES
// 01 — determinism, eyes in the dark
function s1(t) {
  bg(t, 0.6);
  strands(S, edgeRoots, t, { alpha: 0.38, lenMul: 0.35 + 0.65 * eo3(seg(t, 0, 3)) });
  const f = fr(t);
  let ea = seg(t, 0.12, 0.45) * (1 - seg(t, 0.95, 1.3)) + (t > 2.3 && t < 2.62 ? 0.85 : 0);
  if (rnd(f, 11) > 0.78) ea *= 0.25;
  const blink = t > 0.68 && t < 0.8 ? 0.08 : 1;
  face(S, 960 + (rnd(f, 5) - 0.5) * 6, 430, 1.2, { open: blink, alpha: ea, look: Math.sin(t * 3) * 0.6 });
  const T1 = TL.TYPE1, n = Math.floor(seg(t, T1.t0, T1.t1) * T1.text.length + 0.0001);
  const shake = seg(t, 2.5, 3.0);
  S.save(); S.translate((rnd(f, 21) - 0.5) * 18 * shake, (rnd(f, 22) - 0.5) * 8 * shake);
  rich(S, [['Blockchains love ', '#ffffff'], ['determinism.', CYAN]], 960, 560, '700 112px SG', 112, { n, caret: t > 0.8, t, glow: 18 });
  S.restore();
  if (t > 2.15) {
    S.globalAlpha = seg(t, 2.15, 2.45);
    text(S, 'same input  →  same code  →  same output', 960, 680, '500 30px JB', rgba(PINK, 0.85));
    S.globalAlpha = 1;
  }
  // subliminal logo frames
  if ((t > 0.5 && t < 0.567) || (t > 2.72 && t < 2.787)) drawLogo(S, 960, 540, 760, PURPLE, 'purple', 0.9, 80);
  hud(t, '01 / DETERMINISM', 'NODES ONLINE: 100');
}

// 02 — 100 nodes, 100 identical eyes
const GRID = [];
for (let r = 0; r < 5; r++) for (let c = 0; c < 20; c++) GRID.push({ r, c, x: 960 + (c - 9.5) * 82, y: 590 + (r - 2) * 92, i: r * 20 + c });
function s2(t0) {
  const t = t0 - 3.0, f = fr(t0);
  bg(t0, 0.7);
  strands(S, edgeRoots, t0, { alpha: 0.22, lenMul: 0.5 });
  rich(S, [['Run the same smart contract on ', '#ffffff'], ['100 nodes', PINK]], 960, 190, '700 64px SG', 64, { n: Math.floor(seg(t, 0.1, 0.7) * 43), glow: 10 });
  const agree = t >= 1.6;
  // links
  S.lineWidth = 1.5; S.strokeStyle = agree ? rgba(CYAN, 0.35) : rgba(PURPLE, 0.25); S.beginPath();
  for (const g of GRID) { if (g.c < 19) { S.moveTo(g.x + 30, g.y); S.lineTo(g.x + 52, g.y); } }
  S.stroke();
  const wave = (g) => 0.6 + (g.c / 19) * 0.85 + rnd(g.i, 3) * 0.06;
  let gx = 0, gy = 0;
  if (t > 2.15 && t < 2.55) gx = 1; else if (t > 2.55 && t < 2.8) { gx = -1; gy = 0.4; }
  for (const g of GRID) {
    const pop = eback(seg(t, g.c * 0.018 + g.r * 0.03, g.c * 0.018 + g.r * 0.03 + 0.35));
    if (pop <= 0) continue;
    const hit = seg(t, wave(g), wave(g) + 0.18);
    S.save(); S.translate(g.x, g.y); S.scale(pop, pop);
    const open = agree ? eo3(seg(t, 1.6, 1.72)) : 0;
    const ring = agree ? rgba(CYAN, 0.5) : hit > 0 && hit < 1 ? rgba(PINK, 0.9) : rgba(PURPLE, 0.45 + 0.4 * (hit >= 1));
    eyeNode(S, 0, 0, 24, open, gx, gy, agree ? CYAN : hit >= 1 ? PURPLE : rgba('#ffffff', 0.4), ring);
    if (hit > 0 && hit < 1) { S.strokeStyle = rgba(PINK, 1 - hit); S.lineWidth = 3; S.beginPath(); S.arc(0, 0, 31 + hit * 22, 0, TAU); S.stroke(); }
    S.restore();
    if (agree) { S.globalAlpha = seg(t, 1.7, 1.9); text(S, '0xA7F3', g.x, g.y + 42, '500 13px JB', rgba(CYAN, 0.8)); S.globalAlpha = 1; }
  }
  // contract packet sweeping across
  if (t > 0.55 && t < 1.55) {
    const px = lerp(960 - 9.5 * 82 - 60, 960 + 9.5 * 82 + 60, seg(t, 0.6, 1.5));
    const g = S.createLinearGradient(px - 260, 0, px, 0); g.addColorStop(0, 'rgba(255,135,255,0)'); g.addColorStop(1, rgba(PINK, 0.35));
    S.fillStyle = g; S.fillRect(px - 260, 380, 260, 420);
    S.fillStyle = '#fff'; S.fillRect(px - 2, 380, 4, 420);
  }
  if (agree) {
    const a = eo3(seg(t, 1.65, 2.0));
    S.globalAlpha = a;
    rich(S, [['and everyone reaches the ', '#ffffff'], ['exact same result.', CYAN]], 960, 900 + (1 - a) * 30, '700 54px SG', 54, { glow: 14 });
    S.globalAlpha = 1;
    // flash
    S.fillStyle = rgba(CYAN, 0.22 * (1 - seg(t, 1.6, 1.85))); S.fillRect(0, 0, W, H);
  }
  hud(t0, '02 / REPLICATION', agree ? 'AGREEMENT: 100/100 ✓' : `EXECUTING… ${pad(Math.floor(seg(t, 0.6, 1.55) * 99))}/100`);
}

// 03a — the contract needs the real world (cursor scene #1)
const ROWS = ['call an LLM', 'read a webpage', 'analyze unstructured data', 'interpret natural language', 'judge the real world'];
const CODE = [
  [['# intelligent contract (sketch)', '#7a6b8a']],
  [['class ', PINK], ['Oracle', CYAN], [':', '#fff']],
  [['  def ', PINK], ['resolve', CYAN], ['(self, q):', '#fff']],
  [['    answer = ', '#fff'], ['llm', PINK], ['.ask(q)', CYAN]],
  [['    page   = ', '#fff'], ['web', PINK], ['.read(url)', CYAN]],
  [['    facts  = ', '#fff'], ['extract', CYAN], ['(page)', '#fff']],
  [['    intent = ', '#fff'], ['understand', CYAN], ['(q)', '#fff']],
  [['    return ', PINK], ['judge', CYAN], ['(answer, facts)', '#fff']],
  [['    # …deterministic?  ', '#7a6b8a'], ['¯\\_(ツ)_/¯', PINK]],
];
function s3a(t0) {
  const t = t0 - 6.0, f = fr(t0);
  bg(t0, 0.6);
  const ramp = seg(t0, 9.3, 9.6);
  strands(S, edgeRoots, t0, { alpha: 0.25 + ramp * 0.4, lenMul: 0.5 + ramp * 1.2, sway: 1.6 + ramp * 3 });
  const open = eo5(seg(t, 0, 0.3));
  const shake = ramp * 14;
  S.save(); S.translate(960 + (rnd(f, 1) - 0.5) * shake, 550 + (rnd(f, 2) - 0.5) * shake); S.scale(1, open); S.translate(-960, -550);
  // window
  S.fillStyle = 'rgba(14,4,24,0.94)'; S.strokeStyle = rgba(PURPLE, 0.85); S.lineWidth = 2;
  S.beginPath(); S.roundRect(200, 150, 1520, 800, 18); S.fill(); S.stroke();
  S.fillStyle = rgba(PURPLE, 0.18); S.beginPath(); S.roundRect(200, 150, 1520, 52, [18, 18, 0, 0]); S.fill();
  [PINK, PURPLE, CYAN].forEach((c, i) => { S.fillStyle = c; S.beginPath(); S.arc(234 + i * 28, 176, 8, 0, TAU); S.fill(); });
  text(S, 'intelligent_contract.py — GenVM', 960, 176, '500 18px JB', 'rgba(255,255,255,0.55)');
  const T2 = TL.TYPE2;
  rich(S, [['But what happens when a contract ', '#ffffff'], ['needs to:', PINK]], 250, 262, '700 48px SG', 48, { n: Math.floor(seg(t0, T2.t0, T2.t1) * T2.text.length + 0.0001), align: 'left', caret: t0 < 7.2, t: t0 });
  // code
  S.save(); S.beginPath(); S.rect(240, 320, 820, 600); S.clip();
  const lines = Math.floor(seg(t, 0.3, 3.0) * CODE.length * 1.0001);
  CODE.forEach((ln, i) => {
    if (i > lines) return;
    const part = i === lines ? seg(t, 0.3 + i * 0.3, 0.6 + i * 0.3) : 1;
    const n = Math.floor(part * ln.reduce((s, p) => s + p[0].length, 0));
    S.globalAlpha = 0.9;
    text(S, String(i + 1).padStart(2, ' '), 262, 360 + i * 56, '500 20px JB', 'rgba(255,255,255,0.25)', 'left');
    rich(S, ln, 310, 360 + i * 56, '500 25px JB', 25, { n, align: 'left' });
  });
  S.restore(); S.globalAlpha = 1;
  S.strokeStyle = rgba(PURPLE, 0.35); S.beginPath(); S.moveTo(1080, 320); S.lineTo(1080, 920); S.stroke();
  // rows
  const clicks = TL.CURSOR1.filter((k) => k[3]).map((k) => k[0]);
  ROWS.forEach((label, i) => {
    const y = 360 + i * 92, on = seg(t0, clicks[i], clicks[i] + 0.15);
    const pop = on > 0 ? 1 + 0.06 * Math.sin(on * Math.PI) : 1;
    S.save(); S.translate(1390, y + 38); S.scale(pop, pop); S.translate(-1390, -(y + 38));
    if (on > 0) { const g = S.createLinearGradient(1110, 0, 1680, 0); g.addColorStop(0, rgba(PURPLE, 0.55 * on)); g.addColorStop(1, rgba(PURPLE, 0)); S.fillStyle = g; S.beginPath(); S.roundRect(1110, y, 570, 76, 12); S.fill(); }
    S.strokeStyle = rgba(on > 0 ? PINK : PURPLE, 0.35 + 0.5 * on); S.lineWidth = 2; S.beginPath(); S.roundRect(1110, y, 570, 76, 12); S.stroke();
    S.strokeStyle = on > 0 ? CYAN : 'rgba(255,255,255,0.4)'; S.beginPath(); S.roundRect(1125, y + 18, 40, 40, 8); S.stroke();
    if (on > 0) {
      S.fillStyle = CYAN; S.shadowColor = CYAN; S.shadowBlur = 20; S.beginPath(); S.roundRect(1125, y + 18, 40, 40, 8); S.fill(); S.shadowBlur = 0;
      S.strokeStyle = '#0c0416'; S.lineWidth = 5; S.beginPath(); S.moveTo(1134, y + 38); S.lineTo(1142, y + 47); S.lineTo(1157, y + 28); S.stroke();
    }
    const jit = on > 0 && on < 1 ? (rnd(f, i) - 0.5) * 10 : 0;
    gtext(S, '→ ' + label, 1190 + jit, y + 38, '700 31px SG', on > 0 ? '#ffffff' : 'rgba(255,255,255,0.45)', on > 0 && on < 1 ? 1 : 0, f + i, 'left');
    S.restore();
  });
  // execute button
  const hov = seg(t0, 9.0, 9.25), hit = t0 >= 9.3;
  const g = S.createLinearGradient(1110, 0, 1680, 0); g.addColorStop(0, PURPLE); g.addColorStop(1, PINK);
  S.fillStyle = g; S.globalAlpha = 0.65 + 0.35 * hov; S.shadowColor = PINK; S.shadowBlur = 30 * hov;
  S.beginPath(); S.roundRect(1110, 840, 570, 72, 14); S.fill(); S.shadowBlur = 0; S.globalAlpha = 1;
  if (hit) { S.fillStyle = rgba('#ffffff', 0.9 * (1 - seg(t0, 9.3, 9.45))); S.beginPath(); S.roundRect(1110, 840, 570, 72, 14); S.fill(); }
  text(S, '▶  EXECUTE ON 100 NODES', 1395, 876, '800 26px JB', '#0c0416');
  S.restore();
  drawCursor(TL.CURSOR1, t0);
  hud(t0, '03 / THE PROBLEM', 'NON-DETERMINISTIC INPUTS: ' + clicks.filter((c) => t0 >= c).length + '/5');
}

// 03b — the eyes disagree
const ANSWERS = ['TRUE', 'FALSE', '0.73', 'MAYBE', '0x9c1e', '??', '0.41', 'NULL', 'YES?', '0x7b02', 'NO', '61%'];
function s3b(t0) {
  const t = t0 - 9.6, f = fr(t0);
  bg(t0, 1.1);
  strands(S, edgeRoots, t0, { alpha: 0.55, lenMul: 1.5, sway: 4, speed: 0.9 });
  const cols = [PINK, PURPLE, CYAN, '#ffffff'];
  for (const g of GRID) {
    const step = Math.floor(t * 6 + rnd(g.i, 9) * 3);
    const jx = (rnd(g.i, step, 1) - 0.5) * 10, jy = (rnd(g.i, step, 2) - 0.5) * 10;
    const blink = rnd(g.i, step, 5) > 0.82 ? 0.05 : 1;
    const col = cols[Math.floor(rnd(g.i, step, 3) * 4)];
    eyeNode(S, g.x + jx, g.y + jy, 24, blink, rnd(g.i, step, 6) * 2 - 1, rnd(g.i, step, 7) * 2 - 1, col, rgba(col, 0.4));
    text(S, ANSWERS[Math.floor(rnd(g.i, step, 8) * ANSWERS.length)], g.x + jx, g.y + 44 + jy, '500 13px JB', rgba(col, 0.85));
  }
  const a = eo3(seg(t, 0.1, 0.4));
  S.globalAlpha = a;
  gtext(S, 'Perfect determinism', 960, 175, '700 86px SG', '#ffffff', 0.3 + 0.4 * rnd(f, 3), f);
  gtext(S, 'becomes much harder.', 960, 925, '700 92px SG', PINK, 0.4 + 0.5 * rnd(f, 4), f + 7, 'center', 30);
  S.globalAlpha = 1;
  const agreeN = 8 + Math.floor(rnd(f, 77) * 30);
  hud(t0, '03 / THE PROBLEM', `AGREEMENT: ${agreeN}/100 ✗`);
}

// 04 — the character turns around
function s4(t0) {
  const t = t0 - 11.4, f = fr(t0);
  bg(t0, 0.5);
  strands(S, fieldRoots, t0, { alpha: 0.16 + 0.1 * seg(t, 1.2, 2), sway: 3, speed: 0.25, lenMul: 1.2 });
  const hb = pulseAt(t0, TL.HEART, 0.25);
  const move = eio3(seg(t, 1.7, 2.4));
  const cx = lerp(960, 560, move), base = 1010;
  const hgt = lerp(820, 860, seg(t, 0, 4)) * (1 + hb * 0.025);
  // spotlight
  const sp = S.createRadialGradient(cx, 560, 0, cx, 560, 620);
  sp.addColorStop(0, rgba(PURPLE, 0.32 + hb * 0.2)); sp.addColorStop(1, 'rgba(0,0,0,0)');
  S.fillStyle = sp; S.fillRect(0, 0, W, H);
  const fl = rnd(f, 9) > 0.85 ? 0.35 : 1;
  const twitch = rnd(f, 13) > 0.93 ? (rnd(f, 14) - 0.5) * 0.05 : 0;
  if (t < 1.2) {
    drawView(2, cx, base, hgt, { alpha: fl * seg(t, 0, 0.35), filter: 'brightness(0.32) contrast(1.3)', glow: 50, rot: twitch });
  } else if (t < 1.45) {
    drawView(1, cx + (rnd(f, 2) - 0.5) * 30, base, hgt, { filter: 'brightness(0.6)', glow: 40, glowCol: PINK });
  } else {
    drawView(0, cx, base, hgt, { glow: 45, glowCol: rgba(PURPLE, 0.9), rot: twitch + Math.sin(t * 1.3) * 0.012 });
    // face screen glow + flicker overlay
    const v = views[0];
    if (v) {
      const s = hgt / v.h, fx = cx + (0.473 - 0.5) * v.w * s, fy = base - v.h * s + 0.39 * v.h * s;
      const gg = S.createRadialGradient(fx, fy, 0, fx, fy, 260 * s / 0.37);
      gg.addColorStop(0, rgba(CYAN, 0.28 + hb * 0.25 + (rnd(f, 3) > 0.8 ? 0.15 : 0))); gg.addColorStop(1, 'rgba(0,0,0,0)');
      S.save(); S.globalCompositeOperation = 'lighter'; S.fillStyle = gg; S.fillRect(0, 0, W, H); S.restore();
    }
  }
  // text
  if (t > 1.9) {
    const a = eo3(seg(t, 1.9, 2.25)), x = 1360;
    S.globalAlpha = a;
    text(S, 'This is where', x, 330, '500 54px SG', '#ffffff');
    const gx = S.createLinearGradient(-330, 0, 330, 0); gx.addColorStop(0, PINK); gx.addColorStop(0.5, PURPLE); gx.addColorStop(1, CYAN);
    S.save(); S.translate(x, 500); const zs = 1 + 0.25 * (1 - eo5(seg(t, 2.0, 2.4))); S.scale(zs, zs);
    gtext(S, 'GenVM', 0, 0, '700 220px SG', gx, rnd(f, 1) > 0.8 ? 1 : 0.2, f, 'center', 40);
    S.restore();
    S.globalAlpha = eo3(seg(t, 2.3, 2.6));
    text(S, 'becomes interesting.', x, 670, '700 60px SG', '#ffffff', 'center', 16, PINK);
    S.globalAlpha = 1;
    const sub = "the execution environment behind GenLayer's Intelligent Contracts";
    const n = Math.floor(seg(t, 2.6, 3.2) * sub.length);
    S.font = '500 22px JB'; text(S, sub.slice(0, n), x, 770, '500 23px JB', CYAN);
    S.globalAlpha = 1;
  }
  hud(t0, '04 / GENVM', t < 1.45 ? 'SIGNAL: ???' : 'ENTITY: AWAKE');
}

// 05 — traditional vs intelligent contract
const IC = ['Contract', 'Web / AI interaction', 'Reasoning', 'Independent validation', 'Consensus', 'On-chain result'];
const icY = (i) => 300 + i * 116;
const furBox1 = rectRoots(1330, icY(1), 520, 78, 700, 31);
const furBox2 = rectRoots(1330, icY(2), 520, 78, 700, 41);
function s5(t0) {
  const t = t0 - 15.4, f = fr(t0);
  bg(t0, 0.55);
  strands(S, edgeRoots, t0, { alpha: 0.18, lenMul: 0.45 });
  S.globalAlpha = eo3(seg(t, 0, 0.3));
  text(S, 'Think about the difference:', 960, 118, '700 50px SG', '#ffffff');
  S.globalAlpha = 1;
  // left — traditional
  const dim = 1 - 0.55 * seg(t, 1.3, 1.7);
  S.globalAlpha = dim * seg(t, 0.1, 0.3);
  text(S, 'TRADITIONAL SMART CONTRACT', 520, 214, '800 22px JB', 'rgba(255,255,255,0.75)');
  ['Code', 'Execute', 'Same result'].forEach((l, i) => {
    const a = eback(seg(t, 0.15 + i * 0.22, 0.45 + i * 0.22)); if (a <= 0) return;
    const y = 360 + i * 200;
    S.save(); S.globalAlpha = dim; S.translate(520, y); S.scale(a, a);
    S.strokeStyle = 'rgba(255,255,255,0.7)'; S.lineWidth = 2; S.fillStyle = 'rgba(255,255,255,0.05)';
    S.beginPath(); S.roundRect(-180, -42, 360, 84, 10); S.fill(); S.stroke();
    text(S, l, 0, 0, '700 34px SG', '#ffffff'); S.restore();
    if (i < 2 && t > 0.4 + i * 0.22) { S.globalAlpha = dim * 0.7; text(S, '↓', 520, y + 100, '700 44px SG', '#ffffff'); }
  });
  S.globalAlpha = dim * seg(t, 0.9, 1.1);
  text(S, '✓ predictable  ✓ boring', 520, 880, '500 22px JB', 'rgba(255,255,255,0.55)');
  S.globalAlpha = 1;
  // divider
  S.strokeStyle = rgba(PURPLE, 0.5); S.lineWidth = 2; S.beginPath(); S.moveTo(860, 200); S.lineTo(860, 980 * 1); S.stroke();
  gtext(S, 'VS', 860, 560, '400 56px RG', PINK, 0.5 + rnd(f, 2), f);
  // right — intelligent contract
  S.globalAlpha = seg(t, 0.6, 0.9);
  const lg = S.createLinearGradient(1130, 0, 1530, 0); lg.addColorStop(0, PINK); lg.addColorStop(1, CYAN);
  text(S, 'INTELLIGENT CONTRACT', 1330, 214, '800 26px JB', lg);
  S.globalAlpha = 1;
  const lit = (i) => TL.BLIPS[i] - 15.4;
  // connector + travelling pulse
  for (let i = 0; i < 5; i++) {
    const y0 = icY(i) + 40, y1 = icY(i + 1) - 40;
    const p = seg(t, lit(i), lit(i + 1));
    S.strokeStyle = rgba(PURPLE, 0.4 * seg(t, 0.7, 1.0)); S.lineWidth = 3; S.beginPath(); S.moveTo(1330, y0); S.lineTo(1330, y1); S.stroke();
    if (p > 0) { S.strokeStyle = CYAN; S.shadowColor = CYAN; S.shadowBlur = 14; S.beginPath(); S.moveTo(1330, y0); S.lineTo(1330, lerp(y0, y1, p)); S.stroke(); S.shadowBlur = 0; }
    if (p > 0 && p < 1) { S.fillStyle = '#fff'; S.shadowColor = CYAN; S.shadowBlur = 30; S.beginPath(); S.arc(1330, lerp(y0, y1, p), 9, 0, TAU); S.fill(); S.shadowBlur = 0; }
  }
  IC.forEach((l, i) => {
    const y = icY(i), app = eback(seg(t, 0.7 + i * 0.06, 1.0 + i * 0.06));
    if (app <= 0) return;
    const L = seg(t, lit(i), lit(i) + 0.2), on = L > 0;
    const wild = (i === 1 || i === 2) && on;
    if (wild) strands(S, i === 1 ? furBox1 : furBox2, t0, { alpha: 0.55, lenMul: 0.6 + 0.6 * L, sway: 3, speed: 1.2 });
    const jx = wild ? (rnd(f, i, 1) - 0.5) * 8 : 0;
    S.save(); S.translate(1330 + jx, y); S.scale(app * (1 + 0.08 * Math.sin(L * Math.PI)), app);
    if (wild) { // ghost copies — non-deterministic outputs
      S.globalAlpha = 0.35;
      S.strokeStyle = PINK; S.beginPath(); S.roundRect(-260 + (rnd(f, i, 2) - 0.5) * 24, -39 + (rnd(f, i, 3) - 0.5) * 14, 520, 78, 12); S.stroke();
      S.strokeStyle = CYAN; S.beginPath(); S.roundRect(-260 + (rnd(f, i, 4) - 0.5) * 24, -39 + (rnd(f, i, 5) - 0.5) * 14, 520, 78, 12); S.stroke();
      S.globalAlpha = 1;
    }
    let fill = 'rgba(20,6,34,0.9)';
    if (on) { const g = S.createLinearGradient(-260, 0, 260, 0); g.addColorStop(0, rgba(PURPLE, 0.85)); g.addColorStop(1, rgba(i === 5 ? CYAN : PINK, i === 5 ? 0.85 : 0.45)); fill = g; }
    S.fillStyle = fill; S.strokeStyle = on ? (i === 5 ? CYAN : PINK) : rgba(PURPLE, 0.6); S.lineWidth = 2.5;
    if (on) { S.shadowColor = i === 5 ? CYAN : PURPLE; S.shadowBlur = 30 * (1 - L * 0.5); }
    S.beginPath(); S.roundRect(-260, -39, 520, 78, 12); S.fill(); S.shadowBlur = 0; S.stroke();
    text(S, l, i === 3 ? -62 : 0, 0, '700 33px SG', on ? (i === 5 ? '#0c0416' : '#ffffff') : 'rgba(255,255,255,0.5)');
    if (i === 3 && on) for (let k = 0; k < 3; k++) eyeNode(S, 172 + k * 32, 0, 11, 1, Math.sin(t * 6 + k * 2), 0, CYAN, rgba(CYAN, 0.3));
    S.restore();
  });
  hud(t0, '05 / EXECUTION', t > lit(5) ? 'RESULT: COMMITTED' : 'PIPELINE: RUNNING');
}

// 06 — a single AI answer is not truth (cursor scene #2) → validators
const VAL = [270, 200, 160, 340, 20].map((d) => [960 + 610 * Math.cos(d * Math.PI / 180), 575 - 340 * Math.sin(d * Math.PI / 180)]);
function s6(t0) {
  const t = t0 - 19.8, f = fr(t0);
  bg(t0, 0.6);
  strands(S, edgeRoots, t0, { alpha: 0.22, lenMul: 0.5 + 0.3 * pulseAt(t0, TL.DENY, 0.4) });
  const phaseB = t > 1.75;
  S.globalAlpha = phaseB ? eo3(seg(t, 1.75, 2.0)) : eo3(seg(t, 0, 0.3)) * (1 - seg(t, 1.6, 1.75));
  if (!phaseB) rich(S, [['A single AI response ', '#ffffff'], ["isn't unquestionable truth.", PINK]], 960, 100, '700 54px SG', 54, { glow: 10 });
  else rich(S, [['Validators judge ', '#ffffff'], ['independently', CYAN], [' → consensus decides.', '#ffffff']], 960, 100, '700 50px SG', 50, { glow: 10 });
  S.globalAlpha = 1;
  const mv = eio3(seg(t, 1.6, 2.1));
  const cx = lerp(600, 960, mv), cy = lerp(560, 575, mv);
  const deny = pulseAt(t0, TL.DENY, 0.35);
  const shake = deny * 14 * Math.sin(t * 90);
  const cons = t0 >= TL.CONSENSUS, ca = eo3(seg(t0, TL.CONSENSUS, TL.CONSENSUS + 0.3));
  // beams from validators
  VAL.forEach(([vx, vy], i) => {
    const ap = seg(t, 1.9 + i * 0.08, 2.15 + i * 0.08); if (ap <= 0) return;
    const bp = seg(t, 2.2, 2.5);
    if (bp > 0) {
      const no = i === TL.VOTE_NO, voted = t0 >= TL.VOTES[i];
      S.save(); S.setLineDash([10, 12]); S.lineDashOffset = -t * 120;
      S.strokeStyle = rgba(voted && no ? PINK : CYAN, 0.6); S.lineWidth = 2.5;
      S.beginPath(); S.moveTo(vx, vy); S.lineTo(lerp(vx, cx, bp), lerp(vy, cy, bp)); S.stroke(); S.restore();
    }
  });
  // card
  S.save(); S.translate(cx + shake, cy);
  S.fillStyle = 'rgba(16,5,28,0.95)'; S.strokeStyle = cons ? CYAN : deny > 0 ? PINK : rgba(PURPLE, 0.9); S.lineWidth = 3;
  S.shadowColor = cons ? CYAN : PURPLE; S.shadowBlur = 40;
  S.beginPath(); S.roundRect(-300, -170, 600, 340, 18); S.fill(); S.shadowBlur = 0; S.stroke();
  text(S, '◉ LLM OUTPUT', -270, -128, '800 20px JB', PINK, 'left');
  text(S, 'node 0x3f…a1', 270, -128, '500 18px JB', 'rgba(255,255,255,0.4)', 'right');
  text(S, '“Team A won the match.”', 0, -48, '700 44px SG', '#ffffff');
  const conf = 40 + Math.floor(rnd(Math.floor(t * 8), 3) * 59);
  text(S, `confidence: ${cons ? 'validated' : conf + '%'}`, 0, 12, '500 22px JB', cons ? CYAN : 'rgba(255,255,255,0.55)');
  if (!cons) {
    const hov = seg(t, 0.85, 1.0);
    S.fillStyle = deny > 0 ? rgba(PINK, 0.9) : rgba(PURPLE, 0.55 + 0.4 * hov);
    S.shadowColor = PINK; S.shadowBlur = 25 * hov; S.beginPath(); S.roundRect(-170, 72, 340, 66, 12); S.fill(); S.shadowBlur = 0;
    text(S, 'ACCEPT AS TRUTH', 0, 105, '800 24px JB', '#ffffff');
  } else {
    S.globalAlpha = ca;
    S.fillStyle = CYAN; S.shadowColor = CYAN; S.shadowBlur = 30; S.beginPath(); S.roundRect(-250, 72, 500, 66, 12); S.fill(); S.shadowBlur = 0;
    text(S, '✓ CONSENSUS 4/5 → ON-CHAIN', 0, 105, '800 24px JB', '#0c0416');
    S.globalAlpha = 1;
  }
  S.restore();
  // denied stamp
  const st = seg(t0, TL.DENY[0], TL.DENY[0] + 0.12) * (1 - seg(t, 1.55, 1.75));
  if (st > 0) {
    S.save(); S.translate(cx, cy - 10); S.rotate(-0.12); const z = lerp(1.8, 1, eo5(seg(t0, TL.DENY[0], TL.DENY[0] + 0.12))); S.scale(z, z);
    S.globalAlpha = st; S.strokeStyle = PINK; S.lineWidth = 6; S.strokeRect(-330, -62, 660, 124);
    gtext(S, '✕ NOT TRUTH (YET)', 0, 4, '800 62px JB', PINK, 0.4 + 0.6 * rnd(f, 1), f, 'center', 30);
    S.restore();
  }
  // validators — creepy eye-orbs
  VAL.forEach(([vx, vy], i) => {
    const ap = eback(seg(t, 1.9 + i * 0.08, 2.15 + i * 0.08)); if (ap <= 0) return;
    const voted = t0 >= TL.VOTES[i], no = i === TL.VOTE_NO;
    S.save(); S.translate(vx, vy); S.scale(ap, ap);
    S.fillStyle = '#0c0416'; S.strokeStyle = voted ? (no ? PINK : CYAN) : PURPLE; S.lineWidth = 3;
    S.shadowColor = S.strokeStyle; S.shadowBlur = 25; S.beginPath(); S.arc(0, 0, 66, 0, TAU); S.fill(); S.shadowBlur = 0; S.stroke();
    const open = eo3(seg(t, 2.0 + i * 0.08, 2.2 + i * 0.08)) * (rnd(f, i, 9) > 0.96 ? 0.1 : 1);
    const dx = cx - vx, dy = cy - vy, dl = Math.hypot(dx, dy);
    face(S, dx / dl * 8, dy / dl * 6 - 6, 0.16, { open, col: voted && no ? PINK : CYAN, glow: 20, mouth: true });
    S.restore();
    text(S, `VALIDATOR ${i + 1}`, vx, vy + 92, '500 16px JB', 'rgba(255,255,255,0.55)');
    if (voted) {
      const vp = eback(seg(t0, TL.VOTES[i], TL.VOTES[i] + 0.2));
      S.save(); S.translate(vx + 52, vy - 52); S.scale(vp, vp);
      S.fillStyle = no ? PINK : CYAN; S.beginPath(); S.arc(0, 0, 22, 0, TAU); S.fill();
      text(S, no ? '✕' : '✓', 0, 1, '800 24px JB', '#0c0416'); S.restore();
    }
  });
  if (t0 < 22.0) drawCursor(TL.CURSOR2, t0, 1 - seg(t0, 21.5, 21.9));
  hud(t0, '06 / CONSENSUS', cons ? 'STATE: FINALIZED' : phaseB ? 'VALIDATING…' : 'TRUST: 0');
}

// 07 — why it matters (kinetic type)
const WHY = [
  ["AI isn't always", 'deterministic.'],
  ['Web data', 'changes.'],
  ['Natural language', 'is ambiguous.'],
  ["The real world won't fit", 'in a boolean.'],
];
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&@?!<>/\\';
function s7(t0) {
  const idx = Math.min(3, Math.floor((t0 - 23.8) / 0.75)), t = t0 - 23.8 - idx * 0.75, f = fr(t0);
  bg(t0, 0.9);
  strands(S, fieldRoots, t0, { alpha: 0.2 + idx * 0.05, sway: 3.5, speed: 0.6, lenMul: 1 + idx * 0.25 });
  strands(S, edgeRoots, t0, { alpha: 0.35, lenMul: 0.8 + idx * 0.25, sway: 2.5 });
  const [l1, l2] = WHY[idx];
  const z = lerp(1.18, 1, eo5(seg(t, 0, 0.18)));
  text(S, `WHY IT MATTERS — 0${idx + 1}`, 960, 330, '500 24px JB', rgba(PINK, 0.85));
  S.save(); S.translate(960, 560); S.scale(z, z); S.translate(-960, -560);
  if (idx === 3) {
    S.globalAlpha = 0.22; const tf = Math.floor(t * 10) % 2 === 0 ? 'TRUE' : 'FALSE';
    S.font = '400 360px RG'; S.textAlign = 'center'; S.lineWidth = 3; S.strokeStyle = PURPLE; S.strokeText(tf, 960, 560); S.globalAlpha = 1;
  }
  if (idx === 0) {
    for (let k = 0; k < 3; k++) {
      S.globalAlpha = 0.45; const ox = (rnd(f, k, 1) - 0.5) * 50, oy = (rnd(f, k, 2) - 0.5) * 30;
      text(S, l1, 960 + ox, 500 + oy, '700 104px SG', [PINK, PURPLE, CYAN][k]); text(S, l2, 960 + ox, 625 + oy, '700 104px SG', [PINK, PURPLE, CYAN][k]);
    }
    S.globalAlpha = 1;
    gtext(S, l1, 960, 500, '700 104px SG', '#ffffff', 0.3, f); gtext(S, l2, 960, 625, '700 104px SG', CYAN, 0.5, f + 3, 'center', 20);
  } else if (idx === 1) {
    const scr = (s, k0) => s.split('').map((ch, i) => {
      if (ch === ' ') return ch;
      const settle = seg(t, 0.05 + (i + k0) * 0.018, 0.12 + (i + k0) * 0.018);
      const flip = rnd(i + k0, Math.floor(t * 20), 4) > 0.9;
      return settle < 1 || flip ? GLYPHS[Math.floor(rnd(i + k0, f, 2) * GLYPHS.length)] : ch;
    }).join('');
    gtext(S, scr(l1, 0), 960, 500, '700 110px JB', '#ffffff', 0.3, f); gtext(S, scr(l2, 9), 960, 625, '800 110px JB', PINK, 0.6, f, 'center', 20);
  } else if (idx === 2) {
    S.font = '700 104px SG';
    const wave = (s, y, col) => {
      const w = S.measureText(s).width; let x = 960 - w / 2;
      for (let i = 0; i < s.length; i++) {
        const cw = S.measureText(s[i]).width;
        const oy = Math.sin(t * 9 + i * 0.6) * 16, a = 0.55 + 0.45 * Math.sin(t * 7 + i * 1.3);
        S.globalAlpha = a; text(S, s[i], x + cw / 2, y + oy, '700 104px SG', col); x += cw;
      }
      S.globalAlpha = 1;
    };
    wave(l1, 500, '#ffffff'); wave(l2, 625, PURPLE);
    S.globalAlpha = 0.18; text(S, '“bank” → 🏦 ? 🌊 ?', 960, 760, '500 34px JB', CYAN); S.globalAlpha = 1;
  } else {
    gtext(S, l1, 960, 500, '700 98px SG', '#ffffff', 0.4, f); gtext(S, l2, 960, 625, '700 112px SG', PINK, 0.6, f, 'center', 25);
  }
  S.restore();
  // creepy eyes watching at the edges
  face(S, 220, 900, 0.32, { alpha: 0.5 * seg(t0, 24.6, 25.0), open: rnd(f, 1) > 0.9 ? 0.1 : 1, mouth: false, col: PINK });
  face(S, 1700, 190, 0.28, { alpha: 0.45 * seg(t0, 25.4, 25.8), open: rnd(f, 2) > 0.9 ? 0.1 : 1, mouth: false });
  hud(t0, '07 / WHY IT MATTERS', 'UNCERTAINTY: ' + (40 + idx * 18 + Math.floor(rnd(f, 5) * 9)) + '%');
}

// 08 — logo grows fur, GenVM
const LOGO_H = 430, LOGO_CY = 405;
function s8(t0) {
  const t = t0 - 26.8, f = fr(t0);
  bg(t0, 0.6);
  // the cat watches from the dark
  face(S, 960, 440, 2.6, { alpha: 0.09 * seg(t, 1.6, 2.2), open: rnd(f, 3) > 0.94 ? 0.08 : 1, glow: 80, mouth: false });
  strands(S, edgeRoots, t0, { alpha: 0.3, lenMul: 0.7, sway: 2 });
  const breathe = 1 + 0.018 * Math.sin(t * 3.2);
  const s = (LOGO_H / logoBox.h) * breathe;
  const form = seg(t, 0.55, 1.0);
  // solid logo under the fur
  const fillFn = (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, PINK); g.addColorStop(0.55, PURPLE); g.addColorStop(1, '#6a00ff'); return g; };
  drawLogo(S, 960, LOGO_CY, LOGO_H * breathe, fillFn, 'grad', eo3(form), 60);
  // fur strands flying in and then bristling
  const bristle = 0.6 + 0.4 * Math.sin(t * 5) * seg(t, 1, 1.4) + 0.6 * pulseAt(t0, [26.8], 0.6);
  const roots = [];
  for (const p of logoPts) {
    const d = rnd(p.s, 7) * 0.3, k = eo5(seg(t, d, d + 0.65));
    const tx = 960 + (p.x - logoBox.cx) * s, ty = LOGO_CY + (p.y - logoBox.cy) * s;
    const ang = rnd(p.s, 8) * TAU, rad = 900 + rnd(p.s, 9) * 600;
    const x = lerp(960 + Math.cos(ang + t * 2) * rad, tx, k), y = lerp(540 + Math.sin(ang + t * 2) * rad, ty, k);
    const out = Math.atan2(ty - LOGO_CY, tx - 960);
    roots.push({ x, y, a: k < 1 ? ang + Math.PI : out, l: k < 1 ? 40 : (8 + rnd(p.s, 10) * 26) * bristle, c: p.y < logoBox.cy - 40 ? 1 : p.y > logoBox.cy + 70 ? 2 : 0 });
  }
  strands(S, roots, t0, { alpha: 0.5, sway: 2.2, speed: 0.8, width: 1.3, scale: 0.012 });
  // impact flash
  S.fillStyle = rgba('#ffffff', 0.85 * (1 - seg(t, 0, 0.22))); S.fillRect(0, 0, W, H);
  // type
  if (t > 1.0) {
    const a = eo3(seg(t, 1.0, 1.35));
    S.globalAlpha = a;
    S.save(); S.translate(960, 760); const z = lerp(1.3, 1, eo5(seg(t, 1.0, 1.35))); S.scale(z, z);
    gtext(S, 'GenVM', 0, 0, '700 150px SG', brandGrad(S, -260, 260), rnd(f, 4) > 0.85 ? 1 : 0.15, f, 'center', 40);
    S.restore();
    S.globalAlpha = eo3(seg(t, 1.4, 1.7));
    text(S, 'Execution built for AI, Web data & uncertainty.', 960, 868, '500 36px SG', '#ffffff');
    S.globalAlpha = eo3(seg(t, 1.8, 2.1));
    text(S, 'GENLAYER  ·  INTELLIGENT CONTRACTS', 960, 940, '800 24px JB', CYAN, 'center', 14);
    S.globalAlpha = 1;
  }
  hud(t0, '08 / GENLAYER', 'REALITY: ON-CHAIN');
}

const SCENES = [[0, 3.0, s1], [3.0, 6.0, s2], [6.0, 9.6, s3a], [9.6, 11.4, s3b], [11.4, 15.4, s4], [15.4, 19.8, s5], [19.8, 23.8, s6], [23.8, 26.8, s7], [26.8, 99, s8]];

// ---------------------------------------------------------------- post
function glitchAmt(t) {
  let g = 0;
  for (const c of TL.CUTS) { const d = (t - c) / 0.085; g += Math.exp(-d * d); }
  const f = fr(t);
  if (rnd(f, 7) > 0.93) g += 0.4 * rnd(f, 8);
  if (t > 9.3 && t < 9.9) g += 0.25 + 0.3 * rnd(f, 9);
  else if (t >= 9.9 && t < 11.4 && rnd(f, 9) > 0.75) g += 0.35 * rnd(f, 10);
  g += 0.6 * pulseAt(t, TL.DENY, 0.2);
  return Math.min(g, 1.4);
}
function renderFrame(t) {
  t = clamp(t, 0, DUR - 1e-6);
  S.save();
  for (const [a, b, fn] of SCENES) if (t >= a && t < b) { fn(t); break; }
  S.restore();
  S.globalAlpha = 1; S.globalCompositeOperation = 'source-over'; S.shadowBlur = 0;
  const f = fr(t), g = glitchAmt(t), off = 2 + g * 30;
  // RGB split
  TR.globalCompositeOperation = 'copy'; TR.drawImage(sc, 0, 0); TR.globalCompositeOperation = 'multiply'; TR.fillStyle = '#ff0000'; TR.fillRect(0, 0, W, H);
  TB.globalCompositeOperation = 'copy'; TB.drawImage(sc, 0, 0); TB.globalCompositeOperation = 'multiply'; TB.fillStyle = '#00ffff'; TB.fillRect(0, 0, W, H);
  out.globalCompositeOperation = 'source-over'; out.globalAlpha = 1; out.fillStyle = '#000'; out.fillRect(0, 0, W, H);
  out.globalCompositeOperation = 'lighter';
  out.drawImage(tR, off, g * 4 * (rnd(f, 1) - 0.5)); out.drawImage(tB, -off * 0.6, 0);
  out.globalCompositeOperation = 'source-over';
  // slice displacement
  if (g > 0.12) {
    const n = Math.floor(3 + g * 12);
    for (let k = 0; k < n; k++) {
      const y = rnd(f, k, 1) * H, h = 6 + rnd(f, k, 2) * 110 * g, dx = (rnd(f, k, 3) - 0.5) * 300 * g;
      out.drawImage(sc, 0, y, W, h, dx, y, W, h);
      if (rnd(f, k, 4) > 0.7) { out.fillStyle = rgba([PINK, PURPLE, CYAN][k % 3], 0.25 * g); out.fillRect(0, y, W, h); }
    }
  }
  // grain, scanlines, rolling band, vignette, flicker
  out.globalCompositeOperation = 'overlay'; out.globalAlpha = 0.22; out.drawImage(grains[f % 8], 0, 0, W, H);
  out.globalCompositeOperation = 'screen'; out.globalAlpha = 0.045; out.drawImage(grains[(f + 3) % 8], 0, 0, W, H);
  out.globalCompositeOperation = 'source-over'; out.globalAlpha = 1;
  out.fillStyle = scanPat; out.fillRect(0, 0, W, H);
  const by = ((t * 260) % (H + 300)) - 150, band = out.createLinearGradient(0, by - 120, 0, by + 120);
  band.addColorStop(0, 'rgba(255,255,255,0)'); band.addColorStop(0.5, 'rgba(220,0,255,0.05)'); band.addColorStop(1, 'rgba(255,255,255,0)');
  out.fillStyle = band; out.fillRect(0, by - 120, W, 240);
  out.fillStyle = vignette; out.fillRect(0, 0, W, H);
  const flick = 0.05 * rnd(f, 3) + (rnd(f, 4) > 0.97 ? 0.3 : 0);
  out.fillStyle = `rgba(0,0,0,${flick})`; out.fillRect(0, 0, W, H);
  // fade in from black / CRT power-off at the end
  if (t < 0.15) { out.fillStyle = `rgba(0,0,0,${1 - t / 0.15})`; out.fillRect(0, 0, W, H); }
  if (t > 29.45) {
    const p = seg(t, 29.45, 29.85);
    TR.globalCompositeOperation = 'copy'; TR.drawImage(cv, 0, 0);
    out.fillStyle = '#000'; out.fillRect(0, 0, W, H);
    const sy = Math.max(0.004, 1 - eo3(seg(p, 0, 0.6))), sx = 1 - eo3(seg(p, 0.6, 1)) * 0.995;
    if (p < 1) {
      out.save(); out.translate(W / 2, H / 2); out.scale(sx, sy); out.globalCompositeOperation = 'lighter';
      out.drawImage(tR, -W / 2, -H / 2); out.restore();
      out.fillStyle = rgba('#ffffff', 0.9 * seg(p, 0.4, 0.7)); out.fillRect(W / 2 - (W / 2) * sx, H / 2 - 2, W * sx, 4);
    }
  }
}
window.renderFrame = renderFrame;

// ---------------------------------------------------------------- boot
const params = new URLSearchParams(location.search);
const waitImg = (im) => (im.complete && im.naturalWidth ? Promise.resolve() : new Promise((r, j) => { im.onload = r; im.onerror = j; }));
Promise.all([
  waitImg(logoImg), waitImg(charImg),
  document.fonts.load('700 40px SG'), document.fonts.load('500 40px SG'), document.fonts.load('800 40px JB'),
  document.fonts.load('500 40px JB'), document.fonts.load('400 40px RG'),
]).then(() => {
  prepLogo(); prepChar(); prepFx();
  window.READY = true;
  if (params.has('render')) return;
  if (params.has('t')) { renderFrame(+params.get('t')); return; }
  const snd = document.getElementById('snd'), btn = document.getElementById('play');
  let t0 = performance.now();
  const loop = () => {
    const t = !snd.paused ? snd.currentTime : ((performance.now() - t0) / 1000) % DUR;
    renderFrame(t); requestAnimationFrame(loop);
  };
  btn.hidden = false;
  btn.onclick = () => { btn.hidden = true; snd.currentTime = 0; snd.loop = true; snd.play().catch(() => {}); };
  loop();
});
