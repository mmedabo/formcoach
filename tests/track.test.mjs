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
