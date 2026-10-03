// "Clean premium" cut — 120 BPM. Every cut sits on a beat (0.5s grid).
// Shared by main.js (visuals) and audio.js (music + UI sound design).
(function (root) {
  const TL = {
    DUR: 30,
    FPS: 60,
    BPM: 120,
    MUSIC_IN: 1.5, // groove starts after the brand sting
    SCENES: {
      sting: [0, 1.5],
      intro: [1.5, 5.5],
      toggles: [5.5, 9.5],
      chaos: [9.5, 11.5],
      genvm: [11.5, 15.0],
      compare: [15.0, 19.5],
      consensus: [19.5, 23.5],
      why: [23.5, 26.5],
      outro: [26.5, 30],
    },
    // transitions
    PANEL_WIPES: [5.5, 11.5, 19.5], // three-colour panel sweep, scene swaps when covered
    SPLIT: 1.5, // sting splits open
    IRIS: { t: 9.5, x: 1390, y: 842 }, // circle grows out of the RUN button click
    PUSH: 15.0, // vertical push
    WHY: [23.5, 24.25, 25.0, 25.75],
    OUTRO_HIT: 26.5,
    // cursor tracks [t, x, y, click?]
    CURSOR1: [
      [5.9, 1980, 1150],
      [6.5, 1684, 392, 1],
      [7.0, 1684, 486, 1],
      [7.5, 1684, 580, 1],
      [8.0, 1684, 674, 1],
      [8.5, 1684, 768, 1],
      [9.0, 1384, 846],
      [9.25, 1390, 842, 1],
      [9.5, 1396, 846],
    ],
    CURSOR2: [
      [19.8, 1960, 1120],
      [20.5, 960, 690, 1],
      [21.2, 1120, 860],
    ],
    // events
    SYNC_FLIP: [3.5, 4.0, 4.5, 5.0],
    COMPARE_STEPS: [16.0, 16.5, 17.0, 17.5, 18.0, 18.5],
    VOTES: [21.5, 21.75, 22.0, 22.25, 22.5],
    VOTE_NO: 3,
    CONSENSUS: 22.75,
  };
  TL.CLICKS = [...TL.CURSOR1, ...TL.CURSOR2].filter((k) => k[3]).map((k) => k[0]);
  if (typeof module !== 'undefined' && module.exports) module.exports = TL;
  else root.TL = TL;
})(this);
