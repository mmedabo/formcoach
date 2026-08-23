// ============================================================================
//  Court mapping — shared homography + top-down court renderer.
//  Used by the Form Coach to overlay a live 2D court minimap on the camera.
// ============================================================================
export const PALETTE = ["#ff5c00", "#5c8cff", "#ff8ad4", "#c6ff4f"];

// 4-point homography (DLT + Gaussian elimination). src/dst: arrays of 4 {x,y}.
export function computeHomography(src, dst){
  const A = [], b = [];
  for(let i=0;i<4;i++){
    const s = src[i], d = dst[i];
    A.push([s.x, s.y, 1, 0, 0, 0, -d.x*s.x, -d.x*s.y]); b.push(d.x);
    A.push([0, 0, 0, s.x, s.y, 1, -d.y*s.x, -d.y*s.y]); b.push(d.y);
  }
  const M = A.map((row,i)=>[...row, b[i]]), n = 8;
  for(let col=0; col<n; col++){
    let piv = col; for(let r=col+1;r<n;r++) if(Math.abs(M[r][col])>Math.abs(M[piv][col])) piv = r;
    [M[col], M[piv]] = [M[piv], M[col]];
    const dv = M[col][col] || 1e-9;
    for(let c=col;c<=n;c++) M[col][c] /= dv;
    for(let r=0;r<n;r++) if(r!==col){ const f = M[r][col]; for(let c=col;c<=n;c++) M[r][c] -= f*M[col][c]; }
  }
  const h = M.map(row=>row[n]);
  return [h[0],h[1],h[2],h[3],h[4],h[5],h[6],h[7],1];
}
export function applyH(h, x, y){
  const X = h[0]*x+h[1]*y+h[2], Y = h[3]*x+h[4]*y+h[5], W = h[6]*x+h[7]*y+h[8] || 1e-9;
  return { x: X/W, y: Y/W };
}

// Draw the top-down court. players: [{foot:{x,y}}] (normalized). opts: {tIdx,tName,trail,calibMsg}
export function drawCourt(cv, court, H, players, opts = {}){
  const { tIdx = -1, tName = "", trail = null, calibMsg = "Calibrate to plot position" } = opts;
  const ctx = cv.getContext("2d");
  const W = cv.width, Ht = cv.height, pad = 14;
  const sx = (W-2*pad)/court.length, sy = (Ht-2*pad)/court.width;
  const toPx = (x,y) => ({ px: pad + Math.max(0,Math.min(court.length,x))*sx, py: pad + Math.max(0,Math.min(court.width,y))*sy });
  ctx.clearRect(0,0,W,Ht);
  ctx.fillStyle = "rgba(255,92,0,.08)"; ctx.fillRect(pad, pad, court.length*sx, court.width*sy);
  ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 2; ctx.strokeRect(pad, pad, court.length*sx, court.width*sy);
  ctx.strokeStyle = "rgba(255,92,0,.8)"; ctx.setLineDash([6,5]);
  ctx.beginPath(); ctx.moveTo(pad+court.netAt*sx, pad); ctx.lineTo(pad+court.netAt*sx, pad+court.width*sy); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = "rgba(255,255,255,.4)"; ctx.font = "9px monospace"; ctx.textAlign = "center"; ctx.fillText("NET", pad+court.netAt*sx, pad-3);
  if(!H){ ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.font = "11px sans-serif"; ctx.fillText(calibMsg, W/2, Ht/2); return; }
  if(trail && trail.length > 1){
    ctx.strokeStyle = "rgba(255,92,0,.5)"; ctx.lineWidth = 2; ctx.beginPath();
    trail.forEach((s,i)=>{ const q = toPx(s.x, s.y); i ? ctx.lineTo(q.px,q.py) : ctx.moveTo(q.px,q.py); });
    ctx.stroke();
  }
  players.forEach((p,i)=>{
    const c = applyH(H, p.foot.x, p.foot.y);
    if(c.x < -1 || c.x > court.length+1 || c.y < -1 || c.y > court.width+1) return;
    const { px, py } = toPx(c.x, c.y);
    const isT = i === tIdx;
    const col = isT ? "#ff5c00" : PALETTE[i%PALETTE.length];
    ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = isT ? 14 : 9;
    ctx.beginPath(); ctx.arc(px, py, isT ? 9 : 7, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
    if(isT && tName){ ctx.fillStyle = col; ctx.font = "bold 10px sans-serif"; ctx.textAlign = "center"; ctx.fillText(tName, px, py-12); }
    ctx.fillStyle = "#0c0d11"; ctx.font = "bold 10px sans-serif"; ctx.textAlign = "center"; ctx.fillText(isT ? "•" : (i+1), px, py+3);
  });
}
