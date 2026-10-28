import { SPORTS } from "../data/sports.js";

// The five-step "flow" — mirrors the reference site's methodology grid.
const FLOW = [
  ["01", "Sport",      "choose",    "Beach Volleyball now — Tennis, Basketball & Soccer soon.", "#sports"],
  ["02", "Program",    "structured","Speed & Agility, Strength & Vertical, or Combined.",       "#train"],
  ["03", "Build",      "custom",    "Assemble your own plan from blocks & exercises.",          "#build"],
  ["04", "Form Coach", "real-time", "Reps, skill grading and form cues from your camera.",       "#coach"],
  ["05", "Track",      "progress",  "Log sessions and export data to tune the coach.",          "#track"],
];

const flowCard = ([num, title, tag, desc, href]) => `
  <a class="flow-card" href="${href}">
    <div class="flow-num">${num}</div>
    <h3 class="flow-title">${title} <span class="flow-tag">${tag}</span></h3>
    <p class="flow-desc">${desc}</p>
    <span class="flow-arrow">→</span>
  </a>`;

export function renderHome(app){
  const active = Object.values(SPORTS).filter(s => s.status === "active").length;
  app.className = "page";
  app.innerHTML = `
    <section class="hero">
      <div>
        <p class="eyebrow"><span class="dot"></span> Sport training + computer-vision coach</p>
        <h1>Train<br>Smarter</h1>
        <p class="hero-copy">Real-time movement analysis powered by computer vision. Currently optimized for <b>international beach volleyball performance</b>.</p>
        <div class="hero-actions">
          <a class="button" href="#train">Start training <span class="arrow-circle">→</span></a>
          <a class="button secondary" href="#coach">Open Form Coach</a>
          <a class="button secondary" href="#build">Build a plan</a>
        </div>
      </div>
      <div class="cam-card" role="img" aria-label="Beach volleyball athlete spiking a Mikasa BV550C on a court on a Singapore beach at sunset">
        <div class="cam-media"></div>
        <div class="cam-scrim"></div>
        <div class="cam-tag"><div class="k">Vertical jump</div><div class="v">84.2 cm</div></div>
        <div class="cam-live"><span class="dot"></span> Live</div>
        <div class="cam-foot">
          <div class="lab"><span>Form score</span></div>
          <div class="cam-bar"><i></i></div>
          <div class="cam-stats"><span>Stability: 92%</span><span>Force: 4.8kN</span></div>
        </div>
      </div>
      <div class="hero-stamp">
        <span><span class="dot"></span> ${active} sport live</span>
        <span>Computer-vision coach</span>
        <span>On-device · private</span>
      </div>
    </section>

    <div class="goal-marquee"><div class="goal-marquee-track">${
      Array(2).fill(`<span><b></b>Jump higher<b></b>Move faster<b></b>Sharper skills<b></b>Fewer injuries<b></b>Track everything</span>`).join("")
    }</div></div>

    <section class="home-section">
      <div class="section-head">
        <div><p class="eyebrow"><span class="dot"></span> The methodology</p><h2>The flow</h2></div>
        <p>Everything connects. Pick a sport, follow or build a program, coach your movement, and track it.</p>
      </div>
      <div class="flow-grid">${FLOW.map(flowCard).join("")}</div>
    </section>

    <section class="cta">
      <p class="eyebrow"><span class="dot"></span> Ready when you are</p>
      <h2>Level up<br><span class="cta-accent">your game</span></h2>
      <a class="button" href="#coach">Begin technical assessment <span class="arrow-circle">→</span></a>
    </section>`;
}
