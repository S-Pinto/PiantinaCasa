import * as THREE from 'three';
import { $, H, S, X, Z, byId, clamp, pointInPoly, polyArea, segDist, st } from './core.js';
import { btn, el, fld, note, numIn, section, selIn, txtIn } from './dom.js';
import { camera, canvas, editG, scene, stage } from './scene.js';
import { fbox, fcyl } from './furniture.js';
import { isH, uid, wallT } from './model.js';
import { clearGroup, floorElev, rebuild } from './build.js';
import { GRID, deleteSel, duplicateSel, flash, ground, mutate, opt, pushUndo, selItem, setSel, tolPx } from './editor.js';
import { ACC, ORG, ovBox } from './overlay.js';
import { propsEl, refreshProps, sheetEl } from './props.js';
import { toggleMenu, toggleVar } from './variants.js';

/* Impianti: elettrico, idraulico e domotica. Punti (st.plan.sys) e tracciati (st.plan.runs), livelli accendibili,
   aggancio ai muri, catalogo nell’editor, anteprima e scheda veloce al passaggio del mouse, elenco quantità. */

/* ------------------------- Impianti: elettrico, idraulico, domotica ------------------------- */
/* Ogni punto d’impianto ha un tipo (SYS), una posizione in pixel della piantina, un’altezza da terra (z, in metri),
   una rotazione (il fronte guarda verso +z locale, come gli arredi) e una nota libera (circ: circuito, linea…).
   m = montaggio: w parete, c soffitto, f pavimento. g = sigla mostrata nel simbolo. s = misure [l, h, p] in metri.
   I tracciati (runs) sono tratti di cavo o di tubo, con tipo (RUNK) e altezza da terra. */
const LAYERS = {
  el:  { n:'Elettrico', c:'#e8a317' },
  h2o: { n:'Idraulico', c:'#2f86d6' },
  dom: { n:'Domotica',  c:'#2fa36b' }
};
const SYS = {
  presa:      { n:'Presa 10/16 A', l:'el', g:'P', m:'w', z:.3 },
  schuko:     { n:'Presa Schuko', l:'el', g:'SK', m:'w', z:.3 },
  presa_usb:  { n:'Presa con USB', l:'el', g:'USB', m:'w', z:.3 },
  presa_ded:  { n:'Presa dedicata (forno, piano)', l:'el', g:'E', m:'w', z:.6 },
  presa_tv:   { n:'Presa TV / SAT', l:'el', g:'TV', m:'w', z:.3 },
  presa_lan:  { n:'Presa di rete (LAN)', l:'el', g:'LAN', m:'w', z:.3 },
  interr:     { n:'Interruttore', l:'el', g:'I', m:'w', z:1.1 },
  deviatore:  { n:'Deviatore', l:'el', g:'D', m:'w', z:1.1 },
  invert:     { n:'Invertitore', l:'el', g:'INV', m:'w', z:1.1 },
  pulsante:   { n:'Pulsante', l:'el', g:'PU', m:'w', z:1.1 },
  luce_soff:  { n:'Punto luce a soffitto', l:'el', g:'L', m:'c', z:H, s:[.14,.03,.14] },
  luce_par:   { n:'Punto luce a parete', l:'el', g:'LP', m:'w', z:2, s:[.14,.1,.06] },
  quadro:     { n:'Quadro elettrico', l:'el', g:'Q', m:'w', z:1.5, s:[.4,.5,.1] },
  citofono:   { n:'Citofono / videocitofono', l:'el', g:'VC', m:'w', z:1.5, s:[.14,.2,.04] },
  af:         { n:'Attacco acqua fredda', l:'h2o', g:'AF', m:'w', z:.55, c:'#2f86d6', b:'#c9ced3', s:[.05,.05,.06] },
  ac:         { n:'Attacco acqua calda', l:'h2o', g:'AC', m:'w', z:.55, c:'#d64a2f', b:'#c9ced3', s:[.05,.05,.06] },
  scarico:    { n:'Scarico a parete', l:'h2o', g:'S', m:'w', z:.4, c:'#7b6a58', b:'#8f8a84', s:[.08,.08,.06] },
  piletta:    { n:'Piletta a pavimento', l:'h2o', g:'PI', m:'f', z:0, c:'#7b6a58', b:'#aeb4b9', s:[.12,.01,.12] },
  collettore: { n:'Collettore', l:'h2o', g:'CO', m:'w', z:.5, s:[.6,.35,.1], b:'#d9dcdf' },
  caldaia:    { n:'Caldaia / scaldabagno', l:'h2o', g:'CA', m:'w', z:1.4, s:[.45,.7,.3] },
  radiatore:  { n:'Radiatore', l:'h2o', g:'R', m:'w', z:.45, s:[.8,.6,.08] },
  rubinetto:  { n:'Rubinetto esterno', l:'h2o', g:'RB', m:'w', z:.6, b:'#c9ced3', s:[.05,.05,.1] },
  hub:        { n:'Hub / gateway domotico', l:'dom', g:'HUB', m:'w', z:1.2, s:[.15,.15,.04] },
  ap:         { n:'Access point Wi-Fi', l:'dom', g:'AP', m:'c', z:H, s:[.18,.04,.18] },
  cam:        { n:'Telecamera', l:'dom', g:'CAM', m:'w', z:2.4, s:[.09,.09,.16], b:'#2b3036' },
  pir:        { n:'Sensore di movimento', l:'dom', g:'MOV', m:'w', z:2.2 },
  contatto:   { n:'Sensore porta / finestra', l:'dom', g:'APR', m:'w', z:2 },
  fumo:       { n:'Rilevatore di fumo', l:'dom', g:'FUM', m:'c', z:H, s:[.11,.04,.11] },
  gas:        { n:'Rilevatore di gas', l:'dom', g:'GAS', m:'w', z:2.4 },
  allag:      { n:'Sensore di allagamento', l:'dom', g:'H₂O', m:'f', z:0, s:[.07,.02,.07] },
  clima:      { n:'Termostato / sensore clima', l:'dom', g:'T°', m:'w', z:1.5 },
  tapparella: { n:'Attuatore tapparella', l:'dom', g:'TAP', m:'w', z:1.1 },
  rele:       { n:'Attuatore luce / relè', l:'dom', g:'REL', m:'w', z:1.1 },
  valvola:    { n:'Elettrovalvola acqua', l:'dom', g:'EV', m:'w', z:.5 },
  sirena:     { n:'Sirena', l:'dom', g:'SIR', m:'w', z:2.4, s:[.18,.22,.07] },
  energia:    { n:'Misuratore consumi', l:'dom', g:'kWh', m:'w', z:1.5 }
};
const RUNK = {
  el:   { n:'Linea elettrica', l:'el', c:'#e8a317', r:.012, h:.3 },
  dati: { n:'Cavo dati / bus', l:'dom', c:'#2fa36b', r:.01, h:.25 },
  af:   { n:'Tubo acqua fredda', l:'h2o', c:'#2f86d6', r:.016, h:.12 },
  ac:   { n:'Tubo acqua calda', l:'h2o', c:'#d64a2f', r:.016, h:.17 },
  sc:   { n:'Tubo di scarico', l:'h2o', c:'#7b6a58', r:.035, h:.07 }
};
const SYS_MOUNT = { w:'a parete', c:'a soffitto', f:'a pavimento' };

/* ---------- impianti in 3D: un gruppo per livello, accesi e spenti dall’utente ---------- */
const sysG = new THREE.Group(); scene.add(sysG);
const sysL = {};
Object.keys(LAYERS).forEach(k => { sysL[k] = new THREE.Group(); sysL[k].visible = false; sysG.add(sysL[k]); });
const sysColor = t => SYS[t].c || LAYERS[SYS[t].l].c;
const glyphCache = {}, sprCache = {}, runMatCache = {};
function glyphTex(text, col){
  const k = text + col; if (glyphCache[k]) return glyphCache[k];
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  g.beginPath(); g.arc(64, 64, 55, 0, Math.PI*2); g.fillStyle = col; g.fill();
  g.lineWidth = 9; g.strokeStyle = '#ffffff'; g.stroke();
  g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '700 ' + (text.length >= 3 ? 37 : text.length === 2 ? 50 : 64) + 'px Figtree, system-ui, sans-serif';
  g.fillText(text, 64, 68);
  const t = new THREE.CanvasTexture(cv); t.anisotropy = 4;
  return glyphCache[k] = t;
}
function sysSprite(t){
  const m = sprCache[t] || (sprCache[t] = new THREE.SpriteMaterial({ map:glyphTex(SYS[t].g, sysColor(t)), depthTest:false, depthWrite:false, transparent:true, sizeAttenuation:false }));
  m.depthTest = sysWalkDepth;
  const sp = new THREE.Sprite(m); sp.scale.set(sprK, sprK, 1); sp.renderOrder = 12; sysSprites.push(sp); return sp;
}
/* I simboli restano della stessa misura sullo schermo (circa 26 px), a qualsiasi zoom */
const sysSprites = []; let sprK = .03;
let sysWalkDepth = false;
function updSysSprites(){
  sprK = 26 / Math.max(1, canvas.clientHeight) * 2 * Math.tan(camera.fov * Math.PI / 360);
  const sid = (st.editing && st.sel && st.sel.type === 'sys') ? st.sel.id : null;
  sysSprites.forEach(sp => { const on = sp.userData.id === sid, k = on ? sprK * 1.45 : sprK; sp.scale.set(k, k, 1); sp.renderOrder = on ? 25 : 12; });
  /* In passeggiata i simboli e i tubi restano dietro ai muri, nelle altre viste si vedono attraverso */
  const wd = st.mode === 'walk';
  if (wd !== sysWalkDepth){
    sysWalkDepth = wd;
    Object.keys(sprCache).forEach(k => { sprCache[k].depthTest = wd; });
    Object.keys(runMatCache).forEach(k => { runMatCache[k].depthTest = wd; });
  }
}
function runMat(c){ const m = runMatCache[c] || (runMatCache[c] = new THREE.MeshBasicMaterial({ color:c, transparent:true, opacity:.92, depthTest:false, depthWrite:false })); m.depthTest = sysWalkDepth; return m; }
function buildSys(o){
  const d = SYS[o.t]; if (!d) return;
  const g = new THREE.Group(), col = sysColor(o.t), body = d.b || '#f4f4f2';
  const sz = d.s || (d.m === 'w' ? [.085,.085,.025] : [.12,.02,.12]);
  if (d.m === 'w'){
    fbox(g, sz[0], sz[1], sz[2], 0, -sz[1]/2, sz[2]/2, body);
    fbox(g, sz[0]*.5, sz[1]*.5, .008, 0, -sz[1]*.25, sz[2] + .004, col);
  } else {
    const ceil = d.m === 'c', r = sz[0]/2, h = sz[1];
    fcyl(g, r, h, 0, ceil ? -h : 0, 0, body);
    fcyl(g, r*.5, .008, 0, ceil ? -h - .008 : h, 0, col);
  }
  const sp = sysSprite(o.t); sp.userData.id = o.id;
  sp.position.set(0, d.m === 'c' ? -.24 : d.m === 'f' ? .24 : 0, d.m === 'w' ? sz[2] + .14 : 0);
  g.add(sp);
  g.position.set(X(o.x), floorElev(o.x, o.y) + o.z, Z(o.y));
  g.rotation.y = -o.rot * Math.PI / 180;
  sysL[d.l].add(g);
}
const UPV = new THREE.Vector3(0, 1, 0);
function buildRun(r){
  const k = RUNK[r.k]; if (!k) return;
  const m = runMat(k.c), grp = new THREE.Group();
  const y = p => floorElev(p[0], p[1]) + r.h;
  r.pts.forEach(p => {
    const b = new THREE.Mesh(new THREE.SphereGeometry(k.r * 1.25, 12, 8), m);
    b.position.set(X(p[0]), y(p), Z(p[1])); b.renderOrder = 11; grp.add(b);
  });
  for (let i = 0; i < r.pts.length - 1; i++){
    const a = new THREE.Vector3(X(r.pts[i][0]), y(r.pts[i]), Z(r.pts[i][1]));
    const b = new THREE.Vector3(X(r.pts[i+1][0]), y(r.pts[i+1]), Z(r.pts[i+1][1]));
    const dir = b.clone().sub(a), len = dir.length(); if (len < 1e-4) continue;
    const c = new THREE.Mesh(new THREE.CylinderGeometry(k.r, k.r, len, 10), m);
    c.position.copy(a).add(b).multiplyScalar(.5);
    c.quaternion.setFromUnitVectors(UPV, dir.normalize());
    c.renderOrder = 11; grp.add(c);
  }
  sysL[k.l].add(grp);
}

/* Aggancio al muro: il punto finisce sulla faccia del muro più vicino, dal lato del clic, col fronte verso la stanza */
function wallSnap(px, py, tol){
  let best = null, bd = Infinity;
  st.plan.walls.forEach(w => { const d = segDist(px, py, w.x1, w.y1, w.x2, w.y2); if (d <= wallT(w)/2 + tol && d < bd){ bd = d; best = w; } });
  if (!best) return null;
  const h = isH(best), c = h ? best.y1 : best.x1, lo = h ? best.x1 : best.y1, hi = h ? best.x2 : best.y2;
  let along = h ? px : py; if (opt.snap) along = Math.round(along / GRID) * GRID;
  along = clamp(along, lo + 1, hi - 1);
  const side = ((h ? py : px) - c) >= 0 ? 1 : -1, off = wallT(best)/2 + .3;
  return h ? { x:along, y:c + side*off, rot:side > 0 ? 0 : 180 } : { x:c + side*off, y:along, rot:side > 0 ? 270 : 90 };
}
/* Punto o tracciato d’impianto sotto il puntatore (solo nei livelli accesi): il simbolo è largo circa 26 px */
function sysHit(px, py, tol){
  let best = null, bd = Infinity;
  st.plan.sys.forEach(o => {
    if (!layerOn[SYS[o.t].l]) return;
    const d = Math.hypot(px - o.x, py - o.y);
    if (d <= Math.max(4.5, tol*1.3) && d < bd){ bd = d; best = { type:'sys', id:o.id }; }
  });
  if (best) return best;
  for (let j = st.plan.runs.length - 1; j >= 0; j--){
    const r = st.plan.runs[j]; if (!layerOn[RUNK[r.k].l]) continue;
    for (let i=0; i<r.pts.length-1; i++){
      const a = r.pts[i], b = r.pts[i+1];
      if (segDist(px,py,a[0],a[1],b[0],b[1]) <= 2 + tol*.5) return { type:'run', id:r.id };
    }
  }
  return null;
}
function sysSpot(p){
  const d = SYS[sysType];
  let q = { x:opt.snap ? Math.round(p[0]/GRID)*GRID : p[0], y:opt.snap ? Math.round(p[1]/GRID)*GRID : p[1], rot:0, wall:false };
  if (d.m === 'w'){ const ws = wallSnap(p[0], p[1], tolPx()*1.5); if (ws){ q = ws; q.wall = true; } }
  return q;
}
function placeSys(p, before){
  const d = SYS[sysType], q = sysSpot(p);
  st.plan.sys.push({ id:uid(), t:sysType, x:q.x, y:q.y, z:d.z, rot:q.rot });
  pushUndo(before); rebuild();
  flash(d.n + ' in ' + roomName(q.x, q.y) + '. Tocca ancora per metterne un altro.');
}
/* Attacchi tipici dietro ai sanitari: [tipo, spostamento laterale (m), altezza (m), 'c' = al centro a pavimento] */
const FIX = {
  wc:       [['af', -.15, .2], ['scarico', 0, .2]],
  bidet:    [['af', -.08, .2], ['ac', .08, .2], ['scarico', 0, .15]],
  lavabo:   [['af', -.08, .55], ['ac', .08, .55], ['scarico', 0, .45]],
  doccia:   [['af', -.1, 1.1], ['ac', .1, 1.1], ['piletta', 0, 0, 'c']],
  vasca:    [['af', -.1, .7], ['ac', .1, .7], ['scarico', 0, .2]],
  cucina:   [['af', -.08, .55], ['ac', .08, .55], ['scarico', 0, .45]],
  lavatrice:[['af', .15, .9], ['scarico', -.1, .7], ['schuko', -.3, .3]]
};
function addFixtureHookups(){
  let n = 0;
  mutate(() => {
    st.plan.furniture.forEach(f => {
      const spec = FIX[f.type]; if (!spec) return;
      const th = f.rot * Math.PI / 180;
      spec.forEach(sp => {
        const lx = sp[1] / S, ly = sp[3] === 'c' ? 0 : -f.d / S / 2;
        const x = f.x + lx * Math.cos(th) - ly * Math.sin(th), y = f.y + lx * Math.sin(th) + ly * Math.cos(th);
        if (st.plan.sys.some(o => o.t === sp[0] && Math.hypot(o.x - x, o.y - y) < 6)) return;
        st.plan.sys.push({ id:uid(), t:sp[0], x:x, y:y, z:sp[2], rot:f.rot }); n++;
      });
    });
  });
  setLayer('h2o', true);
  flash(n ? 'Aggiunti ' + n + ' attacchi dietro a sanitari, cucina e lavatrice. Controllali e spostali dove servono.' : 'Gli attacchi ci sono già.');
}

/* ---------- livelli degli impianti ---------- */
const LAYER_KEY = 'piantina-livelli-impianti';
const layerOn = { el:false, h2o:false, dom:false };
try { const ls = JSON.parse(localStorage.getItem(LAYER_KEY) || 'null'); if (ls) Object.keys(layerOn).forEach(k => { layerOn[k] = !!ls[k]; }); } catch(e){}
function setLayer(k, on){
  layerOn[k] = !!on; sysL[k].visible = !!on;
  const cb = $('ly-' + k); if (cb) cb.checked = !!on;
  $('btnSys').classList.toggle('on', Object.keys(layerOn).some(x => layerOn[x]));
  try { localStorage.setItem(LAYER_KEY, JSON.stringify(layerOn)); } catch(e){}
  if (!on && st.sel && (st.sel.type === 'sys' || st.sel.type === 'run')){
    const it = selItem();
    if (it && (it.type === 'sys' ? SYS[it.obj.t].l : RUNK[it.obj.k].l) === k) setSel(null);
  }
  st.overlayDirty = true;
}
/* Da chiamare all’avvio: rimette i livelli com’erano e collega le caselle del menu */
function initImpianti(){
  Object.keys(layerOn).forEach(k => {
    setLayer(k, layerOn[k]);
    $('ly-' + k).addEventListener('change', e => setLayer(k, e.target.checked));
  });
}
const sysMenu = $('sysmenu'), btnSys = $('btnSys');
function toggleSysMenu(open){ sysMenu.hidden = !open; btnSys.setAttribute('aria-expanded', String(open)); if (open){ toggleMenu(false); toggleVar(false); } }
btnSys.addEventListener('click', () => toggleSysMenu(sysMenu.hidden));
document.addEventListener('pointerdown', e => {
  if (!sysMenu.hidden && !sysMenu.contains(e.target) && !btnSys.contains(e.target)) toggleSysMenu(false);
});
window.addEventListener('keydown', e => { if (e.key === 'Escape'){ if (!sysMenu.hidden) toggleSysMenu(false); if (!$('qty').hidden) $('qty').hidden = true; } });

/* ---------- elenco quantità ---------- */
function roomName(px, py){
  let best = null, ba = Infinity;
  st.plan.floors.forEach(f => { if (f.name && pointInPoly(px, py, f.pts)){ const a = polyArea(f.pts); if (a < ba){ ba = a; best = f.name; } } });
  return best || 'Esterno';
}
function runLen(r){ let L = 0; for (let i=0; i<r.pts.length-1; i++) L += Math.hypot(r.pts[i+1][0]-r.pts[i][0], r.pts[i+1][1]-r.pts[i][1]); return L * S; }
const fmtNum = (v, dg) => v.toLocaleString('it-IT', { minimumFractionDigits:dg, maximumFractionDigits:dg });
const fmtM = m => fmtNum(m, 1) + ' m';
function sysQty(){
  const out = {}, im = {}, rm = {};
  Object.keys(LAYERS).forEach(l => { out[l] = { items:[], runs:[] }; });
  st.plan.sys.forEach(o => {
    const e = im[o.t] || (im[o.t] = { t:o.t, n:SYS[o.t].n, q:0, where:{} }), rn = roomName(o.x, o.y);
    e.q++; e.where[rn] = (e.where[rn] || 0) + 1;
  });
  st.plan.runs.forEach(r => {
    const e = rm[r.k] || (rm[r.k] = { k:r.k, n:RUNK[r.k].n, q:0, where:{} }), L = runLen(r);
    for (let i=0; i<r.pts.length-1; i++){
      const a = r.pts[i], b = r.pts[i+1], rn = roomName((a[0]+b[0])/2, (a[1]+b[1])/2);
      e.where[rn] = (e.where[rn] || 0) + Math.hypot(b[0]-a[0], b[1]-a[1]) * S;
    }
    e.q += L;
  });
  Object.keys(SYS).forEach(k => { if (im[k]) out[SYS[k].l].items.push(im[k]); });
  Object.keys(RUNK).forEach(k => { if (rm[k]) out[RUNK[k].l].runs.push(rm[k]); });
  return out;
}
const whereTxt = (w, m) => Object.keys(w).sort((a,b) => w[b] - w[a]).map(k => k + ' ' + (m ? fmtM(w[k]) : w[k])).join(', ');
function openQty(){
  const q = sysQty(), body = $('qtybody'); body.textContent = '';
  let any = false;
  Object.keys(LAYERS).forEach(l => {
    const L = q[l]; if (!L.items.length && !L.runs.length) return;
    any = true;
    const h = el('h3'); const dot = el('i','ldot'); dot.style.background = LAYERS[l].c;
    h.append(dot, document.createTextNode(LAYERS[l].n)); body.appendChild(h);
    const t = el('table'), hr = el('tr');
    hr.append(el('th', null, 'Voce'), el('th', null, 'Quantità'), el('th', null, 'Dove'));
    t.appendChild(hr);
    L.items.concat(L.runs).forEach(e => {
      const m = L.runs.indexOf(e) >= 0, tr = el('tr');
      const c0 = el('td'), c1 = el('span','vc'); c0.appendChild(c1);
      if (e.t){ const g = el('b','gl s', SYS[e.t].g); g.style.background = sysColor(e.t); c1.appendChild(g); }
      else { const sw = el('i'); sw.style.cssText = 'flex:none;width:24px;height:5px;margin-right:8px;border-radius:3px;background:' + RUNK[e.k].c; c1.appendChild(sw); }
      c1.appendChild(document.createTextNode(e.n));
      tr.append(c0, el('td','n', m ? fmtM(e.q) : String(e.q)), el('td','w', whereTxt(e.where, m)));
      t.appendChild(tr);
    });
    body.appendChild(t);
  });
  if (!any) body.appendChild(note('Non ci sono ancora impianti. Premi Modifica, poi Impianti per mettere prese, attacchi e sensori, o Tracciati per disegnare cavi e tubi.'));
  else body.appendChild(note('Le lunghezze sono misurate in pianta: per salite, discese e sfridi conviene aggiungere un 10–15%.'));
  $('qtycopy').disabled = $('qtycsv').disabled = !any;
  $('qty').hidden = false; toggleSysMenu(false); toggleMenu(false);
}
function qtyText(){
  const q = sysQty(), out = [];
  Object.keys(LAYERS).forEach(l => {
    const L = q[l]; if (!L.items.length && !L.runs.length) return;
    out.push(LAYERS[l].n.toUpperCase());
    L.items.forEach(e => out.push('- ' + e.n + ': ' + e.q + ' (' + whereTxt(e.where) + ')'));
    L.runs.forEach(e => out.push('- ' + e.n + ': ' + fmtM(e.q) + ' (' + whereTxt(e.where, true) + ')'));
    out.push('');
  });
  return out.join('\n').trim();
}
function qtyCsv(){
  const q = sysQty(), rows = [['Impianto','Voce','Quantità','Unità','Dove']];
  Object.keys(LAYERS).forEach(l => {
    q[l].items.forEach(e => rows.push([LAYERS[l].n, e.n, String(e.q), 'pz', whereTxt(e.where)]));
    q[l].runs.forEach(e => rows.push([LAYERS[l].n, e.n, fmtNum(e.q, 2), 'm', whereTxt(e.where, true)]));
  });
  return '﻿' + rows.map(r => r.map(c => /[;"\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c).join(';')).join('\r\n') + '\r\n';
}
$('btnQty').addEventListener('click', openQty);
$('qtyclose').addEventListener('click', () => { $('qty').hidden = true; });
$('qtycopy').addEventListener('click', async () => {
  const t = qtyText();
  try { await navigator.clipboard.writeText(t); flash('Elenco copiato.'); }
  catch(e){
    const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch(_){}
    ta.remove(); flash(ok ? 'Elenco copiato.' : 'Non riesco a copiare: usa Scarica CSV.');
  }
});
$('qtycsv').addEventListener('click', async () => {
  const data = qtyCsv(), name = 'impianti-quantita.csv';
  try {
    const dl = (window.claude && window.claude.use) ? await window.claude.use('downloads') : null;
    if (dl){ await dl.save({ filename:name, data:data }); return; }
  } catch(e){ if (e && e.code === 'declined') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type:'text/csv;charset=utf-8' })); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
});

let sysType = 'presa', runKind = 'el';
let catLayer = 'el';
function setCatLayer(l){ catLayer = l; }
const narrowUI = () => !!(window.matchMedia && matchMedia('(max-width:719px)').matches);
/* Sul telefono la scheda copre la pianta: dopo la scelta la riduco, così si può toccare dove metterlo */
function collapseSheetIfNarrow(){
  if (!narrowUI()) return;
  sheetEl.dataset.collapsed = '1';
  $('scollapse').setAttribute('aria-label', 'Apri la scheda'); $('scollapse').style.transform = 'rotate(180deg)';
}
function buildSysCatalog(){
  const tabs = el('div','segs lyt');
  Object.keys(LAYERS).forEach(l => {
    const b = el('button'); b.type = 'button';
    const dot = el('i','ldot'); dot.style.background = LAYERS[l].c;
    b.append(dot, document.createTextNode(LAYERS[l].n));
    b.setAttribute('aria-pressed', String(l === catLayer));
    b.addEventListener('click', () => {
      catLayer = l; setLayer(l, true);
      if (SYS[sysType].l !== l) sysType = Object.keys(SYS).find(k => SYS[k].l === l);
      refreshProps();
    });
    tabs.appendChild(b);
  });
  propsEl.appendChild(tabs);
  [catLayer].forEach(l => {
    const row = el('div','tex'); row.style.marginTop = '10px';
    Object.keys(SYS).filter(k => SYS[k].l === l).forEach(k => {
      const b = el('button','tx none sysb'); b.type = 'button';
      const gl = el('b','gl', SYS[k].g); gl.style.background = sysColor(k);
      b.append(gl, el('em', null, SYS[k].n));
      b.setAttribute('aria-pressed', String(k === sysType));
      b.addEventListener('click', () => { sysType = k; setLayer(l, true); refreshProps(); collapseSheetIfNarrow(); });
      row.appendChild(b);
    });
    propsEl.appendChild(row);
    if (l === 'h2o'){
      const a = el('div','acts'); a.style.marginTop = '8px';
      a.append(btn('Aggiungi gli attacchi ai sanitari', addFixtureHookups));
      propsEl.appendChild(a);
    }
  });
  propsEl.appendChild(note('Tocca la pianta per mettere l’elemento scelto: puoi metterne quanti vuoi. Poi scegli Seleziona per spostarli, cambiare altezza o scrivere il circuito.'));
}
function buildRunCatalog(){
  propsEl.appendChild(section('Tipo di linea'));
  Object.keys(RUNK).forEach(k => {
    const b = el('button','rk'); b.type = 'button';
    const sw = el('i'); sw.style.background = RUNK[k].c;
    b.append(sw, el('span', null, RUNK[k].n + ' (' + LAYERS[RUNK[k].l].n.toLowerCase() + ')'));
    b.setAttribute('aria-pressed', String(k === runKind));
    b.addEventListener('click', () => { runKind = k; setLayer(RUNK[k].l, true); refreshProps(); collapseSheetIfNarrow(); });
    propsEl.appendChild(b);
  });
  propsEl.appendChild(note('Trascina per tracciare un tratto dritto. I tratti si agganciano alle estremità di quelli già fatti, così puoi seguire il percorso a pezzi. Le lunghezze finiscono nell’elenco quantità.'));
}

/* Al passaggio del mouse: anteprima di dove finirà l’elemento e scheda veloce sui simboli */
let ghost = null;
const tipEl = $('tip');
function hideTip(){ if (!tipEl.hidden) tipEl.hidden = true; }
function hoverSys(e){
  if (e.pointerType !== 'mouse' || st.mode === 'walk' || st.drag || e.buttons){ hideTip(); return; }
  const p = ground(e); if (!p){ hideTip(); return; }
  if (st.editing && st.tool === 'sys'){
    const q = sysSpot(p); ghost = { t:sysType, x:q.x, y:q.y, wall:q.wall }; st.overlayDirty = true; hideTip(); return;
  }
  if (ghost){ ghost = null; st.overlayDirty = true; }
  if (st.editing && st.tool !== 'select'){ hideTip(); return; }
  const h = sysHit(p[0], p[1], tolPx());
  if (!h){ hideTip(); return; }
  tipEl.textContent = '';
  if (h.type === 'sys'){
    const o = byId(st.plan.sys, h.id), d = SYS[o.t];
    tipEl.append(el('b', null, d.n), el('span', null, roomName(o.x, o.y) + ', ' + SYS_MOUNT[d.m] + (d.m === 'f' ? '' : ', a ' + fmtNum(o.z, 2) + ' m da terra') + (o.circ ? '. ' + o.circ : '')));
  } else {
    const r = byId(st.plan.runs, h.id);
    tipEl.append(el('b', null, RUNK[r.k].n), el('span', null, fmtM(runLen(r)) + ', a ' + fmtNum(r.h, 2) + ' m da terra' + (r.circ ? '. ' + r.circ : '')));
  }
  const sr = stage.getBoundingClientRect();
  tipEl.hidden = false;
  const tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
  let x = e.clientX - sr.left + 16, y = e.clientY - sr.top + 16;
  if (x + tw > sr.width - 8) x = e.clientX - sr.left - tw - 12;
  if (y + th > sr.height - 8) y = e.clientY - sr.top - th - 12;
  tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
}
canvas.addEventListener('pointerleave', () => { hideTip(); if (ghost){ ghost = null; st.overlayDirty = true; } });

/* Proprietà di un punto o di un tracciato nella scheda dell’editor */
function sysProps(it, add, acts, title){
  if (it.type === 'sys'){
    const o = it.obj, d = SYS[o.t]; title.textContent = d.n;
    add(fld('Tipo', selIn(Object.keys(SYS).filter(k => SYS[k].l === d.l).map(k => [k, SYS[k].n]), o.t, v => mutate(() => {
      if (SYS[v].m !== d.m || o.z === d.z) o.z = SYS[v].z; o.t = v; }))));
    add(fld('Altezza da terra (m)', numIn(o.z, .05, 0, v => mutate(() => { o.z = clamp(v, 0, 4); }))));
    if (d.m !== 'w') add(fld('Rotazione (°)', numIn(o.rot, 15, 0, v => mutate(() => { o.rot = ((v % 360) + 360) % 360; }))));
    add(fld('Circuito o nota', txtIn(o.circ || '', v => mutate(() => { o.circ = v || undefined; }))));
    add(note(LAYERS[d.l].n + ', ' + SYS_MOUNT[d.m] + ', in ' + roomName(o.x, o.y) + '.' + (d.m === 'w' ? ' Trascinalo per spostarlo lungo il muro o su un altro muro.' : '')));
    acts.append(btn('Duplica', duplicateSel), btn('Elimina', deleteSel, 'danger'));
  } else {
    const r = it.obj; title.textContent = RUNK[r.k].n;
    add(fld('Tipo', selIn(Object.keys(RUNK).map(k => [k, RUNK[k].n]), r.k, v => mutate(() => { if (r.h === RUNK[r.k].h) r.h = RUNK[v].h; r.k = v; }))));
    add(fld('Altezza da terra (m)', numIn(r.h, .05, 0, v => mutate(() => { r.h = clamp(v, 0, 4); }))));
    add(fld('Circuito o nota', txtIn(r.circ || '', v => mutate(() => { r.circ = v || undefined; }))));
    add(note('Lunghezza in pianta: ' + fmtM(runLen(r)) + '. Trascina i cerchi per spostare le estremità.'));
    acts.append(btn('Duplica', duplicateSel), btn('Elimina', deleteSel, 'danger'));
  }
}
/* Evidenziazioni dell’editor: elemento selezionato e anteprima del punto da mettere */
function sysOverlay(it){
  if (it && it.type === 'sys'){
    const o = it.obj; ovBox(o.x - 3, o.x + 3, o.y - 3, o.y + 3, 0, .12, ACC, .35);
  } else if (it && it.type === 'run'){
    const r = it.obj;
    for (let i=0; i<r.pts.length-1; i++){
      const a = r.pts[i], b = r.pts[i+1];
      ovBox(Math.min(a[0],b[0]) - 3, Math.max(a[0],b[0]) + 3, Math.min(a[1],b[1]) - 3, Math.max(a[1],b[1]) + 3, 0, .1, ACC, .45);
    }
  }
  if (ghost && st.tool === 'sys' && !st.drag){
    const d = SYS[ghost.t];
    const sm = new THREE.SpriteMaterial({ map:glyphTex(d.g, sysColor(ghost.t)), depthTest:false, depthWrite:false, transparent:true, opacity:.6, sizeAttenuation:false });
    const sp = new THREE.Sprite(sm); sp.scale.set(sprK*1.15, sprK*1.15, 1); sp.renderOrder = 32;
    sp.position.set(X(ghost.x), .5, Z(ghost.y)); editG.add(sp);
    ovBox(ghost.x - 2.5, ghost.x + 2.5, ghost.y - 2.5, ghost.y + 2.5, 0, .1, ghost.wall ? ORG : ACC, .9);
  }
}
/* Ricostruzione dei livelli (chiamata da rebuild) */
function rebuildSys(){
  Object.keys(sysL).forEach(k => clearGroup(sysL[k])); sysSprites.length = 0;
  st.plan.sys.forEach(buildSys);
  st.plan.runs.forEach(buildRun);
}

export { RUNK, SYS, buildRunCatalog, buildSysCatalog, fmtM, hoverSys, initImpianti, layerOn, placeSys, rebuildSys, runKind, runLen, setCatLayer, setLayer, sysHit, sysOverlay, sysProps, sysType, toggleSysMenu, updSysSprites, wallSnap };
