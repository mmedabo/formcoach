const KEY = "bv_training_hub_v1";
const todayISO = () => new Date().toISOString().slice(0,10);

function read(){ try{ const s = JSON.parse(localStorage.getItem(KEY)) || {}; return typeof s==="object"&&s ? s : {}; }catch(e){ return {}; } }
function write(s){ try{ localStorage.setItem(KEY, JSON.stringify(s)); return true; }catch(e){ return false; } }

export function renderTrack(app, { sport }){
  app.className = "page";
  app.innerHTML = `
    <div class="page-hero">
      <div><p class="eyebrow"><span class="dot"></span> Progress</p><h2>Track</h2>
      <p>Log your sessions and keep an eye on your training load. Everything is saved privately in this browser.</p></div>
      <span class="route-chip">${sport.name}</span>
    </div>
    <div class="two-col">
      <div class="panel">
        <div class="panel-title"><h3>Log a session</h3><span class="micro" id="storageStatus"></span></div>
        <form id="logForm">
          <div class="field-grid">
            <div class="field"><label for="logDate">Date</label><input type="date" id="logDate" value="${todayISO()}"></div>
            <div class="field"><label for="logSport">Sport</label><input type="text" id="logSport" value="${sport.name}"></div>
          </div>
          <div class="field-grid">
            <div class="field"><label for="logType">Session</label>
              <select id="logType"><option>Speed & Agility</option><option>Strength & Vertical</option><option>Combined</option><option>Form Coach</option><option>Skills / play</option><option>Rest</option></select></div>
            <div class="field"><label for="logDuration">Duration (min)</label><input type="number" id="logDuration" min="0" placeholder="e.g. 60"></div>
          </div>
          <div class="field"><label for="logRating">How did it feel? <span id="ratingLabel">3</span>/5</label><input type="range" id="logRating" min="1" max="5" value="3"></div>
          <div class="field"><label for="logNotes">Notes</label><textarea id="logNotes" placeholder="What went well, what to improve…"></textarea></div>
          <div class="save-row"><button type="submit" class="button">Save entry</button><button type="button" class="button secondary small" id="exportEntries">Export data</button></div>
          <p class="micro" id="saveConfirm"></p>
        </form>
      </div>
      <div>
        <div class="summary-stack" id="summary"></div>
        <div class="panel" style="margin-top:14px"><div class="panel-title"><h3>Recent</h3></div><div id="recent"></div></div>
      </div>
    </div>`;

  const $ = id => app.querySelector("#"+id);
  $("storageStatus").textContent = "Saved in this browser";
  $("logRating").addEventListener("input", e => $("ratingLabel").textContent = e.target.value);

  $("logForm").addEventListener("submit", e => {
    e.preventDefault();
    const s = read();
    if(!Array.isArray(s.entries)) s.entries = [];
    s.entries.push({
      date: $("logDate").value || todayISO(), sport: $("logSport").value.trim(), type: $("logType").value,
      duration: Number($("logDuration").value || 0), rating: Number($("logRating").value), notes: $("logNotes").value.trim(), savedAt: new Date().toISOString(),
    });
    if(write(s)){ $("saveConfirm").textContent = `Saved ${$("logDate").value}.`; renderSummary(app); renderRecent(app); }
  });
  $("exportEntries").addEventListener("click", ()=>{
    const data = JSON.stringify(read(), null, 2);
    const url = URL.createObjectURL(new Blob([data], {type:"application/json"}));
    const a = document.createElement("a"); a.href = url; a.download = `training-data-${todayISO()}.json`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  });
  renderSummary(app); renderRecent(app);
}

function renderSummary(app){
  const s = read(); const entries = s.entries || []; const coach = s.coachSessions || [];
  const sessions = entries.filter(e => e.type !== "Rest").length;
  const minutes = entries.reduce((n,e)=> n + Number(e.duration||0), 0);
  const cards = [["Logged sessions", sessions], ["Training minutes", minutes], ["Coach sessions", coach.length]];
  app.querySelector("#summary").innerHTML = cards.map(([k,v]) => `<div class="summary-card"><span class="micro">${k}</span><b>${v}</b></div>`).join("");
}
function renderRecent(app){
  const s = read();
  const all = [...(s.entries||[]).map(e=>({d:e.date, t:`${e.type} · ${e.sport}`, m:e.duration})),
    ...(s.coachSessions||[]).map(c=>({d:c.date, t:`Coach · ${c.exercise}`, m:c.reps+" reps"}))]
    .sort((a,b)=> (b.d||"").localeCompare(a.d||"")).slice(0,8);
  const el = app.querySelector("#recent");
  el.innerHTML = all.length ? all.map(r => `<div class="d-ex"><span>${r.t}</span><span class="dose">${r.d} · ${r.m||""}</span></div>`).join("")
    : `<div class="empty-state">No sessions yet — log one on the left.</div>`;
}
