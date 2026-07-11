// ============================================================================
//  Shared node-canvas: absolutely-positioned draggable ".node" cards with
//  glowing SVG bezier wires between them. Used by Home, Builder and the Coach.
//
//  Each .node carries its default desktop position via data-x / data-y / data-w.
//  On screens below `breakpoint` the canvas collapses to the normal stacked
//  flow (no absolute positioning, no wires) so mobile stays usable.
//
//  initNodeCanvas(canvasEl, { wires, breakpoint, onNav }) -> { redraw, destroy }
//    wires: array of [fromNodeId, toNodeId, cssColor]
// ============================================================================
export function initNodeCanvas(canvas, { wires = [], breakpoint = 1000 } = {}){
  if(!canvas) return { redraw(){}, destroy(){} };
  const svg = canvas.querySelector(".wires");
  let applied = false;
  const wide = () => window.matchMedia(`(min-width:${breakpoint}px)`).matches;
  const el = id => canvas.querySelector("#" + CSS.escape(id));

  function anchors(a, b){
    const acx = a.offsetLeft + a.offsetWidth/2, acy = a.offsetTop + a.offsetHeight/2;
    const bcx = b.offsetLeft + b.offsetWidth/2, bcy = b.offsetTop + b.offsetHeight/2;
    if(Math.abs(bcx - acx) >= Math.abs(bcy - acy)){
      return bcx > acx ? [{x:a.offsetLeft+a.offsetWidth,y:acy},{x:b.offsetLeft,y:bcy}, true]
                       : [{x:a.offsetLeft,y:acy},{x:b.offsetLeft+b.offsetWidth,y:bcy}, true];
    }
    return bcy > acy ? [{x:acx,y:a.offsetTop+a.offsetHeight},{x:bcx,y:b.offsetTop}, false]
                     : [{x:acx,y:a.offsetTop},{x:bcx,y:b.offsetTop+b.offsetHeight}, false];
  }
  function redraw(){
    if(!svg || !applied) return;
    svg.setAttribute("width", canvas.clientWidth);
    svg.setAttribute("height", canvas.clientHeight);
    let out = "";
    for(const [from, to, col] of (typeof wires === "function" ? wires() : wires)){
      const a = el(from), b = el(to); if(!a || !b) continue;
      const [p1, p2, horiz] = anchors(a, b);
      const d = Math.max(45, (horiz ? Math.abs(p2.x-p1.x) : Math.abs(p2.y-p1.y))/2);
      const path = horiz ? `M ${p1.x} ${p1.y} C ${p1.x+d} ${p1.y}, ${p2.x-d} ${p2.y}, ${p2.x} ${p2.y}`
                         : `M ${p1.x} ${p1.y} C ${p1.x} ${p1.y+d}, ${p2.x} ${p2.y-d}, ${p2.x} ${p2.y}`;
      out += `<path d="${path}" fill="none" stroke="${col}" stroke-width="2" stroke-opacity=".55"/>`
          +  `<circle cx="${p1.x}" cy="${p1.y}" r="3.5" fill="${col}"/><circle cx="${p2.x}" cy="${p2.y}" r="3.5" fill="${col}"/>`;
    }
    svg.innerHTML = out;
  }
  function enableDrag(node){
    const head = node.querySelector(".node-head"); if(!head || head.dataset.drag) return;
    head.dataset.drag = "1";
    head.addEventListener("pointerdown", e => {
      if(!wide() || e.target.closest("a,button")) return;
      e.preventDefault();
      const sx = e.clientX, sy = e.clientY, ox = node.offsetLeft, oy = node.offsetTop;
      node.classList.add("dragging"); head.setPointerCapture(e.pointerId);
      const move = ev => {
        let nx = Math.max(0, Math.min(ox + (ev.clientX-sx), canvas.clientWidth  - node.offsetWidth));
        let ny = Math.max(0, Math.min(oy + (ev.clientY-sy), canvas.clientHeight - node.offsetHeight));
        node.style.left = nx + "px"; node.style.top = ny + "px"; redraw();
      };
      const up = () => { node.classList.remove("dragging"); head.removeEventListener("pointermove", move); head.removeEventListener("pointerup", up); };
      head.addEventListener("pointermove", move); head.addEventListener("pointerup", up);
    });
  }
  function apply(){
    // position only nodes that haven't been placed yet (preserves dragged ones + new nodes)
    canvas.querySelectorAll(".node").forEach(n => {
      if(!n.style.left && n.dataset.x) n.style.left = n.dataset.x + "px";
      if(!n.style.top  && n.dataset.y) n.style.top  = n.dataset.y + "px";
      if(!n.style.width && n.dataset.w) n.style.width = n.dataset.w + "px";
      enableDrag(n);
    });
  }
  function reset(){
    canvas.querySelectorAll(".node").forEach(n => { n.style.left = n.style.top = n.style.width = ""; });
    if(svg) svg.innerHTML = "";
  }
  function refresh(){
    if(wide()){ apply(); applied = true; redraw(); }
    else { if(applied){ reset(); applied = false; } }
  }
  const onResize = () => refresh();
  window.addEventListener("resize", onResize);
  refresh();                        // draw now (layout is available post-insertion)
  requestAnimationFrame(refresh);   // and again after the frame settles
  return { redraw, refresh, destroy(){ window.removeEventListener("resize", onResize); reset(); } };
}
