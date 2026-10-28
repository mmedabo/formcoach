// ============================================================================
//  Game tracking — pure logic for the live game overlay (no DOM, Node-testable).
//  Court homography from 4 tapped corners, a 4-player tracker on the court
//  plane, and per-player movement stats (distance + stamina).
// ============================================================================

export const COURT_W = 16, COURT_H = 8;          // beach court, metres
export const MAX_PLAYERS = 4;                    // beach 2v2

const SMOOTH = 0.35;            // EMA weight of the newest foot position
const MATCH_M = 1.5;            // max jump (m) to keep the same player between frames
const STEP_M = 0.3;             // movement smaller than this is pose jitter, not running
const MAX_SPEED = 9;            // m/s; faster than this is a tracking jump, not running
// Stamina is our own estimate from movement only. It is not a physiological measure.
const DRAIN = v => 0.1 * v + 0.15 * v * v;      // points per second at speed v (m/s)
const RECOVER = 0.08;           // points per second while standing
const REST_S = 1;               // seconds without a step before recovery starts

// ---- Homography -------------------------------------------------------------
// 3×3 matrix (row-major, 9 numbers) that maps the 4 src points onto the 4 dst
// points. Returns null if the points are degenerate (e.g. 3 on one line).
export function homography(src, dst){
  const A = [], b = [];
  for(let i = 0; i < 4; i++){
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u*x, -u*y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v*x, -v*y]); b.push(v);
  }
  const h = solve(A, b);
  return h && [...h, 1];
}
function solve(A, b){                            // Gauss-Jordan, partial pivoting
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for(let c = 0; c < n; c++){
    let p = c;
    for(let r = c + 1; r < n; r++) if(Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if(Math.abs(M[p][c]) < 1e-9) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for(let r = 0; r < n; r++){
      if(r === c) continue;
      const f = M[r][c] / M[c][c];
      for(let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r, i) => r[n] / r[i]);
}
export function project(H, x, y){
  const w = H[6]*x + H[7]*y + H[8];
  return [(H[0]*x + H[1]*y + H[2]) / w, (H[3]*x + H[4]*y + H[5]) / w];
}
// Corners are tapped near-left, near-right, far-right, far-left.
export const COURT_CORNERS = [[0, 0], [COURT_W, 0], [COURT_W, COURT_H], [0, COURT_H]];
export const onCourt = ([x, y], margin = 1) =>
  x > -margin && x < COURT_W + margin && y > -margin && y < COURT_H + margin;

// ---- Tracker ----------------------------------------------------------------
// update(feet, t): feet = on-court foot points in metres, t = time in seconds.
// Each player keeps a fixed slot (0..3) so names stay on the same person. When
// all 4 slots are taken, a new detection goes to the nearest unseen player.
export function createTracker(){
  let players = [];

  function newPlayer(pos, t){
    return { slot:players.length, pos, seen:t, anchor:pos, anchorT:t, dist:0, stamina:100, visible:true };
  }
  function move(p, f, t){
    const dt = t - p.seen;
    p.pos = [p.pos[0] + SMOOTH*(f[0] - p.pos[0]), p.pos[1] + SMOOTH*(f[1] - p.pos[1])];
    const d = Math.hypot(p.pos[0] - p.anchor[0], p.pos[1] - p.anchor[1]);
    if(d >= STEP_M){
      const span = t - p.anchorT, v = span > 0 ? d / span : Infinity;
      if(v <= MAX_SPEED){ p.dist += d; p.stamina -= DRAIN(v) * span; }
      p.anchor = p.pos; p.anchorT = t;
    } else if(t - p.anchorT > REST_S && dt > 0){
      p.stamina += RECOVER * dt;
    }
    p.stamina = Math.max(0, Math.min(100, p.stamina));
    p.seen = t; p.visible = true;
  }
  function jump(p, f, t){                        // re-acquired far away: no distance counted
    p.pos = f; p.anchor = f; p.anchorT = t; p.seen = t; p.visible = true;
  }

  return {
    get players(){ return players; },
    reset(){ players = []; },
    resetStats(){ players.forEach(p => { p.dist = 0; p.stamina = 100; }); },
    update(feet, t){
      players.forEach(p => { p.visible = false; });
      const pairs = [];
      players.forEach((p, pi) => feet.forEach((f, fi) => {
        const d = Math.hypot(f[0] - p.pos[0], f[1] - p.pos[1]);
        if(d < MATCH_M + 2 * (t - p.seen)) pairs.push([d, pi, fi]);   // radius grows while unseen
      }));
      pairs.sort((a, b) => a[0] - b[0]);
      const left = new Set(feet.keys());
      for(const [, pi, fi] of pairs){
        if(players[pi].visible || !left.has(fi)) continue;
        move(players[pi], feet[fi], t); left.delete(fi);
      }
      for(const fi of left){
        if(players.length < MAX_PLAYERS){ players.push(newPlayer(feet[fi], t)); continue; }
        let best = null, bd = Infinity;
        for(const p of players){
          if(p.visible) continue;
          const d = Math.hypot(feet[fi][0] - p.pos[0], feet[fi][1] - p.pos[1]);
          if(d < bd){ bd = d; best = p; }
        }
        if(best) jump(best, feet[fi], t);
      }
      return players;
    }
  };
}
