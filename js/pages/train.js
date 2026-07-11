import { icon } from "../icons.js";
import { programById } from "../data/sports.js";

let sel = { progId: null, variantId: null };

export function renderTrain(app, { sport }){
  app.className = "page";
  if(sport.status !== "active" || !sport.programs){
    app.innerHTML = `
      <div class="page-hero"><div><p class="eyebrow"><span class="dot"></span> Train</p><h2>${sport.name}</h2>
      <p>${sport.blurb}</p></div><span class="route-chip">Coming soon</span></div>
      <div class="empty-state">Programs for ${sport.name} aren't ready yet. Head to <a href="#sports" style="text-decoration:underline">Sports</a> and pick Volleyball to start training.</div>`;
    return;
  }
  if(!sel.progId || !sport.programs.find(p => p.id === sel.progId)) sel.progId = sport.programs[0].id;
  draw(app, sport);
}

function draw(app, sport){
  const prog = sport.programs.find(p => p.id === sel.progId);
  app.innerHTML = `
    <div class="page-hero">
      <div><p class="eyebrow"><span class="dot"></span> ${sport.name} · Train</p><h2>Programs</h2>
      <p>Structured ${sport.name.toLowerCase()} training. Choose a program below — then use the <a href="#coach" style="text-decoration:underline">Form Coach</a> to check your reps and skills.</p></div>
      <span class="route-chip">${sport.programs.length} programs</span>
    </div>
    <div class="prog-tabs">${sport.programs.map(p => `
      <button class="prog-tab ${p.id===sel.progId?"active":""}" data-prog="${p.id}">${p.name} <span class="lv">${p.level}</span></button>`).join("")}
    </div>
    ${prog.variants ? combinedView(sport, prog) : programView(prog)}`;

  app.querySelectorAll("[data-prog]").forEach(b => b.addEventListener("click", ()=>{ sel.progId = b.dataset.prog; sel.variantId = null; draw(app, sport); window.scrollTo({top:0}); }));
  app.querySelectorAll("[data-variant]").forEach(b => b.addEventListener("click", ()=>{ sel.variantId = b.dataset.variant; draw(app, sport); }));
}

function programView(prog){
  return `
    <div class="prog-head"><span class="prog-tagline">${prog.tagline}</span></div>
    <p class="prog-blurb">${prog.blurb}</p>
    ${overview(prog.overview)}
    ${why(prog.why)}
    <div class="section-head"><h2>Weekly schedule</h2><p>Three focused sessions per week. Warm up, work the blocks, cool down.</p></div>
    <div class="days-grid">${prog.days.map(dayCard).join("")}</div>
    <div class="section-head" style="margin-top:36px"><h2>Progression</h2><p>How the 6 weeks build.</p></div>
    <div class="stepper">${prog.progression.map(stepCard).join("")}</div>
    <div class="section-head"><h2>Tips</h2><p>Small habits, big payoff.</p></div>
    <div class="tips-row">${prog.tips.map(t => `<div class="tip"><div class="k">${t.label}</div><div class="t">${t.text}</div></div>`).join("")}</div>`;
}

function combinedView(sport, prog){
  if(!sel.variantId) sel.variantId = prog.variants[0].id;
  const v = prog.variants.find(x => x.id === sel.variantId) || prog.variants[0];
  const refProgs = (prog.combinesRefs || []).map(id => programById(sport, id)).filter(Boolean);
  return `
    <div class="prog-head"><span class="prog-tagline">${prog.tagline}</span></div>
    <p class="prog-blurb">${prog.blurb}</p>
    <div class="variant-toggle">${prog.variants.map(x => `<button data-variant="${x.id}" class="${x.id===v.id?"active":""}">${x.name}</button>`).join("")}</div>
    <div class="notice">${v.summary}</div>
    <div class="section-head" style="margin-top:26px"><h2>${v.name}</h2><p>${v.schedule[0].day ? "Your weekly split." : "Your 6-week rotation."}</p></div>
    <div class="sched-table">${v.schedule.map(schedRow).join("")}</div>
    ${refProgs.map(p => `
      <div class="section-head" style="margin-top:30px"><h2>${p.name}</h2><p>${p.overview.sessionLength} · ${p.overview.frequency}</p></div>
      <div class="days-grid">${p.days.map(dayCard).join("")}</div>`).join("")}`;
}

function schedRow(r){
  const rest = !r.ref;
  return `<div class="sched-row ${rest?"rest":""}"><span class="d">${r.day || r.week}</span><span class="lab">${r.label}</span></div>`;
}

function overview(o){
  const rows = [
    ["Duration", o.duration], ["Frequency", o.frequency], ["Session", o.sessionLength], ["Equipment", o.equipment],
  ];
  return `
    <div class="overview-grid">
      ${rows.map(([k,val]) => `<div class="ov-card"><div class="k">${k}</div><div class="v" style="font-size:${val.length>22?"14px":"20px"};letter-spacing:${val.length>22?"0":"-.05em"};text-transform:${val.length>22?"none":"uppercase"}">${val}</div></div>`).join("")}
    </div>
    <div class="ov-card" style="margin-bottom:6px"><div class="k">Focus areas</div><div class="chips">${o.focus.map(f => `<span class="chip">${f}</span>`).join("")}</div></div>`;
}
function why(items){
  return `<div class="why-row">${items.map(w => `<div class="why-card">${icon(w.icon)}<span>${w.label}</span></div>`).join("")}</div>`;
}
function dayCard(d){
  return `
    <article class="day-card">
      <div class="d-head"><strong>${d.title}</strong><em>${d.subtitle}</em></div>
      ${d.warmup ? `<div><div class="d-sub">Warm-up (10 min)</div><div class="d-warm">${d.warmup}</div></div>` : ""}
      ${d.blocks.map(b => `
        <div class="d-block"><h4>${b.name}</h4>
          ${b.items.map(i => `<div class="d-ex"><span>${i.name}</span><span class="dose">${i.dose}</span></div>`).join("")}
        </div>`).join("")}
      ${d.focus ? `<div class="d-focus"><b>Focus:</b> ${d.focus}</div>` : ""}
      ${d.cooldown ? `<div class="d-cool">Cool-down · ${d.cooldown}</div>` : ""}
    </article>`;
}
function stepCard(s){
  return `<div class="step"><div class="wk">${s.weeks}</div><h4>${s.title}</h4><ul>${s.points.map(p => `<li>${p}</li>`).join("")}</ul></div>`;
}
