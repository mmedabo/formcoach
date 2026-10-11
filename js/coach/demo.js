// ============================================================================
//  Correction demo engine — turns a graded fault into a visual "here's the
//  mistake, here's the right way" comparison.
//
//  Default provider = COMPUTED SELF-CORRECTION: it takes the user's own
//  fault-frame pose and rotates/moves the offending joint to the target angle,
//  so the "correct form" is literally their body, fixed. Asset-free, works for
//  every sport/exercise that defines a `focus` on its fault verdicts.
//
//  Extensibility: the right-hand demo panel is produced by a DemoProvider.
//  Ship with `computed`; drop in `referenceClip` or your self-hosted AI model
//  later by registering another provider (see DEMO_PROVIDERS / AI_DEMO_ENDPOINT).
// ============================================================================

import { jointAngle } from "./coach.js";

// Landmark indices (MediaPipe Pose) we care about.
const NOSE=0, LSH=11,RSH=12, LEL=13,REL=14, LWR=15,RWR=16, LHIP=23,RHIP=24, LKN=25,RKN=26, LANK=27,RANK=28;
const DRAW_IDX = [NOSE,LSH,RSH,LEL,REL,LWR,RWR,LHIP,RHIP,LKN,RKN,LANK,RANK];
const CONNECTIONS = [[LSH,RSH],[LSH,LEL],[LEL,LWR],[RSH,REL],[REL,RWR],
  [LSH,LHIP],[RSH,RHIP],[LHIP,RHIP],[LHIP,LKN],[LKN,LANK],[RHIP,RKN],[RKN,RANK]];

// Per-fault: which segments to spotlight, the joint whose angle we read, and a verb.
export const FOCUS = {
  kneeDepth:   { pairs:[[LHIP,LKN],[LKN,LANK],[RHIP,RKN],[RKN,RANK]], angle:["hip","knee","ankle"],   verb:"Bend to depth" },
  elbowDepth:  { pairs:[[LSH,LEL],[LEL,LWR],[RSH,REL],[REL,RWR]],     angle:["shoulder","elbow","wrist"], verb:"Lower to ~90°" },
  elbowExtend: { pairs:[[LSH,LEL],[LEL,LWR],[RSH,REL],[REL,RWR]],     angle:["shoulder","elbow","wrist"], verb:"Snap to full extension" },
  torsoUpright:{ pairs:[[LSH,LHIP],[RSH,RHIP],[LHIP,RHIP]],           angle:["shoulder","hip","knee"],  verb:"Lift your chest" },
  bodyLine:    { pairs:[[LSH,LHIP],[LHIP,LANK],[RSH,RHIP],[RHIP,RANK]], angle:["shoulder","hip","ankle"], verb:"Straighten your body line" },
  hipExtend:   { pairs:[[LSH,LHIP],[LHIP,LKN],[RSH,RHIP],[RHIP,RKN]], angle:["shoulder","hip","knee"],  verb:"Drive hips to lockout" },
  reachHigh:   { pairs:[[LSH,LEL],[LEL,LWR],[RSH,REL],[REL,RWR]],     angle:["shoulder","elbow","wrist"], verb:"Reach above your head" },
  handsLevel:  { pairs:[[LEL,LWR],[REL,RWR]],                          angle:null,                       verb:"Level both hands" },
};

// ---- geometry helpers ----
const vis = p => p && (p.visibility == null || p.visibility > 0.3);
const clone = lm => lm.map(p => ({ x:p.x, y:p.y, visibility:p.visibility }));
const center = (p, a, b) => {
  const A=p[a], B=p[b];
  if(vis(A)&&vis(B)) return { x:(A.x+B.x)/2, y:(A.y+B.y)/2 };
  return vis(A) ? {x:A.x,y:A.y} : {x:B.x,y:B.y};
};
function signedDeg(A,B,C){
  const v1x=A.x-B.x, v1y=A.y-B.y, v2x=C.x-B.x, v2y=C.y-B.y;
  return Math.atan2(v1x*v2y - v1y*v2x, v1x*v2x + v1y*v2y) * 180/Math.PI;
}
function rot(p, piv, rad){
  const dx=p.x-piv.x, dy=p.y-piv.y, c=Math.cos(rad), s=Math.sin(rad);
  p.x = piv.x + dx*c - dy*s; p.y = piv.y + dx*s + dy*c;
}
// Rotate the distal joint(s) about a pivot so angle(prox,pivot,distal) == targetDeg.
function setAngle(p, iProx, iPiv, distal, targetDeg){
  const A=p[iProx], B=p[iPiv], C=p[distal[0]];
  if(!(vis(A)&&vis(B)&&vis(C))) return;
  const cur = signedDeg(A,B,C);
  const d = (Math.sign(cur||1)*Math.abs(targetDeg) - cur) * Math.PI/180;
  for(const i of distal) if(p[i]) rot(p[i], B, d);
}
// Move a vertex (and its group) onto the line between A and C — straightens A-vertex-C.
function straightenVertex(p, iA, iVert, iC, group){
  const A=p[iA], V=p[iVert], C=p[iC];
  if(!(vis(A)&&vis(V)&&vis(C))) return;
  const ax=C.x-A.x, ay=C.y-A.y, len=ax*ax+ay*ay || 1;
  const t=((V.x-A.x)*ax + (V.y-A.y)*ay)/len;
  const dx=(A.x+t*ax)-V.x, dy=(A.y+t*ay)-V.y;
  for(const i of group) if(p[i]){ p[i].x+=dx; p[i].y+=dy; }
}

// Returns a corrected copy of the landmarks for the given fault focus.
export function computeCorrection(lm, focus, target){
  const p = clone(lm);
  switch(focus){
    case "kneeDepth":
      setAngle(p, LHIP, LKN, [LANK,29,31], target||100);
      setAngle(p, RHIP, RKN, [RANK,30,32], target||100); break;
    case "elbowDepth":
      setAngle(p, LSH, LEL, [LWR,17,19,21], target||95);
      setAngle(p, RSH, REL, [RWR,18,20,22], target||95); break;
    case "elbowExtend":
      setAngle(p, LSH, LEL, [LWR,17,19,21], target||172);
      setAngle(p, RSH, REL, [RWR,18,20,22], target||172); break;
    case "torsoUpright": {
      const hipC=center(p,LHIP,RHIP), shC=center(p,LSH,RSH), knC=center(p,LKN,RKN);
      const cur=signedDeg(shC,hipC,knC);
      const d=(Math.sign(cur||1)*Math.abs(target||75) - cur)*Math.PI/180;
      for(const i of [NOSE,LSH,RSH,LEL,REL,LWR,RWR,17,18,19,20,21,22]) if(p[i]) rot(p[i], hipC, d);
      break; }
    case "bodyLine":
      straightenVertex(p, LSH, LHIP, LANK, [LHIP]);
      straightenVertex(p, RSH, RHIP, RANK, [RHIP]); break;
    case "hipExtend":
      straightenVertex(p, LSH, LHIP, LKN, [LHIP]);
      straightenVertex(p, RSH, RHIP, RKN, [RHIP]); break;
    case "reachHigh": {
      setAngle(p, LSH, LEL, [LWR,17,19,21], 172);
      setAngle(p, RSH, REL, [RWR,18,20,22], 172);
      // lift the higher (hitting) arm straight up over the shoulder
      const side = (p[LWR].y <= p[RWR].y) ? { sh:LSH, grp:[LEL,LWR,17,19,21] } : { sh:RSH, grp:[REL,RWR,18,20,22] };
      const sh=p[side.sh], wr=p[side.grp[1]];
      if(vis(sh)&&vis(wr)){ const d=(-Math.PI/2) - Math.atan2(wr.y-sh.y, wr.x-sh.x); for(const i of side.grp) if(p[i]) rot(p[i], sh, d); }
      break; }
    case "handsLevel": {
      const y=Math.min(p[LWR].y, p[RWR].y); if(p[LWR]) p[LWR].y=y; if(p[RWR]) p[RWR].y=y; break; }
  }
  return p;
}

// Plain-language "your value → target" readout for a fault.
export function describeFocus(focus, target, faultLm){
  const f = FOCUS[focus]; if(!f) return { verb:"Fix your form", detail:"" };
  let detail = "";
  if(f.angle && faultLm){
    const measured = jointAngle(faultLm, f.angle[1], f.angle);
    if(measured != null) detail = target != null ? `Your ${Math.round(measured)}° → aim ${target}°` : `Your ${Math.round(measured)}°`;
  }
  return { verb:f.verb, detail };
}

// ---- drawing ----
const lerp = (a,b,t) => a + (b-a)*t;
function lerpPose(a, b, t){ return a.map((p,i) => ({ x:lerp(p.x,b[i].x,t), y:lerp(p.y,b[i].y,t), visibility:p.visibility })); }

// mode "overlay": map normalized coords straight onto w×h (aligns to the clip).
// mode "figure": auto-fit the visible pose into the canvas with padding.
export function drawPose(ctx, w, h, lm, { highlight=[], base="rgba(140,170,220,.55)", hi="#caff35", mode="figure", joints=true } = {}){
  let ox=0, oy=0, sx=w, sy=h;
  if(mode === "figure"){
    let minX=1,minY=1,maxX=0,maxY=0;
    for(const i of DRAW_IDX){ const p=lm[i]; if(!vis(p)) continue; minX=Math.min(minX,p.x); minY=Math.min(minY,p.y); maxX=Math.max(maxX,p.x); maxY=Math.max(maxY,p.y); }
    if(maxX<=minX||maxY<=minY){ minX=0;minY=0;maxX=1;maxY=1; }
    const pad=0.14, bw=(maxX-minX)||1, bh=(maxY-minY)||1;
    const scale=Math.min(w*(1-2*pad)/(bw*w), h*(1-2*pad)/(bh*h));
    sx=scale*w; sy=scale*h;
    ox=(w-bw*sx)/2 - minX*sx; oy=(h-bh*sy)/2 - minY*sy;
  }
  const X=p=>ox+p.x*sx, Y=p=>oy+p.y*sy;
  const hiSet=new Set(highlight.map(pr=>pr.join("-")).concat(highlight.map(pr=>pr.slice().reverse().join("-"))));
  ctx.lineCap="round"; ctx.lineJoin="round";
  for(const [a,b] of CONNECTIONS){
    if(!(vis(lm[a])&&vis(lm[b]))) continue;
    const on=hiSet.has(a+"-"+b);
    ctx.strokeStyle = on?hi:base; ctx.lineWidth = on?7:4;
    if(on){ ctx.shadowColor=hi; ctx.shadowBlur=14; } else ctx.shadowBlur=0;
    ctx.beginPath(); ctx.moveTo(X(lm[a]),Y(lm[a])); ctx.lineTo(X(lm[b]),Y(lm[b])); ctx.stroke();
  }
  ctx.shadowBlur=0;
  if(joints) for(const i of DRAW_IDX){ const p=lm[i]; if(!vis(p)||i===NOSE) continue;
    ctx.fillStyle="rgba(230,234,240,.9)"; ctx.beginPath(); ctx.arc(X(p),Y(p),3.5,0,7); ctx.fill(); }
  const n=lm[NOSE]; if(vis(n)){ ctx.strokeStyle=base; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(X(n),Y(n), Math.max(8, sx*0.03), 0, 7); ctx.stroke(); }
}

// Draw the morph fault→corrected on a figure canvas; colour ramps red→green.
export function drawCorrectionFrame(ctx, w, h, faultLm, correctedLm, focus, progress){
  ctx.clearRect(0,0,w,h);
  const f = FOCUS[focus] || { pairs:[] };
  const pose = lerpPose(faultLm, correctedLm, progress);
  // faint ghost of the original (wrong) pose
  drawPose(ctx, w, h, faultLm, { highlight:[], base:"rgba(255,90,90,.18)", mode:"figure", joints:false });
  const r=Math.round(lerp(255,120,progress)), g=Math.round(lerp(80,230,progress)), b=Math.round(lerp(70,80,progress));
  drawPose(ctx, w, h, pose, { highlight:f.pairs, base:"rgba(150,170,210,.5)", hi:`rgb(${r},${g},${b})`, mode:"figure" });
}

// ---- Provider registry (for future reference clips / self-hosted AI model) ----
// Each provider: { id, label, available(exerciseId), prepare(fault) -> renderer }
// A renderer is either { kind:"canvas", draw(ctx,w,h,progress) } or { kind:"video", url }.
export let AI_DEMO_ENDPOINT = null; // set to your self-hosted model URL to enable AI-generated demos
export function setAiDemoEndpoint(url){ AI_DEMO_ENDPOINT = url; }

export const DEMO_PROVIDERS = {
  computed: {
    id:"computed", label:"Ideal form",
    available: () => true,
    prepare(fault){
      const corrected = computeCorrection(fault.lm, fault.focus, fault.target);
      return { kind:"canvas", draw:(ctx,w,h,progress)=>drawCorrectionFrame(ctx,w,h,fault.lm,corrected,fault.focus,progress) };
    },
  },
  // referenceClip: { id:"referenceClip", label:"Pro demo", available:ex=>!!CLIPS[ex], prepare(fault){ return { kind:"video", url:CLIPS[fault.exerciseId] }; } },
  // aiModel: { id:"aiModel", label:"AI correction", available:()=>!!AI_DEMO_ENDPOINT,
  //   async prepare(fault){ const r=await fetch(AI_DEMO_ENDPOINT,{method:"POST",body:JSON.stringify({exerciseId:fault.exerciseId,focus:fault.focus,target:fault.target,landmarks:fault.lm})}); return { kind:"video", url:(await r.json()).videoUrl }; } },
};
export function getDemoProvider(id="computed"){ return DEMO_PROVIDERS[id] || DEMO_PROVIDERS.computed; }
