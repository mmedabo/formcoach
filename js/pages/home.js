import { SPORTS } from "../data/sports.js";

export function renderHome(app, { sport }){
  const active = Object.values(SPORTS).filter(s => s.status === "active").length;
  app.className = "page";
  app.innerHTML = `
    <section class="hero">
      <div>
        <p class="eyebrow"><span class="dot"></span> Sport training + computer-vision coach</p>
        <h1>TRAIN<br><span class="outline-word">SMARTER</span></h1>
        <p class="hero-copy">Sport-specific strength, speed and skill programs — paired with a camera <b>Form Coach</b> that grades your movement in real time. Currently dialed in for <b>${sport.name}</b>, with more sports on the way.</p>
        <div class="hero-actions">
          <a class="button" href="#train">Start training <span class="arrow-circle">→</span></a>
          <a class="button blue" href="#coach">Open Form Coach</a>
          <a class="button secondary" href="#sports">Choose sport</a>
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

    <div class="section-head">
      <h2>How it works</h2>
      <p>Pick your sport, follow a structured program, then use the camera coach to check your form and skill technique — and log data to improve over time.</p>
    </div>
    <div class="why-row">
      <div class="why-card"><span>1 · Choose your sport</span><p class="micro">Volleyball now — Tennis, Basketball & Soccer coming.</p></div>
      <div class="why-card"><span>2 · Follow a program</span><p class="micro">Speed & Agility, Strength & Vertical, or a Combined plan.</p></div>
      <div class="why-card"><span>3 · Coach your movement</span><p class="micro">Real-time reps, skill grading and form cues from your camera.</p></div>
      <div class="why-card"><span>4 · Track & tune</span><p class="micro">Log sessions and export data to sharpen the coaching.</p></div>
    </div>`;
}
