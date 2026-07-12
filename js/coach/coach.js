// ============================================================================
//  Form Coach — computer-vision movement tracking (lazy-loaded module).
//  MediaPipe Tasks-Vision itself is imported on demand (only when the camera
//  starts), so mounting this page is cheap even offline.
//  mountCoach(container, sport) injects the UI and wires it to the sport's
//  exercise lists; unmountCoach() stops the camera when you navigate away.
// ============================================================================

import { initNodeCanvas } from "../nodeCanvas.js";

const MP_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
let FilesetResolver, PoseLandmarker, DrawingUtils;

const L = {shoulder:11, elbow:13, wrist:15, hip:23, knee:25, ankle:27};
const R = {shoulder:12, elbow:14, wrist:16, hip:24, knee:26, ankle:28};

function angle(a, b, c){
  const ab = {x:a.x-b.x, y:a.y-b.y}, cb = {x:c.x-b.x, y:c.y-b.y};
  const dot = ab.x*cb.x + ab.y*cb.y, mag = Math.hypot(ab.x, ab.y) * Math.hypot(cb.x, cb.y);
  if(!mag) return null;
  return Math.acos(Math.max(-1, Math.min(1, dot/mag))) * 180/Math.PI;
}
const visible = (lm, i) => lm[i] && (lm[i].visibility ?? 1) > 0.5;
function jointAngle(lm, j, indices){
  const sides = [];
  for(const S of [L, R]) if(indices.every(k => visible(lm, S[k]))) sides.push(angle(lm[S[indices[0]]], lm[S[indices[1]]], lm[S[indices[2]]]));
  return sides.length ? sides.reduce((s,v)=>s+v,0)/sides.length : null;
}
function metrics(lm){
  const g = i => lm[i] || {x:0, y:0}; const vis = i => visible(lm, i);
  const sL=g(11), sR=g(12), eL=g(13), eR=g(14), wL=g(15), wR=g(16), aL=g(27), aR=g(28), nose=g(0);
  const elbowL = (vis(11)&&vis(13)&&vis(15)) ? angle(sL,eL,wL) : null;
  const elbowR = (vis(12)&&vis(14)&&vis(16)) ? angle(sR,eR,wR) : null;
  const shoulderY = (sL.y + sR.y)/2, shoulderW = Math.abs(sL.x - sR.x) || 0.001;
  const wristGap = Math.hypot(wL.x-wR.x, wL.y-wR.y);
  let cnt=0, sum=0; if(vis(27)){sum+=aL.y;cnt++;} if(vis(28)){sum+=aR.y;cnt++;}
  const ankleY = cnt ? sum/cnt : null;
  return { lm, vis, sL, sR, eL, eR, wL, wR, aL, aR, nose, noseY:nose.y, elbowL, elbowR,
    kneeAngle:jointAngle(lm,"knee",["hip","knee","ankle"]), shoulderY, shoulderW, wristGap, ankleY };
}

// ---- Exercise library ----
const EXERCISES = {
  spike: {
    type:"skill", label:"Spike (attack)", angleName:"Status", measure:lm => null,
    hint:"Approach, jump, and snap your hitting arm to full reach above your head. Keep your whole body in the frame.",
    criteria:[
      {name:"Whole body visible in frame", test:m => m.vis(27)&&m.vis(28)&&m.vis(0)&&(m.vis(15)||m.vis(16))},
      {name:"Jump detected", test:(m,S)=> !!S.lastJump},
      {name:"Contact above the head", test:(m,S)=> !!S.lastHigh},
      {name:"Full arm extension at contact", test:(m,S)=> !!S.lastExt}
    ],
    detect(m, S){
      if(m.ankleY == null) return null;
      if(S.base == null) S.base = m.ankleY;
      if(!S.air) S.base = S.base*0.92 + m.ankleY*0.08;
      const airborne = m.ankleY < S.base - 0.06;
      if(airborne){
        S.air = true;
        if(S.apexY == null || m.ankleY < S.apexY){
          S.apexY = m.ankleY; S.apexWristY = Math.min(m.wL.y, m.wR.y);
          S.apexNoseY = m.noseY; S.apexElbow = (m.wL.y < m.wR.y) ? m.elbowL : m.elbowR;
        }
      } else if(S.air){
        S.air = false; S.lastJump = true;
        S.lastHigh = S.apexWristY != null && S.apexWristY < S.apexNoseY - 0.02;
        S.lastExt  = S.apexElbow != null && S.apexElbow > 150;
        const high = S.lastHigh, ext = S.lastExt;
        S.apexY = S.apexWristY = S.apexElbow = null;
        if(high && ext) return {good:true,  msg:"Strong spike — high contact above your head with a full arm reach!"};
        if(!high)       return {good:false, msg:"Reach higher — make contact above your head, not in front of your chest."};
        return {good:false, msg:"Extend your hitting arm fully at contact — snap to a straight elbow."};
      }
      return null;
    }
  },
  set: {
    type:"skill", label:"Set", angleName:"Elbow angle",
    measure:lm => jointAngle(lm, "elbow", ["shoulder","elbow","wrist"]),
    hint:"Make a window above your forehead, push evenly through both hands, and finish tall with arms extended.",
    criteria:[
      {name:"Hands up at the forehead", test:m => m.wL.y<m.shoulderY && m.wR.y<m.shoulderY},
      {name:"Elbows bent ~90°, up & out", test:m => m.elbowL!=null&&m.elbowR!=null && m.elbowL>55&&m.elbowL<120 && m.elbowR>55&&m.elbowR<120},
      {name:"Hands even (symmetric window)", test:m => Math.abs(m.wL.y-m.wR.y) < 0.07}
    ],
    detect(m, S){
      if(m.elbowL==null || m.elbowR==null) return null;
      const ready = m.wL.y<m.shoulderY && m.wR.y<m.shoulderY && m.elbowL<120 && m.elbowR<120;
      if(ready) S.ready = true;
      const extended = m.elbowL>150 && m.elbowR>150 && m.wL.y<m.noseY && m.wR.y<m.noseY;
      if(S.ready && extended && !S.counted){
        S.counted = true; S.ready = false;
        if(Math.abs(m.wL.y - m.wR.y) > 0.08) return {good:false, msg:"Push evenly — keep both hands level through the set."};
        return {good:true, msg:"Clean set — high hands at the forehead and a full, even extension."};
      }
      if(S.counted && m.elbowL<120) S.counted = false;
      return null;
    }
  },
  receive: {
    type:"skill", label:"Receive (pass)", angleName:"Knee angle",
    measure:lm => jointAngle(lm, "knee", ["hip","knee","ankle"]),
    hint:"Get low, lock your forearms into one platform low and in front, and angle it toward the target.",
    criteria:[
      {name:"Knees bent — athletic base", test:m => m.kneeAngle!=null && m.kneeAngle>=100 && m.kneeAngle<=155},
      {name:"Arms straight — solid platform", test:m => m.elbowL!=null&&m.elbowR!=null && m.elbowL>160 && m.elbowR>160},
      {name:"Hands together, low & in front", test:m => m.wristGap < m.shoulderW*0.7 && m.wL.y>m.shoulderY && m.wR.y>m.shoulderY}
    ],
    detect(m, S){
      const ok = this.criteria.every(c => c.test(m, S));
      if(ok){ S.hold = (S.hold||0) + 1;
        if(S.hold === 10 && !S.counted){ S.counted = true; return {good:true, msg:"Solid platform — knees bent, arms locked. Hold it steady to the target."}; }
      } else { S.hold = 0; S.counted = false; }
      return null;
    }
  },
  squat: {
    type:"rep", label:"Squat", angleName:"Knee angle", startHigh:true, down:100, up:160,
    measure:lm => jointAngle(lm, "knee", ["hip","knee","ankle"]),
    phases:[{name:"Stand tall", test:a=>a>=155},{name:"Descend with control", test:a=>a<155&&a>=110},{name:"Hit depth, then drive up", test:a=>a<110}],
    formCheck(lm, minAngle){
      if(minAngle != null && minAngle > 105) return {type:"warn", msg:"Go a little deeper — aim for thighs near parallel."};
      const torso = jointAngle(lm, "hip", ["shoulder","hip","knee"]);
      if(torso != null && torso < 55) return {type:"warn", msg:"Chest is dropping — keep your torso taller."};
      return {type:"good", msg:"Clean squat — good depth and posture."};
    }
  },
  pushup: {
    type:"rep", label:"Push-up", angleName:"Elbow angle", startHigh:true, down:95, up:155,
    measure:lm => jointAngle(lm, "elbow", ["shoulder","elbow","wrist"]),
    phases:[{name:"Top — arms extended", test:a=>a>=150},{name:"Lower your chest", test:a=>a<150&&a>=100},{name:"Reach bottom, then press", test:a=>a<100}],
    formCheck(lm, minAngle){
      const line = jointAngle(lm, "hip", ["shoulder","hip","ankle"]);
      if(line != null && line < 155) return {type:"warn", msg:"Keep a straight line — don't let hips sag or pike."};
      if(minAngle != null && minAngle > 100) return {type:"warn", msg:"Lower further — get elbows to about 90°."};
      return {type:"good", msg:"Solid push-up — full range and a straight body."};
    }
  },
  lunge: {
    type:"rep", label:"Reverse lunge", angleName:"Front-knee angle", startHigh:true, down:105, up:160,
    measure:lm => jointAngle(lm, "knee", ["hip","knee","ankle"]),
    phases:[{name:"Stand tall", test:a=>a>=155},{name:"Step back and lower", test:a=>a<155&&a>=115},{name:"Front thigh parallel, drive up", test:a=>a<115}],
    formCheck(lm, minAngle){
      if(minAngle != null && minAngle > 110) return {type:"warn", msg:"Sink lower — front thigh toward parallel."};
      return {type:"good", msg:"Nice lunge depth — controlled and balanced."};
    }
  },
  bridge: {
    type:"rep", label:"Glute bridge", angleName:"Hip angle", startHigh:false, down:135, up:162,
    measure:lm => jointAngle(lm, "hip", ["shoulder","hip","knee"]),
    phases:[{name:"Hips down to start", test:a=>a<140},{name:"Drive hips up", test:a=>a>=140&&a<162},{name:"Squeeze glutes at top", test:a=>a>=162}],
    formCheck(lm, maxAngle){
      if(maxAngle != null && maxAngle < 160) return {type:"warn", msg:"Extend further — squeeze hips to full lockout."};
      return {type:"good", msg:"Strong bridge — full hip extension at the top."};
    }
  }
};

// ---- State ----
let poseLandmarker = null, draw = null, stream = null, rafId = null;
let current = "receive", reps = 0, goodAttempts = 0, stage = "rest", extremeAngle = null, lastCue = null, running = false;
let skillState = {}, sessionStart = null, trail = [], facing = "user";
let attemptLog = [], lastAttemptId = null;
let sportCoach = null, sportName = "", mode = "skills";
let sportPrograms = null, workoutSource = "base", currentLabelOverride = null;
const LOG_KEY = "bv_coach_log_v1";
const TRAIL_NEUTRAL = "255,122,47", TRAIL_GOOD = "150,230,80", TRAIL_WARN = "255,170,40";
let trailColor = TRAIL_NEUTRAL, ghost = null;
const HEAT_COLS = 44, HEAT_ROWS = 33;
let heatGrid = new Float32Array(HEAT_COLS * HEAT_ROWS), heatMax = 0, heatOn = false;

const els = {};
const ID = id => document.getElementById(id);
function cache(){ ["coachVideo","coachCanvas","coachStage","stageBadge","stageBadgeText","stageEmpty","startCam","stopCam","expandCam","minimizeCam","flipCam","resetReps","heatToggle","saveSession","modeSkills","modeWorkout","exercisePicker","repCount","repLabel","angleVal","angleLabel","formCue","phaseTrack","fbRight","fbWrong","fbMissed","dsTotal","dsGood","dsWrong","dsMissed","dataNote","addNote","exportCsv","exportJson","copyJson","clearLog"].forEach(id => els[id]=ID(id)); }

// Expand the camera preview to a full-screen overlay so users can watch their
// own tracking, then minimize back to the normal node when they're done.
let onKeyDown = null, stagePlaceholder = null;
function setExpanded(on){
  const stage = els.coachStage || ID("coachStage"); if(!stage) return;
  const isOn = stage.classList.contains("expanded");
  if(on && !isOn){
    // portal the stage to <body> so position:fixed is viewport-relative even
    // if an ancestor (page entrance animation, desktop node canvas) has a transform
    stagePlaceholder = document.createComment("coach-stage");
    stage.parentNode.insertBefore(stagePlaceholder, stage);
    document.body.appendChild(stage);
  } else if(!on && isOn && stagePlaceholder && stagePlaceholder.parentNode){
    stagePlaceholder.parentNode.insertBefore(stage, stagePlaceholder);
    stagePlaceholder.remove(); stagePlaceholder = null;
  }
  stage.classList.toggle("expanded", on);
  document.body.classList.toggle("coach-fs", on);
  if(els.expandCam) els.expandCam.classList.toggle("on", on);
}

function toast(msg){ const t = ID("toast"); if(!t) return; t.textContent = msg; t.classList.add("show"); setTimeout(()=>t.classList.remove("show"), 2100); }
function badge(text, live){ els.stageBadgeText.textContent = text; els.stageBadge.classList.toggle("live", !!live); }
function setCue(type, msg){ if(msg === lastCue) return; lastCue = msg; els.formCue.className = `form-cue ${type}`; els.formCue.textContent = msg; }

// ---- Training-plan ↔ Form-Coach bridge -------------------------------------
// Map a free-text exercise name (from a program or a custom plan) onto one of
// the movement patterns the pose coach can actually grade. Returns a detector
// key (squat/pushup/lunge/bridge) or null when it isn't auto-trackable yet.
function matchDetector(name){
  const n = String(name || "").toLowerCase();
  if(/push[\s-]?up/.test(n)) return "pushup";
  if(/split squat|bulgarian|lunge/.test(n)) return "lunge";
  if(/bridge|hip thrust/.test(n)) return "bridge";
  if(/squat/.test(n)) return "squat";          // back squat, squat jumps, goblet…
  return null;
}
const escHtml = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));
function readCustomPlans(){ try{ const a = JSON.parse(localStorage.getItem("bv_custom_plans")); return Array.isArray(a) ? a : []; }catch(e){ return []; } }
const exLabel = () => currentLabelOverride || (EXERCISES[current] ? EXERCISES[current].label : "");

// Exercises for the selected workout source, de-duplicated and matched.
function workoutItems(){
  let names = [];
  if(workoutSource === "base"){
    return (sportCoach.workout || []).filter(id => EXERCISES[id]).map(id => ({ name: EXERCISES[id].label, detector: id }));
  }
  const sep = workoutSource.indexOf(":"), kind = workoutSource.slice(0, sep), key = workoutSource.slice(sep + 1);
  if(kind === "program"){
    const p = (sportPrograms || []).find(x => x.id === key);
    if(p && p.days) names = p.days.flatMap(d => (d.blocks || []).flatMap(b => b.items.map(i => i.name)));
  } else if(kind === "plan"){
    const p = readCustomPlans()[Number(key)];
    if(p) names = (p.blocks || []).flatMap(b => (b.items || []).map(i => i.name));
  }
  const seen = new Set(), items = [];
  names.forEach(n => { const k = n.toLowerCase(); if(k && !seen.has(k)){ seen.add(k); items.push({ name: n, detector: matchDetector(n) }); } });
  return items;
}
function sourceOptions(){
  let html = `<option value="base">Base movements</option>`;
  (sportPrograms || []).forEach(p => { if(p.days) html += `<option value="program:${p.id}">Program · ${escHtml(p.name)}</option>`; });
  readCustomPlans().forEach((p, i) => { html += `<option value="plan:${i}">My plan · ${escHtml(p.name)}</option>`; });
  return html;
}

function setMode(m){
  mode = m;
  els.modeSkills.classList.toggle("active", m === "skills");
  els.modeWorkout.classList.toggle("active", m === "workout");
  buildPicker();
  if(m === "skills"){
    const ids = (sportCoach.skills || []).filter(id => EXERCISES[id]);
    if(ids.length) selectExercise(ids[0]);
  } else {
    const first = workoutItems().find(it => it.detector);
    if(first) selectExercise(first.detector, first.name);
  }
}
function chip(label, detector, active){
  const b = document.createElement("button");
  b.type = "button"; b.textContent = label; b.dataset.label = label;
  if(detector){
    b.dataset.ex = detector;
    b.className = active ? "active" : "";
    b.addEventListener("click", () => selectExercise(detector, label));
  } else {
    b.disabled = true; b.className = "untracked"; b.title = "Pose tracking for this exercise isn't available yet";
  }
  return b;
}
function buildPicker(){
  els.exercisePicker.innerHTML = "";
  if(mode === "skills"){
    const row = document.createElement("div"); row.className = "picker-row";
    (sportCoach.skills || []).filter(id => EXERCISES[id]).forEach(id =>
      row.appendChild(chip(EXERCISES[id].label, id, id === current)));
    els.exercisePicker.appendChild(row);
    return;
  }
  // Workout mode: choose a source (base movements / a program / a saved plan),
  // then pick any of its exercises to track.
  const sel = document.createElement("select");
  sel.className = "plan-select wk-source"; sel.innerHTML = sourceOptions(); sel.value = workoutSource;
  if(sel.value !== workoutSource){ workoutSource = "base"; sel.value = "base"; }   // plan was deleted
  sel.addEventListener("change", () => {
    workoutSource = sel.value; buildPicker();
    const first = workoutItems().find(it => it.detector);
    if(first) selectExercise(first.detector, first.name);
    else setCue("info", "None of these are auto-trackable yet — the dimmed ones need pose logic. Pick a base movement to track now.");
  });
  els.exercisePicker.appendChild(sel);

  const items = workoutItems();
  const row = document.createElement("div"); row.className = "picker-row";
  items.forEach(it => row.appendChild(chip(it.name, it.detector, current === it.detector && exLabel() === it.name)));
  els.exercisePicker.appendChild(row);

  if(workoutSource !== "base"){
    const trackable = items.filter(it => it.detector).length;
    const note = document.createElement("p"); note.className = "coach-note picker-note";
    note.textContent = trackable
      ? `${trackable} of ${items.length} exercise${items.length === 1 ? "" : "s"} can be tracked now — dimmed ones aren't pose-trackable yet.`
      : "No exercises here are pose-trackable yet — switch to Base movements to track squats, push-ups, lunges or bridges.";
    els.exercisePicker.appendChild(note);
  }
}
function renderSteps(states){
  const ex = EXERCISES[current];
  const items = ex.type === "skill" ? ex.criteria : ex.phases;
  els.phaseTrack.innerHTML = items.map((it,i)=>`<li class="${states[i]?"active":""}"><span class="pip"></span>${it.name}</li>`).join("");
}
function selectExercise(id, labelOverride){
  current = id; currentLabelOverride = labelOverride || null;
  reps = 0; goodAttempts = 0; stage = "rest"; extremeAngle = null; skillState = {};
  trail = []; trailColor = TRAIL_NEUTRAL; ghost = null; heatGrid.fill(0); heatMax = 0;
  const ex = EXERCISES[id], label = exLabel();
  els.exercisePicker.querySelectorAll("button").forEach(b => b.classList.toggle("active", b.dataset.ex === id && b.dataset.label === label));
  els.repCount.textContent = "0";
  els.repLabel.textContent = ex.type === "skill" ? "Attempts" : "Reps";
  els.angleLabel.textContent = ex.angleName;
  els.angleVal.textContent = "—";
  renderSteps((ex.type === "skill" ? ex.criteria : ex.phases).map(()=>false));
  const intro = ex.type === "skill" ? ex.hint : `Tracking ${label.toLowerCase()} — get into your start position.`;
  setCue("info", running ? intro : `Selected ${label}. Start the camera to begin.`);
}

async function ensureModel(){
  if(poseLandmarker) return;
  badge("Loading model…", false);
  if(!PoseLandmarker) ({ FilesetResolver, PoseLandmarker, DrawingUtils } = await import(MP_URL));
  const vision = await FilesetResolver.forVisionTasks(MP_URL + "/wasm");
  poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions:{ modelAssetPath:"https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task", delegate:"GPU" },
    runningMode:"VIDEO", numPoses:1
  });
}
async function startCamera(){
  try{
    els.startCam.disabled = true;
    await ensureModel();
    badge("Requesting camera…", false);
    stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:facing, width:{ideal:1280}, height:{ideal:960} }, audio:false });
    els.coachVideo.srcObject = stream;
    await els.coachVideo.play();
    els.coachCanvas.width = els.coachVideo.videoWidth; els.coachCanvas.height = els.coachVideo.videoHeight;
    applyMirror();
    draw = new DrawingUtils(els.coachCanvas.getContext("2d"));
    els.stageEmpty.style.display = "none";
    els.stopCam.disabled = false; els.flipCam.disabled = false; els.resetReps.disabled = false; els.saveSession.disabled = false; els.heatToggle.disabled = false; els.expandCam.disabled = false;
    running = true; sessionStart = Date.now();
    badge("Live", true); selectExercise(current); loop();
  }catch(err){
    console.error("Camera/model error", err);
    setCue("warn", err && err.name === "NotAllowedError"
      ? "Camera permission denied. Enable it for this site and try again."
      : "Couldn't start the camera or load the model. Check your connection and camera, then retry.");
    badge("Camera off", false); els.startCam.disabled = false;
  }
}
function stopCamera(){
  running = false; trail = []; ghost = null; heatGrid.fill(0); heatMax = 0; trailColor = TRAIL_NEUTRAL;
  if(rafId) cancelAnimationFrame(rafId);
  if(stream){ stream.getTracks().forEach(t=>t.stop()); stream = null; }
  if(els.coachVideo){
    els.coachVideo.srcObject = null;
    const ctx = els.coachCanvas.getContext("2d"); ctx.clearRect(0,0,els.coachCanvas.width, els.coachCanvas.height);
    els.stageEmpty.style.display = "";
    els.startCam.disabled = false; els.stopCam.disabled = true; els.flipCam.disabled = true; els.expandCam.disabled = true;
    setExpanded(false);
    badge("Camera off", false);
  }
}
function applyMirror(){ const t = facing === "user" ? "scaleX(-1)" : "none"; els.coachVideo.style.transform = t; els.coachCanvas.style.transform = t; }
async function flipCamera(){
  facing = facing === "user" ? "environment" : "user";
  if(!running){ toast(facing === "user" ? "Front camera (start to use)" : "Rear camera (start to use)"); return; }
  try{
    if(stream) stream.getTracks().forEach(t => t.stop());
    stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:facing, width:{ideal:1280}, height:{ideal:960} }, audio:false });
    els.coachVideo.srcObject = stream; await els.coachVideo.play();
    els.coachCanvas.width = els.coachVideo.videoWidth; els.coachCanvas.height = els.coachVideo.videoHeight;
    applyMirror(); trail = [];
    toast(facing === "user" ? "Front camera" : "Rear camera");
  }catch(e){ console.error(e); toast("Couldn't switch camera"); }
}
function loop(){
  if(!running) return;
  const v = els.coachVideo;
  if(v.readyState >= 2){
    const res = poseLandmarker.detectForVideo(v, performance.now());
    const ctx = els.coachCanvas.getContext("2d");
    ctx.clearRect(0,0,els.coachCanvas.width, els.coachCanvas.height);
    if(res.landmarks && res.landmarks.length){
      const lm = res.landmarks[0];
      updateTrail(lm); drawHeatmap(ctx); drawGhost(ctx); drawTrail(ctx);
      draw.drawConnectors(lm, PoseLandmarker.POSE_CONNECTIONS, {color:"rgba(255,92,0,.9)", lineWidth:3});
      draw.drawLandmarks(lm, {color:"#f5f5f0", lineWidth:1, radius:4});
      processPose(lm);
    } else setCue("info", "Step back so your whole body is in the frame.");
  }
  rafId = requestAnimationFrame(loop);
}
let currentLm = {};
function processPose(lm){
  currentLm = lm;
  const ex = EXERCISES[current];
  if(ex.type === "skill"){ processSkill(lm, ex); return; }
  const a = ex.measure(lm);
  if(a == null){ setCue("info", "Can't see the key joints clearly — adjust your position or lighting."); return; }
  els.angleVal.textContent = Math.round(a) + "°";
  let phaseIdx = ex.phases.findIndex(p => p.test(a));
  renderSteps(ex.phases.map((_,i)=> i===phaseIdx));
  if(ex.startHigh){
    if(a < ex.down){ if(stage !== "effort"){ stage = "effort"; extremeAngle = a; } extremeAngle = Math.min(extremeAngle, a); }
    else if(a > ex.up && stage === "effort"){ stage = "rest"; countRep(ex, extremeAngle); }
  } else {
    if(a > ex.up){ if(stage !== "effort"){ stage = "effort"; extremeAngle = a; } extremeAngle = Math.max(extremeAngle, a); }
    else if(a < ex.down && stage === "effort"){ stage = "rest"; countRep(ex, extremeAngle); }
  }
  if(stage === "effort" && phaseIdx === ex.phases.length-1) setCue("good", "Good range — now reverse the movement.");
  else if(stage === "rest" && reps === 0) setCue("info", `Get into position and do your first ${ex.label.toLowerCase()}.`);
}
function countRep(ex, extreme){
  reps++; els.repCount.textContent = reps;
  const v = ex.formCheck(currentLm, extreme);
  onAttempt(v.type === "good");
  setCue(v.type, `Rep ${reps}: ${v.msg}`);
  logAttempt({ exercise:current, label:exLabel(), kind:"rep", reps, good:v.type==="good", msg:v.msg, metrics:{ extreme:rnd(extreme), measure:rnd(ex.measure(currentLm)) } });
  if(navigator.vibrate) navigator.vibrate(30);
}
function processSkill(lm, ex){
  const m = metrics(lm);
  const a = ex.measure(lm);
  els.angleVal.textContent = (a == null) ? "—" : Math.round(a) + "°";
  const results = ex.criteria.map(c => !!c.test(m, skillState));
  renderSteps(results);
  const verdict = ex.detect(m, skillState);
  if(verdict){
    reps++; els.repCount.textContent = reps;
    if(verdict.good) goodAttempts++;
    onAttempt(verdict.good);
    setCue(verdict.good ? "good" : "warn", `${exLabel()} ${reps}: ${verdict.msg}`);
    logAttempt({ exercise:current, label:exLabel(), kind:"skill", reps, good:verdict.good, msg:verdict.msg, metrics:snap(m) });
    if(navigator.vibrate) navigator.vibrate(verdict.good ? 30 : [15,40,15]);
  } else if(reps === 0){
    const allMet = results.every(Boolean);
    setCue(allMet ? "good" : "info", allMet ? "Looking good — hold it." : ex.hint);
  }
}
function trailPoint(lm){
  const g = i => lm[i]; const mid = (a,b) => ({x:(g(a).x+g(b).x)/2, y:(g(a).y+g(b).y)/2});
  switch(current){
    case "spike":   return (visible(lm,15)||visible(lm,16)) ? (g(15).y<g(16).y?g(15):g(16)) : null;
    case "set":
    case "receive": return (visible(lm,15)&&visible(lm,16)) ? mid(15,16) : null;
    case "pushup":  return (visible(lm,11)&&visible(lm,12)) ? mid(11,12) : null;
    default:        return (visible(lm,23)&&visible(lm,24)) ? mid(23,24) : null;
  }
}
function updateTrail(lm){
  const tp = trailPoint(lm);
  if(!tp){ if(trail.length) trail.shift(); return; }
  const W = els.coachCanvas.width, H = els.coachCanvas.height;
  trail.push({x:tp.x*W, y:tp.y*H}); if(trail.length > 36) trail.shift();
  const gx = Math.max(0, Math.min(HEAT_COLS-1, (tp.x*HEAT_COLS)|0)), gy = Math.max(0, Math.min(HEAT_ROWS-1, (tp.y*HEAT_ROWS)|0));
  const v = heatGrid[gy*HEAT_COLS+gx] + 1; heatGrid[gy*HEAT_COLS+gx] = v; if(v > heatMax) heatMax = v;
}
function onAttempt(good){ trailColor = good ? TRAIL_GOOD : TRAIL_WARN; if(good && trail.length > 3) ghost = trail.map(p => ({x:p.x, y:p.y})); }
function drawHeatmap(ctx){
  if(!heatOn || heatMax < 2) return;
  const W = els.coachCanvas.width, H = els.coachCanvas.height, cw = W/HEAT_COLS, ch = H/HEAT_ROWS;
  ctx.save();
  for(let gy=0; gy<HEAT_ROWS; gy++) for(let gx=0; gx<HEAT_COLS; gx++){
    const d = heatGrid[gy*HEAT_COLS+gx]; if(!d) continue;
    const t = Math.min(1, d/heatMax);
    ctx.fillStyle = `rgba(${Math.round(40+215*t)},${Math.round(20+120*t*t)},${Math.round(90-60*t)},${0.10+0.4*t})`;
    ctx.fillRect(gx*cw, gy*ch, cw+1, ch+1);
  }
  ctx.restore();
}
function drawGhost(ctx){
  if(!ghost || ghost.length < 2) return;
  ctx.save(); ctx.setLineDash([6,6]); ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255,255,255,.45)"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(ghost[0].x, ghost[0].y);
  for(let i=1;i<ghost.length;i++) ctx.lineTo(ghost[i].x, ghost[i].y);
  ctx.stroke(); ctx.restore();
}
function drawTrail(ctx){
  if(trail.length < 2) return;
  ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
  for(let i=1;i<trail.length;i++){
    const a = trail[i-1], b = trail[i], t = i/trail.length;
    ctx.strokeStyle = `rgba(${trailColor},${0.12 + 0.7*t})`; ctx.lineWidth = 5 + 18*t;
    ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
  }
  const head = trail[trail.length-1];
  ctx.shadowColor = `rgba(${trailColor},.95)`; ctx.shadowBlur = 22; ctx.fillStyle = `rgba(${trailColor},.95)`;
  ctx.beginPath(); ctx.arc(head.x, head.y, 12, 0, Math.PI*2); ctx.fill();
  ctx.shadowBlur = 0; ctx.strokeStyle = "rgba(13,13,13,.55)"; ctx.lineWidth = 2.5; ctx.stroke();
  if(current === "spike"){
    let peak = trail[0]; for(const p of trail) if(p.y < peak.y) peak = p;
    ctx.strokeStyle = "rgba(255,92,0,.95)"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(peak.x, peak.y, 20, 0, Math.PI*2); ctx.stroke();
  }
  ctx.restore();
}
function saveSession(){
  if(!reps){ toast("No reps to save yet"); return; }
  const key = "bv_training_hub_v1"; let state;
  try{ state = JSON.parse(localStorage.getItem(key)) || {}; }catch(e){ state = {}; }
  if(typeof state !== "object" || !state) state = {};
  if(!Array.isArray(state.coachSessions)) state.coachSessions = [];
  const ex = EXERCISES[current], isSkill = ex.type === "skill", label = exLabel();
  state.coachSessions.push({ date:new Date().toISOString().slice(0,10), sport:sportName, exercise:label, kind:ex.type, reps,
    goodReps: isSkill ? goodAttempts : null, durationSec: sessionStart ? Math.round((Date.now()-sessionStart)/1000) : null, savedAt:new Date().toISOString() });
  const summary = isSkill ? `${goodAttempts}/${reps} clean ${label.toLowerCase()}s` : `${reps} ${label.toLowerCase()} reps`;
  try{ localStorage.setItem(key, JSON.stringify(state)); toast(`Saved ${summary}`); }catch(e){ toast("Save failed — storage may be full"); }
}

// ---- Data collection ----
const rnd = v => v == null ? null : Math.round(v);
const r3  = v => v == null ? null : +(+v).toFixed(3);
function snap(m){ return m ? { kneeAngle:rnd(m.kneeAngle), elbowL:rnd(m.elbowL), elbowR:rnd(m.elbowR), shoulderY:r3(m.shoulderY), wristGap:r3(m.wristGap), ankleY:r3(m.ankleY) } : {}; }
function loadLog(){ try{ attemptLog = JSON.parse(localStorage.getItem(LOG_KEY)) || []; }catch(e){ attemptLog = []; } if(!Array.isArray(attemptLog)) attemptLog = []; }
function persistLog(){ try{ localStorage.setItem(LOG_KEY, JSON.stringify(attemptLog)); }catch(e){ toast("Log storage is full"); } }
function renderDataStats(){
  if(!els.dsTotal) return;
  const real = attemptLog.filter(a => a.kind !== "missed" && a.kind !== "note");
  els.dsTotal.textContent = real.length;
  els.dsGood.textContent = real.filter(a => a.good === true).length;
  els.dsWrong.textContent = attemptLog.filter(a => a.userLabel === "wrong").length;
  els.dsMissed.textContent = attemptLog.filter(a => a.kind === "missed").length;
}
function logAttempt(rec){
  rec.id = Date.now() + "-" + Math.random().toString(36).slice(2,7);
  rec.ts = new Date().toISOString(); rec.userLabel = rec.userLabel || null; rec.note = rec.note || "";
  rec.facing = facing; rec.sport = sportName; rec.mode = mode;
  attemptLog.push(rec); lastAttemptId = rec.id;
  els.fbRight.classList.remove("on"); els.fbWrong.classList.remove("on");
  persistLog(); renderDataStats();
}
function labelLast(label){
  const rec = attemptLog.find(a => a.id === lastAttemptId);
  if(!rec){ toast("No attempt logged yet"); return; }
  rec.userLabel = label; persistLog(); renderDataStats();
  els.fbRight.classList.toggle("on", label === "correct"); els.fbWrong.classList.toggle("on", label === "wrong");
  toast(label === "correct" ? "Marked the call correct" : "Marked the call wrong");
}
function addSessionNote(){
  const t = els.dataNote.value.trim(); if(!t){ toast("Type a note first"); return; }
  const rec = attemptLog.find(a => a.id === lastAttemptId);
  if(rec) rec.note = rec.note ? rec.note + " | " + t : t;
  else logAttempt({ exercise:current, label:(EXERCISES[current]||{}).label || "—", kind:"note", good:null, msg:"", note:t, metrics:{} });
  persistLog(); els.dataNote.value = ""; toast("Note saved");
}
function downloadBlob(data, filename, type){
  const url = URL.createObjectURL(new Blob([data], {type}));
  const a = document.createElement("a"); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
function exportCsv(){
  if(!attemptLog.length){ toast("No data yet"); return; }
  const cols = ["ts","sport","mode","exercise","kind","reps","good","userLabel","note","msg","facing","kneeAngle","elbowL","elbowR","shoulderY","wristGap","ankleY","extreme","measure"];
  const esc = v => { if(v == null) return ""; const s = String(v).replace(/"/g,'""'); return /[",\n]/.test(s) ? `"${s}"` : s; };
  const rows = [cols.join(",")];
  for(const a of attemptLog){ const m = a.metrics || {}; rows.push(cols.map(c => c in a ? esc(a[c]) : (c in m ? esc(m[c]) : "")).join(",")); }
  downloadBlob(rows.join("\n"), `form-coach-data-${new Date().toISOString().slice(0,10)}.csv`, "text/csv"); toast("CSV exported");
}
function exportJson(){
  if(!attemptLog.length){ toast("No data yet"); return; }
  downloadBlob(JSON.stringify(attemptLog, null, 2), `form-coach-data-${new Date().toISOString().slice(0,10)}.json`, "application/json"); toast("JSON exported");
}
async function copyJson(){
  if(!attemptLog.length){ toast("No data yet"); return; }
  try{ await navigator.clipboard.writeText(JSON.stringify(attemptLog, null, 2)); toast("JSON copied to clipboard"); }catch(e){ toast("Copy failed — use Export JSON"); }
}
function clearLog(){
  if(!attemptLog.length){ toast("Log already empty"); return; }
  if(!confirm(`Delete all ${attemptLog.length} logged data points?`)) return;
  attemptLog = []; lastAttemptId = null; persistLog(); renderDataStats(); toast("Log cleared");
}

// ---- Mount / unmount ----
function coachHTML(sport){
  return `
  <div class="page-hero">
    <div><p class="eyebrow"><span class="dot"></span> Computer vision · ${sport.name}</p><h2>Form Coach</h2>
    <p>A live movement pipeline: your <b>camera</b> feeds pose tracking, which grades each <b>${sport.name.toLowerCase()} skill</b> or <b>workout</b> rep against its checkpoints. All on-device; nothing leaves your browser.</p></div>
    <span class="route-chip">Live movement tracking</span>
  </div>
  <div class="wf-bar">
    <div class="wf-tabs"><span class="on">Coach</span><span>Skills</span><span>Data</span></div>
    <div class="wf-title">movement pipeline · ${sport.name.toLowerCase()}</div>
  </div>
  <div class="node-canvas" id="nodeCanvas">
    <svg class="wires" id="wires"></svg>
    <div class="node" id="nodeMove" data-x="10" data-y="44" data-w="270">
      <div class="node-head"><span class="pd g"></span> Movement <span class="node-tag">input</span></div>
      <div class="mode-toggle">
        <button type="button" id="modeSkills" class="active">🏐 ${sport.name} skills</button>
        <button type="button" id="modeWorkout">🏋️ Workout</button>
      </div>
      <div class="exercise-picker" id="exercisePicker"></div>
    </div>
    <div class="node" id="nodePreview" data-x="632" data-y="14" data-w="440">
      <div class="node-head"><span class="pd y"></span> Preview <span class="node-tag">camera → pose</span></div>
      <div class="stage" id="coachStage">
        <video id="coachVideo" playsinline muted></video>
        <canvas id="coachCanvas"></canvas>
        <div class="stage-badge" id="stageBadge"><span class="dot"></span><span id="stageBadgeText">Camera off</span></div>
        <button type="button" class="stage-expand-exit" id="minimizeCam" aria-label="Exit full screen">⤡ Minimize</button>
        <div class="stage-empty" id="stageEmpty"><b>Step into frame</b>Pick a movement, then start the camera. Stand 2–3 m back so your whole body is visible and the area is well lit.</div>
      </div>
      <div class="coach-controls">
        <button type="button" class="coach-btn primary" id="startCam">Start camera</button>
        <button type="button" class="coach-btn" id="stopCam" disabled>Stop</button>
        <button type="button" class="coach-btn" id="expandCam" disabled>⤢ Full screen</button>
        <button type="button" class="coach-btn" id="flipCam" disabled>Flip cam</button>
        <button type="button" class="coach-btn" id="resetReps" disabled>Reset reps</button>
        <button type="button" class="coach-btn" id="heatToggle" disabled>Heatmap</button>
        <button type="button" class="coach-btn accent" id="saveSession" disabled>Save session</button>
      </div>
      <p class="coach-note">Tip: skills like spike/set read best from the side or front-on; prop your phone and use <b>Flip cam</b> for a full-body rear view.</p>
    </div>
    <div class="node" id="nodeCoach" data-x="300" data-y="14" data-w="310">
      <div class="node-head"><span class="pd b"></span> Coach <span class="node-tag">grading</span></div>
      <div class="rep-readout">
        <div class="rep-card"><b id="repCount">0</b><span id="repLabel">Attempts</span></div>
        <div class="rep-card angle"><b id="angleVal">—</b><span id="angleLabel">Joint angle</span></div>
      </div>
      <div class="form-cue info" id="formCue">Pick a movement and start the camera to begin.</div>
      <ul class="phase-track" id="phaseTrack"></ul>
    </div>
    <div class="node" id="nodeData" data-x="300" data-y="398" data-w="310">
      <div class="node-head"><span class="pd p"></span> Data <span class="node-tag">tuning</span></div>
      <div class="feedback-row">
        <button type="button" class="pick-good" id="fbRight"><b>✓</b>Right call</button>
        <button type="button" class="pick-bad" id="fbWrong"><b>✗</b>Wrong call</button>
        <button type="button" id="fbMissed"><b>＋</b>Missed rep</button>
      </div>
      <details class="data-panel" id="dataPanel">
        <summary>Session data — for tuning the algorithm</summary>
        <div class="data-stats">
          <div>Attempts<b id="dsTotal">0</b></div><div>Good<b id="dsGood">0</b></div>
          <div>Wrong<b id="dsWrong">0</b></div><div>Missed<b id="dsMissed">0</b></div>
        </div>
        <textarea class="data-note" id="dataNote" placeholder="Note an issue or idea — attaches to your last attempt…"></textarea>
        <div class="data-actions">
          <button type="button" id="addNote">Attach note</button>
          <button type="button" id="exportCsv">Export CSV</button>
          <button type="button" id="exportJson">Export JSON</button>
          <button type="button" id="copyJson">Copy JSON</button>
          <button type="button" id="clearLog">Clear log</button>
        </div>
      </details>
    </div>
  </div>
  <p class="coach-note canvas-hint">Drag any node by its header to rearrange the canvas · wires follow.</p>`;
}

const WIRES = [["nodeMove","nodeCoach","#ff5c00"], ["nodeCoach","nodePreview","#ff7a2f"], ["nodeCoach","nodeData","#666666"]];
let canvasCtl = null;

export function mountCoach(container, sport){
  container.innerHTML = coachHTML(sport);
  container.classList.add("page");
  sportCoach = sport.coach; sportName = sport.name; sportPrograms = sport.programs || [];
  cache();
  running = false; mode = "skills"; facing = "user"; workoutSource = "base"; currentLabelOverride = null;
  current = sportCoach.defaultExercise || sportCoach.skills[0];
  buildPicker(); selectExercise(current);
  loadLog(); renderDataStats();
  els.startCam.addEventListener("click", startCamera);
  els.stopCam.addEventListener("click", stopCamera);
  els.expandCam.addEventListener("click", () => setExpanded(!els.coachStage.classList.contains("expanded")));
  els.minimizeCam.addEventListener("click", () => setExpanded(false));
  onKeyDown = e => { if(e.key === "Escape") setExpanded(false); };
  document.addEventListener("keydown", onKeyDown);
  els.flipCam.addEventListener("click", flipCamera);
  els.modeSkills.addEventListener("click", ()=> setMode("skills"));
  els.modeWorkout.addEventListener("click", ()=> setMode("workout"));
  els.resetReps.addEventListener("click", ()=>{ reps=0; goodAttempts=0; stage="rest"; extremeAngle=null; skillState={}; trail=[]; ghost=null; heatGrid.fill(0); heatMax=0; trailColor=TRAIL_NEUTRAL; els.repCount.textContent="0"; setCue("info","Count reset — go again."); });
  els.heatToggle.addEventListener("click", ()=>{ heatOn = !heatOn; els.heatToggle.classList.toggle("accent", heatOn); els.heatToggle.textContent = heatOn ? "Heatmap: on" : "Heatmap"; });
  els.saveSession.addEventListener("click", saveSession);
  els.fbRight.addEventListener("click", ()=> labelLast("correct"));
  els.fbWrong.addEventListener("click", ()=> labelLast("wrong"));
  els.fbMissed.addEventListener("click", ()=>{ logAttempt({ exercise:current, label:(EXERCISES[current]||{}).label||"—", kind:"missed", good:null, msg:"user: rep not counted", userLabel:"missed", metrics:{} }); toast("Logged a missed rep"); });
  els.addNote.addEventListener("click", addSessionNote);
  els.exportCsv.addEventListener("click", exportCsv);
  els.exportJson.addEventListener("click", exportJson);
  els.copyJson.addEventListener("click", copyJson);
  els.clearLog.addEventListener("click", clearLog);
  // node canvas: absolute positioning, wires and dragging on desktop
  els.dataPanel = ID("dataPanel");
  canvasCtl = initNodeCanvas(ID("nodeCanvas"), { wires: WIRES });
  if(els.dataPanel) els.dataPanel.addEventListener("toggle", () => canvasCtl && canvasCtl.redraw());
}
export function unmountCoach(){
  setExpanded(false);
  if(onKeyDown){ document.removeEventListener("keydown", onKeyDown); onKeyDown = null; }
  stopCamera();
  if(canvasCtl){ canvasCtl.destroy(); canvasCtl = null; }
}
