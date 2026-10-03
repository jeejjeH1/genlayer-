// Usage:
//   node render.js                      -> renders genvm.mp4 (needs soundtrack.wav, run `node audio.js` first)
//   node render.js --stills 1.5,4.8 DIR -> writes PNG stills for review
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const ROOT = __dirname;
const TL = require('./timeline.js');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav' };

function serve() {
  return new Promise((res) => {
    const srv = http.createServer((req, rsp) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { rsp.writeHead(404); return rsp.end(); }
      rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(rsp);
    }).listen(0, () => res(srv));
  });
}

(async () => {
  const srv = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('console', (m) => console.log('[page]', m.text()));
  page.on('pageerror', (e) => console.error('[page error]', e.message));
  await page.goto(`http://127.0.0.1:${srv.address().port}/index.html?render=1`);
  await page.waitForFunction(() => window.READY === true, null, { timeout: 60000 });

  const si = process.argv.indexOf('--stills');
  if (si > 0) {
    const times = process.argv[si + 1].split(',').map(Number);
    const dir = process.argv[si + 2] || ROOT;
    fs.mkdirSync(dir, { recursive: true });
    for (const t of times) {
      const b64 = await page.evaluate((t) => { renderFrame(t); return document.getElementById('c').toDataURL('image/jpeg', 0.9).slice(23); }, t);
      fs.writeFileSync(path.join(dir, `still_${t.toFixed(2)}.jpg`), Buffer.from(b64, 'base64'));
    }
  } else {
    const outFile = path.join(ROOT, process.argv[2] || 'genvm.mp4');
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error',
      '-f', 'image2pipe', '-framerate', String(TL.FPS), '-c:v', 'mjpeg', '-i', '-',
      '-i', path.join(ROOT, 'soundtrack.wav'),
      '-map', '0:v', '-map', '1:a',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', String(TL.FPS),
      '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-shortest', '-movflags', '+faststart', outFile], { stdio: ['pipe', 'inherit', 'inherit'] });
    const total = TL.DUR * TL.FPS;
    const t0 = Date.now();
    for (let f = 0; f < total; f++) {
      const b64 = await page.evaluate((t) => { renderFrame(t); return document.getElementById('c').toDataURL('image/jpeg', 0.97).slice(23); }, f / TL.FPS);
      if (!ff.stdin.write(Buffer.from(b64, 'base64'))) await new Promise((r) => ff.stdin.once('drain', r));
      if (f % 60 === 0) console.log(`frame ${f}/${total}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
    ff.stdin.end();
    await new Promise((r) => ff.on('close', r));
    console.log('wrote', outFile);
  }
  await browser.close();
  srv.close();
})();
