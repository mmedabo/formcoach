// ============================================================================
//  Court Vision — real-time multi-player tracking on a 2D top-down court.
//  Reuses MediaPipe PoseLandmarker (same CDN model as the Form Coach) with
//  numPoses > 1, projects each player's feet through a tap-calibrated
//  homography, and paints a live "bird's-eye" court minimap.
//  Ball tracking is intentionally out of scope here (best done offline in the
//  Python analysis/ pipeline) — this MVP focuses on players + court position.
// ============================================================================
const MP_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
let FilesetResolver, PoseLandmarker;

let poseLandmarker = null, stream = null, rafId = null, running = false, facing = "environment";
let court = null, H = null, calibrating = false, calibPts = [], miniOn = true;
let onWinResize = null, onFsChange = null, stageHome = null;
const PALETTE = ["#c6ff4f", "#5c8cff", "#ff8ad4", "#ffb020"];
const els = {};
const ID = id => document.getElementById(id);
const toast = m => { const t = ID("toast"); if(!t) return; t.textContent = m; t.classList.add("show"); setTimeout(()=>t.classList.remove("show"), 2100); };
const badge = (text, live) => { els.cvBadgeText.textContent = text; els.cvBadge.classList.toggle("live", !!live); };

// ---- Homography (4-point DLT solved with Gaussian elimination) --------------
function computeHomography(src, dst){
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
function applyH(h, x, y){
  const X = h[0]*x+h[1]*y+h[2], Y = h[3]*x+h[4]*y+h[5], W = h[6]*x+h[7]*y+h[8] || 1e-9;
  return { x: X/W, y: Y/W };
}

// ---- MediaPipe ----
async function ensureModel(){
  if(poseLandmarker) return;
  badge("Loading model…", false);
  if(!PoseLandmarker) ({ FilesetResolver, PoseLandmarker } = await import(MP_URL));
  const vision = await FilesetResolver.forVisionTasks(MP_URL + "/wasm");
  poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions:{ modelAssetPath:"https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task", delegate:"GPU" },
    runningMode:"VIDEO", numPoses: court.maxPlayers || 4
  });
}
async function startCamera(){
  try{
    els.startCam.disabled = true;
    await ensureModel();
    badge("Requesting camera…", false);
    stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:facing, width:{ideal:1280}, height:{ideal:720} }, audio:false });
    els.cvVideo.srcObject = stream; await els.cvVideo.play();
    const vw = els.cvVideo.videoWidth, vh = els.cvVideo.videoHeight;
    els.courtStage.style.aspectRatio = `${vw} / ${vh}`;   // match stream so overlay aligns 1:1
    els.cvCanvas.width = vw; els.cvCanvas.height = vh;
    els.cvEmpty.style.display = "none";
    els.stopCam.disabled = false; els.flipCam.disabled = false; els.calibrate.disabled = false;
    running = true; badge(H ? "Live" : "Live · calibrate the court", true);
    loop();
  }catch(err){
    console.error("Court camera error", err);
    toast(err && err.name === "NotAllowedError" ? "Camera permission denied" : "Couldn't start the camera");
    badge("Camera off", false); els.startCam.disabled = false;
  }
}
function stopCamera(){
  running = false; if(rafId) cancelAnimationFrame(rafId);
  if(stream){ stream.getTracks().forEach(t=>t.stop()); stream = null; }
  if(els.cvVideo){ els.cvVideo.srcObject = null; els.cvCanvas.getContext("2d").clearRect(0,0,els.cvCanvas.width,els.cvCanvas.height); }
  els.cvEmpty.style.display = ""; els.startCam.disabled = false; els.stopCam.disabled = true; els.flipCam.disabled = true; els.calibrate.disabled = true;
  badge("Camera off", false);
}
async function flipCamera(){
  facing = facing === "environment" ? "user" : "environment";
  if(!running){ toast(facing==="environment"?"Rear camera":"Front camera"); return; }
  if(stream) stream.getTracks().forEach(t=>t.stop());
  stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:facing, width:{ideal:1280}, height:{ideal:720} }, audio:false });
  els.cvVideo.srcObject = stream; await els.cvVideo.play();
  els.cvCanvas.width = els.cvVideo.videoWidth; els.cvCanvas.height = els.cvVideo.videoHeight;
  els.courtStage.style.aspectRatio = `${els.cvVideo.videoWidth} / ${els.cvVideo.videoHeight}`;
  toast(facing==="environment"?"Rear camera":"Front camera");
}

// ---- Fullscreen (expand the whole stage so overlays + minimap stay visible) ----
function fitExpanded(){
  if(!els.courtStage.classList.contains("expanded")) return;
  const va = (els.cvVideo.videoWidth / els.cvVideo.videoHeight) || (16/9);
  let w = window.innerWidth, h = w/va;
  if(h > window.innerHeight){ h = window.innerHeight; w = h*va; }
  els.courtStage.style.width = w+"px"; els.courtStage.style.height = h+"px";
}
function setExpanded(on){
  const stage = els.courtStage;
  if(on){
    // portal the stage to <body> so its fixed/z-index escapes the glass node's stacking context
    stageHome = { parent: stage.parentNode, next: stage.nextSibling };
    document.body.appendChild(stage);
    stage.classList.add("expanded");
    fitExpanded();
    stage.requestFullscreen && stage.requestFullscreen().catch(()=>{});
  } else {
    stage.classList.remove("expanded");
    stage.style.width = ""; stage.style.height = "";
    if(stageHome){ stageHome.parent.insertBefore(stage, stageHome.next); stageHome = null; }
    if(document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(()=>{});
  }
  els.cvExpand.textContent = on ? "✕" : "⛶";
  els.cvExpand.title = on ? "Exit fullscreen" : "Fullscreen";
}
const toggleExpand = () => setExpanded(!els.courtStage.classList.contains("expanded"));

// ---- Calibration ----
function startCalibration(){
  calibrating = true; calibPts = []; H = null;
  els.calibrate.classList.add("accent");
  updateCalibHint();
}
function updateCalibHint(){
  if(!calibrating){ els.cvHint.textContent = H ? "Court calibrated ✓ — players are mapped below." : "Not calibrated — tap “Calibrate court”, then tap the 4 corners."; return; }
  const next = court.corners[calibPts.length];
  els.cvHint.textContent = next ? `Calibrating: tap the ${next} court corner (${calibPts.length+1}/4).` : "Calibrated!";
}
function onStageTap(e){
  if(e.target.closest(".cv-expand")) return;   // don't treat the fullscreen button as a corner tap
  if(!calibrating) return;
  const r = els.courtStage.getBoundingClientRect();
  const nx = (e.clientX - r.left)/r.width, ny = (e.clientY - r.top)/r.height;
  calibPts.push({ x: Math.max(0,Math.min(1,nx)), y: Math.max(0,Math.min(1,ny)) });
  if(calibPts.length === 4){
    const dst = [ {x:0,y:0}, {x:court.length,y:0}, {x:court.length,y:court.width}, {x:0,y:court.width} ];
    H = computeHomography(calibPts, dst);
    calibrating = false; els.calibrate.classList.remove("accent");
    toast("Court calibrated"); badge("Live", true);
  }
  updateCalibHint();
}

// ---- Detection loop ----
function loop(){
  if(!running) return;
  const v = els.cvVideo, ctx = els.cvCanvas.getContext("2d"), W = els.cvCanvas.width, Ht = els.cvCanvas.height;
  if(v.readyState >= 2){
    ctx.clearRect(0,0,W,Ht);
    const res = poseLandmarker.detectForVideo(v, performance.now());
    const players = [];
    if(res.landmarks && res.landmarks.length){
      res.landmarks.forEach(lm => {
        const xs = lm.map(p=>p.x), ys = lm.map(p=>p.y);
        const minX=Math.min(...xs), maxX=Math.max(...xs), minY=Math.min(...ys), maxY=Math.max(...ys);
        const la=lm[27], ra=lm[28];
        const foot = { x:(la.x+ra.x)/2, y:Math.max(la.y,ra.y) };   // mid-ankle, lowest = ground contact
        players.push({ minX,maxX,minY,maxY, foot });
      });
    }
    players.sort((a,b)=> a.foot.x - b.foot.x);                     // stable-ish left→right labels
    // draw calibration markers
    calibPts.forEach((p,i)=>{ ctx.fillStyle="#c6ff4f"; ctx.beginPath(); ctx.arc(p.x*W,p.y*Ht,7,0,7); ctx.fill(); ctx.fillStyle="#0c0d11"; ctx.font="bold 12px sans-serif"; ctx.textAlign="center"; ctx.fillText(i+1, p.x*W, p.y*Ht+4); });
    // draw player boxes + labels
    players.forEach((p,i)=>{
      const col = PALETTE[i%PALETTE.length];
      ctx.strokeStyle=col; ctx.lineWidth=3;
      ctx.strokeRect(p.minX*W, p.minY*Ht, (p.maxX-p.minX)*W, (p.maxY-p.minY)*Ht);
      ctx.fillStyle=col; ctx.fillRect(p.minX*W, p.minY*Ht-20, 34, 20);
      ctx.fillStyle="#0c0d11"; ctx.font="bold 12px sans-serif"; ctx.textAlign="left"; ctx.fillText("P"+(i+1), p.minX*W+5, p.minY*Ht-6);
    });
    renderCourt(els.courtMap, players);
    if(miniOn && els.miniMap) renderCourt(els.miniMap, players);
    els.cvCount.textContent = players.length;
  }
  rafId = requestAnimationFrame(loop);
}

function renderCourt(cv, players){
  const ctx = cv.getContext("2d");
  const W = cv.width, Ht = cv.height, pad = 16;
  const sx = (W-2*pad)/court.length, sy = (Ht-2*pad)/court.width;
  ctx.clearRect(0,0,W,Ht);
  // court
  ctx.fillStyle = "rgba(92,140,255,.08)"; ctx.fillRect(pad, pad, court.length*sx, court.width*sy);
  ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 2; ctx.strokeRect(pad, pad, court.length*sx, court.width*sy);
  ctx.strokeStyle = "rgba(198,255,79,.8)"; ctx.setLineDash([6,5]);            // net line
  ctx.beginPath(); ctx.moveTo(pad+court.netAt*sx, pad); ctx.lineTo(pad+court.netAt*sx, pad+court.width*sy); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = "rgba(255,255,255,.4)"; ctx.font = "9px monospace"; ctx.textAlign="center"; ctx.fillText("NET", pad+court.netAt*sx, pad-4);
  if(!H){ ctx.fillStyle="rgba(255,255,255,.5)"; ctx.font="12px sans-serif"; ctx.fillText("Calibrate the court to plot players", W/2, Ht/2); return; }
  players.forEach((p,i)=>{
    const c = applyH(H, p.foot.x, p.foot.y);
    if(c.x < -1 || c.x > court.length+1 || c.y < -1 || c.y > court.width+1) return;   // ignore off-court
    const px = pad + Math.max(0,Math.min(court.length,c.x))*sx, py = pad + Math.max(0,Math.min(court.width,c.y))*sy;
    const col = PALETTE[i%PALETTE.length];
    ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(px, py, 8, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = "#0c0d11"; ctx.font = "bold 11px sans-serif"; ctx.textAlign="center"; ctx.fillText("P"+(i+1), px, py+4);
  });
}

// ---- Mount / unmount ----
function html(sport){
  return `
  <div class="page-hero">
    <div><p class="eyebrow"><span class="dot"></span> Computer vision · ${sport.name}</p><h2>Court Vision</h2>
    <p>Point your camera at the court, tap the four corners once to calibrate, and see every player mapped live onto a 2D top-down court. Runs on-device — great filmed from the side on a tripod. <b>Ball tracking</b> comes from the offline analysis tool.</p></div>
    <span class="route-chip">Live player tracking</span>
  </div>
  <div class="court-grid">
    <div class="node">
      <div class="node-head"><span class="pd y"></span> Camera <span class="node-tag">detect players</span></div>
      <div class="stage court-stage" id="courtStage">
        <video id="cvVideo" playsinline muted></video>
        <canvas id="cvCanvas"></canvas>
        <div class="court-mini" id="miniWrap"><span class="court-mini-label">Live court</span><canvas id="miniMap" width="320" height="176"></canvas></div>
        <button type="button" class="cv-expand" id="cvExpand" title="Fullscreen" aria-label="Toggle fullscreen">⛶</button>
        <div class="stage-badge" id="cvBadge"><span class="dot"></span><span id="cvBadgeText">Camera off</span></div>
        <div class="stage-empty" id="cvEmpty"><b>Set up your court</b>Prop the phone so the whole court is in frame, start the camera, then tap the 4 corners to calibrate.</div>
      </div>
      <div class="coach-controls">
        <button type="button" class="coach-btn primary" id="startCam">Start camera</button>
        <button type="button" class="coach-btn" id="calibrate" disabled>Calibrate court</button>
        <button type="button" class="coach-btn" id="miniToggle">Minimap: on</button>
        <button type="button" class="coach-btn" id="flipCam" disabled>Flip cam</button>
        <button type="button" class="coach-btn" id="stopCam" disabled>Stop</button>
      </div>
      <p class="coach-note" id="cvHint">Not calibrated — start the camera, tap “Calibrate court”, then tap the 4 corners (near-left, near-right, far-right, far-left).</p>
    </div>
    <div class="node">
      <div class="node-head"><span class="pd b"></span> Live court <span class="node-tag">top-down</span></div>
      <canvas id="courtMap" class="court-map" width="640" height="360"></canvas>
      <div class="cv-legend"><span><b id="cvCount">0</b> players tracked</span><span class="micro">P1–P4 by court position</span></div>
    </div>
  </div>`;
}

export function mountCourt(container, sport){
  court = sport.court || { length:16, width:8, netAt:8, corners:["near-left","near-right","far-right","far-left"], maxPlayers:4 };
  container.className = "page";
  container.innerHTML = html(sport);
  ["courtStage","cvVideo","cvCanvas","cvBadge","cvBadgeText","cvEmpty","startCam","calibrate","miniToggle","flipCam","stopCam","cvHint","courtMap","miniMap","miniWrap","cvCount","cvExpand"].forEach(id => els[id]=ID(id));
  running = false; H = null; calibrating = false; calibPts = []; facing = "environment"; miniOn = true;
  els.startCam.addEventListener("click", startCamera);
  els.stopCam.addEventListener("click", stopCamera);
  els.flipCam.addEventListener("click", flipCamera);
  els.calibrate.addEventListener("click", startCalibration);
  els.miniToggle.addEventListener("click", () => {
    miniOn = !miniOn;
    els.miniWrap.style.display = miniOn ? "block" : "none";
    els.miniToggle.textContent = miniOn ? "Minimap: on" : "Minimap: off";
    els.miniToggle.classList.toggle("accent", miniOn);
  });
  els.miniToggle.classList.add("accent");
  els.cvExpand.addEventListener("click", toggleExpand);
  els.courtStage.addEventListener("pointerdown", onStageTap);
  onWinResize = () => fitExpanded();
  onFsChange = () => { if(!document.fullscreenElement && els.courtStage.classList.contains("expanded")) setExpanded(false); };
  window.addEventListener("resize", onWinResize);
  document.addEventListener("fullscreenchange", onFsChange);
  renderCourt(els.courtMap, []); renderCourt(els.miniMap, []);
}
export function unmountCourt(){
  if(els.courtStage && els.courtStage.classList.contains("expanded")) setExpanded(false);  // re-home the portaled stage before teardown
  stopCamera();
  if(onWinResize){ window.removeEventListener("resize", onWinResize); onWinResize = null; }
  if(onFsChange){ document.removeEventListener("fullscreenchange", onFsChange); onFsChange = null; }
}
