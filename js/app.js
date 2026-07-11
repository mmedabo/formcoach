import { SPORTS, getSport } from "./data/sports.js";
import { renderHome } from "./pages/home.js";
import { renderSports } from "./pages/sports.js";
import { renderTrain } from "./pages/train.js";
import { renderTrack } from "./pages/track.js";
import { renderBuilder } from "./pages/builder.js";

const app = document.getElementById("app");
const routes = { home: renderHome, sports: renderSports, train: renderTrain, track: renderTrack, build: renderBuilder };
const NAV = ["home", "sports", "train", "coach", "build", "track"];

const SPORT_KEY = "bv_active_sport";
const currentSportId = () => localStorage.getItem(SPORT_KEY) || "volleyball";
function setSport(id){ if(SPORTS[id] && SPORTS[id].status === "active"){ localStorage.setItem(SPORT_KEY, id); } }

let coachMod = null, pageTeardown = null;

async function route(){
  const page = (location.hash.replace("#","").split("/")[0]) || "home";
  const known = NAV.includes(page) ? page : "home";
  setActiveNav(known);

  // tear down whatever the previous page set up (canvas listeners, camera, …)
  if(pageTeardown){ try{ pageTeardown(); }catch(e){ console.error(e); } pageTeardown = null; }

  const ctx = { sport: getSport(currentSportId()), setSport };

  if(known === "coach"){
    app.className = "page";
    app.innerHTML = `<div class="empty-state">Loading Form Coach…</div>`;
    try{
      if(!coachMod) coachMod = await import("./coach/coach.js");
      coachMod.mountCoach(app, ctx.sport);
      pageTeardown = () => coachMod.unmountCoach();
    }catch(e){
      console.error(e);
      app.innerHTML = `<div class="empty-state">Couldn't load the Form Coach module. Check your connection and retry.</div>`;
    }
    window.scrollTo({ top: 0 });
    return;
  }

  const teardown = (routes[known] || renderHome)(app, ctx);
  pageTeardown = typeof teardown === "function" ? teardown : null;
  window.scrollTo({ top: 0 });
}

function setActiveNav(page){
  document.querySelectorAll("[data-nav]").forEach(a => {
    if(a.dataset.nav === page) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}

window.addEventListener("hashchange", route);
window.addEventListener("DOMContentLoaded", route);
if(document.readyState !== "loading") route();
