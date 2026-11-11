// ============================================================================
//  Form engine — pure pose geometry for grading (no DOM, Node-testable).
//  Methods adapted from jeremyipark/vision-demos (Apache-2.0) and the
//  left/right repair idea from MaxLiu22/Motion2MixamoRig (Apache-2.0 code):
//    · isotropic units  — MediaPipe x and y are fractions of frame WIDTH and
//      HEIGHT, so angles and distances on raw values are distorted on any
//      non-square frame. x is scaled by the frame aspect first (lm.aspect).
//    · body-length thresholds, a 5-frame median, the clearer body side
//    · left/right flip repair over a whole clip
//    · reference scoring: joint angles vs a model rep → match % + top fixes
//    · spike timeline: take-off, peak, contact, landing, air time, jump height
// ============================================================================

const SIDE = {
  L: { shoulder:11, elbow:13, wrist:15, hip:23, knee:25, ankle:27 },
  R: { shoulder:12, elbow:14, wrist:16, hip:24, knee:26, ankle:28 },
};
const VIS_MIN = 0.5;
const vis = (lm, i) => !!lm[i] && (lm[i].visibility ?? 1) > VIS_MIN;
const k = lm => lm.aspect || 1;                         // frame width / height
const pt = (lm, i) => ({ x: lm[i].x * k(lm), y: lm[i].y });   // isotropic (frame-height units)
const mid = (a, b) => ({ x:(a.x + b.x) / 2, y:(a.y + b.y) / 2 });

function angle3(a, b, c){
  const abx = a.x - b.x, aby = a.y - b.y, cbx = c.x - b.x, cby = c.y - b.y;
  const mag = Math.hypot(abx, aby) * Math.hypot(cbx, cby);
  if(!mag) return null;
  return Math.acos(Math.max(-1, Math.min(1, (abx*cbx + aby*cby) / mag))) * 180 / Math.PI;
}
export function angleAt(lm, a, b, c){
  return (lm[a] && lm[b] && lm[c]) ? angle3(pt(lm, a), pt(lm, b), pt(lm, c)) : null;
}
export function dist(lm, i, j){
  const a = pt(lm, i), b = pt(lm, j);
  return Math.hypot(a.x - b.x, a.y - b.y);
}
const sideVis = (lm, S, names) => names.reduce((s, n) => s + (lm[S[n]]?.visibility ?? 1), 0) / names.length;

// Joint angle on the clearer side. Both sides are averaged only when the
// model sees them about equally well (a hidden side is a guess).
export function jointAngleOf(lm, names){
  const got = [];
  for(const S of [SIDE.L, SIDE.R]){
    if(names.every(n => vis(lm, S[n]))) got.push({ a: angleAt(lm, S[names[0]], S[names[1]], S[names[2]]), v: sideVis(lm, S, names) });
  }
  if(!got.length) return null;
  if(got.length === 2 && Math.abs(got[0].v - got[1].v) > 0.15) return got[0].v > got[1].v ? got[0].a : got[1].a;
  return got.reduce((s, g) => s + g.a, 0) / got.length;
}

// Body lengths in isotropic units. Thresholds use these, so the camera
// distance cancels out.
export function torsoLen(lm){
  if(!(vis(lm,11) && vis(lm,12) && vis(lm,23) && vis(lm,24))) return null;
  const s = mid(pt(lm,11), pt(lm,12)), h = mid(pt(lm,23), pt(lm,24));
  return Math.hypot(s.x - h.x, s.y - h.y) || null;
}
export function legLen(lm){
  const ls = [];
  for(const S of [SIDE.L, SIDE.R]) if(vis(lm,S.hip) && vis(lm,S.knee) && vis(lm,S.ankle)) ls.push(dist(lm,S.hip,S.knee) + dist(lm,S.knee,S.ankle));
  return ls.length ? ls.reduce((a, b) => a + b, 0) / ls.length : null;
}
export const shoulderWidth = lm => (lm[11] && lm[12]) ? dist(lm, 11, 12) : null;

// ---- Median smoother: one bad frame cannot decide a verdict -----------------
const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m-1] + s[m]) / 2; };
export function createSmoother(n = 5){
  let buf = [];
  return {
    reset(){ buf = []; },
    push(lm){
      buf.push(lm); if(buf.length > n) buf.shift();
      const out = lm.map((_, i) => ({
        x: median(buf.map(f => f[i].x)), y: median(buf.map(f => f[i].y)),
        z: lm[i].z, visibility: median(buf.map(f => f[i].visibility ?? 1)),
      }));
      out.aspect = lm.aspect;
      return out;
    },
  };
}

// ---- Left/right flip repair (offline, whole clip) ---------------------------
// The pose model labels left and right per frame with no memory, and swaps them
// for a frame or two now and then. The facing sign sign(xLeftShoulder - xRight)
// can only really change through a side view (narrow shoulders). So inside a
// run of wide frames, short minority runs are label flips and are swapped back.
const SWAP = [[1,4],[2,5],[3,6],[7,8],[9,10],[11,12],[13,14],[15,16],[17,18],[19,20],[21,22],[23,24],[25,26],[27,28],[29,30],[31,32]];
const MIN_TURN_FRAMES = 4, NARROW = 0.35;               // shoulder width / torso length
function swapSides(lm){
  for(const [a, b] of SWAP) if(lm[a] && lm[b]){ const t = lm[a]; lm[a] = lm[b]; lm[b] = t; }
}
export function fixSideFlips(frames){                   // frames: array of landmark arrays (mutated)
  const info = frames.map(lm => {
    const t = torsoLen(lm), w = shoulderWidth(lm);
    return { sign: Math.sign(lm[11].x - lm[12].x), wide: t != null && w != null && w / t > NARROW };
  });
  let fixed = 0, i = 0;
  while(i < frames.length){
    if(!info[i].wide){ i++; continue; }
    let j = i; while(j < frames.length && info[j].wide) j++;      // wide segment [i, j)
    const seg = info.slice(i, j), pos = seg.filter(s => s.sign > 0).length;
    const major = pos * 2 >= seg.length ? 1 : -1;
    for(let a = i; a < j; ){
      if(info[a].sign === major || info[a].sign === 0){ a++; continue; }
      let b = a; while(b < j && info[b].sign !== major && info[b].sign !== 0) b++;
      if(b - a < MIN_TURN_FRAMES){ for(let f = a; f < b; f++){ swapSides(frames[f]); fixed++; } }
      a = b;
    }
    i = j;
  }
  return fixed;
}

// ---- Reference scoring: compare a rep with a model rep ----------------------
// Features are joint angles: no limb proportions, and they map straight onto a
// coaching cue. "hit" = the arm with the higher wrist; "avg" = both arms/legs.
const hitSide = lm => (lm[15] && lm[16] && lm[15].y <= lm[16].y) ? SIDE.L : SIDE.R;
function sideAngle(lm, S, a, b, c){ return (vis(lm,S[a]) && vis(lm,S[b]) && vis(lm,S[c])) ? angleAt(lm, S[a], S[b], S[c]) : null; }
export const FEATURES = {
  hitElbow:    { label:"Hitting elbow",       get: lm => { const S = hitSide(lm); return sideAngle(lm, S, "shoulder","elbow","wrist"); } },
  hitShoulder: { label:"Hitting arm height",  get: lm => { const S = hitSide(lm); return sideAngle(lm, S, "hip","shoulder","elbow"); } },
  elbows:      { label:"Elbows",              get: lm => jointAngleOf(lm, ["shoulder","elbow","wrist"]) },
  shoulders:   { label:"Arm height",          get: lm => jointAngleOf(lm, ["hip","shoulder","elbow"]) },
  knees:       { label:"Knee bend",           get: lm => jointAngleOf(lm, ["hip","knee","ankle"]) },
  trunkLean:   { label:"Trunk lean",          get: lm => {
    if(!(vis(lm,11) && vis(lm,12) && vis(lm,23) && vis(lm,24))) return null;
    const s = mid(pt(lm,11), pt(lm,12)), h = mid(pt(lm,23), pt(lm,24));
    return Math.abs(Math.atan2(s.x - h.x, h.y - s.y)) * 180 / Math.PI;   // 0 = upright
  } },
};
// Default model = coaching targets at the key moment of each skill (spike:
// contact, set: release, receive: platform). Tolerance = no penalty inside it.
// They are starting values: a coach can replace them with a recorded model rep.
export const DEFAULT_REFERENCE = {
  spike: [
    { f:"hitElbow",    target:170, tol:10, w:1,   low:"Snap your hitting arm straight at contact.", focus:"elbowExtend" },
    { f:"hitShoulder", target:165, tol:15, w:1,   low:"Reach higher — swing your hitting arm up beside your ear.", focus:"reachHigh" },
    { f:"trunkLean",   target:10,  tol:15, w:0.5, high:"Stay tall at contact — don't fold forward." },
  ],
  set: [
    { f:"elbows",    target:160, tol:15, w:1,   low:"Push through to full arm extension.", focus:"elbowExtend" },
    { f:"shoulders", target:150, tol:20, w:1,   low:"Push the ball up, not forward — finish with hands above your forehead.", focus:"reachHigh" },
    { f:"trunkLean", target:5,   tol:15, w:0.5, high:"Stay upright under the ball." },
  ],
  receive: [
    { f:"elbows",    target:170, tol:10, w:1,   low:"Lock your elbows — make one flat platform.", focus:"elbowExtend" },
    { f:"knees",     target:125, tol:20, w:1,   high:"Bend your knees more — get low under the ball.", low:"Don't sit so deep — stay in an athletic stance.", focus:"kneeDepth" },
    { f:"shoulders", target:70,  tol:20, w:0.8, high:"Keep the platform low — arms below shoulder height.", low:"Lift your platform out in front of you." },
    { f:"trunkLean", target:30,  tol:15, w:0.5, low:"Lean forward from the hips — shoulders over your knees." },
  ],
};
const NULL_DEG = 45;    // mean excess at which a rep scores 0 (form unrelated to the model)

export function featuresOf(lm, ref){
  const out = {};
  for(const r of ref){ const v = FEATURES[r.f].get(lm); if(v != null) out[r.f] = Math.round(v); }
  return out;
}
// A model rep recorded by a coach: same tolerances, its own target values.
export function referenceFrom(features, exerciseId){
  return (DEFAULT_REFERENCE[exerciseId] || []).map(r => features[r.f] == null ? r : { ...r, target: features[r.f] });
}
export function compareToReference(lm, ref){
  const rows = [];
  for(const r of ref){
    const v = FEATURES[r.f].get(lm);
    if(v == null) continue;
    const d = v - r.target, excess = Math.max(0, Math.abs(d) - r.tol);
    rows.push({ f:r.f, label:FEATURES[r.f].label, value:Math.round(v), target:r.target, d, excess, w:r.w,
      text: excess > 0 ? (d < 0 ? r.low : r.high) || null : null, focus: r.focus || null });
  }
  if(!rows.length) return null;
  const W = rows.reduce((s, r) => s + r.w, 0);
  const mean = rows.reduce((s, r) => s + r.w * r.excess, 0) / W;
  const score = Math.round(100 * Math.max(0, Math.min(1, 1 - mean / NULL_DEG)));
  const fixes = rows.filter(r => r.excess > 0 && r.text).sort((a, b) => b.w * b.excess - a.w * a.excess).slice(0, 2);
  return { score, fixes, rows };
}

// ---- Spike timeline (offline, from a whole clip) ---------------------------
// Airborne = ankles more than JUMP_LEG leg-lengths above the standing level.
// Jump height comes from air time (h = g·T²/8), which needs no camera scale.
const JUMP_LEG = 0.15, G = 9.81, TIMING_S = 0.08;
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]; };
export function spikeTimeline(track){                    // track: [{ t, lm }]
  const rows = track.map(({ t, lm }) => {
    const ys = [27, 28].filter(i => vis(lm, i)).map(i => lm[i].y);
    const ws = [15, 16].filter(i => vis(lm, i)).map(i => lm[i].y);
    return { t, lm, ankle: ys.length ? ys.reduce((a, b) => a + b) / ys.length : null, wrist: ws.length ? Math.min(...ws) : null, leg: legLen(lm) };
  }).filter(r => r.ankle != null);
  if(rows.length < 5) return [];
  const ground = pct(rows.map(r => r.ankle), 0.8);
  const legs = rows.filter(r => r.leg).map(r => r.leg);
  const leg = legs.length ? median(legs) : 0.25;       // fallback: a typical leg in frame-height units
  const air = rows.map(r => r.ankle < ground - JUMP_LEG * leg);
  const jumps = [];
  for(let i = 0; i < rows.length; ){
    if(!air[i]){ i++; continue; }
    let j = i; while(j < rows.length && (air[j] || (air[j + 1] && j + 1 < rows.length))) j++;   // bridge 1-frame gaps
    if(j - i >= 2){
      const run = rows.slice(i, j);
      const apex = run.reduce((a, b) => b.ankle < a.ankle ? b : a);
      const withWrist = run.filter(r => r.wrist != null);
      const contact = withWrist.length ? withWrist.reduce((a, b) => b.wrist < a.wrist ? b : a) : apex;
      const takeoff = rows[i].t, landing = j < rows.length ? rows[j].t : rows[j - 1].t;
      const airTime = landing - takeoff, dt = contact.t - apex.t;
      jumps.push({
        takeoff, apex: apex.t, contact: contact.t, landing, airTime,
        heightCm: Math.round(G * airTime * airTime / 8 * 100),
        contactVsApexMs: Math.round(dt * 1000), contactLm: contact.lm,
        timing: dt > TIMING_S ? "late" : dt < -TIMING_S ? "early" : "good",
        cue: dt > TIMING_S ? "You hit after your peak — start your arm swing earlier."
           : dt < -TIMING_S ? "You hit before your peak — wait a beat, then swing."
           : "Contact at your peak — well timed.",
      });
    }
    i = j;
  }
  return jumps;
}
