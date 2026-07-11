import { SPORTS } from "../data/sports.js";

export function renderSports(app, { sport, setSport }){
  app.className = "page";
  app.innerHTML = `
    <div class="page-hero">
      <div><p class="eyebrow"><span class="dot"></span> Pick your sport</p><h2>Sports</h2>
      <p>Each sport has its own training programs and a Form Coach tuned to its skills. Choose one to make it active across Train and Form Coach.</p></div>
      <span class="route-chip">Currently: ${sport.name}</span>
    </div>
    <div class="sport-grid">${Object.values(SPORTS).map(s => sportCard(s, sport.id)).join("")}</div>`;

  app.querySelectorAll("[data-sport]").forEach(btn => btn.addEventListener("click", () => {
    setSport(btn.dataset.sport);
    location.hash = "#train";
  }));
}

function sportCard(s, activeId){
  const soon = s.status !== "active";
  const isActive = s.id === activeId;
  return `
    <button class="sport-card ${isActive ? "active-sport":""}" data-sport="${s.id}" ${soon ? "disabled":""}>
      <span class="sport-status ${soon ? "soon":""}">${soon ? "Coming soon" : "Ready"}</span>
      <div><h3>${s.name}</h3><p>${s.blurb}</p></div>
      <span class="sport-current">${isActive ? `<span class="dot"></span> Active sport` : (soon ? "In training" : "Tap to select →")}</span>
    </button>`;
}
