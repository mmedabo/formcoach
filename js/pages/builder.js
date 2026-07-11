import { initNodeCanvas } from "../nodeCanvas.js";

// Custom workout-plan builder — drag & wire "block" nodes into a plan.
const KEY = "bv_custom_plans";
let blocks = [], ctl = null, seq = 0, suggestions = [];

const toast = m => { const t = document.getElementById("toast"); if(!t) return; t.textContent = m; t.classList.add("show"); setTimeout(()=>t.classList.remove("show"), 2100); };
const esc = s => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const readPlans = () => { try{ const a = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(a) ? a : []; }catch(e){ return []; } };
const writePlans = a => { try{ localStorage.setItem(KEY, JSON.stringify(a)); return true; }catch(e){ return false; } };

function harvest(sport){
  const set = new Set(["Squat","Push-up","Reverse lunge","Glute bridge","Spike (attack)","Set","Receive (pass)"]);
  (sport.programs || []).forEach(p => (p.days || []).forEach(d => (d.blocks || []).forEach(b => b.items.forEach(i => set.add(i.name)))));
  return [...set].sort();
}
function newBlock(title){ const i = blocks.length; return { id: "b" + (++seq), title: title || "Block " + (i+1), items: [], x: 15 + (i%3)*360, y: 15 + Math.floor(i/3)*300 }; }
const nodeId = b => "blk_" + b.id;
const wires = () => blocks.slice(1).map((b,i) => [nodeId(blocks[i]), nodeId(b), "#5c8cff"]);

export function renderBuilder(app, { sport }){
  suggestions = harvest(sport);
  if(!blocks.length) blocks = [ newBlock("Warm-up"), newBlock("Main block") ];
  app.className = "page";
  app.innerHTML = `
    <div class="page-hero">
      <div><p class="eyebrow"><span class="dot"></span> ${sport.name} · Build</p><h2>Plan Builder</h2>
      <p>Assemble a custom workout as connected blocks. Add exercises, drag the nodes to arrange your flow, then save or export it.</p></div>
      <span class="route-chip">Custom plan</span>
    </div>
    <div class="wf-bar builder-bar">
      <input id="planName" class="plan-name" placeholder="Plan name (e.g. My Jump Block)">
      <button class="coach-btn" id="addBlock">+ Add block</button>
      <button class="coach-btn primary" id="savePlan">Save</button>
      <select id="loadPlan" class="plan-select"><option value="">Load saved plan…</option></select>
      <button class="coach-btn" id="delPlan">Delete</button>
      <button class="coach-btn" id="exportPlan">Export</button>
      <button class="coach-btn" id="newPlan">New</button>
    </div>
    <p class="coach-note canvas-hint">Drag any block by its header · blocks auto-wire top to bottom of your plan.</p>
    <div class="node-canvas build-canvas" id="buildCanvas"><svg class="wires" id="wires"></svg></div>
    <datalist id="exList">${suggestions.map(s => `<option value="${esc(s)}">`).join("")}</datalist>`;

  refreshSavedList(app);
  app.querySelector("#addBlock").addEventListener("click", () => { syncPositions(app); blocks.push(newBlock()); renderCanvas(app); });
  app.querySelector("#savePlan").addEventListener("click", () => savePlan(app));
  app.querySelector("#loadPlan").addEventListener("change", e => loadPlan(app, e.target.value));
  app.querySelector("#delPlan").addEventListener("click", () => deletePlan(app));
  app.querySelector("#exportPlan").addEventListener("click", () => exportPlan(app));
  app.querySelector("#newPlan").addEventListener("click", () => { blocks = [ newBlock("Warm-up"), newBlock("Main block") ]; app.querySelector("#planName").value = ""; renderCanvas(app); });
  bindDelegation(app);
  renderCanvas(app);
  return () => { syncPositions(app); if(ctl) ctl.destroy(); };
}

function renderCanvas(app){
  const canvas = app.querySelector("#buildCanvas");
  canvas.querySelectorAll(".node").forEach(n => n.remove());
  blocks.forEach((b,i) => canvas.insertAdjacentHTML("beforeend", blockNode(b,i)));
  sizeCanvas(canvas);
  if(ctl) ctl.destroy();
  ctl = initNodeCanvas(canvas, { wires });
}
function sizeCanvas(canvas){
  if(window.matchMedia("(min-width:1000px)").matches){
    const rows = Math.ceil(blocks.length / 3);
    canvas.style.height = Math.max(420, 40 + rows * 300) + "px";
  } else canvas.style.height = "";
}
function blockNode(b, i){
  return `
    <div class="node build-node" id="${nodeId(b)}" data-x="${b.x}" data-y="${b.y}" data-w="330">
      <div class="node-head"><span class="pd b"></span> Block <span class="node-tag">${i+1}</span>
        <button class="node-x" data-remove="${b.id}" title="Remove block">×</button></div>
      <input class="blk-title" data-title="${b.id}" value="${esc(b.title)}" placeholder="Block name">
      <div class="blk-items" data-items="${b.id}">${b.items.map((it,ix) => itemRow(b.id, ix, it)).join("")}</div>
      <div class="blk-add">
        <input list="exList" class="blk-name" placeholder="Exercise">
        <input class="blk-dose" placeholder="Sets × reps">
        <button class="coach-btn small" data-add="${b.id}">Add</button>
      </div>
    </div>`;
}
const itemRow = (bid, ix, it) => `<div class="blk-item"><span>${esc(it.name)}</span><span class="dose">${esc(it.dose)}</span><button class="node-x" data-del="${bid}:${ix}">×</button></div>`;

// One delegated listener set handles all block controls, including nodes added later.
function bindDelegation(app){
  const canvas = app.querySelector("#buildCanvas");
  canvas.addEventListener("input", e => {
    if(e.target.matches("[data-title]")){ const b = blocks.find(x => x.id === e.target.dataset.title); if(b) b.title = e.target.value; }
  });
  canvas.addEventListener("click", e => {
    const add = e.target.closest("[data-add]"), del = e.target.closest("[data-del]"), rem = e.target.closest("[data-remove]");
    if(add){
      const node = add.closest(".node"), name = node.querySelector(".blk-name").value.trim();
      if(!name){ toast("Type an exercise name"); return; }
      const b = blocks.find(x => x.id === add.dataset.add); if(!b) return;
      b.items.push({ name, dose: node.querySelector(".blk-dose").value.trim() });
      node.querySelector(".blk-name").value = ""; node.querySelector(".blk-dose").value = "";
      node.querySelector(`[data-items="${b.id}"]`).innerHTML = b.items.map((it,ix) => itemRow(b.id, ix, it)).join("");
      ctl && ctl.redraw();
    } else if(del){
      const [bid, ix] = del.dataset.del.split(":"); const b = blocks.find(x => x.id === bid); if(!b) return;
      b.items.splice(Number(ix), 1);
      canvas.querySelector(`[data-items="${bid}"]`).innerHTML = b.items.map((it,i) => itemRow(bid, i, it)).join("");
      ctl && ctl.redraw();
    } else if(rem){
      if(blocks.length <= 1){ toast("Keep at least one block"); return; }
      syncPositions(app); blocks = blocks.filter(x => x.id !== rem.dataset.remove); renderCanvas(app);
    }
  });
}
function syncPositions(app){
  blocks.forEach(b => { const n = app.querySelector("#" + nodeId(b)); if(n && n.style.left){ b.x = parseInt(n.style.left) || b.x; b.y = parseInt(n.style.top) || b.y; } });
}

function currentPlan(app){ syncPositions(app); return { name: app.querySelector("#planName").value.trim() || "Untitled plan", blocks: JSON.parse(JSON.stringify(blocks)) }; }
function savePlan(app){
  const plan = currentPlan(app); plan.id = "p" + Date.now(); plan.savedAt = new Date().toISOString();
  const plans = readPlans(); const existing = plans.findIndex(p => p.name.toLowerCase() === plan.name.toLowerCase());
  if(existing >= 0) plans[existing] = plan; else plans.push(plan);
  if(writePlans(plans)){ toast(`Saved “${plan.name}”`); refreshSavedList(app, plan.name); } else toast("Save failed — storage full");
}
function refreshSavedList(app, selectName){
  const sel = app.querySelector("#loadPlan"); const plans = readPlans();
  sel.innerHTML = `<option value="">Load saved plan…</option>` + plans.map(p => `<option value="${esc(p.name)}" ${p.name===selectName?"selected":""}>${esc(p.name)} (${p.blocks.length} blocks)</option>`).join("");
}
function loadPlan(app, name){
  if(!name) return;
  const plan = readPlans().find(p => p.name === name); if(!plan) return;
  blocks = plan.blocks.map(b => ({ ...b, id: b.id || ("b"+(++seq)) }));
  seq = Math.max(seq, blocks.length);
  app.querySelector("#planName").value = plan.name;
  renderCanvas(app); toast(`Loaded “${plan.name}”`);
}
function deletePlan(app){
  const name = app.querySelector("#loadPlan").value; if(!name){ toast("Pick a saved plan first"); return; }
  if(!confirm(`Delete plan “${name}”?`)) return;
  writePlans(readPlans().filter(p => p.name !== name)); refreshSavedList(app); toast("Plan deleted");
}
function exportPlan(app){
  const plan = currentPlan(app);
  const url = URL.createObjectURL(new Blob([JSON.stringify(plan, null, 2)], {type:"application/json"}));
  const a = document.createElement("a"); a.href = url; a.download = `workout-plan-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); toast("Plan exported");
}
