// Form engine tests. Run: node tests/form.test.mjs
import assert from "node:assert/strict";
import { angleAt, jointAngleOf, createSmoother, fixSideFlips, compareToReference,
  DEFAULT_REFERENCE, referenceFrom, featuresOf, spikeTimeline } from "../js/coach/form.js";

// Build a 33-point MediaPipe pose from pixel positions on a W×H frame.
function pose(px, W, H, visibility = 0.95){
  const lm = Array.from({ length:33 }, () => ({ x:0.5, y:0.5, visibility }));
  for(const [i, [x, y]] of Object.entries(px)) lm[i] = { x:x / W, y:y / H, visibility };
  lm.aspect = W / H;
  return lm;
}
// Upright athlete in pixels (portrait 720×1280), arms adjustable.
function athlete({ W = 720, H = 1280, dx = 0, lift = 0, hitElbow = [0, -110], hitWrist = [0, -220], kneeBend = 0 } = {}){
  const sh = 400 - lift, hip = 700 - lift, kn = 950 - lift, an = 1200 - lift;
  const px = {
    0:[360+dx, sh-120], 11:[300+dx, sh], 12:[420+dx, sh], 23:[320+dx, hip], 24:[400+dx, hip],
    25:[320+dx+kneeBend, kn], 26:[400+dx+kneeBend, kn], 27:[320+dx, an], 28:[400+dx, an],
    13:[300+dx+hitElbow[0], sh+hitElbow[1]], 15:[300+dx+hitWrist[0], sh+hitWrist[1]],   // left = hitting arm (raised)
    14:[440+dx, sh+150], 16:[450+dx, sh+300],                                             // right arm down
  };
  return pose(px, W, H);
}

// 1. Isotropic angles: a true 90° elbow with both segments at 45°, portrait 720×1280.
{
  const lm = pose({ 11:[300, 500], 13:[400, 600], 15:[500, 500] }, 720, 1280);
  assert.equal(Math.round(angleAt(lm, 11, 13, 15)), 90);
  const raw = lm.map(p => ({ ...p })); raw.aspect = 1;           // the old way: no aspect correction
  assert.ok(Math.abs(angleAt(raw, 11, 13, 15) - 90) > 25, "raw normalized angle is distorted");
}

// 2. The clearer side wins when one side is a guess.
{
  const lm = pose({ 23:[300,700], 25:[300,950], 27:[300,1200], 24:[420,700], 26:[500,900], 28:[420,1100] }, 720, 1280);
  [24, 26, 28].forEach(i => lm[i].visibility = 0.6);               // right leg barely seen
  assert.equal(Math.round(jointAngleOf(lm, ["hip","knee","ankle"])), 180, "uses the clear (straight) left leg");
}

// 3. Median smoother: one wild frame does not move the output.
{
  const sm = createSmoother(5);
  let out;
  for(let i = 0; i < 5; i++){
    const lm = athlete();
    if(i === 3) lm[15] = { x:0.05, y:0.95, visibility:0.95 };       // one bad wrist detection
    out = sm.push(lm);
  }
  const clean = athlete();
  assert.ok(Math.abs(out[15].x - clean[15].x) < 1e-9 && Math.abs(out[15].y - clean[15].y) < 1e-9);
  assert.equal(out.aspect, clean.aspect);
}

// 4. Left/right flip repair: a 2-frame flip is fixed; a real 6-frame turn is kept.
{
  const frames = Array.from({ length:30 }, () => athlete());
  const mirror = lm => { const m = lm.map(p => ({ ...p, x:1 - p.x })); m.aspect = lm.aspect; return m; };
  frames[10] = mirror(frames[10]); frames[11] = mirror(frames[11]);  // label flip (looks like an instant turn)
  for(let f = 20; f < 26; f++) frames[f] = mirror(frames[f]);         // a longer run → treated as a real turn
  const fixed = fixSideFlips(frames);
  assert.equal(fixed, 2);
  const sign = lm => Math.sign(lm[11].x - lm[12].x);
  assert.equal(sign(frames[10]), sign(frames[0]));
  assert.notEqual(sign(frames[22]), sign(frames[0]));
}

// 5. Reference scoring: a textbook spike contact scores 100; a bent elbow gets the cue.
{
  const ref = DEFAULT_REFERENCE.spike;
  const good = athlete({ hitElbow:[0, -110], hitWrist:[0, -220] });     // arm straight up
  const g = compareToReference(good, ref);
  assert.equal(g.score, 100); assert.equal(g.fixes.length, 0);
  const bent = athlete({ hitElbow:[0, -110], hitWrist:[90, -160] });    // elbow ~130°
  const b = compareToReference(bent, ref);
  assert.ok(b.score < 100);
  assert.equal(b.fixes[0].f, "hitElbow");
  assert.match(b.fixes[0].text, /straight at contact/);
  // a coach's own model rep becomes the target
  const custom = referenceFrom(featuresOf(bent, ref), "spike");
  assert.equal(compareToReference(bent, custom).score, 100);
}

// 6. Spike timeline: 0.6 s in the air → ~44 cm; contact 0.2 s after the peak → "late".
{
  const fps = 30, track = [];
  for(let f = 0; f < 60; f++){
    const t = f / fps, inAir = t >= 0.5 && t < 1.1;
    const lift = inAir ? Math.round(600 * Math.sin(Math.PI * (t - 0.5) / 0.6) ** 1) : 0;   // peak at t=0.8
    const lm = athlete({ lift, hitElbow:[-60, 80], hitWrist:[-80, 150] });          // arm cocked low
    if(Math.abs(t - 1.0) < 0.02) lm[15] = { x:300 / 720, y:(400 - lift - 300) / 1280, visibility:0.95 };   // swing: wrist highest at t=1.0
    track.push({ t, lm });
  }
  const jumps = spikeTimeline(track);
  assert.equal(jumps.length, 1);
  const j = jumps[0];
  assert.ok(j.airTime > 0.4 && j.airTime <= 0.62, `air time ${j.airTime}`);
  assert.ok(Math.abs(j.apex - 0.8) < 0.05, `apex ${j.apex}`);
  assert.equal(j.timing, "late");
  assert.ok(j.heightCm > 20 && j.heightCm <= 47, `height ${j.heightCm}`);
}
console.log("form.js: all tests passed");
