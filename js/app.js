import { SPORTS, getSport } from "./data/sports.js";
import { renderHome } from "./pages/home.js";
import { renderSports } from "./pages/sports.js";
import { renderTrain } from "./pages/train.js";
import { renderTrack } from "./pages/track.js";
import { renderBuilder } from "./pages/builder.js";

const app = document.getElementById("app");
const routes = { home: renderHome, sports: renderSports, train: renderTrain, track: renderTrack, build: renderBuilder };
const NAV = ["home", "sports", "train", "coach", "court", "build", "track"];

// Camera-heavy pages are code-split and loaded on demand.
const LAZY = {
  coach: { path: "./coach/coach.js", mount: "mountCoach", unmount: "unmountCoach", loading: "Loading Form Coach…" },
  court: { path: "./court/court.js", mount: "mountCourt", unmount: "unmountCourt", loading: "Loading Court Vision…" },
};
const lazyCache = {};

const SPORT_KEY = "bv_active_sport";
const currentSportId = () => localStorage.getItem(SPORT_KEY) || "volleyball";
function setSport(id){ if(SPORTS[id] && SPORTS[id].status === "active"){ localStorage.setItem(SPORT_KEY, id); } }

let pageTeardown = null;

async function route(){
  const page = (location.hash.replace("#","").split("/")[0]) || "home";
  const known = NAV.includes(page) ? page : "home";
  setActiveNav(known);

  // tear down whatever the previous page set up (canvas listeners, camera, …)
  if(pageTeardown){ try{ pageTeardown(); }catch(e){ console.error(e); } pageTeardown = null; }

  const ctx = { sport: getSport(currentSportId()), setSport };

  if(LAZY[known]){
    const cfg = LAZY[known];
    app.className = "page";
    app.innerHTML = `<div class="empty-state">${cfg.loading}</div>`;
    try{
      if(!lazyCache[known]) lazyCache[known] = await import(cfg.path);
      lazyCache[known][cfg.mount](app, ctx.sport);
      pageTeardown = () => lazyCache[known][cfg.unmount]();
    }catch(e){
      console.error(e);
      app.innerHTML = `<div class="empty-state">Couldn't load this module. Check your connection and retry.</div>`;
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
