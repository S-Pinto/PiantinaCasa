import * as THREE from 'three';
import { $, CX, CY, S, byId, clamp, clone, isRectPts, pointInPoly, polyArea, segDist, st } from './core.js';
import { el, typing } from './dom.js';
import { camera, canvas } from './scene.js';
import { FURN } from './furniture.js';
import { isH, normalize, uid, wallT } from './model.js';
import { labelWpx, rebuild } from './build.js';
import { controls, hintEl, setHint, setMode, updateLow } from './views.js';
import { refreshProps } from './props.js';
import { setCompare } from './variants.js';
import { scheduleSave } from './storage.js';
import { RUNK, SYS, fmtM, layerOn, placeSys, runKind, runLen, setLayer, sysHit, sysType, wallSnap } from './impianti.js';

/* =========================================================================
   EDITOR
   ========================================================================= */
const opt = { snap:true, link:true };
const GRID = 2.5;                                  // 10 cm
const pointers = new Set();

const NAMES = { wallE:'Muro esterno', wallI:'Muro interno', door:'Porta', win:'Finestra', pf:'Porta-finestra', open:'Apertura',
  column:'Colonna', floor:'Pavimento', rail:'Parapetto', glazed:'Vetrata', label:'Nome stanza' };
const TIPS = {
  wallE:'Trascina sulla pianta per disegnare un muro esterno.',
  wallI:'Trascina sulla pianta per disegnare un muro interno.',
  door:'Clicca su un muro per inserire una porta. Il lato su cui clicchi decide verso dove si apre.',
  win:'Clicca su un muro per inserire una finestra.',
  pf:'Clicca su un muro per inserire una porta-finestra.',
  open:'Clicca su un muro per aprire un varco senza porta.',
  column:'Clicca per posizionare una colonna.',
  floor:'Trascina per disegnare un pavimento rettangolare.',
  rail:'Trascina per disegnare un parapetto.',
  glazed:'Trascina per disegnare una vetrata.',
  fence:'Trascina per disegnare una ringhiera.',
  cut:'Tocca un parapetto, una vetrata o una ringhiera per dividerlo in due pezzi. Poi scegli Seleziona per cambiare un pezzo.',
  furn:'Scegli un arredo dall’elenco e tocca la pianta per metterlo.',
  label:'Clicca per aggiungere il nome di una stanza.',
  sys:'Scegli un elemento e tocca la pianta. Quelli a parete si agganciano al muro più vicino, dal lato dove tocchi.',
  run:'Scegli il tipo di linea e trascina sulla pianta per tracciare un tratto. Puoi tracciarne quanti vuoi, uno dopo l’altro.'
};


/* ---------- puntatore sulla pianta ---------- */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), gplane = new THREE.Plane(new THREE.Vector3(0,1,0),0), hitV = new THREE.Vector3();
function ground(e){
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left)/r.width)*2 - 1, -((e.clientY - r.top)/r.height)*2 + 1);
  ray.setFromCamera(ndc, camera);
  if (!ray.ray.intersectPlane(gplane, hitV)) return null;
  return [hitV.x/S + CX, hitV.z/S + CY];
}
function tolPx(){
  const d = Math.max(2, camera.position.distanceTo(controls.target));
  const wpp = 2*d*Math.tan(camera.fov*Math.PI/360) / Math.max(1, canvas.clientHeight);
  return clamp(10*wpp/S, 2, 60);
}

/* ---------- aggancio ---------- */
function guides(ex){
  const xs = [], ys = [];
  st.plan.walls.forEach(w => { if (w.id === ex) return; xs.push(w.x1,w.x2); ys.push(w.y1,w.y2); });
  st.plan.columns.forEach(c => { if (c.id === ex) return; xs.push(c.x0,c.x1); ys.push(c.y0,c.y1); });
  st.plan.floors.forEach(f => { if (f.id === ex) return; f.pts.forEach(p => { xs.push(p[0]); ys.push(p[1]); }); });
  st.plan.runs.forEach(r => { if (r.id === ex || !layerOn[RUNK[r.k].l]) return; r.pts.forEach(p => { xs.push(p[0]); ys.push(p[1]); }); });
  st.plan.sys.forEach(o => { if (o.id === ex || !layerOn[SYS[o.t].l]) return; xs.push(o.x); ys.push(o.y); });
  return { xs:xs, ys:ys };
}
function snap1(v, arr, tol){
  let b = null, bd = tol;
  for (const a of arr){ const d = Math.abs(a - v); if (d < bd){ bd = d; b = a; } }
  if (b !== null) return b;
  return opt.snap ? Math.round(v/GRID)*GRID : v;
}
function snapDelta(vals, d, arr, tol){
  let best = null, bd = tol;
  for (const v of vals) for (const a of arr){
    const dd = a - (v + d);
    if (Math.abs(dd) < bd){ bd = Math.abs(dd); best = d + dd; }
  }
  if (best !== null) return best;
  if (opt.snap) return Math.round((vals[0] + d)/GRID)*GRID - vals[0];
  return d;
}

/* ---------- selezione ---------- */
function selItem(){
  if (!st.sel) return null;
  if (st.sel.type === 'op'){
    const w = byId(st.plan.walls, st.sel.id); const o = w && w.ops[st.sel.i];
    return o ? { type:'op', wall:w, op:o, obj:o } : null;
  }
  const arr = { wall:st.plan.walls, column:st.plan.columns, floor:st.plan.floors, rail:st.plan.rails, label:st.plan.labels, furn:st.plan.furniture, sys:st.plan.sys, run:st.plan.runs }[st.sel.type];
  const obj = arr && byId(arr, st.sel.id);
  return obj ? { type:st.sel.type, obj:obj } : null;
}
function setSel(h){
  if (!st.sel || !h || st.sel.id !== h.id || st.sel.type !== h.type) st.finishSide = 'both';
  st.sel = h ? { type:h.type, id:h.id, i:h.i } : null; st.overlayDirty = true; refreshProps();
}
function validateSel(){ if (st.sel && !selItem()) st.sel = null; }

function hitTest(px, py){
  const tol = tolPx();
  const sh = sysHit(px, py, tol); if (sh) return sh;
  for (const w of st.plan.walls){
    const t = wallT(w), h = isH(w), c = h ? w.y1 : w.x1;
    for (let i=0; i<w.ops.length; i++){
      const o = w.ops[i], al = h ? px : py, cr = h ? py : px;
      if (Math.abs(al - o.p) <= o.w/2 + tol*.3 && Math.abs(cr - c) <= t/2 + tol*.6) return { type:'op', id:w.id, i:i };
    }
  }
  for (const c of st.plan.columns)
    if (px >= c.x0 - tol*.4 && px <= c.x1 + tol*.4 && py >= c.y0 - tol*.4 && py <= c.y1 + tol*.4) return { type:'column', id:c.id };
  for (let i = st.plan.furniture.length - 1; i >= 0; i--){
    const f = st.plan.furniture[i], th = f.rot * Math.PI / 180, dx = px - f.x, dy = py - f.y;
    const lx = dx * Math.cos(th) + dy * Math.sin(th), ly = -dx * Math.sin(th) + dy * Math.cos(th);
    if (Math.abs(lx) <= f.w / S / 2 + tol*.3 && Math.abs(ly) <= f.d / S / 2 + tol*.3) return { type:'furn', id:f.id };
  }
  for (const l of st.plan.labels){
    const wp = labelWpx(l), hp = wp/4;
    if (Math.abs(px - l.x) <= wp/2 && Math.abs(py - l.y) <= hp/2) return { type:'label', id:l.id };
  }
  let best = null, bd = Infinity;
  for (const w of st.plan.walls){
    const d = segDist(px,py,w.x1,w.y1,w.x2,w.y2);
    if (d <= wallT(w)/2 + tol*.6 && d < bd){ bd = d; best = { type:'wall', id:w.id }; }
  }
  if (best) return best;
  for (const r of st.plan.rails)
    for (let i=0; i<r.pts.length-1; i++){
      const a = r.pts[i], b = r.pts[i+1];
      if (segDist(px,py,a[0],a[1],b[0],b[1]) <= 4 + tol*.6) return { type:'rail', id:r.id };
    }
  let fb = null, fa = Infinity;
  for (const f of st.plan.floors) if (pointInPoly(px,py,f.pts)){ const a = polyArea(f.pts); if (a < fa){ fa = a; fb = { type:'floor', id:f.id }; } }
  return fb;
}

function getHandles(){
  const it = selItem(); if (!it) return [];
  if (it.type === 'wall'){ const w = it.obj; return [{ k:'a', x:w.x1, y:w.y1 }, { k:'b', x:w.x2, y:w.y2 }]; }
  if (it.type === 'op'){
    const w = it.wall, o = it.op, h = isH(w), c = h ? w.y1 : w.x1, lo = o.p - o.w/2, hi = o.p + o.w/2;
    return [{ k:'lo', x:h ? lo : c, y:h ? c : lo }, { k:'hi', x:h ? hi : c, y:h ? c : hi }];
  }
  if (it.type === 'column'){ const c = it.obj; return [{ k:'tl', x:c.x0, y:c.y0 }, { k:'br', x:c.x1, y:c.y1 }]; }
  if (it.type === 'furn'){
    const f = it.obj, th = f.rot * Math.PI / 180, off = f.d / S / 2 + 7;
    return [{ k:'rot', x:f.x - Math.sin(th) * off, y:f.y + Math.cos(th) * off }];
  }
  if (it.type === 'floor' || it.type === 'rail' || it.type === 'run') return it.obj.pts.map((p,i) => ({ k:i, x:p[0], y:p[1] }));
  return [];
}

/* ---------- storia (annulla / ripeti) ---------- */
const undoS = [], redoS = [];
function histBtns(){ $('undo').disabled = !undoS.length; $('redo').disabled = !redoS.length; }
function pushUndo(before){ undoS.push(before); if (undoS.length > 150) undoS.shift(); redoS.length = 0; histBtns(); scheduleSave(); }
function afterHistory(){ rebuild(); validateSel(); st.overlayDirty = true; refreshProps(); histBtns(); scheduleSave(); }
function undo(){ if (!undoS.length) return; redoS.push(JSON.stringify(st.plan)); st.plan = normalize(JSON.parse(undoS.pop())); afterHistory(); }
function redo(){ if (!redoS.length) return; undoS.push(JSON.stringify(st.plan)); st.plan = normalize(JSON.parse(redoS.pop())); afterHistory(); }
function mutate(fn){
  const before = JSON.stringify(st.plan);
  fn();
  if (JSON.stringify(st.plan) === before) return;
  pushUndo(before); rebuild(); validateSel(); st.overlayDirty = true; refreshProps();
}
$('undo').addEventListener('click', undo);
$('redo').addEventListener('click', redo);

function flash(msg){ hintEl.textContent = msg; clearTimeout(flash.t); flash.t = setTimeout(setHint, 2400); }

/* ---------- modifiche sugli elementi ---------- */
function shiftItem(type, obj, dx, dy){
  if (type === 'wall'){
    const h = isH(obj);
    obj.x1 += dx; obj.x2 += dx; obj.y1 += dy; obj.y2 += dy;
    obj.ops.forEach(o => { o.p += h ? dx : dy; });
  } else if (type === 'op'){ /* gestito a parte */ }
  else if (type === 'column'){ obj.x0 += dx; obj.x1 += dx; obj.y0 += dy; obj.y1 += dy; }
  else if (type === 'floor' || type === 'rail' || type === 'run'){ obj.pts.forEach(p => { p[0] += dx; p[1] += dy; }); }
  else if (type === 'label' || type === 'furn' || type === 'sys'){ obj.x += dx; obj.y += dy; }
}
function nudge(dx, dy){
  const it = selItem(); if (!it) return;
  mutate(() => {
    if (it.type === 'op'){ const h = isH(it.wall); const a = h ? it.wall.x1 : it.wall.y1, b = h ? it.wall.x2 : it.wall.y2;
      it.op.p = clamp(it.op.p + (h ? dx : dy), a + it.op.w/2, b - it.op.w/2); }
    else shiftItem(it.type, it.obj, dx, dy);
    if (it.type === 'sys' && SYS[it.obj.t].m === 'w'){
      const ws = wallSnap(it.obj.x, it.obj.y, 2); if (ws){ it.obj.x = ws.x; it.obj.y = ws.y; it.obj.rot = ws.rot; }
    }
  });
}
function deleteSel(){
  const it = selItem(); if (!it) return;
  mutate(() => {
    if (it.type === 'op') it.wall.ops.splice(st.sel.i, 1);
    else {
      const key = { wall:'walls', column:'columns', floor:'floors', rail:'rails', label:'labels', furn:'furniture', sys:'sys', run:'runs' }[it.type];
      st.plan[key] = st.plan[key].filter(x => x.id !== it.obj.id);
    }
  });
  st.sel = null; st.overlayDirty = true; refreshProps();
}
function duplicateSel(){
  const it = selItem(); if (!it || it.type === 'op') return;
  let nid = null;
  mutate(() => {
    const key = { wall:'walls', column:'columns', floor:'floors', rail:'rails', label:'labels', furn:'furniture', sys:'sys', run:'runs' }[it.type];
    const c = clone(it.obj); c.id = uid(); nid = c.id;
    if (it.type === 'sys' && SYS[c.t].m === 'w'){ const v = c.rot === 90 || c.rot === 270; shiftItem('sys', c, v ? 0 : 5, v ? 5 : 0); }
    else shiftItem(it.type, c, 10, 10);
    st.plan[key].push(c);
  });
  if (nid){ st.sel = { type:it.type, id:nid }; st.overlayDirty = true; refreshProps(); }
}

function attachedFor(w){
  const list = []; if (!opt.link) return list;
  const h = isH(w);
  st.plan.walls.forEach(b => {
    if (b.id === w.id || isH(b) === h) return;
    if (h){
      if (b.x1 < w.x1 - 1.5 || b.x1 > w.x2 + 1.5) return;
      if (Math.abs(b.y1 - w.y1) <= 1.5) list.push({ id:b.id, key:'y1', orig:b.y1 });
      if (Math.abs(b.y2 - w.y1) <= 1.5) list.push({ id:b.id, key:'y2', orig:b.y2 });
    } else {
      if (b.y1 < w.y1 - 1.5 || b.y1 > w.y2 + 1.5) return;
      if (Math.abs(b.x1 - w.x1) <= 1.5) list.push({ id:b.id, key:'x1', orig:b.x1 });
      if (Math.abs(b.x2 - w.x1) <= 1.5) list.push({ id:b.id, key:'x2', orig:b.x2 });
    }
  });
  return list;
}

/* ---------- interazione col puntatore ---------- */
function setTool(t){
  st.tool = t; if (t !== 'select') st.sel = null;
  if (t === 'sys') setLayer(SYS[sysType].l, true);
  if (t === 'run') setLayer(RUNK[runKind].l, true);
  st.drag = null; st.draft = null;
  document.querySelectorAll('#dock button[data-tool]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === t)));
  canvas.style.cursor = t === 'select' ? 'default' : 'crosshair';
  st.overlayDirty = true; refreshProps();
}
const ICONS = {
  select:'<svg class="i" viewBox="0 0 24 24"><path d="M5 3l14 8-6.2 2L16.5 20l-3 1.4-3.6-6.8L5 19z" fill="currentColor" stroke="none"/></svg>',
  wallE:'<svg class="i" viewBox="0 0 24 24"><rect x="3" y="8.5" width="18" height="7" fill="currentColor" stroke="none"/></svg>',
  wallI:'<svg class="i" viewBox="0 0 24 24"><rect x="3" y="10.8" width="18" height="2.6" fill="currentColor" stroke="none"/></svg>',
  door:'<svg class="i" viewBox="0 0 24 24"><path d="M3 20h4M17 20h4M7 20V5a15 15 0 0 1 10 15"/></svg>',
  win:'<svg class="i" viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="1"/><path d="M12 5v14M4 12h16"/></svg>',
  pf:'<svg class="i" viewBox="0 0 24 24"><rect x="6" y="3" width="12" height="18" rx="1"/><path d="M12 3v18M3 21h18"/></svg>',
  open:'<svg class="i" viewBox="0 0 24 24"><path d="M4 7v10M20 7v10M4 12h3.5M16.5 12H20"/><path d="M10 12h4" stroke-dasharray="1 2.4"/></svg>',
  column:'<svg class="i" viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" fill="currentColor" stroke="none"/></svg>',
  floor:'<svg class="i" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 12h16M12 4v16" opacity=".55"/></svg>',
  rail:'<svg class="i" viewBox="0 0 24 24"><path d="M3 16h18M6 16v-6M12 16v-6M18 16v-6"/></svg>',
  glazed:'<svg class="i" viewBox="0 0 24 24"><path d="M3 6h18M3 19h18M3 6v13M21 6v13M9 6v13M15 6v13"/></svg>',
  fence:'<svg class="i" viewBox="0 0 24 24"><path d="M3 8h18M3 17h18M5 8v11M9.7 8v9M14.3 8v9M19 8v11"/></svg>',
  cut:'<svg class="i" viewBox="0 0 24 24"><circle cx="6" cy="6.5" r="2.5"/><circle cx="6" cy="17.5" r="2.5"/><path d="M8 8.2L20 18M8 15.8L20 6"/></svg>',
  furn:'<svg class="i" viewBox="0 0 24 24"><path d="M5 11V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3"/><path d="M3 13a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v4H3z"/><path d="M6 17v2M18 17v2"/></svg>',
  label:'<svg class="i" viewBox="0 0 24 24"><path d="M4 18l4.5-11L13 18M5.7 14h5.6M16 9.5h4M18 9.5V18"/></svg>',
  sys:'<svg class="i" viewBox="0 0 24 24"><path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/></svg>',
  run:'<svg class="i" viewBox="0 0 24 24"><path d="M4 18h7V7h9"/><circle cx="4" cy="18" r="1.8" fill="currentColor"/><circle cx="20" cy="7" r="1.8" fill="currentColor"/></svg>'
};
const TOOLDEF = [['select','Seleziona'],['|'],['wallE','Muro esterno'],['wallI','Muro interno'],['|'],
  ['door','Porta'],['win','Finestra'],['pf','Porta-finestra'],['open','Varco'],['|'],
  ['column','Colonna'],['floor','Pavimento'],['rail','Parapetto'],['glazed','Vetrata'],['fence','Ringhiera'],['cut','Dividi'],['furn','Arredi'],['label','Nome stanza'],['|'],['sys','Impianti'],['run','Tracciati']];
function buildDock(){
  const d = $('dock');
  TOOLDEF.forEach(t => {
    if (t[0] === '|'){ d.appendChild(el('div','sep')); return; }
    const b = el('button','tl'); b.type = 'button'; b.dataset.tool = t[0];
    b.setAttribute('aria-pressed', String(t[0] === 'select')); b.title = t[1];
    b.innerHTML = ICONS[t[0]]; b.appendChild(el('span', null, t[1]));
    b.addEventListener('click', () => setTool(t[0]));
    d.appendChild(b);
  });
}
$('optSnap').addEventListener('change', e => { opt.snap = e.target.checked; });
$('optLink').addEventListener('change', e => { opt.link = e.target.checked; });

function editorDown(e){
  if (!st.editing) return;
  pointers.add(e.pointerId);
  if (pointers.size > 1){ cancelInteraction(true); return; }
  if (e.pointerType === 'mouse' && (e.button !== 0 || e.shiftKey || e.ctrlKey || e.metaKey)) return;
  const p = ground(e); if (!p) return;
  try { canvas.setPointerCapture(e.pointerId); } catch(_){}
  canvas.focus();
  const before = JSON.stringify(st.plan), tol = tolPx();

  if (st.tool === 'select'){
    for (const h of getHandles()){
      if (Math.hypot(h.x - p[0], h.y - p[1]) <= tol*1.3){
        const it = selItem();
        st.drag = { kind:'handle', h:h, before:before, start:p, orig:clone(it.type === 'op' ? it.wall : it.obj),
                 g:guides(it.type === 'op' ? null : it.obj.id), rect:it.type === 'floor' && isRectPts(it.obj.pts) };
        return;
      }
    }
    const hit = hitTest(p[0], p[1]);
    if (!hit){ setSel(null); return; }
    setSel(hit);
    const it = selItem();
    const base = it.type === 'op' ? it.wall : it.obj;
    st.drag = { kind:'move', before:before, start:p, orig:clone(base), g:guides(it.type === 'op' ? null : base.id),
             attached:it.type === 'wall' ? attachedFor(it.obj) : [] };
    return;
  }
  if (st.tool === 'wallE' || st.tool === 'wallI' || st.tool === 'rail' || st.tool === 'glazed' || st.tool === 'fence' || st.tool === 'run'){
    const g = guides(null), q = [snap1(p[0], g.xs, tol*.8), snap1(p[1], g.ys, tol*.8)];
    st.draft = { kind:'line', x0:q[0], y0:q[1], x1:q[0], y1:q[1] };
    st.drag = { kind:'draw', before:before, g:g };
    st.overlayDirty = true; return;
  }
  if (st.tool === 'floor'){
    const g = guides(null), q = [snap1(p[0], g.xs, tol*.8), snap1(p[1], g.ys, tol*.8)];
    st.draft = { kind:'rect', x0:q[0], y0:q[1], x1:q[0], y1:q[1] };
    st.drag = { kind:'draw', before:before, g:g };
    st.overlayDirty = true; return;
  }
  st.drag = { kind:'place', p:p, cx:e.clientX, cy:e.clientY, moved:false, before:before };
}

function editorMove(e){
  if (!st.editing || !st.drag) return;
  if (st.drag.kind === 'place'){ if (Math.hypot(e.clientX - st.drag.cx, e.clientY - st.drag.cy) > 8) st.drag.moved = true; return; }
  const p = ground(e); if (!p) return;
  const tol = tolPx()*.8;

  if (st.drag.kind === 'draw'){
    const q = [snap1(p[0], st.drag.g.xs, tol), snap1(p[1], st.drag.g.ys, tol)];
    if (st.draft.kind === 'rect'){ st.draft.x1 = q[0]; st.draft.y1 = q[1]; }
    else if (Math.abs(q[0]-st.draft.x0) >= Math.abs(q[1]-st.draft.y0)){ st.draft.x1 = q[0]; st.draft.y1 = st.draft.y0; }
    else { st.draft.x1 = st.draft.x0; st.draft.y1 = q[1]; }
    st.overlayDirty = true; return;
  }
  const dx = p[0] - st.drag.start[0], dy = p[1] - st.drag.start[1], o = st.drag.orig, g = st.drag.g, it = selItem();
  if (!it) return;

  if (st.drag.kind === 'move'){
    if (it.type === 'wall'){
      const w = it.obj, h = isH(o);
      const ddx = snapDelta([o.x1,o.x2], dx, g.xs, tol), ddy = snapDelta([o.y1,o.y2], dy, g.ys, tol);
      w.x1 = o.x1 + ddx; w.x2 = o.x2 + ddx; w.y1 = o.y1 + ddy; w.y2 = o.y2 + ddy;
      w.ops.forEach((op,i) => { op.p = o.ops[i].p + (h ? ddx : ddy); });
      st.drag.attached.forEach(a => { const b = byId(st.plan.walls, a.id); if (b) b[a.key] = a.orig + (h ? ddy : ddx); });
    } else if (it.type === 'op'){
      const w = it.wall, h = isH(o), oo = o.ops[st.sel.i];
      const a = h ? o.x1 : o.y1, b = h ? o.x2 : o.y2;
      const d = snapDelta([oo.p], h ? dx : dy, [], tol);
      it.op.p = clamp(oo.p + d, a + oo.w/2, b - oo.w/2);
    } else if (it.type === 'column'){
      const c = it.obj, ddx = snapDelta([o.x0,o.x1], dx, g.xs, tol), ddy = snapDelta([o.y0,o.y1], dy, g.ys, tol);
      c.x0 = o.x0 + ddx; c.x1 = o.x1 + ddx; c.y0 = o.y0 + ddy; c.y1 = o.y1 + ddy;
    } else if (it.type === 'sys'){
      const ob = it.obj, nx = o.x + dx, ny = o.y + dy;
      const ws = SYS[ob.t].m === 'w' ? wallSnap(nx, ny, tol*1.8) : null;
      if (ws){ ob.x = ws.x; ob.y = ws.y; ob.rot = ws.rot; }
      else { ob.rot = o.rot; ob.x = o.x + snapDelta([o.x], dx, g.xs, tol); ob.y = o.y + snapDelta([o.y], dy, g.ys, tol); }
    } else if (it.type === 'floor' || it.type === 'rail' || it.type === 'run'){
      const ddx = snapDelta(o.pts.map(q => q[0]), dx, g.xs, tol), ddy = snapDelta(o.pts.map(q => q[1]), dy, g.ys, tol);
      it.obj.pts = o.pts.map(q => [q[0] + ddx, q[1] + ddy]);
    } else if (it.type === 'label' || it.type === 'furn'){
      it.obj.x = o.x + snapDelta([o.x], dx, [], tol); it.obj.y = o.y + snapDelta([o.y], dy, [], tol);
    }
  } else if (st.drag.kind === 'handle'){
    const k = st.drag.h.k, sx = snap1(p[0], g.xs, tol), sy = snap1(p[1], g.ys, tol);
    if (it.type === 'wall'){
      const w = it.obj;
      if (isH(o)){ if (k === 'a') w.x1 = Math.min(sx, o.x2 - 4); else w.x2 = Math.max(sx, o.x1 + 4); }
      else      { if (k === 'a') w.y1 = Math.min(sy, o.y2 - 4); else w.y2 = Math.max(sy, o.y1 + 4); }
    } else if (it.type === 'op'){
      const w = it.wall, h = isH(w), oo = o.ops[st.sel.i];
      const v = snap1(h ? p[0] : p[1], [], tol);
      let lo = oo.p - oo.w/2, hi = oo.p + oo.w/2;
      if (k === 'lo') lo = Math.min(v, hi - 8); else hi = Math.max(v, lo + 8);
      lo = Math.max(lo, h ? w.x1 : w.y1); hi = Math.min(hi, h ? w.x2 : w.y2);
      if (hi - lo >= 6){ it.op.p = (lo+hi)/2; it.op.w = hi - lo; }
    } else if (it.type === 'column'){
      const c = it.obj;
      if (k === 'tl'){ c.x0 = Math.min(sx, o.x1 - 2); c.y0 = Math.min(sy, o.y1 - 2); }
      else { c.x1 = Math.max(sx, o.x0 + 2); c.y1 = Math.max(sy, o.y0 + 2); }
    } else if (it.type === 'floor'){
      if (st.drag.rect){
        const opp = o.pts[(k + 2) % 4];
        const x0 = Math.min(sx, opp[0]), x1 = Math.max(sx, opp[0]), y0 = Math.min(sy, opp[1]), y1 = Math.max(sy, opp[1]);
        if (x1 - x0 >= 4 && y1 - y0 >= 4) it.obj.pts = [[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
      } else it.obj.pts[k] = [sx, sy];
    } else if (it.type === 'rail' || it.type === 'run'){
      it.obj.pts[k] = [sx, sy];
    } else if (it.type === 'furn'){
      const f = it.obj;
      let a = Math.atan2(p[1] - f.y, p[0] - f.x) * 180 / Math.PI - 90;
      a = Math.round(a / 15) * 15; f.rot = ((a % 360) + 360) % 360;
    }
  }
  st.needRebuild = true; st.overlayDirty = true;
}

function editorUp(e, cancelled){
  pointers.delete(e.pointerId);
  if (!st.editing || !st.drag) return;
  if (cancelled){ cancelInteraction(true); return; }
  const d = st.drag; st.drag = null;
  if (d.kind === 'draw') return finishDraw(d);
  if (d.kind === 'place'){ if (!d.moved) doPlace(d); return; }
  if (JSON.stringify(st.plan) !== d.before){
    const keep = st.sel; st.plan = normalize(st.plan); st.sel = keep; validateSel();
    pushUndo(d.before); rebuild();
  }
  st.overlayDirty = true; refreshProps();
}

function cancelInteraction(restore){
  if (st.drag && restore && st.drag.before && JSON.stringify(st.plan) !== st.drag.before){
    st.plan = normalize(JSON.parse(st.drag.before)); st.needRebuild = true; validateSel(); refreshProps();
  }
  st.drag = null; st.draft = null; st.overlayDirty = true;
}

function finishDraw(d){
  const dr = st.draft; st.draft = null; st.overlayDirty = true;
  if (!dr) return;
  const before = d.before;
  if (dr.kind === 'rect'){
    const x0 = Math.min(dr.x0,dr.x1), x1 = Math.max(dr.x0,dr.x1), y0 = Math.min(dr.y0,dr.y1), y1 = Math.max(dr.y0,dr.y1);
    if (x1 - x0 < 4 || y1 - y0 < 4) return;
    const f = { id:uid(), name:'Stanza', m:'parquet', pts:[[x0,y0],[x1,y0],[x1,y1],[x0,y1]] };
    st.plan.floors.push(f); pushUndo(before); rebuild(); setTool('select'); setSel({ type:'floor', id:f.id }); return;
  }
  if (Math.hypot(dr.x1 - dr.x0, dr.y1 - dr.y0) < 4) return;
  if (st.tool === 'run'){
    const r = { id:uid(), k:runKind, h:RUNK[runKind].h, pts:[[dr.x0,dr.y0],[dr.x1,dr.y1]] };
    st.plan.runs.push(r); pushUndo(before); rebuild();
    flash(RUNK[runKind].n + ': tratto di ' + fmtM(runLen(r)) + '. Trascina ancora per continuare.');
    return;
  }
  if (st.tool === 'wallE' || st.tool === 'wallI'){
    const w = { id:uid(), x1:Math.min(dr.x0,dr.x1), y1:Math.min(dr.y0,dr.y1), x2:Math.max(dr.x0,dr.x1), y2:Math.max(dr.y0,dr.y1), k:st.tool === 'wallE' ? 'e' : 'i', ops:[] };
    st.plan.walls.push(w); pushUndo(before); rebuild(); setTool('select'); setSel({ type:'wall', id:w.id });
  } else {
    const r = { id:uid(), kind:st.tool === 'glazed' ? 'glazed' : st.tool === 'fence' ? 'fence' : 'rail', pts:[[dr.x0,dr.y0],[dr.x1,dr.y1]] };
    st.plan.rails.push(r); pushUndo(before); rebuild(); setTool('select'); setSel({ type:'rail', id:r.id });
  }
}

function cutRail(p){
  const tol = tolPx();
  let best = null, bd = Infinity;
  st.plan.rails.forEach(r => { for (let i=0; i<r.pts.length-1; i++){
    const a = r.pts[i], b = r.pts[i+1], dd = segDist(p[0],p[1],a[0],a[1],b[0],b[1]);
    if (dd <= 4 + tol*.8 && dd < bd){ bd = dd; best = { r:r, i:i }; }
  } });
  if (!best){ flash('Tocca un parapetto, una vetrata o una ringhiera.'); return; }
  const r = best.r, a = r.pts[best.i], b = r.pts[best.i+1];
  const horiz = Math.abs(b[1]-a[1]) <= Math.abs(b[0]-a[0]);
  const q = horiz ? [opt.snap ? Math.round(p[0]/GRID)*GRID : p[0], a[1]] : [a[0], opt.snap ? Math.round(p[1]/GRID)*GRID : p[1]];
  const lo = horiz ? Math.min(a[0],b[0]) : Math.min(a[1],b[1]), hi = horiz ? Math.max(a[0],b[0]) : Math.max(a[1],b[1]), v = horiz ? q[0] : q[1];
  if (v - lo < 4 || hi - v < 4){ flash('Troppo vicino a un’estremità: tocca più al centro.'); return; }
  mutate(() => {
    const idx = st.plan.rails.indexOf(r);
    const r1 = clone(r), r2 = clone(r); r1.id = uid(); r2.id = uid();
    r1.pts = r.pts.slice(0, best.i + 1).concat([q]);
    r2.pts = [q].concat(r.pts.slice(best.i + 1));
    st.plan.rails.splice(idx, 1, r1, r2);
  });
}
function splitRail(){
  const it = selItem(); if (!it || it.type !== 'rail' || it.obj.pts.length < 3) return;
  mutate(() => {
    const r = it.obj, idx = st.plan.rails.indexOf(r), parts = [];
    for (let i=0; i<r.pts.length-1; i++){ const c = clone(r); c.id = uid(); c.pts = [r.pts[i], r.pts[i+1]]; parts.push(c); }
    st.plan.rails.splice.apply(st.plan.rails, [idx, 1].concat(parts));
  });
  setSel(null);
}
function doPlace(d){
  const p = d.p, tol = tolPx(), before = d.before;
  if (st.tool === 'cut'){ cutRail(p); return; }
  if (st.tool === 'sys'){ placeSys(p, before); return; }
  if (st.tool === 'column'){
    const cx = opt.snap ? Math.round(p[0]/GRID)*GRID : p[0], cy = opt.snap ? Math.round(p[1]/GRID)*GRID : p[1];
    const c = { id:uid(), x0:cx-5, x1:cx+5, y0:cy-5, y1:cy+5 };
    st.plan.columns.push(c); pushUndo(before); rebuild(); setTool('select'); setSel({ type:'column', id:c.id }); return;
  }
  if (st.tool === 'furn'){
    const dd = FURN[st.furnType], cx = opt.snap ? Math.round(p[0]/GRID)*GRID : p[0], cy = opt.snap ? Math.round(p[1]/GRID)*GRID : p[1];
    const f = { id:uid(), type:st.furnType, x:cx, y:cy, rot:0, w:dd.w, d:dd.d, h:dd.h };
    st.plan.furniture.push(f); pushUndo(before); rebuild(); setTool('select'); setSel({ type:'furn', id:f.id }); return;
  }
  if (st.tool === 'label'){
    const l = { id:uid(), text:'Stanza', x:p[0], y:p[1], w:1.4, g:0 };
    st.plan.labels.push(l); pushUndo(before); rebuild(); setTool('select'); setSel({ type:'label', id:l.id }); return;
  }
  if (['door','win','pf','open'].indexOf(st.tool) < 0) return;
  let best = null, bd = Infinity;
  st.plan.walls.forEach(w => { const dd = segDist(p[0],p[1],w.x1,w.y1,w.x2,w.y2); if (dd <= wallT(w)/2 + tol*.8 && dd < bd){ bd = dd; best = w; } });
  if (!best){ flash('Clicca su un muro per inserirla.'); return; }
  const h = isH(best), a = h ? best.x1 : best.y1, b = h ? best.x2 : best.y2, c = h ? best.y1 : best.x1;
  const def = { door:24, win:28, pf:30, open:40 }[st.tool], w = Math.min(def, b - a - 2);
  if (w < 6){ flash('Il muro è troppo corto.'); return; }
  let pos = h ? p[0] : p[1]; if (opt.snap) pos = Math.round(pos/GRID)*GRID;
  pos = clamp(pos, a + w/2 + 1, b - w/2 - 1);
  if (best.ops.some(o => Math.abs(o.p - pos) < (o.w + w)/2)){ flash('C’è già un’apertura in questo punto.'); return; }
  const s = h ? (p[1] < c ? 1 : -1) : (p[0] > c ? 1 : -1);
  best.ops.push({ p:pos, w:w, t:st.tool, s:s });
  pushUndo(before); rebuild(); setSel({ type:'op', id:best.id, i:best.ops.length - 1 });
}

window.addEventListener('keydown', e => {
  if (!st.editing || typing(e.target)) return;
  const k = e.key, mod = e.ctrlKey || e.metaKey;
  if (mod && k.toLowerCase() === 'z'){ e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
  if (mod && k.toLowerCase() === 'y'){ e.preventDefault(); redo(); return; }
  if (k === 'Delete' || k === 'Backspace'){ if (st.sel){ e.preventDefault(); deleteSel(); } return; }
  if (k === 'Escape'){ cancelInteraction(true); if (st.tool !== 'select') setTool('select'); else setSel(null); return; }
  if (k.indexOf('Arrow') === 0 && st.sel){
    e.preventDefault();
    const st = (e.shiftKey ? 4 : 1) * GRID;
    nudge(k === 'ArrowLeft' ? -st : k === 'ArrowRight' ? st : 0, k === 'ArrowUp' ? -st : k === 'ArrowDown' ? st : 0);
  }
});

/* ---------- attivazione dell’editor ---------- */
function setEditing(on){
  if (on === st.editing) return;
  st.editing = on;
  if (on && st.cmpId) setCompare(null);
  document.querySelectorAll('.edit-only').forEach(e => { e.hidden = !on; });
  $('btnEdit').setAttribute('aria-pressed', String(on));
  $('editLbl').textContent = on ? 'Fine' : 'Modifica';
  if (on){
    if (st.mode !== 'plan') setMode('plan');
    controls.enableRotate = false;
    setTool('select');
  } else {
    controls.enableRotate = true;
    st.sel = null; st.draft = null; st.drag = null; pointers.clear(); canvas.style.cursor = '';
  }
  updateLow(); st.overlayDirty = true; refreshProps(); histBtns();
}
$('btnEdit').addEventListener('click', () => setEditing(!st.editing));

export { GRID, TIPS, buildDock, deleteSel, duplicateSel, editorDown, editorMove, editorUp, flash, getHandles, ground, histBtns, mutate, opt, pushUndo, selItem, setEditing, setSel, splitRail, tolPx, validateSel };
