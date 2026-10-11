// ============================================================================
//  Offline analyzer — grades a recorded / uploaded clip with the SAME exercise
//  criteria the live Form Coach uses (EXERCISES from coach.js), so results stay
//  consistent. It seek-samples the video through the pose landmarker (faster and
//  more deterministic than real-time playback) and replays the live rep / skill
//  state machine over the sampled frames.
//    analyzeVideoFile(file, exerciseId, onProgress) -> summary object
// ============================================================================

import { EXERCISES, metrics, createLandmarker } from "./coach.js";

const SAMPLE_FPS = 15;              // frames we grade per second of video
const seekTo = (v, t) => new Promise(res => {
  const done = () => { v.removeEventListener("seeked", done); res(); };
  v.addEventListener("seeked", done);
  v.currentTime = Math.min(t, (v.duration || 0) - 0.001);
});

// One grading step for rep-type exercises — mirrors coach.js processPose/countRep.
function gradeRepFrame(ex, lm, S, t){
  const a = ex.measure(lm);
  if(a == null) return null;
  const idx = ex.phases.findIndex(p => p.test(a));
  if(idx >= 0) S.phasesSeen.add(idx);
  const mark = () => { S.extreme = a; S.extremeLm = lm; S.extremeT = t; };   // remember the key (extreme) frame
  if(ex.startHigh){
    if(a < ex.down){ if(S.stage !== "effort"){ S.stage = "effort"; mark(); } else if(a < S.extreme) mark(); }
    else if(a > ex.up && S.stage === "effort"){ S.stage = "rest"; return finishRep(ex, S); }
  } else {
    if(a > ex.up){ if(S.stage !== "effort"){ S.stage = "effort"; mark(); } else if(a > S.extreme) mark(); }
    else if(a < ex.down && S.stage === "effort"){ S.stage = "rest"; return finishRep(ex, S); }
  }
  return null;
}
function finishRep(ex, S){
  const v = ex.formCheck(S.extremeLm, S.extreme);
  return { good:v.type==="good", msg:v.msg, type:v.type, focus:v.focus||null, target:v.target??null, lm:S.extremeLm, t:S.extremeT };
}

// One grading step for skill-type exercises — mirrors coach.js processSkill.
function gradeSkillFrame(ex, lm, S, t){
  const m = metrics(lm);
  ex.criteria.forEach((c, i) => { if(c.test(m, S)) S.critPass[i]++; });
  const v = ex.detect(m, S);               // detect() mutates S, same as live skillState
  return v ? { good:v.good, msg:v.msg, type:v.good?"good":"warn", focus:v.focus||null, target:v.target??null, lm, t } : null;
}

function tally(list){
  const map = new Map();
  for(const msg of list) map.set(msg, (map.get(msg) || 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([msg, count]) => ({ msg, count }));
}

export async function analyzeVideoFile(file, exerciseId, onProgress){
  const ex = EXERCISES[exerciseId];
  if(!ex) throw new Error("Unknown exercise: " + exerciseId);
  const isSkill = ex.type === "skill";

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url; video.muted = true; video.playsInline = true; video.preload = "auto";
  try{
    await new Promise((res, rej) => {
      video.addEventListener("loadedmetadata", res, { once:true });
      video.addEventListener("error", () => rej(new Error("Couldn't read that video file.")), { once:true });
    });
    const duration = video.duration;
    if(!isFinite(duration) || duration <= 0) throw new Error("That clip has no readable duration.");

    const landmarker = await createLandmarker();
    const S = isSkill
      ? { critPass: ex.criteria.map(() => 0) }
      : { stage:"rest", extreme:null, phasesSeen:new Set() };

    const verdicts = [], track = [], faults = [];
    let framesWithPose = 0, framesTotal = 0, ts = 0;
    const step = 1 / SAMPLE_FPS;

    for(let t = 0; t < duration; t += step){
      await seekTo(video, t);
      framesTotal++;
      const res = landmarker.detectForVideo(video, (ts += 1000 / SAMPLE_FPS));
      if(res.landmarks && res.landmarks.length){
        framesWithPose++;
        const lm = res.landmarks[0];
        track.push({ t, lm });                 // for the synced skeleton overlay on the clip
        const v = isSkill ? gradeSkillFrame(ex, lm, S, t) : gradeRepFrame(ex, lm, S, t);
        if(v){
          const rep = verdicts.length + 1;
          verdicts.push({ rep, good: v.type === "good", msg: v.msg, type: v.type });
          if(!v.good && v.focus && v.lm)       // a fixable fault with a key frame to show
            faults.push({ rep, t:v.t, focus:v.focus, target:v.target, msg:v.msg, lm:v.lm, exerciseId });
        }
      }
      if(onProgress) onProgress(Math.min(1, t / duration));
    }
    if(onProgress) onProgress(1);
    landmarker.close && landmarker.close();

    const reps = verdicts.length;
    const good = verdicts.filter(v => v.good).length;
    const corrections = tally(verdicts.filter(v => !v.good).map(v => v.msg));
    const strengths   = tally(verdicts.filter(v =>  v.good).map(v => v.msg));

    const checkpoints = isSkill
      ? ex.criteria.map((c, i) => ({ name: c.name, met: framesWithPose > 0 && S.critPass[i] / framesWithPose > 0.25 }))
      : ex.phases.map((p, i) => ({ name: p.name, met: S.phasesSeen.has(i) }));

    return {
      exerciseId, label: ex.label, kind: ex.type, reps, good,
      score: reps ? Math.round((good / reps) * 100) : null,
      verdicts, corrections, strengths, checkpoints, faults, track,
      poseCoverage: framesTotal ? framesWithPose / framesTotal : 0,
      videoUrl: url,              // caller owns this; revoke when the screen tears down
      durationSec: Math.round(duration),
      hint: ex.hint || null,
    };
  }catch(err){
    URL.revokeObjectURL(url);
    throw err;
  }
}
