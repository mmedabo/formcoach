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
// target selection + recording
let lastPlayers = [], target = null, targetIdx = -1;
let recording = false, recStart = 0, recSamples = [], recDist = 0, lastRecPos = null, lastSampleT = 0, recTimer = null;
const COURT_KEY = "bv_court_sessions";
const esc = s => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const fmtT = sec => { const m = Math.floor(sec/60), s = Math.round(sec%60); return `${m}:${String(s).padStart(2,"0")}`; };
const readSessions = () => { try{ const a = JSON.parse(localStorage.getItem(COURT_KEY)); return Array.isArray(a) ? a : []; }catch(e){ return []; } };
const writeSessions = a => { try{ localStorage.setItem(COURT_KEY, JSON.stringify(a)); }catch(e){ toast("Storage full"); } };
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
  if(recording) stopRec();                 // save whatever was captured
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
  const r = els.courtStage.getBoundingClientRect();
  const nx = (e.clientX - r.left)/r.width, ny = (e.clientY - r.top)/r.height;
  if(calibrating){
    calibPts.push({ x: Math.max(0,Math.min(1,nx)), y: Math.max(0,Math.min(1,ny)) });
    if(calibPts.length === 4){
      const dst = [ {x:0,y:0}, {x:court.length,y:0}, {x:court.length,y:court.width}, {x:0,y:court.width} ];
      H = computeHomography(calibPts, dst);
      calibrating = false; els.calibrate.classList.remove("accent");
      toast("Court calibrated"); badge("Live", true);
    }
    updateCalibHint();
    return;
  }
  // otherwise: pick the detected player nearest the tap as the target
  if(!running || !lastPlayers.length) return;
  let best = null, bd = Infinity;
  lastPlayers.forEach(p => { const cx=(p.minX+p.maxX)/2, cy=(p.minY+p.maxY)/2; const d=Math.hypot(cx-nx, cy-ny); if(d<bd){ bd=d; best=p; } });
  if(best && bd < 0.3) setTarget(best);
}
function setTarget(p){
  const name = els.playerName.value.trim() || "Player";
  target = { name, lastFoot: { x:p.foot.x, y:p.foot.y } };
  els.targetInfo.textContent = `🎯 ${name} — tap Record to start a session`;
  els.recordBtn.disabled = false;
  toast(`Targeting ${name}`);
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
    lastPlayers = players;
    // re-acquire the selected target each frame by nearest foot position
    targetIdx = -1;
    if(target && players.length){
      let bd = Infinity, bi = -1;
      players.forEach((p,i)=>{ const d = Math.hypot(p.foot.x-target.lastFoot.x, p.foot.y-target.lastFoot.y); if(d<bd){ bd=d; bi=i; } });
      if(bi >= 0){ targetIdx = bi; target.lastFoot = players[bi].foot; }
    }
    // calibration markers
    calibPts.forEach((p,i)=>{ ctx.fillStyle="#c6ff4f"; ctx.beginPath(); ctx.arc(p.x*W,p.y*Ht,7,0,7); ctx.fill(); ctx.fillStyle="#0c0d11"; ctx.font="bold 12px sans-serif"; ctx.textAlign="center"; ctx.fillText(i+1, p.x*W, p.y*Ht+4); });
    // player boxes + labels (target = lime + name)
    players.forEach((p,i)=>{
      const isT = i === targetIdx;
      const col = isT ? "#c6ff4f" : PALETTE[i%PALETTE.length];
      const label = isT ? (target.name || "Target") : ("P"+(i+1));
      ctx.strokeStyle=col; ctx.lineWidth = isT ? 4 : 3;
      ctx.strokeRect(p.minX*W, p.minY*Ht, (p.maxX-p.minX)*W, (p.maxY-p.minY)*Ht);
      const lw = Math.max(34, label.length*8 + 12);
      ctx.fillStyle=col; ctx.fillRect(p.minX*W, p.minY*Ht-20, lw, 20);
      ctx.fillStyle="#0c0d11"; ctx.font="bold 12px sans-serif"; ctx.textAlign="left"; ctx.fillText(label, p.minX*W+6, p.minY*Ht-6);
    });
    // record the target's court path
    if(recording && targetIdx >= 0){
      const now = performance.now();
      if(now - lastSampleT > 150){
        lastSampleT = now;
        const foot = players[targetIdx].foot;
        const pos = H ? applyH(H, foot.x, foot.y) : { x: foot.x*court.length, y: foot.y*court.width };
        if(lastRecPos) recDist += Math.hypot(pos.x-lastRecPos.x, pos.y-lastRecPos.y);
        lastRecPos = pos;
        recSamples.push({ t: Math.round(now-recStart), x:+pos.x.toFixed(2), y:+pos.y.toFixed(2) });
      }
    }
    renderCourt(els.courtMap, players, targetIdx, target && target.name);
    if(miniOn && els.miniMap) renderCourt(els.miniMap, players, targetIdx, target && target.name);
    els.cvCount.textContent = players.length;
  }
  rafId = requestAnimationFrame(loop);
}

function renderCourt(cv, players, tIdx = -1, tName = ""){
  const ctx = cv.getContext("2d");
  const W = cv.width, Ht = cv.height, pad = 16;
  const sx = (W-2*pad)/court.length, sy = (Ht-2*pad)/court.width;
  const toPx = (x,y) => ({ px: pad + Math.max(0,Math.min(court.length,x))*sx, py: pad + Math.max(0,Math.min(court.width,y))*sy });
  ctx.clearRect(0,0,W,Ht);
  ctx.fillStyle = "rgba(92,140,255,.08)"; ctx.fillRect(pad, pad, court.length*sx, court.width*sy);
  ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 2; ctx.strokeRect(pad, pad, court.length*sx, court.width*sy);
  ctx.strokeStyle = "rgba(198,255,79,.8)"; ctx.setLineDash([6,5]);            // net line
  ctx.beginPath(); ctx.moveTo(pad+court.netAt*sx, pad); ctx.lineTo(pad+court.netAt*sx, pad+court.width*sy); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = "rgba(255,255,255,.4)"; ctx.font = "9px monospace"; ctx.textAlign="center"; ctx.fillText("NET", pad+court.netAt*sx, pad-4);
  if(!H){ ctx.fillStyle="rgba(255,255,255,.5)"; ctx.font="12px sans-serif"; ctx.fillText("Calibrate the court to plot players", W/2, Ht/2); return; }
  // recorded target trail
  if(recSamples.length > 1){
    ctx.strokeStyle = "rgba(198,255,79,.5)"; ctx.lineWidth = 2; ctx.beginPath();
    recSamples.forEach((s,i)=>{ const q = toPx(s.x, s.y); i ? ctx.lineTo(q.px,q.py) : ctx.moveTo(q.px,q.py); });
    ctx.stroke();
  }
  players.forEach((p,i)=>{
    const c = applyH(H, p.foot.x, p.foot.y);
    if(c.x < -1 || c.x > court.length+1 || c.y < -1 || c.y > court.width+1) return;   // ignore off-court
    const { px, py } = toPx(c.x, c.y);
    const isT = i === tIdx;
    const col = isT ? "#c6ff4f" : PALETTE[i%PALETTE.length];
    ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = isT ? 14 : 10;
    ctx.beginPath(); ctx.arc(px, py, isT ? 10 : 8, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
    if(isT && tName){ ctx.fillStyle = col; ctx.font = "bold 10px sans-serif"; ctx.textAlign="center"; ctx.fillText(tName, px, py-13); }
    ctx.fillStyle = "#0c0d11"; ctx.font = "bold 11px sans-serif"; ctx.textAlign="center"; ctx.fillText(isT ? "T" : ("P"+(i+1)), px, py+4);
  });
}

// ---- Recording sessions (per target player, tagged with name + datetime) ----
function toggleRecord(){
  if(!target){ toast("Tap a player to target first"); return; }
  recording ? stopRec() : startRec();
}
function startRec(){
  recording = true; recStart = performance.now(); recSamples = []; recDist = 0; lastRecPos = null; lastSampleT = 0;
  els.recordBtn.textContent = "■ Stop"; els.recordBtn.classList.add("recording");
  els.targetInfo.textContent = `● Recording ${target.name}…`;
  recTimer = setInterval(()=>{ els.recTime.textContent = fmtT((performance.now()-recStart)/1000); }, 500);
}
function stopRec(){
  if(!recording) return;
  recording = false; clearInterval(recTimer); recTimer = null;
  els.recordBtn.textContent = "● Record"; els.recordBtn.classList.remove("recording");
  const dur = Math.round((performance.now()-recStart)/1000);
  els.recTime.textContent = "0:00";
  if(recSamples.length < 2){ els.targetInfo.textContent = `🎯 ${target.name}`; toast("Recording too short to save"); return; }
  const all = readSessions();
  all.push({ id:"s"+Date.now(), name: target.name, sport: sportName, startedAt: new Date().toISOString(),
    durationSec: dur, distanceM: +recDist.toFixed(1), samples: recSamples.length, calibrated: !!H, path: recSamples });
  writeSessions(all); renderSessions();
  els.targetInfo.textContent = `🎯 ${target.name} — saved (${fmtT(dur)})`;
  toast(`Saved ${target.name}'s ${fmtT(dur)} session`);
}
function renderSessions(){
  if(!els.sessList) return;
  const all = readSessions();
  els.sessCount.textContent = all.length;
  els.sessList.innerHTML = all.length
    ? all.slice().reverse().map(s => `<div class="sess-row"><span><b>${esc(s.name)}</b><br><span class="micro">${new Date(s.startedAt).toLocaleString()}</span></span><span class="dose">${fmtT(s.durationSec)} · ${s.distanceM}m</span><button class="node-x" data-del="${s.id}" title="Delete">×</button></div>`).join("")
    : `<div class="empty-state">No recordings yet — target a player and hit Record.</div>`;
  els.sessList.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", ()=>{ writeSessions(readSessions().filter(x=>x.id!==b.dataset.del)); renderSessions(); }));
}
function exportSessions(){
  const all = readSessions(); if(!all.length){ toast("No recordings yet"); return; }
  const url = URL.createObjectURL(new Blob([JSON.stringify(all,null,2)], {type:"application/json"}));
  const a = document.createElement("a"); a.href = url; a.download = `court-sessions-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); toast("Sessions exported");
}
function clearSessions(){
  if(!readSessions().length){ toast("Nothing to clear"); return; }
  if(!confirm("Delete all saved court recordings?")) return;
  writeSessions([]); renderSessions(); toast("Recordings cleared");
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
      <div class="cv-legend"><span><b id="cvCount">0</b> players tracked</span><span class="micro">tap a player to target</span></div>
      <div class="cv-session">
        <input id="playerName" class="cv-name" placeholder="Player name (e.g. Madhav)" autocomplete="off" />
        <div class="cv-target" id="targetInfo">Tap the player you want to track in the video, then Record.</div>
        <div class="cv-rec-row">
          <button type="button" class="coach-btn" id="recordBtn" disabled>● Record</button>
          <span class="cv-rec-time" id="recTime">0:00</span>
        </div>
      </div>
      <details class="data-panel" id="sessPanel">
        <summary>Saved recordings <b id="sessCount">0</b></summary>
        <div id="sessList"></div>
        <div class="data-actions"><button type="button" id="exportSess">Export all</button><button type="button" id="clearSess">Clear all</button></div>
      </details>
    </div>
  </div>`;
}

export function mountCourt(container, sport){
  court = sport.court || { length:16, width:8, netAt:8, corners:["near-left","near-right","far-right","far-left"], maxPlayers:4 };
  container.className = "page";
  container.innerHTML = html(sport);
  ["courtStage","cvVideo","cvCanvas","cvBadge","cvBadgeText","cvEmpty","startCam","calibrate","miniToggle","flipCam","stopCam","cvHint","courtMap","miniMap","miniWrap","cvCount","cvExpand","playerName","targetInfo","recordBtn","recTime","sessPanel","sessList","sessCount","exportSess","clearSess"].forEach(id => els[id]=ID(id));
  running = false; H = null; calibrating = false; calibPts = []; facing = "environment"; miniOn = true;
  target = null; targetIdx = -1; recording = false; recSamples = []; lastPlayers = [];
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
  els.recordBtn.addEventListener("click", toggleRecord);
  els.exportSess.addEventListener("click", exportSessions);
  els.clearSess.addEventListener("click", clearSessions);
  els.playerName.addEventListener("input", () => { if(target){ target.name = els.playerName.value.trim() || "Player"; els.targetInfo.textContent = recording ? `● Recording ${target.name}…` : `🎯 ${target.name}`; } });
  renderSessions();
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
