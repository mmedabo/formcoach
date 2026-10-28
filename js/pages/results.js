// ============================================================================
//  Results — a dedicated screen that takes a clip (uploaded OR recorded from the
//  camera), grades it with the shared Form-Coach criteria, and shows the
//  correction in a cinematic format: score, kinetic headline, glowing muscle
//  map, form checkpoints, corrections and a per-rep timeline, beside the clip.
//  Only the correction OUTPUT is restyled; input/page chrome keep the app look.
// ============================================================================

import { EXERCISES, takeRecordedClip } from "../coach/coach.js";
import { analyzeVideoFile } from "../coach/analyze.js";
import { getDemoProvider, describeFocus, drawPose, FOCUS } from "../coach/demo.js";

// Which muscles each movement works (presentation only — lives with the output).
export const MUSCLES = {
  spike:   ["shoulders","core","lats","forearms"],
  set:     ["shoulders","triceps","forearms","core"],
  receive: ["quads","glutes","core","forearms"],
  squat:   ["quads","glutes","core","hamstrings"],
  pushup:  ["chest","triceps","shoulders","core"],
  lunge:   ["quads","glutes","hamstrings","core"],
  bridge:  ["glutes","hamstrings","core"],
};
// Per-movement filming tip — how to frame the clip so it grades well.
const FILMING_TIPS = {
  spike:   "Film from the side, whole body in frame. Capture the approach, jump and arm swing.",
  set:     "Film front-on at chest height. Keep both hands and elbows visible above the forehead.",
  receive: "Film from the side or front-on. Get low with your whole body in frame — feet to hands.",
  squat:   "Film from the side, 2–3 m back. Keep feet, hips and head in frame through the full rep.",
  pushup:  "Film from the side at floor level. Show shoulders, hips and ankles in one straight line.",
  lunge:   "Film from the side. Keep the front leg, hips and torso fully in frame.",
  bridge:  "Film from the side at floor level. Show shoulders, hips and knees.",
};
const MUSCLE_NAME = { shoulders:"Shoulders", chest:"Chest", triceps:"Triceps", biceps:"Biceps",
  forearms:"Forearms", lats:"Lats", core:"Core", glutes:"Glutes", quads:"Quads", hamstrings:"Hamstrings" };
// Muscle -> visual zone on the silhouette (several muscles can share one zone).
const MUSCLE_ZONE = { shoulders:"shoulders", chest:"chest", triceps:"arms", biceps:"arms",
  forearms:"forearms", lats:"lats", core:"core", glutes:"glutes", quads:"thigh", hamstrings:"thigh" };

const ZONE_SHAPES = {
  shoulders:['<ellipse cx="40" cy="56" rx="16" ry="11"/>','<ellipse cx="100" cy="56" rx="16" ry="11"/>'],
  chest:    ['<ellipse cx="57" cy="80" rx="14" ry="11"/>','<ellipse cx="83" cy="80" rx="14" ry="11"/>'],
  arms:     ['<rect x="18" y="62" width="13" height="40" rx="6"/>','<rect x="109" y="62" width="13" height="40" rx="6"/>'],
  forearms: ['<rect x="14" y="104" width="12" height="44" rx="6"/>','<rect x="114" y="104" width="12" height="44" rx="6"/>'],
  lats:     ['<ellipse cx="49" cy="104" rx="9" ry="22"/>','<ellipse cx="91" cy="104" rx="9" ry="22"/>'],
  core:     ['<rect x="58" y="94" width="24" height="52" rx="10"/>'],
  glutes:   ['<rect x="48" y="150" width="44" height="22" rx="12"/>'],
  thigh:    ['<rect x="50" y="176" width="17" height="66" rx="9"/>','<rect x="73" y="176" width="17" height="66" rx="9"/>'],
};
const ZONE_ORDER = ["shoulders","chest","arms","forearms","lats","core","glutes","thigh"];

function muscleSvg(exerciseId){
  const targetZones = new Set((MUSCLES[exerciseId] || []).map(m => MUSCLE_ZONE[m]));
  const zones = ZONE_ORDER.map(z =>
    `<g class="mz ${targetZones.has(z) ? "on" : ""}">${ZONE_SHAPES[z].join("")}</g>`).join("");
  // static outline bits (head + lower legs) for a readable body, never glow
  const outline = `<g class="mz base">
    <circle cx="70" cy="24" r="14"/>
    <rect x="52" y="246" width="13" height="54" rx="6"/><rect x="75" y="246" width="13" height="54" rx="6"/>
  </g>`;
  return `<svg class="muscle-figure" viewBox="0 0 140 320" aria-hidden="true">${outline}${zones}</svg>`;
}

function headline(r){
  if(!r.reps) return "NO REPS DETECTED";
  if(r.score === 100) return "PERFECT FORM";
  if(r.score >= 70)   return "DIALED IN";
  if(r.score >= 40)   return "ALMOST THERE";
  return "FIX YOUR FORM";
}
function scoreRing(score){
  const pct = score == null ? 0 : score, C = 2 * Math.PI * 52;
  const off = C * (1 - pct / 100);
  const col = score == null ? "var(--muted)" : score >= 70 ? "var(--good)" : score >= 40 ? "var(--warn)" : "#ff5a5a";
  return `<svg class="score-ring" viewBox="0 0 120 120">
    <circle class="sr-track" cx="60" cy="60" r="52"/>
    <circle class="sr-val" cx="60" cy="60" r="52" style="stroke:${col};stroke-dasharray:${C.toFixed(1)};stroke-dashoffset:${off.toFixed(1)}"/>
    <text x="60" y="58" class="sr-num">${score == null ? "—" : score}</text>
    <text x="60" y="78" class="sr-unit">${score == null ? "no score" : "FORM SCORE"}</text>
  </svg>`;
}

export function cineOutput(r){
  const muscleChips = (MUSCLES[r.exerciseId] || [])
    .map(m => `<span class="m-chip">${MUSCLE_NAME[m] || m}</span>`).join("");
  const checks = r.checkpoints
    .map(c => `<li class="${c.met ? "met" : "miss"}"><span class="ck">${c.met ? "✓" : "○"}</span>${c.name}</li>`).join("");
  const corrections = r.corrections.length
    ? r.corrections.map(c => `<li><span class="c-n">${c.count}×</span>${c.msg}</li>`).join("")
    : `<li class="none">No form faults flagged — clean work.</li>`;
  const strengths = r.strengths.length
    ? `<div class="cine-card strengths"><h4>What you nailed</h4><ul>${
        r.strengths.map(s => `<li><span class="c-n">${s.count}×</span>${s.msg}</li>`).join("")}</ul></div>`
    : "";
  const timeline = r.verdicts.length
    ? `<div class="cine-card"><h4>Rep timeline</h4><div class="rep-dots">${
        r.verdicts.map(v => `<span class="rd ${v.good ? "g" : "w"}" title="Rep ${v.rep}: ${v.msg.replace(/"/g,"&quot;")}">${v.rep}</span>`).join("")}</div></div>`
    : "";
  const topFix = r.corrections.length ? r.corrections[0].msg
    : r.reps ? "Keep it up — repeat and bank the reps." : (r.hint || "Frame your whole body and try again.");
  const coverageWarn = r.reps === 0 && r.poseCoverage < 0.4
    ? `<p class="cine-warn">Heads up: your body was only in frame ${Math.round(r.poseCoverage*100)}% of the clip. Stand back so you're fully visible.</p>`
    : "";

  return `
  <div class="cine" aria-live="polite">
    <div class="cine-head">
      <span class="cine-ex">${r.label}</span>
      <span class="cine-kind">${r.kind === "skill" ? "Skill" : "Workout"} · ${r.durationSec}s clip</span>
    </div>
    <div class="cine-hero">
      ${scoreRing(r.score)}
      <div class="cine-hl">
        <div class="kinetic">${headline(r)}</div>
        <p class="cine-count">${r.reps ? `${r.good}/${r.reps} clean ${r.kind === "skill" ? "attempts" : "reps"}` : "Nothing to grade yet"}</p>
        <p class="cine-fix"><span>Top fix</span>${topFix}</p>
      </div>
    </div>
    ${coverageWarn}
    <div class="cine-grid">
      <div class="cine-card muscles">
        <h4>Muscles worked</h4>
        ${muscleSvg(r.exerciseId)}
        <div class="m-chips">${muscleChips}</div>
      </div>
      <div class="cine-stack">
        <div class="cine-card"><h4>Form checkpoints</h4><ul class="check-list">${checks}</ul></div>
        <div class="cine-card corrections"><h4>Corrections</h4><ul>${corrections}</ul></div>
      </div>
    </div>
    ${strengths}
    ${timeline}
  </div>`;
}

// ---- Side-by-side "mistake vs correct form" player -------------------------
export function playerHTML(r){
  if(!r.faults.length){
    return `<div class="cine-player no-faults">
      <div class="cp-stage">
        <div class="cp-pane"><div class="cp-tag">Your form</div>
          <div class="cp-video"><video id="playClip" playsinline muted loop></video><canvas id="clipCanvas"></canvas></div></div>
        <div class="cp-pane"><div class="cp-tag good">Verdict</div>
          <div class="cp-video demo clean"><div class="cp-clean">✓<span>Clean form — no corrections needed. Your reps match the model.</span></div></div></div>
      </div>
    </div>`;
  }
  return `<div class="cine-player">
    <div class="cp-stage">
      <div class="cp-pane">
        <div class="cp-tag">Your form <span class="cp-sub">what happened</span></div>
        <div class="cp-video"><video id="playClip" playsinline muted loop></video><canvas id="clipCanvas"></canvas>
          <div class="cp-flag" id="clipFlag">MISTAKE</div></div>
      </div>
      <div class="cp-pane">
        <div class="cp-tag good">Correct form <span class="cp-sub">the fix</span></div>
        <div class="cp-video demo"><canvas id="demoCanvas"></canvas></div>
      </div>
    </div>
    <div class="cp-fault" id="faultCard"></div>
    <div class="cp-timeline" id="timeline" aria-label="Fault timeline"></div>
    <div class="cp-controls">
      <button type="button" class="coach-btn small" id="cpPlay">Pause</button>
      <button type="button" class="coach-btn small" id="cpPrev">◀ Prev</button>
      <button type="button" class="coach-btn small" id="cpNext">Next ▶</button>
      <span class="cp-hint">Tap a marker to jump to that mistake</span>
    </div>
  </div>`;
}

// Wires video, overlay canvas, correction demo and timeline. Returns a cleanup fn.
export function wirePlayer(root, r, objUrl){
  const video = root.querySelector("#playClip");
  if(!video) return () => {};
  video.src = objUrl;
  const clipCanvas = root.querySelector("#clipCanvas");
  const demoCanvas = root.querySelector("#demoCanvas");
  const clipFlag = root.querySelector("#clipFlag");
  const faultCard = root.querySelector("#faultCard");
  const timeline = root.querySelector("#timeline");
  const faults = r.faults, dur = r.durationSec || 1;
  const provider = getDemoProvider("computed");
  let raf = 0, activeIdx = -1, renderer = null, dead = false;

  function fitClip(){
    if(!video.videoWidth) return;
    const ar = (video.videoWidth / video.videoHeight).toFixed(4);
    const pane = clipCanvas.parentElement;
    pane.style.aspectRatio = ar;
    clipCanvas.width = pane.clientWidth; clipCanvas.height = pane.clientHeight;
    if(demoCanvas){ demoCanvas.parentElement.style.aspectRatio = ar;
      demoCanvas.width = demoCanvas.clientWidth; demoCanvas.height = demoCanvas.clientHeight; }
  }
  video.addEventListener("loadedmetadata", fitClip);
  const onResize = () => fitClip();
  window.addEventListener("resize", onResize);

  function setActive(i){
    if(!faults.length) return;
    activeIdx = (i + faults.length) % faults.length;
    const f = faults[activeIdx];
    renderer = provider.prepare(f);
    const d = describeFocus(f.focus, f.target, f.lm);
    if(faultCard) faultCard.innerHTML =
      `<div class="fc-l"><span class="fc-k">Mistake · rep ${f.rep}</span>${f.msg}</div>
       <div class="fc-r"><span class="fc-k good">The fix</span>${d.verb}${d.detail ? ` · <b>${d.detail}</b>` : ""}</div>`;
    if(timeline) timeline.querySelectorAll(".tl-mark").forEach((m, j) => m.classList.toggle("on", j === activeIdx));
  }

  // build timeline markers
  if(timeline){
    timeline.innerHTML = `<div class="tl-track"></div>` +
      faults.map((f, i) => `<button type="button" class="tl-mark" data-i="${i}" style="left:${Math.max(1, Math.min(99, f.t/dur*100)).toFixed(1)}%" title="Rep ${f.rep}: ${f.msg.replace(/"/g,"&quot;")}"><b>${f.rep}</b></button>`).join("");
    timeline.querySelectorAll(".tl-mark").forEach(m => m.addEventListener("click", () => {
      const i = +m.dataset.i; setActive(i); try{ video.currentTime = Math.max(0, faults[i].t - 0.2); }catch(e){} video.play().catch(()=>{});
    }));
  }

  const play = root.querySelector("#cpPlay"), prev = root.querySelector("#cpPrev"), next = root.querySelector("#cpNext");
  if(play) play.addEventListener("click", () => { if(video.paused){ video.play(); play.textContent = "Pause"; } else { video.pause(); play.textContent = "Play"; } });
  if(prev) prev.addEventListener("click", () => { setActive(activeIdx - 1); try{ video.currentTime = Math.max(0, faults[activeIdx].t - 0.2); }catch(e){} });
  if(next) next.addEventListener("click", () => { setActive(activeIdx + 1); try{ video.currentTime = Math.max(0, faults[activeIdx].t - 0.2); }catch(e){} });

  const nearestTrack = ct => {
    const tr = r.track; if(!tr.length) return null;
    let best = tr[0], bd = Infinity;
    for(const e of tr){ const d = Math.abs(e.t - ct); if(d < bd){ bd = d; best = e; } }
    return bd < 0.25 ? best : null;
  };

  function loop(){
    if(dead) return;
    const ct = video.currentTime || 0;
    // left: synced skeleton on the clip, highlight the active fault chain near its moment
    if(clipCanvas.width){
      const ctx = clipCanvas.getContext("2d");
      ctx.clearRect(0, 0, clipCanvas.width, clipCanvas.height);
      const e = nearestTrack(ct);
      const f = faults[activeIdx];
      const nearFault = f && Math.abs(ct - f.t) < 0.7;
      if(e) drawPose(ctx, clipCanvas.width, clipCanvas.height, e.lm,
        { mode:"overlay", base:"rgba(150,170,210,.55)", hi:"#ff5a5a", highlight: nearFault ? (FOCUS[f.focus]?.pairs || []) : [] });
      if(clipFlag) clipFlag.classList.toggle("show", !!nearFault);
    }
    // auto-select the fault we're currently passing
    for(let i = 0; i < faults.length; i++){ if(Math.abs(ct - faults[i].t) < 0.35 && i !== activeIdx){ setActive(i); break; } }
    // right: correction demo morph loop (dwells on the corrected pose)
    if(renderer && renderer.kind === "canvas" && demoCanvas && demoCanvas.width){
      const cyc = (performance.now() % 2400) / 2400;
      const ss = x => x*x*(3 - 2*x);
      const p = cyc < 0.35 ? ss(cyc/0.35) : cyc < 0.78 ? 1 : 1 - ss((cyc - 0.78)/0.22);
      renderer.draw(demoCanvas.getContext("2d"), demoCanvas.width, demoCanvas.height, p);
    }
    raf = requestAnimationFrame(loop);
  }

  video.addEventListener("loadeddata", () => { fitClip(); setActive(0); video.play().catch(()=>{}); });
  raf = requestAnimationFrame(loop);

  return () => { dead = true; if(raf) cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); try{ video.pause(); video.src = ""; }catch(e){} };
}

const pickMime = () => ["video/webm;codecs=vp9","video/webm;codecs=vp8","video/webm","video/mp4"]
  .find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || "";

export function renderResults(app, ctx){
  const sport = ctx.sport;
  const coach = sport.coach || { skills:[], workout:[], defaultExercise:"pushup" };
  const ids = [...(coach.skills||[]), ...(coach.workout||[])].filter(id => EXERCISES[id]);
  let current = coach.defaultExercise && EXERCISES[coach.defaultExercise] ? coach.defaultExercise : (ids[0] || "pushup");

  const canRecord = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder && pickMime());

  app.className = "page";
  app.innerHTML = `
  <div class="page-hero">
    <div><p class="eyebrow"><span class="dot"></span> Results · ${sport.name}</p><h2>Form Results</h2>
    <p>Drop in a clip or record one, pick the movement, and get your <b>correction</b> back — scored, with the muscles worked and the exact fixes. Analysis runs on-device.</p></div>
    <span class="route-chip">Correction report</span>
  </div>

  <div class="results-grid">
    <div class="panel results-input">
      <div class="panel-title"><h3>Your clip</h3><span class="micro" id="resState">Pick a movement</span></div>
      <label class="label" style="margin-bottom:6px">Movement</label>
      <div class="exercise-picker" id="exPicker"><div class="picker-row">${
        ids.map(id => `<button type="button" data-ex="${id}" class="${id===current?"active":""}">${EXERCISES[id].label}</button>`).join("")
      }</div></div>
      <p class="film-tip" id="filmTip"><span>📹 Filming tip</span>${FILMING_TIPS[current] || ""}</p>

      <div class="stage results-stage" id="rStage">
        <video id="rVideo" playsinline muted></video>
        <div class="stage-empty" id="rEmpty"><b>Add a clip</b>Upload a short clip or record 5–15s of one movement. Keep your whole body in frame.</div>
        <div class="stage-badge" id="rBadge" style="display:none"><span class="dot"></span><span id="rBadgeText">Recording</span></div>
      </div>

      <div class="coach-controls">
        <button type="button" class="coach-btn primary" id="btnUpload">Upload clip</button>
        <button type="button" class="coach-btn" id="btnRecord" ${canRecord?"":"disabled title=\"Recording isn't supported in this browser — upload instead\""}>Record clip</button>
        <button type="button" class="coach-btn accent" id="btnStop" style="display:none">Stop &amp; analyse</button>
      </div>
      <input type="file" id="fileInput" accept="video/*" hidden />
      <div class="progress-wrap" id="progWrap" style="display:none"><div class="progress-bar" id="progBar"></div></div>
      <p class="coach-note">${canRecord ? "Tip: prop your phone, step back 2–3 m, and keep the lighting even." : "Recording isn't available here — upload a clip from your device."}</p>
    </div>

    <div class="results-output" id="rOutput">
      <div class="empty-state">Your correction report appears here once a clip is analysed.</div>
    </div>
  </div>`;

  const $ = id => app.querySelector(id);
  const els = { video:$("#rVideo"), empty:$("#rEmpty"), badge:$("#rBadge"), badgeText:$("#rBadgeText"),
    state:$("#resState"), out:$("#rOutput"), upload:$("#btnUpload"), record:$("#btnRecord"),
    stop:$("#btnStop"), file:$("#fileInput"), progWrap:$("#progWrap"), progBar:$("#progBar"), filmTip:$("#filmTip") };

  let objUrl = null, recStream = null, recorder = null, recChunks = [], recTimer = null, busy = false, playerCleanup = null;

  function setState(t){ els.state.textContent = t; }
  function clearObjUrl(){ if(objUrl){ URL.revokeObjectURL(objUrl); objUrl = null; } }

  function selectEx(id){
    current = id;
    app.querySelectorAll("#exPicker button").forEach(x => x.classList.toggle("active", x.dataset.ex === id));
    if(els.filmTip) els.filmTip.innerHTML = `<span>📹 Filming tip</span>${FILMING_TIPS[current] || ""}`;
    setState(`${EXERCISES[current].label} selected`);
  }
  app.querySelectorAll("#exPicker button").forEach(b => b.addEventListener("click", () => selectEx(b.dataset.ex)));

  async function runAnalysis(fileOrBlob){
    if(busy) return;
    busy = true;
    els.upload.disabled = els.record.disabled = true;
    els.progWrap.style.display = ""; els.progBar.style.width = "0%";
    setState("Analysing…");
    els.out.innerHTML = `<div class="empty-state">Analysing your ${EXERCISES[current].label.toLowerCase()} clip… this runs frame-by-frame on your device.</div>`;
    try{
      const r = await analyzeVideoFile(fileOrBlob, current, p => { els.progBar.style.width = Math.round(p*100) + "%"; });
      if(playerCleanup){ playerCleanup(); playerCleanup = null; }
      clearObjUrl(); objUrl = r.videoUrl;
      // input panel returns to a done state; the clip now lives in the player
      els.video.src = ""; els.video.srcObject = null; els.video.controls = false; els.video.style.transform = "none";
      els.empty.style.display = "";
      els.empty.innerHTML = `<b>Clip analysed ✓</b>Your correction report is on the right. Add another clip anytime.`;
      els.out.innerHTML = playerHTML(r) + cineOutput(r);
      playerCleanup = wirePlayer(els.out, r, objUrl);
      setState(r.reps ? `${r.good}/${r.reps} clean` : "No reps detected");
    }catch(err){
      console.error(err);
      els.out.innerHTML = `<div class="empty-state">${(err && err.message) || "Couldn't analyse that clip."} Try a clearer, full-body clip.</div>`;
      setState("Analysis failed");
    }finally{
      busy = false;
      els.upload.disabled = false; els.record.disabled = !canRecord;
      els.progWrap.style.display = "none";
    }
  }

  // ---- Upload path ----
  els.upload.addEventListener("click", () => els.file.click());
  els.file.addEventListener("change", () => {
    const f = els.file.files && els.file.files[0];
    if(f){ runAnalysis(f); els.file.value = ""; }
  });

  // ---- Record path ----
  function stopStream(){ if(recStream){ recStream.getTracks().forEach(t => t.stop()); recStream = null; } }
  function endRecUi(){
    els.badge.style.display = "none"; els.stop.style.display = "none";
    els.upload.style.display = ""; els.record.style.display = "";
    if(recTimer){ clearInterval(recTimer); recTimer = null; }
  }
  els.record.addEventListener("click", async () => {
    if(busy) return;
    try{
      recStream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:"user", width:{ideal:1280}, height:{ideal:960} }, audio:false });
      els.video.src = ""; els.video.controls = false; els.video.loop = false;
      els.video.srcObject = recStream; els.video.style.transform = "scaleX(-1)"; await els.video.play();
      els.empty.style.display = "none";
      recChunks = [];
      recorder = new MediaRecorder(recStream, { mimeType: pickMime() });
      recorder.ondataavailable = e => { if(e.data && e.data.size) recChunks.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(recChunks, { type: recorder.mimeType || "video/webm" });
        stopStream(); els.video.srcObject = null; els.video.style.transform = "none"; endRecUi();
        if(blob.size) runAnalysis(blob); else setState("Nothing recorded");
      };
      recorder.start();
      const start = Date.now();
      els.badge.style.display = ""; els.badgeText.textContent = "Recording 0s";
      els.upload.style.display = "none"; els.record.style.display = "none"; els.stop.style.display = "";
      setState("Recording…");
      recTimer = setInterval(() => {
        const s = Math.round((Date.now()-start)/1000);
        els.badgeText.textContent = `Recording ${s}s`;
        if(s >= 20 && recorder.state === "recording") recorder.stop();   // safety cap
      }, 250);
    }catch(err){
      console.error(err);
      stopStream(); endRecUi();
      setState(err && err.name === "NotAllowedError" ? "Camera permission denied" : "Couldn't start the camera");
    }
  });
  els.stop.addEventListener("click", () => { if(recorder && recorder.state === "recording") recorder.stop(); });

  // A clip recorded in the Form Coach arrives here ready to analyse.
  const handoff = takeRecordedClip();
  if(handoff){
    if(EXERCISES[handoff.exercise]) selectEx(handoff.exercise);
    runAnalysis(handoff.blob);
  }

  // teardown
  return () => {
    try{ if(recorder && recorder.state === "recording") recorder.stop(); }catch(e){}
    stopStream();
    if(recTimer) clearInterval(recTimer);
    if(playerCleanup){ playerCleanup(); playerCleanup = null; }
    clearObjUrl();
  };
}
