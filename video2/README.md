# GenVM — "Clean Cut" (30s, 16:9, 1920×1080, 60fps)

A second, completely different take on the GenVM post: a premium, keynote-style motion graphic.
It uses Swiss-grid kinetic typography, colour-block transitions and a 120 BPM track where every cut lands on a beat.
Palette: `#ff87ff`, `#dc00ff`, `#00fff7` with ink `#120a1f` and paper `#f6f3fb`. Font: Sora + JetBrains Mono.

**Final file:** `genvm_clean.mp4` (H.264 + AAC, X-ready)

| Time | Scene | Transition out |
|---|---|---|
| 0–1.5s | Brand sting: logo, **GenVM**, "Blockchains love determinism. Reality doesn't." (frame 0 = thumbnail) | Purple splits open top/bottom |
| 1.5–5.5s | "Blockchains love determinism." + 100 tiles flipping in perfect sync on the beat → "100 / 100 nodes agree" | 3-colour panel sweep |
| 5.5–9.5s | **Cursor #1:** toggles on *Call an LLM / Read a webpage / Unstructured data / Natural language / Judge the real world*, then clicks **Run on 100 nodes** | Circle grows out of the clicked button |
| 9.5–11.5s | Same tiles now disagree. "~~Perfect determinism~~ becomes much harder." | Panel sweep |
| 11.5–15s | Character rises on a gradient disc with orbiting LLM / Web / Data chips. "This is where **GenVM** becomes interesting." | Vertical push |
| 15–19.5s | Split screen: Traditional (Code → Execute → Same result) vs Intelligent Contract (6 steps lit on the beat) | Panel sweep |
| 19.5–23.5s | **Cursor #2:** clicks "Accept as final" on one LLM answer, which becomes "Needs independent validation". 5 validators vote 4/5 → on-chain | Hard cut on the beat |
| 23.5–26.5s | Why it matters: 4 colour cards, one every 1.5 beats | Ink iris from centre (drop) |
| 26.5–30s | Logo, GenVM, tagline, mascot pops up to say bye | Fade |

## Rebuild
```bash
node audio.js    # -> soundtrack.wav (music + UI sound design, synced to timeline.js)
node render.js   # -> genvm.mp4 (headless Chromium + ffmpeg)
```
