// Tracker + homography tests. Run: node tests/track.test.mjs
import assert from "node:assert/strict";
import { homography, project, createTracker, COURT_CORNERS, onCourt } from "../js/game/track.js";

// Homography: tapped pixel corners map exactly onto court corners.
const px = [[140, 680], [1140, 680], [900, 330], [380, 330]];
const H = homography(px, COURT_CORNERS);
px.forEach((p, i) => {
  const [x, y] = project(H, ...p);
  assert.ok(Math.abs(x - COURT_CORNERS[i][0]) < 1e-6 && Math.abs(y - COURT_CORNERS[i][1]) < 1e-6);
});
const Hinv = homography(COURT_CORNERS, px);
const [bx, by] = project(H, ...project(Hinv, 5, 3));
assert.ok(Math.abs(bx - 5) < 1e-6 && Math.abs(by - 3) < 1e-6, "round trip");
assert.equal(homography([[0, 0], [1, 1], [2, 2], [3, 3]], COURT_CORNERS), null, "collinear → null");
assert.ok(onCourt([8, 4]) && !onCourt([8, 11]));

const noise = () => (Math.random() - 0.5) * 0.12;   // ±6 cm pose jitter
const fps = 30;

// 1. Standing still with jitter: no distance, stamina stays ~100.
{
  const tr = createTracker();
  for(let i = 0; i < fps * 20; i++) tr.update([[3 + noise(), 2 + noise()]], i / fps);
  const p = tr.players[0];
  assert.ok(p.dist < 0.5, `standing dist ${p.dist}`);
  assert.ok(p.stamina > 99, `standing stamina ${p.stamina}`);
}

// 2. Running 2 m/s for 5 s: ~10 m, stamina drains, then recovers when still.
{
  const tr = createTracker();
  let t = 0;
  for(let i = 0; i < fps * 5; i++, t = i / fps) tr.update([[2 + 2 * t + noise(), 4 + noise()]], t);
  const p = tr.players[0];
  assert.ok(p.dist > 9 && p.dist < 11.5, `run dist ${p.dist}`);
  const after = p.stamina;
  assert.ok(after < 98 && after > 90, `run stamina ${after}`);
  for(let i = 0; i < fps * 30; i++) tr.update([[p.pos[0] + noise(), 4 + noise()]], 5 + i / fps);
  assert.ok(p.stamina > after, "recovers when standing");
}

// 3. Four players keep their slots; a lost player gets its slot back.
{
  const tr = createTracker();
  const start = [[3, 2], [5, 6], [11, 3], [13, 6]];
  for(let i = 0; i < fps; i++) tr.update(start.map(([x, y]) => [x + noise(), y + noise()]), i / fps);
  assert.equal(tr.players.length, 4);
  const slotAt = pos => tr.players.find(p => Math.hypot(p.pos[0] - pos[0], p.pos[1] - pos[1]) < 0.5).slot;
  const before = start.map(slotAt);
  // player at [11,3] disappears for 2 s, then shows up 4 m away
  for(let i = 0; i < fps * 2; i++) tr.update([start[0], start[1], start[3]], 1 + i / fps);
  for(let i = 0; i < 20; i++) tr.update([start[0], start[1], [14, 1], start[3]], 3 + i / fps);
  assert.equal(tr.players.length, 4, "no 5th player");
  assert.equal(slotAt([14, 1]), before[2], "lost player keeps slot");
  assert.deepEqual([start[0], start[1], start[3]].map(slotAt), [before[0], before[1], before[3]]);
  // a spectator-like 5th detection on court must not create a 5th player
  tr.update([...start, [8, 4]], 4);
  assert.equal(tr.players.length, 4);
}
console.log("track.js: all tests passed");

// ---- Ball tracker ----
import { createBallTracker } from "../js/game/track.js";
{
  const H = 720, fps = 30, g = 2000;                                  // px/s² "gravity" in image space
  const run = (bt, from, to, path, extra = () => []) => {
    const touches = [];
    for(let f = Math.round(from * fps); f < Math.round(to * fps); f++){
      const t = f / fps, p = path(t);
      const r = bt.update(p ? [{ ...p, score:0.8 }, ...extra(t)] : extra(t), t);
      if(r.touch) touches.push(+r.touch.t.toFixed(2));
    }
    return touches;
  };
  // 1. a free arc (up, over the top, down): no touch
  {
    const bt = createBallTracker({ scale:H });
    const arc = t => ({ x:200 + 300 * t, y:600 - 900 * t + 0.5 * g * t * t });
    assert.deepEqual(run(bt, 0, 0.9, arc), [], "gravity arc is not a touch");
  }
  // 2. falling, then hit back up at t = 1.0: one touch near 1.0
  {
    const bt = createBallTracker({ scale:H });
    const path = t => t < 1 ? { x:400, y:100 + 500 * t } : { x:400 + 200 * (t - 1), y:600 - 700 * (t - 1) };
    const touches = run(bt, 0, 1.6, path);
    assert.equal(touches.length, 1); assert.ok(Math.abs(touches[0] - 1) < 0.1, `touch at ${touches[0]}`);
    assert.equal(bt.state.touches, 1);
  }
  // 3. a spike: slow drift, then 4× faster straight down → touch; a far-away false detection is ignored
  {
    const bt = createBallTracker({ scale:H });
    // a still decoy with a higher score is dropped after 0.5 s; the spike comes at 1.0 s
    const path = t => t < 1 ? { x:300 + 150 * t, y:200 + 100 * t } : { x:450 + 100 * (t - 1), y:300 + 1500 * (t - 1) };
    const decoy = t => [{ x:50, y:50, score:0.95 }];                 // e.g. a white hat in the corner
    const touches = run(bt, 0, 1.3, path, decoy);
    assert.equal(touches.length, 1);
    assert.ok(bt.state.trail.every(p => p.x > 100), "decoy never joined the track");
  }
  // 4. rallies: a 2 s rally, a 2 s gap (ends it), a 0.5 s blip (too short to count)
  {
    const bt = createBallTracker({ scale:H });
    const arc = t => ({ x:300, y:300 + 50 * Math.sin(t * 3) });
    run(bt, 0, 2, arc); run(bt, 2, 4, () => null); run(bt, 4, 4.5, arc); run(bt, 4.5, 6.5, () => null);
    assert.equal(bt.state.rallies, 1); assert.equal(bt.state.active, false);
  }
}
console.log("ball tracker: all tests passed");
// 5. a still false detection (a hat) never shows as a rally, even for a moment
{
  const bt = createBallTracker({ scale:720 });
  let shown = 0;
  for(let f = 0; f < 90; f++){ bt.update([{ x:50, y:50, score:0.9 }], f / 30); if(bt.state.active || bt.state.rallies) shown++; }
  assert.equal(shown, 0);
}
console.log("ball tracker: still-object check passed");
