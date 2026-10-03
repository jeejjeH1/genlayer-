// Shared timeline: used by the renderer (main.js) and the sound design (audio.js)
// so every glitch, click and heartbeat lands on the same frame.
(function (root) {
  const TL = {
    DUR: 30,
    FPS: 60,
    // scene cuts / glitch spikes
    CUTS: [3.0, 6.0, 9.6, 11.4, 12.6, 12.85, 15.4, 19.8, 23.8, 24.55, 25.3, 26.05, 26.8],
    TYPE1: { t0: 0.9, t1: 2.1, text: 'Blockchains love determinism.' },
    TYPE2: { t0: 6.15, t1: 6.75, text: 'But what happens when a contract needs to:' },
    // [time, x, y, click?]  (x,y = pointer hotspot)
    CURSOR1: [
      [6.45, 1980, 1150],
      [6.95, 1145, 398, 1],
      [7.4, 1150, 490, 1],
      [7.85, 1142, 582, 1],
      [8.3, 1148, 674, 1],
      [8.75, 1145, 766, 1],
      [9.3, 1395, 876, 1],
      [9.6, 1430, 900],
    ],
    CURSOR2: [
      [19.95, 1750, 1060],
      [20.8, 600, 668],
      [20.9, 600, 668, 1],
      [21.15, 606, 664, 1],
      [21.8, 840, 930],
    ],
    HEART: [0.35, 0.55, 1.6, 1.8, 11.7, 11.9, 12.7, 12.9, 13.6, 13.8, 14.5, 14.7,
      25.0, 25.15, 25.5, 25.62, 25.95, 26.05, 26.35, 26.43],
    AGREE: 4.6,
    CHAOS: 9.6,
    TURN: 12.6,
    HISS: 12.85,
    BLIPS: [16.4, 16.95, 17.5, 18.05, 18.6, 19.15],
    DENY: [20.9, 21.15],
    VOTES: [22.3, 22.45, 22.6, 22.75, 22.9],
    VOTE_NO: 3,
    CONSENSUS: 23.1,
    RISER: [25.6, 26.8],
    IMPACT: 26.8,
  };
  TL.CLICKS = [...TL.CURSOR1, ...TL.CURSOR2].filter((k) => k[3]).map((k) => k[0]);
  if (typeof module !== 'undefined' && module.exports) module.exports = TL;
  else root.TL = TL;
})(this);
