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
   Lavora a livelli: Pareti, Pavimenti, Arredi, Impianti. In ogni livello si possono
   toccare e spostare solo gli elementi di quel livello, gli altri restano bloccati.
   ========================================================================= */
const opt = { snap:true, link:true };
const GRID = 2.5;                                  // 10 cm
const pointers = new Set();
const DRAG_PX = 6;                                 // sotto questi pixel un clic non sposta niente

const NAMES = { wall:'un muro', op:'una porta o finestra', column:'una colonna', rail:'un parapetto o una vetrata',
  floor:'un pavimento', label:'il nome di una stanza', furn:'un arredo', sys:'un punto degli impianti', run:'un tracciato degli impianti' };
const LEVELS = {
  pareti:    { n:'Pareti',    types:['wall','op','column','rail'], tools:['select','cut','|','wallE','wallI','|','door','win','pf','open','|','column','rail','glazed','fence'] },
  pavimenti: { n:'Pavimenti', types:['floor','label'],             tools:['select','floor','label'] },
  arredi:    { n:'Arredi',    types:['furn'],                      tools:['select','furn'] },
  impianti:  { n:'Impianti',  types:['sys','run'],                 tools:['select','sys','run'] }
};
const LEVEL_KEY = 'piantina-livello-modifica';
const levelOf = type => Object.keys(LEVELS).find(k => LEVELS[k].types.indexOf(type) >= 0);
const LEVEL_TIPS = {
  pareti:'Livello Pareti: muri, porte, finestre e vetrate. Pavimenti e arredi sono bloccati.',
  pavimenti:'Livello Pavimenti: stanze e nomi. Muri e arredi sono bloccati.',
  arredi:'Livello Arredi: muri e pavimenti sono bloccati. Tocca un arredo per spostarlo, oppure Aggiungi.',
  impianti:'Livello Impianti: prese, luci, tubi e sensori. Il resto della casa è bloccato.'
};
const TIPS = {
  wallE:'Trascina per disegnare un muro esterno. Puoi disegnarne quanti vuoi di fila; Esc per finire.',
  wallI:'Trascina per disegnare un muro interno. Puoi disegnarne quanti vuoi di fila; Esc per finire.',
  door:'Clicca su un muro per inserire una porta. Il lato su cui clicchi decide verso dove si apre.',
  win:'Clicca su un muro per inserire una finestra.',
  pf:'Clicca su un muro per inserire una porta-finestra.',
  open:'Clicca su un muro per aprire un varco senza porta.',
  column:'Clicca per posizionare una colonna.',
  floor:'Trascina per disegnare un pavimento rettangolare.',
  rail:'Trascina per disegnare un parapetto.',
  glazed:'Trascina per disegnare una vetrata.',
  fence:'Trascina per disegnare una ringhiera.',
  cut:'Tocca un parapetto, una vetrata o una ringhiera per dividerlo in due pezzi.',
  furn:'Scegli un arredo dall’elenco e tocca la pianta: vicino a un muro si appoggia da solo.',
  label:'Clicca per aggiungere il nome di una stanza.',
  sys:'Scegli un elemento e tocca la pianta. Quelli a parete si agganciano al muro più vicino, dal lato dove tocchi.',
  run:'Scegli il tipo di linea e trascina sulla pianta per tracciare un tratto. Puoi tracciarne quanti vuoi, uno dopo l’altro.'
};
/* arredi che si appoggiano al muro con lo schienale (si girano da soli quando li avvicini a un muro) */
const WALLBACK = new Set(['divano','mobiletv','libreria','vetrina','cucina','pensile','frigo','lavatrice','letto2','letto1','comodino','armadio','cassettiera','scrivania','lavabo','wc','bidet','vasca',
  'tvparete','colonnaforno','mobilealto','cassettone','scaffale','lavabososp','specchio','postazionepc','listelli','mensoleled','gradinigatto','tende',
  'quadri','armadiospecchi','paretetv','mobileled','pensilevetro','barbecue','scaffalescala','ledparete']);

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

/* ---------- aggancio ----------
   Ogni valore di aggancio porta con sé l’estensione dell’oggetto da cui viene, così posso
   disegnare la linea guida fra l’oggetto che sposti e quello a cui si è agganciato. */
let freeMove = false;                                   // Alt tenuto premuto: niente aggancio
const snapOn = () => opt.snap && !freeMove;
const snapLines = [];                                    // linee guida da disegnare: { ax, v, a, b }
function guides(ex){
  const g = { xs:[], ys:[], xr:[], yr:[] };
  const X_ = (v, a, b) => { g.xs.push(v); g.xr.push([a, b]); }, Y_ = (v, a, b) => { g.ys.push(v); g.yr.push([a, b]); };
  st.plan.walls.forEach(w => { if (w.id === ex) return; X_(w.x1, w.y1, w.y2); X_(w.x2, w.y1, w.y2); Y_(w.y1, w.x1, w.x2); Y_(w.y2, w.x1, w.x2); });
  st.plan.columns.forEach(c => { if (c.id === ex) return; X_(c.x0, c.y0, c.y1); X_(c.x1, c.y0, c.y1); Y_(c.y0, c.x0, c.x1); Y_(c.y1, c.x0, c.x1); });
  st.plan.floors.forEach(f => { if (f.id === ex) return; f.pts.forEach(p => { X_(p[0], p[1], p[1]); Y_(p[1], p[0], p[0]); }); });
  st.plan.rails.forEach(r => { if (r.id === ex) return; r.pts.forEach(p => { X_(p[0], p[1], p[1]); Y_(p[1], p[0], p[0]); }); });
  st.plan.runs.forEach(r => { if (r.id === ex || !layerOn[RUNK[r.k].l]) return; r.pts.forEach(p => { X_(p[0], p[1], p[1]); Y_(p[1], p[0], p[0]); }); });
  st.plan.sys.forEach(o => { if (o.id === ex || !layerOn[SYS[o.t].l]) return; X_(o.x, o.y, o.y); Y_(o.y, o.x, o.x); });
  return g;
}
const NOG = { xs:[], ys:[], xr:[], yr:[] };
function rec(ax, v, src, ext){
  const a = Math.min(src ? src[0] : v, ext[0]), b = Math.max(src ? src[1] : v, ext[1]);
  snapLines.push({ ax:ax, v:v, a:a - 4, b:b + 4 });
}
/* aggancia un valore: prima alle guide, poi alla griglia. ext = estensione dell’oggetto sull’altro asse */
function snap1(v, g, ax, tol, ext){
  if (!snapOn()) return v;
  const arr = ax === 'x' ? g.xs : g.ys, rr = ax === 'x' ? g.xr : g.yr;
  let b = -1, bd = tol;
  for (let i=0; i<arr.length; i++){ const d = Math.abs(arr[i] - v); if (d < bd){ bd = d; b = i; } }
  if (b >= 0){ if (ext) rec(ax, arr[b], rr[b], ext); return arr[b]; }
  return Math.round(v/GRID)*GRID;
}
/* aggancia uno spostamento: uno qualsiasi dei valori dell’oggetto (bordi, centro) va su una guida */
function snapDelta(vals, d, g, ax, tol, ext){
  if (!snapOn()) return d;
  const arr = ax === 'x' ? g.xs : g.ys, rr = ax === 'x' ? g.xr : g.yr;
  let best = null, bd = tol, bi = -1;
  for (const v of vals) for (let i=0; i<arr.length; i++){
    const dd = arr[i] - (v + d);
    if (Math.abs(dd) < bd){ bd = Math.abs(dd); best = d + dd; bi = i; }
  }
  if (best !== null){ if (ext) rec(ax, arr[bi], rr[bi], ext.map(e => e)); return best; }
  return Math.round((vals[0] + d)/GRID)*GRID - vals[0];
}

/* ---------- facce degli ostacoli (muri, colonne, parapetti) ----------
   ax 'y' = faccia orizzontale alla quota y = v, lunga da lo a hi; side +1 = guarda verso sud (+y).
   ax 'x' = faccia verticale alla quota x = v; side +1 = guarda verso est (+x). */
function railT(r){ return r.kind === 'glazed' ? 5 : r.kind === 'fence' ? (r.base > 0 ? 6 : 2) : 8; }
function obstacleFaces(exWall){
  const F = [];
  const seg = (h, c, t, lo, hi) => {
    if (h){ F.push({ ax:'y', v:c - t/2, lo:lo - t/2, hi:hi + t/2, side:-1 }); F.push({ ax:'y', v:c + t/2, lo:lo - t/2, hi:hi + t/2, side:1 }); }
    else  { F.push({ ax:'x', v:c - t/2, lo:lo - t/2, hi:hi + t/2, side:-1 }); F.push({ ax:'x', v:c + t/2, lo:lo - t/2, hi:hi + t/2, side:1 }); }
  };
  st.plan.walls.forEach(w => { if (w.id !== exWall) { const h = isH(w); seg(h, h ? w.y1 : w.x1, wallT(w), h ? w.x1 : w.y1, h ? w.x2 : w.y2); } });
  st.plan.columns.forEach(c => {
    F.push({ ax:'y', v:c.y0, lo:c.x0, hi:c.x1, side:-1 }); F.push({ ax:'y', v:c.y1, lo:c.x0, hi:c.x1, side:1 });
    F.push({ ax:'x', v:c.x0, lo:c.y0, hi:c.y1, side:-1 }); F.push({ ax:'x', v:c.x1, lo:c.y0, hi:c.y1, side:1 });
  });
  st.plan.rails.forEach(r => { for (let i=0; i<r.pts.length-1; i++){
    const a = r.pts[i], b = r.pts[i+1], h = Math.abs(b[1]-a[1]) <= Math.abs(b[0]-a[0]);
    seg(h, h ? a[1] : a[0], railT(r), h ? Math.min(a[0],b[0]) : Math.min(a[1],b[1]), h ? Math.max(a[0],b[0]) : Math.max(a[1],b[1]));
  } });
  return F;
}
/* distanza libera dai quattro lati di un rettangolo [x0,x1,y0,y1] alla faccia più vicina (in px), null se non c’è */
function clearances(x0, x1, y0, y1, F){
  const r = { n:null, s:null, w:null, e:null };
  F.forEach(f => {
    if (f.ax === 'y'){
      if (f.hi < x0 + .5 || f.lo > x1 - .5) return;
      if (f.side === 1 && f.v <= y0 + .5){ const d = y0 - f.v; if (r.n === null || d < r.n) r.n = d; }
      if (f.side === -1 && f.v >= y1 - .5){ const d = f.v - y1; if (r.s === null || d < r.s) r.s = d; }
    } else {
      if (f.hi < y0 + .5 || f.lo > y1 - .5) return;
      if (f.side === 1 && f.v <= x0 + .5){ const d = x0 - f.v; if (r.w === null || d < r.w) r.w = d; }
      if (f.side === -1 && f.v >= x1 - .5){ const d = f.v - x1; if (r.e === null || d < r.e) r.e = d; }
    }
  });
  return r;
}
function fmtLen(px){
  const m = Math.max(0, px) * S;
  if (m < 0.995) return Math.round(m * 100) + ' cm';
  return m.toLocaleString('it-IT', { minimumFractionDigits:2, maximumFractionDigits:2 }) + ' m';
}
function clearTxt(c, keys){
  const A = { n:'↑', s:'↓', w:'←', e:'→' };
  return (keys || ['w','e','n','s']).filter(k => c[k] !== null && c[k] < 400).map(k => A[k] + ' ' + fmtLen(c[k])).join('   ');
}
/* misure in tempo reale vicino al puntatore */
const readEl = $('readout');
let lastPtr = null;
function readout(txt){
  if (!txt || !lastPtr){ if (!readEl.hidden) readEl.hidden = true; return; }
  const r = $('stage').getBoundingClientRect();
  readEl.textContent = txt; readEl.hidden = false;
  const w = readEl.offsetWidth, x = clamp(lastPtr[0] - r.left + 18, 8, r.width - w - 8), y = clamp(lastPtr[1] - r.top - 44, 60, r.height - 40);
  readEl.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
}

/* ---------- arredi: si appoggiano ai muri e si allineano agli altri arredi ---------- */
const rightAngle = rot => Math.abs(rot % 90) < 1e-6;
function furnHalf(f, rot){
  const q = ((rot % 180) + 180) % 180 === 90;
  return [ (q ? f.d : f.w) / S / 2, (q ? f.w : f.d) / S / 2 ];
}
function furnGuides(f){
  const g = { xs:[], ys:[], xr:[], yr:[] };
  st.plan.furniture.forEach(o => {
    if (o.id === f.id || !rightAngle(o.rot)) return;
    const h = furnHalf(o, o.rot), xr = [o.y - h[1], o.y + h[1]], yr = [o.x - h[0], o.x + h[0]];
    [o.x - h[0], o.x + h[0], o.x].forEach(v => { g.xs.push(v); g.xr.push(xr); });
    [o.y - h[1], o.y + h[1], o.y].forEach(v => { g.ys.push(v); g.yr.push(yr); });
  });
  return g;
}
function addFaces(g, F, ax, lo, hi){
  F.forEach(f => {
    if (f.ax !== ax || f.hi < lo - 2 || f.lo > hi + 2) return;
    if (ax === 'x'){ g.xs.push(f.v); g.xr.push([f.lo, f.hi]); } else { g.ys.push(f.v); g.yr.push([f.lo, f.hi]); }
  });
}
function moveFurn(f, o, dx, dy, tol, F){
  let nx = o.x + dx, ny = o.y + dy, rot = o.rot;
  f.x = nx; f.y = ny; f.rot = rot;
  if (!snapOn()){ readout(clearTxt(clearances(nx - 1, nx + 1, ny - 1, ny + 1, F))); return; }
  /* 1. schienale contro il muro */
  let wall = null;
  if (WALLBACK.has(f.type)){
    const D = f.d / S, W = f.w / S;
    let bs = Infinity;
    F.forEach(fc => {
      const along = fc.ax === 'y' ? nx : ny, nrm = fc.ax === 'y' ? ny : nx;
      if (along < fc.lo - W*.3 || along > fc.hi + W*.3) return;
      if (fc.hi - fc.lo < Math.min(W, 40) * .6) return;   // pezzetti di muro o colonne: troppo corti per appoggiarci
      const dist = (nrm - fc.v) * fc.side;              // > 0 dal lato verso cui guarda la faccia
      if (dist < D*.2 || dist > D/2 + tol*2.2) return;
      const sc = Math.abs(dist - D/2);
      if (sc < bs){ bs = sc; wall = fc; }
    });
    if (wall){
      rot = wall.ax === 'y' ? (wall.side > 0 ? 0 : 180) : (wall.side > 0 ? 270 : 90);
      if (wall.ax === 'y') ny = wall.v + wall.side * D/2; else nx = wall.v + wall.side * D/2;
      const h = furnHalf(f, rot);
      if (wall.ax === 'y') snapLines.push({ ax:'y', v:wall.v, a:nx - h[0] - 6, b:nx + h[0] + 6 });
      else snapLines.push({ ax:'x', v:wall.v, a:ny - h[1] - 6, b:ny + h[1] + 6 });
    }
  }
  /* 2. bordi allineati a muri e altri arredi (solo con rotazioni a 90°) */
  if (rightAngle(rot)){
    const h = furnHalf(f, rot), g = furnGuides(f);
    if (!wall || wall.ax === 'y'){
      addFaces(g, F, 'x', ny - h[1], ny + h[1]);
      const ddx = snapDelta([nx - h[0], nx + h[0], nx], 0, g, 'x', tol, [ny - h[1], ny + h[1]]);
      nx += ddx;
    }
    if (!wall || wall.ax === 'x'){
      addFaces(g, F, 'y', nx - h[0], nx + h[0]);
      const ddy = snapDelta([ny - h[1], ny + h[1], ny], 0, g, 'y', tol, [nx - h[0], nx + h[0]]);
      ny += ddy;
    }
    f.x = nx; f.y = ny; f.rot = rot;
    readout(clearTxt(clearances(nx - h[0], nx + h[0], ny - h[1], ny + h[1], F)));
  } else {
    f.x = Math.round(nx/GRID)*GRID; f.y = Math.round(ny/GRID)*GRID; f.rot = rot; readout('');
  }
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

/* Elemento sotto il puntatore. Con allowed = elenco di tipi guarda solo quelli (il livello attivo). */
function hitTest(px, py, allowed){
  const tol = tolPx(), ok = t => !allowed || allowed.indexOf(t) >= 0;
  if (ok('sys') || ok('run')){ const sh = sysHit(px, py, tol); if (sh && ok(sh.type)) return sh; }
  if (ok('op')) for (const w of st.plan.walls){
    const t = wallT(w), h = isH(w), c = h ? w.y1 : w.x1;
    for (let i=0; i<w.ops.length; i++){
      const o = w.ops[i], al = h ? px : py, cr = h ? py : px;
      if (Math.abs(al - o.p) <= o.w/2 + tol*.3 && Math.abs(cr - c) <= t/2 + tol*.6) return { type:'op', id:w.id, i:i };
    }
  }
  if (ok('column')) for (const c of st.plan.columns)
    if (px >= c.x0 - tol*.4 && px <= c.x1 + tol*.4 && py >= c.y0 - tol*.4 && py <= c.y1 + tol*.4) return { type:'column', id:c.id };
  if (ok('furn')) for (let i = st.plan.furniture.length - 1; i >= 0; i--){
    const f = st.plan.furniture[i], th = f.rot * Math.PI / 180, dx = px - f.x, dy = py - f.y;
    const lx = dx * Math.cos(th) + dy * Math.sin(th), ly = -dx * Math.sin(th) + dy * Math.cos(th);
    if (Math.abs(lx) <= f.w / S / 2 + tol*.3 && Math.abs(ly) <= f.d / S / 2 + tol*.3) return { type:'furn', id:f.id };
  }
  if (ok('label')) for (const l of st.plan.labels){
    const wp = labelWpx(l), hp = wp/4;
    if (Math.abs(px - l.x) <= wp/2 && Math.abs(py - l.y) <= hp/2) return { type:'label', id:l.id };
  }
  if (ok('wall')){
    let best = null, bd = Infinity;
    for (const w of st.plan.walls){
      const d = segDist(px,py,w.x1,w.y1,w.x2,w.y2);
      if (d <= wallT(w)/2 + tol*.6 && d < bd){ bd = d; best = { type:'wall', id:w.id }; }
    }
    if (best) return best;
  }
  if (ok('rail')) for (const r of st.plan.rails)
    for (let i=0; i<r.pts.length-1; i++){
      const a = r.pts[i], b = r.pts[i+1];
      if (segDist(px,py,a[0],a[1],b[0],b[1]) <= 4 + tol*.6) return { type:'rail', id:r.id };
    }
  if (ok('floor')){
    let fb = null, fa = Infinity;
    for (const f of st.plan.floors) if (pointInPoly(px,py,f.pts)){ const a = polyArea(f.pts); if (a < fa){ fa = a; fb = { type:'floor', id:f.id }; } }
    return fb;
  }
  return null;
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

function flash(msg, ms){ hintEl.textContent = msg; hintEl.hidden = false; clearTimeout(flash.t); flash.t = setTimeout(setHint, ms || 2400); }

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
    else if (it.type === 'wall'){
      /* il muro scorre di traverso e si porta dietro i muri collegati */
      const w = it.obj, h = isH(w), att = attachedFor(w), m = h ? dy : dx;
      if (!m && att.length) return;
      shiftItem('wall', w, h ? (att.length ? 0 : dx) : m, h ? m : (att.length ? 0 : dy));
      att.forEach(a => { const b = byId(st.plan.walls, a.id); if (b) b[a.key] = a.orig + m; });
    }
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
    else if (it.type === 'furn' && rightAngle(c.rot)){
      /* la copia va accanto all’originale, lungo il muro */
      const h = furnHalf(c, c.rot), q = ((c.rot % 180) + 180) % 180 === 90;
      shiftItem('furn', c, q ? 0 : h[0]*2, q ? h[1]*2 : 0);
    }
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
/* distanze nette fra un muro e i muri paralleli più vicini (larghezza delle stanze ai due lati) */
function wallGaps(w){
  const h = isH(w), t = wallT(w), c = h ? w.y1 : w.x1, lo = h ? w.x1 : w.y1, hi = h ? w.x2 : w.y2;
  let a = null, b = null;
  st.plan.walls.forEach(o => {
    if (o.id === w.id || isH(o) !== h) return;
    const oc = h ? o.y1 : o.x1, olo = h ? o.x1 : o.y1, ohi = h ? o.x2 : o.y2, ot = wallT(o);
    if (ohi < lo + 2 || olo > hi - 2) return;
    if (oc < c){ const d = (c - t/2) - (oc + ot/2); if (d > 0 && (a === null || d < a)) a = d; }
    else if (oc > c){ const d = (oc - ot/2) - (c + t/2); if (d > 0 && (b === null || d < b)) b = d; }
  });
  return h ? { n:a, s:b, w:null, e:null } : { w:a, e:b, n:null, s:null };
}
/* spazio libero ai lati di un’apertura, fino ai muri che incrociano quello che la ospita */
function opGaps(w, o){
  const h = isH(w), c = h ? w.y1 : w.x1, lo = o.p - o.w/2, hi = o.p + o.w/2;
  let a = h ? w.x1 : w.y1, b = h ? w.x2 : w.y2;
  st.plan.walls.forEach(x => {
    if (x.id === w.id || isH(x) === h) return;
    const xc = h ? x.x1 : x.y1, xlo = h ? x.y1 : x.x1, xhi = h ? x.y2 : x.x2, t = wallT(x);
    if (c < xlo - t || c > xhi + t) return;
    if (xc + t/2 <= lo + .5 && xc + t/2 > a) a = xc + t/2;
    if (xc - t/2 >= hi - .5 && xc - t/2 < b) b = xc - t/2;
  });
  w.ops.forEach(q => { if (q === o) return; const ql = q.p - q.w/2, qh = q.p + q.w/2;
    if (qh <= lo + .5 && qh > a) a = qh; if (ql >= hi - .5 && ql < b) b = ql; });
  return { a:a, b:b, h:h };
}

/* ---------- livelli e strumenti ---------- */
function setTool(t){
  st.tool = t; if (t !== 'select') st.sel = null;
  if (t === 'sys') setLayer(SYS[sysType].l, true);
  if (t === 'run') setLayer(RUNK[runKind].l, true);
  st.drag = null; st.draft = null; snapLines.length = 0; readout('');
  document.querySelectorAll('#dock button[data-tool]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === t)));
  canvas.style.cursor = t === 'select' ? 'default' : 'crosshair';
  st.overlayDirty = true; refreshProps();
}
function setLevel(l){
  if (!LEVELS[l]) l = 'arredi';
  st.level = l;
  try { localStorage.setItem(LEVEL_KEY, l); } catch(_){}
  document.querySelectorAll('#levels button[data-level]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.level === l)));
  document.body.dataset.level = l;
  if (l === 'impianti' && !Object.keys(layerOn).some(k => layerOn[k])) setLayer('el', true);
  buildTools();
  st.sel = null;
  setTool('select');
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
  run:'<svg class="i" viewBox="0 0 24 24"><path d="M4 18h7V7h9"/><circle cx="4" cy="18" r="1.8" fill="currentColor"/><circle cx="20" cy="7" r="1.8" fill="currentColor"/></svg>',
  snap:'<svg class="i" viewBox="0 0 24 24"><path d="M6 4v8a6 6 0 0 0 12 0V4"/><path d="M6 4h3.5v8a2.5 2.5 0 0 0 5 0V4H18"/><path d="M6 8h3.5M14.5 8H18"/></svg>',
  pareti:'<svg class="i" viewBox="0 0 24 24"><path d="M3 4h18v16H3z"/><path d="M3 11h9v9M12 4v3"/></svg>',
  pavimenti:'<svg class="i" viewBox="0 0 24 24"><path d="M3 9l9-5 9 5-9 5z"/><path d="M7.5 6.5l9 5M16.5 6.5l-9 5" opacity=".55"/><path d="M3 13.5l9 5 9-5"/></svg>',
  arredi:'<svg class="i" viewBox="0 0 24 24"><path d="M5 11V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3"/><path d="M3 13a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v4H3z"/><path d="M6 17v2M18 17v2"/></svg>',
  impianti:'<svg class="i" viewBox="0 0 24 24"><path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/></svg>'
};
const TOOLN = { select:'Seleziona', wallE:'Muro esterno', wallI:'Muro interno', door:'Porta', win:'Finestra', pf:'Porta-finestra', open:'Varco',
  column:'Colonna', floor:'Pavimento', rail:'Parapetto', glazed:'Vetrata', fence:'Ringhiera', cut:'Dividi', furn:'Aggiungi', label:'Nome stanza', sys:'Punti', run:'Tracciati' };
function toolBtn(t, name){
  const b = el('button','tl'); b.type = 'button'; b.dataset.tool = t;
  b.setAttribute('aria-pressed', String(t === st.tool)); b.title = name;
  b.innerHTML = ICONS[t]; b.appendChild(el('span', null, name));
  b.addEventListener('click', () => setTool(t));
  return b;
}
function buildTools(){
  const d = $('dock'); d.textContent = '';
  LEVELS[st.level].tools.forEach(t => { d.appendChild(t === '|' ? el('div','sep') : toolBtn(t, TOOLN[t])); });
  d.appendChild(el('div','sep grow'));
  const sb = el('button','tl snap'); sb.type = 'button'; sb.id = 'btnSnap'; sb.title = 'Aggancio automatico a muri, arredi e griglia (tieni premuto Alt per staccarlo)';
  sb.innerHTML = ICONS.snap; sb.appendChild(el('span', null, 'Aggancio'));
  sb.setAttribute('aria-pressed', String(opt.snap));
  sb.addEventListener('click', () => setSnap(!opt.snap));
  d.appendChild(sb);
}
function setSnap(on){
  opt.snap = on; $('optSnap').checked = on;
  const b = $('btnSnap'); if (b) b.setAttribute('aria-pressed', String(on));
  flash(on ? 'Aggancio acceso: gli elementi si allineano a muri, arredi e griglia.' : 'Aggancio spento: movimenti liberi.');
}
function buildDock(){
  let l = 'arredi';
  try { l = localStorage.getItem(LEVEL_KEY) || 'arredi'; } catch(_){}
  st.level = LEVELS[l] ? l : 'arredi';
  const bar = $('levels');
  Object.keys(LEVELS).forEach((k, i) => {
    const b = el('button'); b.type = 'button'; b.dataset.level = k;
    b.title = LEVELS[k].n + ' (tasto ' + (i + 1) + ')';
    b.setAttribute('aria-pressed', String(k === st.level));
    b.innerHTML = ICONS[k]; b.appendChild(el('span', null, LEVELS[k].n));
    b.addEventListener('click', () => setLevel(k));
    bar.appendChild(b);
  });
  document.body.dataset.level = st.level;
  buildTools();
}
$('optSnap').addEventListener('change', e => setSnap(e.target.checked));
$('optLink').addEventListener('change', e => { opt.link = e.target.checked; });

/* ---------- interazione col puntatore ---------- */
function editorDown(e){
  if (!st.editing) return;
  pointers.add(e.pointerId);
  if (pointers.size > 1){ cancelInteraction(true); return; }
  if (e.pointerType === 'mouse' && (e.button !== 0 || e.shiftKey || e.ctrlKey || e.metaKey)) return;
  const p = ground(e); if (!p) return;
  try { canvas.setPointerCapture(e.pointerId); } catch(_){}
  canvas.focus();
  lastPtr = [e.clientX, e.clientY]; freeMove = e.altKey;
  const before = JSON.stringify(st.plan), tol = tolPx();

  if (st.tool === 'select'){
    for (const h of getHandles()){
      if (Math.hypot(h.x - p[0], h.y - p[1]) <= tol*1.3){
        const it = selItem();
        st.drag = { kind:'handle', h:h, before:before, start:p, cx:e.clientX, cy:e.clientY, armed:false, orig:clone(it.type === 'op' ? it.wall : it.obj),
                 g:guides(it.type === 'op' ? null : it.obj.id), rect:it.type === 'floor' && isRectPts(it.obj.pts) };
        return;
      }
    }
    const allowed = LEVELS[st.level].types;
    const hit = hitTest(p[0], p[1], allowed);
    if (!hit){
      setSel(null);
      const other = hitTest(p[0], p[1], null);
      const lv = other && levelOf(other.type);
      if (lv && lv !== st.level) flash('È ' + NAMES[other.type] + ': per modificarlo passa al livello ' + LEVELS[lv].n + ' (in alto).', 3200);
      return;
    }
    setSel(hit);
    const it = selItem();
    const base = it.type === 'op' ? it.wall : it.obj;
    st.drag = { kind:'move', before:before, start:p, cx:e.clientX, cy:e.clientY, armed:false, orig:clone(base),
             g:guides(it.type === 'op' ? null : base.id),
             F:(it.type === 'furn' || it.type === 'op') ? obstacleFaces() : null,
             attached:it.type === 'wall' ? attachedFor(it.obj) : [] };
    return;
  }
  if (st.tool === 'wallE' || st.tool === 'wallI' || st.tool === 'rail' || st.tool === 'glazed' || st.tool === 'fence' || st.tool === 'run'){
    const g = guides(null); snapLines.length = 0;
    const q = [snap1(p[0], g, 'x', tol*.8, [p[1], p[1]]), snap1(p[1], g, 'y', tol*.8, [p[0], p[0]])];
    st.draft = { kind:'line', x0:q[0], y0:q[1], x1:q[0], y1:q[1] };
    st.drag = { kind:'draw', before:before, g:g };
    st.overlayDirty = true; return;
  }
  if (st.tool === 'floor'){
    const g = guides(null); snapLines.length = 0;
    const q = [snap1(p[0], g, 'x', tol*.8, [p[1], p[1]]), snap1(p[1], g, 'y', tol*.8, [p[0], p[0]])];
    st.draft = { kind:'rect', x0:q[0], y0:q[1], x1:q[0], y1:q[1] };
    st.drag = { kind:'draw', before:before, g:g };
    st.overlayDirty = true; return;
  }
  st.drag = { kind:'place', p:p, cx:e.clientX, cy:e.clientY, moved:false, before:before };
}

function editorMove(e){
  if (!st.editing || !st.drag) return;
  lastPtr = [e.clientX, e.clientY]; freeMove = e.altKey;
  if (st.drag.kind === 'place'){ if (Math.hypot(e.clientX - st.drag.cx, e.clientY - st.drag.cy) > 8) st.drag.moved = true; return; }
  /* un piccolo tremolio del clic non sposta niente: serve un vero trascinamento */
  if (st.drag.armed === false){
    if (Math.hypot(e.clientX - st.drag.cx, e.clientY - st.drag.cy) < DRAG_PX) return;
    st.drag.armed = true;
  }
  const p = ground(e); if (!p) return;
  const tol = tolPx()*.8;
  snapLines.length = 0;

  if (st.drag.kind === 'draw'){
    const dr = st.draft, g = st.drag.g;
    if (dr.kind === 'rect'){
      dr.x1 = snap1(p[0], g, 'x', tol, [Math.min(dr.y0, p[1]), Math.max(dr.y0, p[1])]);
      dr.y1 = snap1(p[1], g, 'y', tol, [Math.min(dr.x0, p[0]), Math.max(dr.x0, p[0])]);
      readout(fmtLen(Math.abs(dr.x1 - dr.x0)) + ' × ' + fmtLen(Math.abs(dr.y1 - dr.y0)));
    } else if (Math.abs(p[0]-dr.x0) >= Math.abs(p[1]-dr.y0)){
      dr.x1 = snap1(p[0], g, 'x', tol, [dr.y0, dr.y0]); dr.y1 = dr.y0;
      readout(fmtLen(Math.abs(dr.x1 - dr.x0)));
    } else {
      dr.x1 = dr.x0; dr.y1 = snap1(p[1], g, 'y', tol, [dr.x0, dr.x0]);
      readout(fmtLen(Math.abs(dr.y1 - dr.y0)));
    }
    st.overlayDirty = true; return;
  }
  const dx = p[0] - st.drag.start[0], dy = p[1] - st.drag.start[1], o = st.drag.orig, g = st.drag.g, it = selItem();
  if (!it) return;
  let light = false;

  if (st.drag.kind === 'move'){
    if (it.type === 'wall'){
      /* il muro scorre solo di traverso (niente spostamenti storti per sbaglio) e allunga o accorcia i muri collegati;
         per allungarlo si trascinano i pallini alle estremità, per spostarlo in lungo si usano le frecce */
      const w = it.obj, h = isH(o), att = st.drag.attached, lockAlong = true;
      const ext = h ? [o.x1, o.x2] : [o.y1, o.y2];
      const ddx = (h && lockAlong) ? 0 : snapDelta([o.x1,o.x2], dx, g, 'x', tol, h ? null : ext);
      const ddy = (!h && lockAlong) ? 0 : snapDelta([o.y1,o.y2], dy, g, 'y', tol, h ? ext : null);
      w.x1 = o.x1 + ddx; w.x2 = o.x2 + ddx; w.y1 = o.y1 + ddy; w.y2 = o.y2 + ddy;
      w.ops.forEach((op,i) => { op.p = o.ops[i].p + (h ? ddx : ddy); });
      att.forEach(a => { const b = byId(st.plan.walls, a.id); if (b) b[a.key] = a.orig + (h ? ddy : ddx); });
      readout(clearTxt(wallGaps(w), h ? ['n','s'] : ['w','e']));
    } else if (it.type === 'op'){
      const w = it.wall, h = isH(o), oo = o.ops[st.sel.i];
      const a = h ? o.x1 : o.y1, b = h ? o.x2 : o.y2;
      /* aggancio al centro dello spazio libero fra i muri, o alla griglia */
      let np = oo.p + (h ? dx : dy);
      const gp = opGaps(w, it.op), mid = (gp.a + gp.b)/2;
      if (snapOn()){
        if (Math.abs(np - mid) < tol){ np = mid; const c = h ? w.y1 : w.x1;
          snapLines.push(h ? { ax:'x', v:mid, a:c - 14, b:c + 14 } : { ax:'y', v:mid, a:c - 14, b:c + 14 }); }
        else np = Math.round(np/GRID)*GRID;
      }
      it.op.p = clamp(np, a + oo.w/2, b - oo.w/2);
      const g2 = opGaps(w, it.op);
      readout((h ? '← ' : '↑ ') + fmtLen(it.op.p - it.op.w/2 - g2.a) + '   ' + (h ? '→ ' : '↓ ') + fmtLen(g2.b - it.op.p - it.op.w/2));
    } else if (it.type === 'column'){
      const c = it.obj, ddx = snapDelta([o.x0,o.x1], dx, g, 'x', tol, [o.y0 + dy, o.y1 + dy]), ddy = snapDelta([o.y0,o.y1], dy, g, 'y', tol, [o.x0 + dx, o.x1 + dx]);
      c.x0 = o.x0 + ddx; c.x1 = o.x1 + ddx; c.y0 = o.y0 + ddy; c.y1 = o.y1 + ddy;
    } else if (it.type === 'sys'){
      const ob = it.obj, nx = o.x + dx, ny = o.y + dy;
      const ws = SYS[ob.t].m === 'w' ? wallSnap(nx, ny, tol*1.8) : null;
      if (ws){ ob.x = ws.x; ob.y = ws.y; ob.rot = ws.rot; }
      else { ob.rot = o.rot; ob.x = o.x + snapDelta([o.x], dx, g, 'x', tol, [ny, ny]); ob.y = o.y + snapDelta([o.y], dy, g, 'y', tol, [nx, nx]); }
    } else if (it.type === 'floor' || it.type === 'rail' || it.type === 'run'){
      const xs = o.pts.map(q => q[0]), ys = o.pts.map(q => q[1]);
      const ddx = snapDelta(xs, dx, g, 'x', tol, [Math.min(...ys) + dy, Math.max(...ys) + dy]);
      const ddy = snapDelta(ys, dy, g, 'y', tol, [Math.min(...xs) + dx, Math.max(...xs) + dx]);
      it.obj.pts = o.pts.map(q => [q[0] + ddx, q[1] + ddy]);
    } else if (it.type === 'label'){
      it.obj.x = o.x + snapDelta([o.x], dx, NOG, 'x', tol); it.obj.y = o.y + snapDelta([o.y], dy, NOG, 'y', tol);
    } else if (it.type === 'furn'){
      moveFurn(it.obj, o, dx, dy, tol, st.drag.F); light = true;
    }
  } else if (st.drag.kind === 'handle'){
    const k = st.drag.h.k;
    if (it.type === 'wall'){
      const w = it.obj;
      if (isH(o)){ const sx = snap1(p[0], g, 'x', tol, [o.y1, o.y1]); if (k === 'a') w.x1 = Math.min(sx, o.x2 - 4); else w.x2 = Math.max(sx, o.x1 + 4); readout(fmtLen(w.x2 - w.x1)); }
      else      { const sy = snap1(p[1], g, 'y', tol, [o.x1, o.x1]); if (k === 'a') w.y1 = Math.min(sy, o.y2 - 4); else w.y2 = Math.max(sy, o.y1 + 4); readout(fmtLen(w.y2 - w.y1)); }
    } else if (it.type === 'op'){
      const w = it.wall, h = isH(w), oo = o.ops[st.sel.i];
      const v = snap1(h ? p[0] : p[1], NOG, h ? 'x' : 'y', tol);
      let lo = oo.p - oo.w/2, hi = oo.p + oo.w/2;
      if (k === 'lo') lo = Math.min(v, hi - 8); else hi = Math.max(v, lo + 8);
      lo = Math.max(lo, h ? w.x1 : w.y1); hi = Math.min(hi, h ? w.x2 : w.y2);
      if (hi - lo >= 6){ it.op.p = (lo+hi)/2; it.op.w = hi - lo; }
      readout(fmtLen(it.op.w));
    } else if (it.type === 'column'){
      const c = it.obj, sx = snap1(p[0], g, 'x', tol, [p[1], p[1]]), sy = snap1(p[1], g, 'y', tol, [p[0], p[0]]);
      if (k === 'tl'){ c.x0 = Math.min(sx, o.x1 - 2); c.y0 = Math.min(sy, o.y1 - 2); }
      else { c.x1 = Math.max(sx, o.x0 + 2); c.y1 = Math.max(sy, o.y0 + 2); }
      readout(fmtLen(c.x1 - c.x0) + ' × ' + fmtLen(c.y1 - c.y0));
    } else if (it.type === 'floor'){
      const sx = snap1(p[0], g, 'x', tol, [p[1], p[1]]), sy = snap1(p[1], g, 'y', tol, [p[0], p[0]]);
      if (st.drag.rect){
        const opp = o.pts[(k + 2) % 4];
        const x0 = Math.min(sx, opp[0]), x1 = Math.max(sx, opp[0]), y0 = Math.min(sy, opp[1]), y1 = Math.max(sy, opp[1]);
        if (x1 - x0 >= 4 && y1 - y0 >= 4) it.obj.pts = [[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
        readout(fmtLen(x1 - x0) + ' × ' + fmtLen(y1 - y0));
      } else it.obj.pts[k] = [sx, sy];
    } else if (it.type === 'rail' || it.type === 'run'){
      it.obj.pts[k] = [snap1(p[0], g, 'x', tol, [p[1], p[1]]), snap1(p[1], g, 'y', tol, [p[0], p[0]])];
    } else if (it.type === 'furn'){
      const f = it.obj;
      let a = Math.atan2(p[1] - f.y, p[0] - f.x) * 180 / Math.PI - 90;
      a = snapOn() ? Math.round(a / 15) * 15 : Math.round(a); f.rot = ((a % 360) + 360) % 360;
      readout(f.rot + '°'); light = true;
    }
  }
  /* durante il trascinamento di un arredo ricostruisco solo gli arredi: muri e pavimenti restano fermi */
  st.needRebuild = light ? (st.needRebuild === true ? true : 'furn') : true;
  st.overlayDirty = true;
}

function editorUp(e, cancelled){
  pointers.delete(e.pointerId);
  if (!st.editing || !st.drag) return;
  if (cancelled){ cancelInteraction(true); return; }
  const d = st.drag; st.drag = null; snapLines.length = 0; readout('');
  if (d.kind === 'draw') return finishDraw(d);
  if (d.kind === 'place'){ if (!d.moved) doPlace(d); return; }
  if (JSON.stringify(st.plan) !== d.before){
    const keep = st.sel; st.plan = normalize(st.plan); st.sel = keep; validateSel();
    pushUndo(d.before); rebuild(); st.needRebuild = false;
  }
  st.overlayDirty = true; refreshProps();
}

function cancelInteraction(restore){
  if (st.drag && restore && st.drag.before && JSON.stringify(st.plan) !== st.drag.before){
    st.plan = normalize(JSON.parse(st.drag.before)); st.needRebuild = true; validateSel(); refreshProps();
  }
  st.drag = null; st.draft = null; snapLines.length = 0; readout(''); st.overlayDirty = true;
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
  const len = Math.hypot(dr.x1 - dr.x0, dr.y1 - dr.y0);
  if (len < 4) return;
  if (st.tool === 'run'){
    const r = { id:uid(), k:runKind, h:RUNK[runKind].h, pts:[[dr.x0,dr.y0],[dr.x1,dr.y1]] };
    st.plan.runs.push(r); pushUndo(before); rebuild();
    flash(RUNK[runKind].n + ': tratto di ' + fmtM(runLen(r)) + '. Trascina ancora per continuare.');
    return;
  }
  if (st.tool === 'wallE' || st.tool === 'wallI'){
    /* resto nello strumento: si disegnano più muri di fila, partendo dalla fine del precedente */
    const w = { id:uid(), x1:Math.min(dr.x0,dr.x1), y1:Math.min(dr.y0,dr.y1), x2:Math.max(dr.x0,dr.x1), y2:Math.max(dr.y0,dr.y1), k:st.tool === 'wallE' ? 'e' : 'i', ops:[] };
    st.plan.walls.push(w); pushUndo(before); rebuild();
    flash('Muro di ' + fmtLen(len) + ' aggiunto. Trascina ancora per il prossimo, Esc o Seleziona per finire.', 3500);
  } else {
    const r = { id:uid(), kind:st.tool === 'glazed' ? 'glazed' : st.tool === 'fence' ? 'fence' : 'rail', pts:[[dr.x0,dr.y0],[dr.x1,dr.y1]] };
    if (r.kind === 'glazed') r.pw = .5;
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
    const dd = FURN[st.furnType];
    const f = { id:uid(), type:st.furnType, x:p[0], y:p[1], rot:0, w:dd.w, d:dd.d, h:dd.h };
    /* anche appena messo si appoggia al muro vicino, come quando lo trascini */
    moveFurn(f, { x:p[0], y:p[1], rot:0 }, 0, 0, tol*.8, obstacleFaces());
    snapLines.length = 0; readout('');
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
  if (e.key === 'Alt') freeMove = true;
  if (!st.editing || typing(e.target)) return;
  const k = e.key, mod = e.ctrlKey || e.metaKey;
  if (mod && k.toLowerCase() === 'z'){ e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
  if (mod && k.toLowerCase() === 'y'){ e.preventDefault(); redo(); return; }
  if (mod && k.toLowerCase() === 'd'){ e.preventDefault(); duplicateSel(); return; }
  if (k === 'Delete' || k === 'Backspace'){ if (st.sel){ e.preventDefault(); deleteSel(); } return; }
  if (k === 'Escape'){ cancelInteraction(true); if (st.tool !== 'select') setTool('select'); else setSel(null); return; }
  if (!mod && !e.altKey && k >= '1' && k <= '4'){ setLevel(Object.keys(LEVELS)[+k - 1]); return; }
  if (!mod && (k === 'r' || k === 'R')){ const it = selItem(); if (it && it.type === 'furn'){ mutate(() => { it.obj.rot = (it.obj.rot + 90) % 360; }); } return; }
  if (k.indexOf('Arrow') === 0 && st.sel){
    e.preventDefault();
    const step = (e.shiftKey ? 4 : 1) * GRID;
    nudge(k === 'ArrowLeft' ? -step : k === 'ArrowRight' ? step : 0, k === 'ArrowUp' ? -step : k === 'ArrowDown' ? step : 0);
  }
});
window.addEventListener('keyup', e => { if (e.key === 'Alt') freeMove = false; });
window.addEventListener('blur', () => { freeMove = false; });

/* ---------- attivazione dell’editor ---------- */
function setEditing(on){
  if (on === st.editing) return;
  st.editing = on;
  if (on && st.cmpId) setCompare(null);
  document.querySelectorAll('.edit-only').forEach(e => { e.hidden = !on; });
  document.body.dataset.editing = on ? '1' : '0';
  $('btnEdit').setAttribute('aria-pressed', String(on));
  $('editLbl').textContent = on ? 'Fine' : 'Modifica';
  if (on){
    if (st.mode !== 'plan') setMode('plan');
    controls.enableRotate = false;
    setLevel(st.level);
  } else {
    controls.enableRotate = true;
    st.sel = null; st.draft = null; st.drag = null; pointers.clear(); canvas.style.cursor = ''; snapLines.length = 0; readout('');
  }
  updateLow(); st.overlayDirty = true; refreshProps(); histBtns();
}
$('btnEdit').addEventListener('click', () => setEditing(!st.editing));

export { GRID, LEVEL_TIPS, TIPS, buildDock, clearTxt, clearances, deleteSel, duplicateSel, editorDown, editorMove, editorUp, flash, fmtLen, furnHalf, getHandles, ground, histBtns, mutate, obstacleFaces, opt, pushUndo, rightAngle, selItem, setEditing, setSel, snapLines, splitRail, tolPx, validateSel, wallGaps };
