# GenVM — 30s motion piece (16:9, 1920×1080, 60fps)

A creepy, fur-and-glitch motion graphic for the GenVM / Intelligent Contracts Twitter post.
Palette: `#ff87ff`, `#dc00ff`, `#00fff7`. Uses the GenLayer logo and the cat-bot character.

**Final file:** `genvm.mp4` (H.264 + AAC, Twitter/X-ready)

## Storyboard
| Time | Scene |
|---|---|
| 0–3s | Glowing cat eyes in the dark, fur creeping in from the edges, "Blockchains love determinism." typed out, single-frame logo flashes |
| 3–6s | 100 nodes as 100 closed cat-eyes. The contract sweeps across, then all of them open at once and look the same way: "exact same result" |
| 6–9.6s | **Cursor scene 1:** the pointer ticks *call an LLM / read a webpage / unstructured data / natural language / judge the real world*, then clicks **EXECUTE ON 100 NODES** |
| 9.6–11.4s | The eyes stop agreeing: random gazes, blinks and answers. "Perfect determinism becomes much harder." |
| 11.4–15.4s | The character stands with its back turned, glitches around to face you, then "This is where **GenVM** becomes interesting." |
| 15.4–19.8s | Traditional (Code → Execute → Same result) vs Intelligent Contract (6-step pipeline with a pulse running through it; the Web/AI and Reasoning steps grow fur) |
| 19.8–23.8s | **Cursor scene 2:** the pointer tries "ACCEPT AS TRUTH" on one LLM answer and gets denied. Five validator eye-orbs vote 4/5, and consensus puts the answer on-chain |
| 23.8–26.8s | Why it matters: four rapid kinetic-type beats |
| 26.8–30s | Impact. Fur strands fly in to form the logo, cat eyes watch from behind, **GenVM** tagline, then a CRT power-off |

## Rebuild
```bash
node audio.js          # -> soundtrack.wav (procedural sound design, synced to timeline.js)
node render.js         # -> genvm.mp4 (headless Chromium + ffmpeg)
```
Live preview: serve this folder (`npx serve .`) and open `index.html`.

Fonts: Space Grotesk, JetBrains Mono and Rubik Glitch (OFL, in `assets/fonts`). To use another font, change the `@font-face` rules in `index.html`.
