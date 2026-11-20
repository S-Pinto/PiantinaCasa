import * as THREE from 'three';
import { $, S, X, Z, isRectPts, pointInPoly, polyArea, st } from './core.js';
import { el } from './dom.js';
import { MAING, camera, canvas, scene } from './scene.js';
import { isH, wallT } from './model.js';

/* Misure: quote interne delle stanze (luce netta fra i muri), superfici, ingombro totale della casa,
   e un metro per misurare a mano fra due punti qualsiasi (muri, pavimento, arredi). */

const measG = new THREE.Group(), tapeG = new THREE.Group();
measG.renderOrder = 10;
scene.add(measG, tapeG);
let measOn = false, measRev = -1, tapeOn = false, tapeA = null;

const fmtM = v => v.toFixed(2).replace('.', ',') + ' m';
const fmtA = v => v.toFixed(1).replace('.', ',') + ' m²';
const OUTDOOR = /balcon|veranda|terrazz/i, SKIP = /scale|ascensore/i;

/* ---------- testo sempre leggibile: etichette a dimensione costante sullo schermo ---------- */
const spriteCache = {};
function textSprite(text, kind){
  const key = kind + '|' + text;
  let tex = spriteCache[key];
  const hpx = kind === 'area' ? 54 : 46;
  if (!tex){
    const cv = document.createElement('canvas'), g = cv.getContext('2d');
    const font = (kind === 'area' ? '600 ' : '700 ') + (hpx * 0.56) + 'px Figtree, system-ui, sans-serif';
    g.font = font;
    const w = Math.ceil(g.measureText(text).width + hpx * 0.8);
    cv.width = w; cv.height = hpx;
    g.font = font;
    const bg = kind === 'total' ? '#1f5f8b' : kind === 'tape' ? '#c2410c' : kind === 'area' ? 'rgba(255,255,255,.92)' : 'rgba(22,29,37,.86)';
    const fg = kind === 'area' ? '#1c2630' : '#ffffff';
    g.fillStyle = bg;
    const r = hpx / 2;
    g.beginPath(); g.moveTo(r, 0); g.lineTo(w - r, 0); g.arc(w - r, r, r, -Math.PI/2, Math.PI/2); g.lineTo(r, hpx); g.arc(r, r, r, Math.PI/2, Math.PI*1.5); g.fill();
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, hpx / 2 + 2);
    tex = spriteCache[key] = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace; tex.userData = { aspect: w / hpx };
  }
  const m = new THREE.SpriteMaterial({ map:tex, depthTest:false, depthWrite:false, sizeAttenuation:false, toneMapped:false, transparent:true });
  const s = new THREE.Sprite(m);
  const k = kind === 'area' ? 0.021 : 0.019;
  s.scale.set(k * tex.userData.aspect, k, 1);
  s.renderOrder = 12;
  return s;
}

/* ---------- linee di quota ---------- */
const lineMats = {
  dim: new THREE.LineBasicMaterial({ color:'#1c2630', depthTest:false, transparent:true, opacity:.85, toneMapped:false }),
  total: new THREE.LineBasicMaterial({ color:'#1f5f8b', depthTest:false, transparent:true, toneMapped:false }),
  tape: new THREE.LineBasicMaterial({ color:'#c2410c', depthTest:false, transparent:true, toneMapped:false })
};
/* quota da a a b (in metri, nel piano orizzontale a quota y) con trattini obliqui alle estremità */
function dimLine(parent, ax, az, bx, bz, y, kind, text){
  const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1;
  const ux = dx / len, uz = dz / len, t = 0.14;
  const pts = [ax, y, az, bx, y, bz];
  [[ax, az], [bx, bz]].forEach(p => {
    pts.push(p[0] - (ux + uz) * t, y, p[1] - (uz - ux) * t, p[0] + (ux + uz) * t, y, p[1] + (uz - ux) * t);   // trattino a 45°
    pts.push(p[0] - uz * t * 1.6, y, p[1] + ux * t * 1.6, p[0] + uz * t * 1.6, y, p[1] - ux * t * 1.6);       // linea di richiamo
  });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const l = new THREE.LineSegments(g, lineMats[kind] || lineMats.dim); l.renderOrder = 11;
  parent.add(l);
  if (text){ const s = textSprite(text, kind === 'dim' ? 'dim' : kind); s.position.set((ax+bx)/2, y + 0.02, (az+bz)/2); parent.add(s); }
}

/* luce netta di una stanza lungo x (a quota cy) o lungo y (a quota cx): cerco le facce dei muri più vicine */
function clearSpan(f, along){
  const xs = f.pts.map(p => p[0]), ys = f.pts.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  let lo = along === 'x' ? x0 : y0, hi = along === 'x' ? x1 : y1, loF = false, hiF = false;
  st.plan.walls.forEach(w => {
    const t = wallT(w) / 2, h = isH(w);
    if (along === 'x' && !h){
      const wx = w.x1, a = Math.min(w.y1, w.y2), b = Math.max(w.y1, w.y2);
      if (cy < a || cy > b || Math.abs(wx - (wx < cx ? x0 : x1)) > 8) return;
      if (wx < cx && (!loF || wx + t > lo)){ lo = wx + t; loF = true; }
      if (wx > cx && (!hiF || wx - t < hi)){ hi = wx - t; hiF = true; }
    }
    if (along === 'y' && h){
      const wy = w.y1, a = Math.min(w.x1, w.x2), b = Math.max(w.x1, w.x2);
      if (cx < a || cx > b || Math.abs(wy - (wy < cy ? y0 : y1)) > 8) return;
      if (wy < cy && (!loF || wy + t > lo)){ lo = wy + t; loF = true; }
      if (wy > cy && (!hiF || wy - t < hi)){ hi = wy - t; hiF = true; }
    }
  });
  return { lo, hi, len:(hi - lo) * S, x0, x1, y0, y1 };
}

function roomInfo(){
  return st.plan.floors.filter(f => f.name && !SKIP.test(f.name)).map(f => {
    const rect = isRectPts(f.pts);
    const out = OUTDOOR.test(f.name);
    let w = null, d = null, net = polyArea(f.pts) * S * S;
    if (rect){ w = clearSpan(f, 'x'); d = clearSpan(f, 'y'); net = w.len * d.len; }
    return { f, rect, out, w, d, net };
  });
}

function buildMeasures(){
  measRev = st.rev;
  measG.children.slice().forEach(o => { measG.remove(o); if (o.geometry) o.geometry.dispose(); if (o.material && o.material.isSpriteMaterial) o.material.dispose(); });
  const y = 0.12, rooms = roomInfo();
  rooms.forEach(r => {
    const f = r.f;
    let cx = 0, cy = 0; f.pts.forEach(p => { cx += p[0]; cy += p[1]; }); cx /= f.pts.length; cy /= f.pts.length;
    if (r.rect){
      const w = r.w, d = r.d;
      const yq = w.y0 + (w.y1 - w.y0) * 0.24, xq = d.x0 + (d.x1 - d.x0) * 0.2;
      /* nei corridoi e negli spazi piccoli basta la superficie: le quote affollerebbero la pianta */
      if (Math.min(w.len, d.len) >= 1.5 && r.net >= 4){
        dimLine(measG, X(w.lo), Z(yq), X(w.hi), Z(yq), y, 'dim', fmtM(w.len));
        dimLine(measG, X(xq), Z(d.lo), X(xq), Z(d.hi), y, 'dim', fmtM(d.len));
      }
    }
    /* la superficie va sotto il nome della stanza */
    const lab = st.plan.labels.find(l => !l.g && pointInPoly(l.x, l.y, f.pts));
    const ax = lab ? lab.x : cx, ay = lab ? lab.y + 13 : cy;
    const s = textSprite(fmtA(r.net), 'area'); s.position.set(X(ax), y, Z(ay)); measG.add(s);
  });
  /* ingombro totale (filo esterno dei muri perimetrali) */
  const ext = st.plan.walls.filter(w => w.k === 'e');
  if (ext.length){
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    ext.forEach(w => { const t = wallT(w) / 2;
      x0 = Math.min(x0, Math.min(w.x1, w.x2) - (isH(w) ? 0 : t)); x1 = Math.max(x1, Math.max(w.x1, w.x2) + (isH(w) ? 0 : t));
      y0 = Math.min(y0, Math.min(w.y1, w.y2) - (isH(w) ? t : 0)); y1 = Math.max(y1, Math.max(w.y1, w.y2) + (isH(w) ? t : 0)); });
    const floorsY = st.plan.floors.reduce((m, f) => Math.max(m, ...f.pts.map(p => p[1])), y1);
    dimLine(measG, X(x0), Z(y0) - 1.3, X(x1), Z(y0) - 1.3, y, 'total', 'Fronte ' + fmtM((x1 - x0) * S));
    dimLine(measG, X(x0) - 1.3, Z(y0), X(x0) - 1.3, Z(floorsY), y, 'total', 'Profondità ' + fmtM((floorsY - y0) * S));
  }
  fillPanel(rooms);
}

/* ---------- pannello con l’elenco delle superfici ---------- */
const mpanel = $('mpanel'), btnMis = $('btnMis');
function fillPanel(rooms){
  const list = $('mlist'); list.textContent = '';
  let tin = 0, tout = 0;
  rooms.slice().sort((a, b) => (a.out - b.out) || (b.net - a.net)).forEach(r => {
    if (r.out) tout += r.net; else tin += r.net;
    const li = el('li', r.out ? 'out' : '');
    li.append(el('span', 'mn', r.f.name), el('span', 'md', r.rect ? (fmtM(r.w.len).replace(' m', '') + ' × ' + fmtM(r.d.len)) : ''), el('span', 'ma', fmtA(r.net)));
    list.append(li);
  });
  $('mcount').textContent = rooms.length;
  $('mtot').textContent = fmtA(tin);
  $('mout').textContent = fmtA(tout);
}
function setMeasures(on){
  measOn = on;
  btnMis.setAttribute('aria-pressed', String(on));
  mpanel.hidden = !on;
  if (!on) setTape(false);
  if (on && measRev !== st.rev) buildMeasures();
}
btnMis.addEventListener('click', () => setMeasures(!measOn));
$('mclose').addEventListener('click', () => setMeasures(false));
$('mcollapse').addEventListener('click', () => {
  const c = mpanel.dataset.collapsed === '1'; mpanel.dataset.collapsed = c ? '0' : '1';
  $('mcollapse').setAttribute('aria-label', c ? 'Riduci' : 'Espandi');
});

/* ---------- metro: due clic, distanza in pianta (e dislivello se c’è) ---------- */
const tapeRay = new THREE.Raycaster(), tapeNdc = new THREE.Vector2();
const dotMat = new THREE.MeshBasicMaterial({ color:'#c2410c', depthTest:false, toneMapped:false });
const dotGeo = new THREE.SphereGeometry(0.06, 12, 8);
function setTape(on){
  tapeOn = on; tapeA = null;
  $('mtape').setAttribute('aria-pressed', String(on));
  $('mtape').textContent = on ? 'Fine misura' : 'Misura una distanza';
  $('mtapehint').hidden = !on;
  canvas.style.cursor = on ? 'crosshair' : '';
}
$('mtape').addEventListener('click', () => setTape(!tapeOn));
$('mclear').addEventListener('click', () => {
  tapeG.children.slice().forEach(o => { tapeG.remove(o); if (o.geometry && o.geometry !== dotGeo) o.geometry.dispose(); });
  tapeA = null;
});
function pick(e){
  const r = canvas.getBoundingClientRect();
  tapeNdc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  tapeRay.setFromCamera(tapeNdc, camera);
  const objs = [MAING.f, MAING.w]; if (MAING.u.visible) objs.push(MAING.u);
  const hit = tapeRay.intersectObjects(objs, true).find(h => !(h.object.material && h.object.material.transparent));
  return hit ? hit.point.clone() : null;
}
let downAt = null;
canvas.addEventListener('pointerdown', e => { downAt = (tapeOn && e.isPrimary && e.button === 0) ? [e.clientX, e.clientY] : null; });
canvas.addEventListener('pointerup', e => {
  if (!downAt || !tapeOn || st.editing || st.mode === 'walk') return;
  if (Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
  const p = pick(e); if (!p) return;
  const dot = new THREE.Mesh(dotGeo, dotMat); dot.position.copy(p); dot.renderOrder = 13; tapeG.add(dot);
  if (!tapeA){ tapeA = p; return; }
  const a = tapeA, dh = Math.hypot(p.x - a.x, p.z - a.z), dy = Math.abs(p.y - a.y);
  const txt = fmtM(dh) + (dy > 0.05 ? '  ↕ ' + fmtM(dy) : '');
  const g = new THREE.BufferGeometry().setFromPoints([a, p]);
  const l = new THREE.Line(g, lineMats.tape); l.renderOrder = 13; tapeG.add(l);
  const s = textSprite(txt, 'tape'); s.position.copy(a).lerp(p, .5); tapeG.add(s);
  tapeA = null;
});

function measFrame(){
  if (st.editing && measOn) setMeasures(false);      /* in modifica il pannello coprirebbe gli strumenti */
  const vis = st.mode !== 'walk';
  measG.visible = measOn && vis; tapeG.visible = vis;
  if (measOn && measRev !== st.rev) buildMeasures();
}

export { measFrame };
