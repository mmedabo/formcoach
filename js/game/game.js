// ============================================================================
//  Game Tracker — live beach-volleyball overlay (lazy-loaded module).
//  A fixed camera (or a recorded clip) feeds a MediaPipe person detector. The
//  user taps the 4 court corners once; each player's feet (bottom of the box)
//  are then mapped onto the court to draw rings, name tags, a court map,
//  distance and stamina. People off the court (referee, spectators) are skipped.
//  mountGame(container) builds the UI; unmountGame() stops the camera.
// ============================================================================

import { createPersonDetector } from "../coach/coach.js";
import { homography, project, createTracker, onCourt, COURT_W, COURT_H, COURT_CORNERS } from "./track.js";

const COLORS = ["#5c8cff", "#7cf5a0", "#f5d76e", "#ff8ad4"];
const CORNER_NAMES = ["near-left", "near-right", "far-right", "far-left"];
const RING_M = 0.6;                 // ring radius on the sand, metres

let detector = null, stream = null, clipUrl = null, rafId = null, running = false;
let H = null, Hinv = null, taps = null, names = [], lastPanel = 0;
const tracker = createTracker();
const els = {};
const ID = id => document.getElementById(id);

function badge(text, live){ els.gameBadgeText.textContent = text; els.gameBadge.classList.toggle("live", !!live); }
function setCue(type, msg){ els.gameCue.className = `form-cue ${type}`; els.gameCue.textContent = msg; }
const nameOf = p => names[p.slot] || `P${p.slot + 1}`;

// ---- Source (camera or clip) ----------------------------------------------
async function startSource(file){
  stopSource();
  try{
    els.startCam.disabled = true;
    badge("Loading model…", false); setCue("info", "Loading the player detection model…");
    if(!detector) detector = await createPersonDetector();
    const v = els.gameVideo;
    if(file){
      clipUrl = URL.createObjectURL(file);
      v.src = clipUrl; v.loop = true;
    } else {
      badge("Requesting camera…", false);
      stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:"environment", width:{ideal:1920}, height:{ideal:1080} }, audio:false });
      v.srcObject = stream;
    }
    await v.play();
    if(!v.isConnected){ stopSource(); return; }  // user left the page while loading
    els.gameCanvas.width = v.videoWidth; els.gameCanvas.height = v.videoHeight;
    els.gameStage.style.aspectRatio = `${v.videoWidth} / ${v.videoHeight}`;
    els.gameEmpty.style.display = "none";
    [els.stopCam, els.calibrate, els.resetStats].forEach(b => b.disabled = false);
    running = true; H = Hinv = null; tracker.reset();
    badge("Live", true);
    startCalibration();
    loop();
  }catch(err){
    console.error("Game source error", err);
    setCue("warn", err && err.name === "NotAllowedError"
      ? "Camera permission denied. Enable it for this site and try again."
      : "Could not start the video or load the model. Check your connection and try again.");
    stopSource();
  }
}
function stopSource(){
  running = false; taps = null;
  if(rafId) cancelAnimationFrame(rafId);
  if(stream){ stream.getTracks().forEach(t => t.stop()); stream = null; }
  const v = els.gameVideo;
  if(v){ v.pause(); v.srcObject = null; v.removeAttribute("src"); v.load(); }
  if(clipUrl){ URL.revokeObjectURL(clipUrl); clipUrl = null; }
  if(els.gameCanvas){
    els.gameCanvas.getContext("2d").clearRect(0, 0, els.gameCanvas.width, els.gameCanvas.height);
    els.gameEmpty.style.display = "";
    els.startCam.disabled = false;
    [els.stopCam, els.calibrate, els.resetStats].forEach(b => b.disabled = true);
    badge("Camera off", false);
  }
}

// ---- Calibration: tap the 4 court corners ----------------------------------
function startCalibration(){
  taps = [];
  if(clipUrl) els.gameVideo.pause();             // tap on a still frame
  setCue("info", `Tap corner 1 of 4: ${CORNER_NAMES[0]} (the near sideline is the one closest to the camera).`);
}
function onTap(e){
  if(!taps) return;
  const r = els.gameCanvas.getBoundingClientRect();
  taps.push([(e.clientX - r.left) * els.gameCanvas.width / r.width, (e.clientY - r.top) * els.gameCanvas.height / r.height]);
  if(taps.length < 4){ setCue("info", `Tap corner ${taps.length + 1} of 4: ${CORNER_NAMES[taps.length]}.`); return; }
  const h = homography(taps, COURT_CORNERS);
  if(!h){ taps = []; setCue("warn", "Those 4 points do not form a court. Tap again, starting near-left."); return; }
  H = h; Hinv = homography(COURT_CORNERS, taps); taps = null;
  tracker.reset();
  if(clipUrl) els.gameVideo.play();
  setCue("good", "Court set. Tracking players. Tap Calibrate court again if the camera moves.");
}

// ---- Main loop ---------------------------------------------------------------
function loop(){
  if(!running) return;
  const v = els.gameVideo, c = els.gameCanvas, ctx = c.getContext("2d");
  if(v.readyState >= 2){
    ctx.clearRect(0, 0, c.width, c.height);
    const s = c.width / (c.clientWidth || c.width);   // sizes below are in on-screen CSS px
    if(taps) drawTaps(ctx, s);
    else if(H){
      const t = performance.now() / 1000;
      const res = detector.detectForVideo(v, performance.now());
      const people = res.detections.map(d => person(d.boundingBox)).filter(p => onCourt(p.court));
      const players = tracker.update(people.map(p => p.court), t);
      drawCourt(ctx, s);
      for(const p of players.filter(p => p.visible)) drawRing(ctx, p, s);
      for(const p of players.filter(p => p.visible)){
        const det = nearest(people, p.pos);
        if(det) drawTag(ctx, p, det.head, s);
      }
      if(t - lastPanel > 0.25){ lastPanel = t; renderPanel(players); }
    }
  }
  rafId = requestAnimationFrame(loop);
}
// Feet = bottom-centre of the box (pixels → court metres); head = top-centre.
function person(b){
  const x = b.originX + b.width / 2;
  return { court:project(H, x, b.originY + b.height), head:{ x, y:b.originY } };
}
function nearest(people, pos){
  let best = null, bd = 1.5;
  for(const q of people){ const d = Math.hypot(q.court[0] - pos[0], q.court[1] - pos[1]); if(d < bd){ bd = d; best = q; } }
  return best;
}

// ---- Drawing -----------------------------------------------------------------
function drawTaps(ctx, s){
  ctx.save(); ctx.fillStyle = "#c6ff4f"; ctx.strokeStyle = "#c6ff4f"; ctx.lineWidth = 2 * s;
  ctx.font = `600 ${16 * s}px ui-monospace, monospace`;
  taps.forEach(([x, y], i) => {
    ctx.beginPath(); ctx.arc(x, y, 7 * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillText(String(i + 1), x + 10 * s, y - 10 * s);
    if(i){ ctx.beginPath(); ctx.moveTo(...taps[i - 1]); ctx.lineTo(x, y); ctx.stroke(); }
  });
  ctx.restore();
}
function drawCourt(ctx, s){                       // faint outline + net line confirm the calibration
  ctx.save(); ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 1.5 * s;
  ctx.beginPath();
  COURT_CORNERS.forEach(([x, y], i) => { const [px, py] = project(Hinv, x, y); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
  ctx.closePath(); ctx.stroke();
  ctx.setLineDash([8 * s, 8 * s]); ctx.beginPath();
  ctx.moveTo(...project(Hinv, COURT_W / 2, 0)); ctx.lineTo(...project(Hinv, COURT_W / 2, COURT_H)); ctx.stroke();
  ctx.restore();
}
function ringPath(ctx, [cx, cy], r){
  ctx.beginPath();
  for(let i = 0; i <= 48; i++){
    const a = i / 48 * Math.PI * 2, [x, y] = project(Hinv, cx + r * Math.cos(a), cy + r * Math.sin(a));
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
}
function drawRing(ctx, p, s){
  const col = COLORS[p.slot % COLORS.length];
  ctx.save(); ctx.strokeStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 14 * s;
  ctx.lineWidth = 3.5 * s; ringPath(ctx, p.pos, RING_M); ctx.stroke();
  ctx.globalAlpha = 0.55; ctx.lineWidth = 1.5 * s; ringPath(ctx, p.pos, RING_M * 0.6); ctx.stroke();
  ctx.restore();
}
function drawTag(ctx, p, head, s){
  const col = COLORS[p.slot % COLORS.length], name = nameOf(p), sta = String(Math.round(p.stamina));
  ctx.save();
  const f = 13 * s; ctx.font = `600 ${f}px Inter, system-ui, sans-serif`;
  const w = ctx.measureText(name).width + ctx.measureText(sta).width + 30 * s, h = f + 16 * s;
  const x = head.x - w / 2, y = head.y - h - 18 * s;
  ctx.fillStyle = "rgba(12,13,17,.78)"; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = col; ctx.fillRect(x, y + h - 3 * s, w * p.stamina / 100, 3 * s);   // stamina bar
  ctx.fillStyle = "#fff"; ctx.textBaseline = "middle"; ctx.fillText(name, x + 8 * s, y + h / 2 - 1 * s);
  ctx.fillStyle = col; ctx.textAlign = "right"; ctx.fillText(sta, x + w - 8 * s, y + h / 2 - 1 * s);
  ctx.beginPath(); ctx.moveTo(head.x - 6 * s, y + h); ctx.lineTo(head.x + 6 * s, y + h); ctx.lineTo(head.x, y + h + 8 * s); ctx.fill();
  ctx.restore();
}
function renderPanel(players){
  const sorted = [...players].sort((a, b) => a.slot - b.slot);
  els.gamePlayers.innerHTML = sorted.length ? sorted.map(p => {
    const col = COLORS[p.slot % COLORS.length];
    return `<div class="game-player${p.visible ? "" : " lost"}" style="--pc:${col}">
      <div class="gp-top"><b>${escapeHtml(nameOf(p))}</b><span class="micro">Stamina</span><strong>${Math.round(p.stamina)}</strong></div>
      <div class="gp-bar"><i style="width:${p.stamina}%"></i></div>
      <div class="gp-foot micro"><span>Move</span><span>${p.dist.toFixed(1)} m</span></div></div>`;
  }).join("") : `<div class="empty-state">No players on the court yet.</div>`;
  drawMap(players);
}
const escapeHtml = s => s.replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
function drawMap(players){                        // top-down court; near sideline at the bottom
  const c = els.gameMap, dpr = window.devicePixelRatio || 1, cw = c.clientWidth;
  if(!cw) return;
  const ch = Math.round(cw * (COURT_H + 2) / (COURT_W + 2));
  if(c.width !== Math.round(cw * dpr)){ c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr); c.style.height = ch + "px"; }
  const ctx = c.getContext("2d"), k = c.width / (COURT_W + 2);
  const m = (x, y) => [(x + 1) * k, (COURT_H + 1 - y) * k];
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = dpr;
  ctx.strokeRect(...m(0, COURT_H), COURT_W * k, COURT_H * k);
  ctx.setLineDash([4 * dpr, 4 * dpr]); ctx.beginPath(); ctx.moveTo(...m(COURT_W / 2, 0)); ctx.lineTo(...m(COURT_W / 2, COURT_H)); ctx.stroke(); ctx.setLineDash([]);
  for(const p of players){
    const [x, y] = m(Math.max(0, Math.min(COURT_W, p.pos[0])), Math.max(0, Math.min(COURT_H, p.pos[1])));
    ctx.globalAlpha = p.visible ? 1 : 0.35;
    ctx.fillStyle = COLORS[p.slot % COLORS.length]; ctx.beginPath(); ctx.arc(x, y, 5 * dpr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ---- Mount / unmount ---------------------------------------------------------
function gameHTML(){
  return `
  <div class="page-hero">
    <div><p class="eyebrow"><span class="dot"></span> Computer vision · Beach game</p><h2>Game Tracker</h2>
    <p>Point a <b>fixed camera</b> at the court, or load a clip. Tap the 4 court corners once. Every player then gets a ring, a name tag, distance moved and a stamina estimate. All on-device; nothing leaves your browser.</p></div>
    <span class="route-chip">Live game overlay</span>
  </div>
  <div class="game-layout">
    <div class="panel">
      <div class="stage game-stage" id="gameStage">
        <video id="gameVideo" playsinline muted></video>
        <canvas id="gameCanvas"></canvas>
        <div class="stage-badge" id="gameBadge"><span class="dot"></span><span id="gameBadgeText">Camera off</span></div>
        <div class="stage-empty" id="gameEmpty"><b>Set up the camera</b>Put the phone on a tripod at the sideline, high enough to see the full court. Then start the camera or load a clip.</div>
      </div>
      <div class="form-cue info" id="gameCue" style="margin-top:14px">Start the camera or load a clip to begin.</div>
      <div class="coach-controls">
        <button type="button" class="coach-btn primary" id="startCam">Start camera</button>
        <label class="coach-btn" for="gameFile">Load clip</label>
        <input type="file" id="gameFile" accept="video/*" hidden>
        <button type="button" class="coach-btn" id="calibrate" disabled>Calibrate court</button>
        <button type="button" class="coach-btn" id="resetStats" disabled>Reset stats</button>
        <button type="button" class="coach-btn" id="stopCam" disabled>Stop</button>
      </div>
      <label class="game-names">Player names, in the order they appear
        <input type="text" id="gameNames" placeholder="Ana, Bo, Cy, Dee" autocomplete="off"></label>
    </div>
    <div class="panel">
      <p class="micro">Court map</p>
      <canvas class="game-map" id="gameMap"></canvas>
      <div class="game-players" id="gamePlayers"><div class="empty-state">No players on the court yet.</div></div>
      <p class="coach-note">Stamina starts at 100. It drops with distance and sprint speed, and recovers slowly while a player stands. It is an estimate from movement only, not a medical measure.</p>
    </div>
  </div>`;
}
export function mountGame(container){
  container.innerHTML = gameHTML();
  container.classList.add("page");
  ["gameStage","gameVideo","gameCanvas","gameBadge","gameBadgeText","gameEmpty","gameCue","startCam","gameFile","calibrate","resetStats","stopCam","gameNames","gameMap","gamePlayers"].forEach(id => els[id] = ID(id));
  running = false; H = Hinv = null; taps = null; names = []; tracker.reset();
  els.startCam.addEventListener("click", () => startSource(null));
  els.gameFile.addEventListener("change", () => { const f = els.gameFile.files[0]; els.gameFile.value = ""; if(f) startSource(f); });
  els.calibrate.addEventListener("click", startCalibration);
  els.resetStats.addEventListener("click", () => { tracker.resetStats(); renderPanel(tracker.players); });
  els.stopCam.addEventListener("click", stopSource);
  els.gameCanvas.addEventListener("click", onTap);
  els.gameNames.addEventListener("input", () => { names = els.gameNames.value.split(",").map(n => n.trim()); renderPanel(tracker.players); });
  drawMap([]);
}
export function unmountGame(){ stopSource(); }
