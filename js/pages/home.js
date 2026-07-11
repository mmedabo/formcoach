import { SPORTS } from "../data/sports.js";
import { initNodeCanvas } from "../nodeCanvas.js";

const NODE = (id, x, y, w, dot, title, tag, desc, href) => `
  <div class="node home-node" id="${id}" data-x="${x}" data-y="${y}" data-w="${w}">
    <div class="node-head"><span class="pd ${dot}"></span> ${title} <span class="node-tag">${tag}</span></div>
    <p class="home-node-desc">${desc}</p>
    <a class="home-node-link" href="${href}">Open <span class="arrow-circle">→</span></a>
  </div>`;

export function renderHome(app, { sport }){
  const active = Object.values(SPORTS).filter(s => s.status === "active").length;
  app.className = "page";
  app.innerHTML = `
    <section class="hero">
      <div>
        <p class="eyebrow"><span class="dot"></span> Sport training + computer-vision coach</p>
        <h1>TRAIN<br><span class="outline-word">SMARTER</span></h1>
        <p class="hero-copy">Sport-specific programs and a camera <b>Form Coach</b> that grades your movement in real time — wired together like a pipeline. Currently dialed in for <b>${sport.name}</b>.</p>
        <div class="hero-actions">
          <a class="button" href="#train">Start training <span class="arrow-circle">→</span></a>
          <a class="button blue" href="#coach">Open Form Coach</a>
          <a class="button secondary" href="#build">Build a plan</a>
        </div>
      </div>
      <div class="hero-art">
        <div class="big-number">${sport.name.slice(0,2).toUpperCase()}</div>
        <div class="stamp"><span>${active} sport live</span><span>Computer-vision coach</span></div>
      </div>
    </section>

    <div class="goal-marquee"><div class="goal-marquee-track">${
      Array(2).fill(`<span><b></b>Jump higher<b></b>Move faster<b></b>Sharper skills<b></b>Fewer injuries<b></b>Track everything</span>`).join("")
    }</div></div>

    <div class="section-head"><h2>The flow</h2><p>Everything connects. Pick a sport, follow or build a program, coach your movement, and track it — drag the nodes to explore.</p></div>
    <div class="node-canvas home-canvas" id="homeCanvas">
      <svg class="wires" id="wires"></svg>
      ${NODE("nSport","10","118","215","g","Sport","choose","Volleyball now — Tennis, Basketball & Soccer soon.","#sports")}
      ${NODE("nProgram","250","30","235","b","Program","structured","Speed & Agility, Strength & Vertical, or Combined.","#train")}
      ${NODE("nBuild","250","250","235","y","Build","custom","Assemble your own plan from blocks & exercises.","#build")}
      ${NODE("nCoach","525","118","235","p","Form Coach","real-time","Reps, skill grading and form cues from your camera.","#coach")}
      ${NODE("nTrack","800","118","230","g","Track","progress","Log sessions and export data to tune the coach.","#track")}
    </div>`;

  const ctl = initNodeCanvas(document.getElementById("homeCanvas"), {
    wires: [["nSport","nProgram","#7cf5a0"],["nProgram","nCoach","#5c8cff"],["nCoach","nTrack","#7cf5a0"],["nProgram","nBuild","#f5d76e"]],
  });
  return () => ctl.destroy();
}
