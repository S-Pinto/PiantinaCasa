import * as THREE from 'three';
import { $, CX, CY, H, HEAD, S, SILL, X, Z, isRectPts, pointInPoly, polyArea, st } from './core.js';
import { el } from './dom.js';
import { MAING, camera, canvas, scene } from './scene.js';
import { isH, wallT } from './model.js';
import { railThick } from './build.js';
import { controls } from './views.js';

/* Misure: quote interne delle stanze (luce netta fra i muri), superfici, ingombro totale della casa,
   e un metro per misurare a mano fra due punti qualsiasi (muri, pavimento, arredi). */

const measG = new THREE.Group(), tapeG = new THREE.Group();
measG.renderOrder = 10;
scene.add(measG, tapeG);
let measOn = false, measRev = -1, tapeOn = false, tapeA = null;

const misFmtM = v => v.toFixed(2).replace('.', ',') + ' m';
const misFmtA = v => v.toFixed(1).replace('.', ',') + ' m²';
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
    const bg = { total:'#1f5f8b', tape:'#c2410c', area:'rgba(255,255,255,.92)', wall:'#7c3aed', op:'#0f766e' }[kind] || 'rgba(22,29,37,.86)';
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
  tape: new THREE.LineBasicMaterial({ color:'#c2410c', depthTest:false, transparent:true, toneMapped:false }),
  wall: new THREE.LineBasicMaterial({ color:'#7c3aed', depthTest:false, transparent:true, toneMapped:false }),
  op:   new THREE.LineBasicMaterial({ color:'#0f766e', depthTest:false, transparent:true, opacity:.9, toneMapped:false }),
  sel:  new THREE.LineBasicMaterial({ color:'#7c3aed', depthTest:false, transparent:true, opacity:.55, toneMapped:false })
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
  if (text){ const s = textSprite(text, kind); s.position.set((ax+bx)/2, y + 0.02, (az+bz)/2); parent.add(s); }
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

/* ---------- i muri di una stanza: lunghezza di ciascuno al netto dei muri, aperture, perimetro ---------- */
const OPNAME = { door:'porta', win:'finestra', pf:'porta-finestra', open:'varco', lift:'porta ascensore' };
const RAILNAME = { glazed:'vetrata', fence:'ringhiera', rail:'parapetto' };
const CATASTO = 184;      /* superficie catastale dichiarata da Mone (m²): muri e balconi in quota compresi */
function boundSegs(){
  const out = [];
  st.plan.walls.forEach(w => { const h = isH(w);
    out.push({ h, c:h ? w.y1 : w.x1, a:h ? w.x1 : w.y1, b:h ? w.x2 : w.y2, t:wallT(w), ops:w.ops || [], kind:'wall' }); });
  st.plan.rails.forEach(r => { for (let i = 0; i < r.pts.length - 1; i++){
    const p = r.pts[i], q = r.pts[i + 1], h = Math.abs(p[1] - q[1]) < 1e-6, v = Math.abs(p[0] - q[0]) < 1e-6;
    if (!h && !v) continue;
    const a = h ? Math.min(p[0], q[0]) : Math.min(p[1], q[1]), b = h ? Math.max(p[0], q[0]) : Math.max(p[1], q[1]);
    out.push({ h, c:h ? p[1] : p[0], a, b, t:railThick(r), ops:[], kind:r.kind || 'rail' });
  } });
  return out;
}
/* il poligono del pavimento passa per l’asse dei muri: sposto ogni lato sul filo interno del suo muro
   e ricavo i nuovi vertici. Solo per stanze con lati orizzontali e verticali (tutte, in questa casa). */
function roomWalls(f, segs){
  let pts = f.pts.filter((p, i, a) => { const q = a[(i + 1) % a.length]; return Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) > 0.01; });
  pts = pts.filter((p, i, a) => { const o = a[(i - 1 + a.length) % a.length], q = a[(i + 1) % a.length];
    return !((Math.abs(o[0] - p[0]) < 1e-6 && Math.abs(p[0] - q[0]) < 1e-6) || (Math.abs(o[1] - p[1]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6)); });
  const n = pts.length;
  if (n < 4 || !pts.every((p, i) => { const q = pts[(i + 1) % n]; return Math.abs(p[0] - q[0]) < 1e-6 || Math.abs(p[1] - q[1]) < 1e-6; })) return null;
  /* giro in senso orario sullo schermo, partendo dall’angolo in alto a sinistra */
  let sa = 0; pts.forEach((p, i) => { const q = pts[(i + 1) % n]; sa += p[0] * q[1] - q[0] * p[1]; });
  if (sa < 0) pts.reverse();
  let k0 = 0; pts.forEach((p, i) => { const b = pts[k0]; if (p[1] < b[1] - 1e-6 || (Math.abs(p[1] - b[1]) < 1e-6 && p[0] < b[0])) k0 = i; });
  pts = pts.slice(k0).concat(pts.slice(0, k0));
  segs = segs || boundSegs();
  const edges = pts.map((p, i) => {
    const q = pts[(i + 1) % n], h = Math.abs(p[1] - q[1]) < 1e-6, c = h ? p[1] : p[0];
    const a = h ? Math.min(p[0], q[0]) : Math.min(p[1], q[1]), b = h ? Math.max(p[0], q[0]) : Math.max(p[1], q[1]);
    const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    const sgn = h ? (pointInPoly(mx, my + 0.5, pts) ? 1 : -1) : (pointInPoly(mx + 0.5, my, pts) ? 1 : -1);
    const hits = segs.filter(s => s.h === h && Math.abs(s.c - c) <= 6 && Math.min(s.b, b) - Math.max(s.a, a) > 2);
    let inner = c, kind = 'open';
    if (hits.length){
      const best = hits.reduce((m, s) => (Math.min(s.b, b) - Math.max(s.a, a)) > (Math.min(m.b, b) - Math.max(m.a, a)) ? s : m);
      inner = best.c + sgn * best.t / 2; kind = best.kind;
    }
    return { h, c, a, b, sgn, inner, hits, kind };
  });
  const V = edges.map((e, i) => { const pe = edges[(i - 1 + n) % n]; return e.h ? [pe.inner, e.inner] : [e.inner, pe.inner]; });
  let letter = 0;
  const walls = edges.map((e, i) => {
    const A = V[i], B = V[(i + 1) % n];
    const lo = e.h ? Math.min(A[0], B[0]) : Math.min(A[1], B[1]), hi = e.h ? Math.max(A[0], B[0]) : Math.max(A[1], B[1]);
    const ops = [];
    e.hits.forEach(s => s.ops.forEach(o => { if (o.p > lo && o.p < hi) ops.push({ t:o.t, w:o.w * S, lo:o.p - o.w / 2, hi:o.p + o.w / 2 }); }));
    ops.sort((p, q) => p.lo - q.lo);
    const len = (hi - lo) * S;
    const w = { A, B, h:e.h, sgn:e.sgn, len, kind:e.kind, ops, id:'' };
    if (e.kind !== 'open' && len >= 0.2) w.id = String.fromCharCode(65 + letter++);
    return w;
  });
  const area = polyArea(V) * S * S, per = walls.reduce((m, w) => m + w.len, 0);
  /* superficie delle pareti in muratura da pitturare, tolte porte e finestre */
  let paint = 0;
  walls.forEach(w => { if (w.kind !== 'wall') return; paint += w.len * H;
    w.ops.forEach(o => { paint -= o.w * (o.t === 'win' ? HEAD - SILL : HEAD); }); });
  return { V, walls, area, per, paint };
}

function roomInfo(){
  const segs = boundSegs();
  return st.plan.floors.filter(f => f.name && !SKIP.test(f.name)).map(f => {
    const rect = isRectPts(f.pts);
    const out = OUTDOOR.test(f.name);
    let w = null, d = null, net = polyArea(f.pts) * S * S;
    const rw = roomWalls(f, segs);
    if (rw) net = rw.area;
    if (rect){ w = clearSpan(f, 'x'); d = clearSpan(f, 'y'); if (!rw) net = w.len * d.len; }
    return { f, rect, out, w, d, net, rw };
  });
}

/* quote di tutti i muri di una stanza; con "full" anche lettere e aperture */
function wallDims(r, y, full){
  if (!r.rw) return;
  const off = 0.32 / S;
  r.rw.walls.forEach(w => {
    if (!w.id) return;
    const ax = w.h ? w.A[0] : w.A[0] + w.sgn * off, az = w.h ? w.A[1] + w.sgn * off : w.A[1];
    const bx = w.h ? w.B[0] : w.B[0] + w.sgn * off, bz = w.h ? w.B[1] + w.sgn * off : w.B[1];
    dimLine(measG, X(ax), Z(az), X(bx), Z(bz), y, full ? 'wall' : 'dim', (full ? w.id + '  ' : '') + misFmtM(w.len));
    if (!full) return;
    w.ops.forEach(o => {
      const o2 = 0.75 / S;
      if (w.h){ const zz = w.A[1] + w.sgn * o2; dimLine(measG, X(o.lo), Z(zz), X(o.hi), Z(zz), y, 'op', misFmtM(o.w)); }
      else { const xx = w.A[0] + w.sgn * o2; dimLine(measG, X(xx), Z(o.lo), X(xx), Z(o.hi), y, 'op', misFmtM(o.w)); }
    });
  });
  if (full){
    const p = []; r.rw.V.forEach((v, i) => { const q = r.rw.V[(i + 1) % r.rw.V.length]; p.push(X(v[0]), y, Z(v[1]), X(q[0]), y, Z(q[1])); });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    const l = new THREE.LineSegments(g, lineMats.sel); l.renderOrder = 11; measG.add(l);
  }
}

let selRoom = null, allWalls = false;
function buildMeasures(){
  measRev = st.rev;
  measG.children.slice().forEach(o => { measG.remove(o); if (o.geometry) o.geometry.dispose(); if (o.material && o.material.isSpriteMaterial) o.material.dispose(); });
  const y = 0.12, rooms = roomInfo();
  const sel = selRoom && rooms.find(r => r.f.id === selRoom);
  if (!sel) selRoom = null;
  rooms.forEach(r => {
    const f = r.f;
    if (sel && r !== sel) return;
    let cx = 0, cy = 0; f.pts.forEach(p => { cx += p[0]; cy += p[1]; }); cx /= f.pts.length; cy /= f.pts.length;
    if (sel || allWalls) wallDims(r, y, !!sel);
    else if (r.rect){
      const w = r.w, d = r.d;
      const yq = w.y0 + (w.y1 - w.y0) * 0.24, xq = d.x0 + (d.x1 - d.x0) * 0.2;
      /* nei corridoi e negli spazi piccoli basta la superficie: le quote affollerebbero la pianta */
      if (Math.min(w.len, d.len) >= 1.5 && r.net >= 4){
        dimLine(measG, X(w.lo), Z(yq), X(w.hi), Z(yq), y, 'dim', misFmtM(w.len));
        dimLine(measG, X(xq), Z(d.lo), X(xq), Z(d.hi), y, 'dim', misFmtM(d.len));
      }
    }
    /* la superficie va sotto il nome della stanza (con le misure accese i nomi in 3D si spengono) */
    const lab = st.plan.labels.find(l => !l.g && pointInPoly(l.x, l.y, f.pts));
    const ax = lab ? lab.x : cx, ay = lab ? lab.y + 13 : cy;
    const s = textSprite(misFmtA(r.net), 'area'); s.position.set(X(ax), y, Z(ay)); measG.add(s);
  });
  if (!sel){
    /* ingombro totale (filo esterno dei muri perimetrali) */
    const ext = st.plan.walls.filter(w => w.k === 'e');
    if (ext.length){
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      ext.forEach(w => { const t = wallT(w) / 2;
        x0 = Math.min(x0, Math.min(w.x1, w.x2) - (isH(w) ? 0 : t)); x1 = Math.max(x1, Math.max(w.x1, w.x2) + (isH(w) ? 0 : t));
        y0 = Math.min(y0, Math.min(w.y1, w.y2) - (isH(w) ? t : 0)); y1 = Math.max(y1, Math.max(w.y1, w.y2) + (isH(w) ? t : 0)); });
      const floorsY = st.plan.floors.reduce((m, f) => Math.max(m, ...f.pts.map(p => p[1])), y1);
      dimLine(measG, X(x0), Z(y0) - 1.3, X(x1), Z(y0) - 1.3, y, 'total', 'Fronte ' + misFmtM((x1 - x0) * S));
      dimLine(measG, X(x0) - 1.3, Z(y0), X(x0) - 1.3, Z(floorsY), y, 'total', 'Profondità ' + misFmtM((floorsY - y0) * S));
    }
  }
  fillPanel(rooms, sel);
}

/* ---------- pannello con l’elenco delle superfici e la scheda della stanza scelta ---------- */
const mpanel = $('mpanel'), btnMis = $('btnMis');
function selectRoom(id){
  selRoom = id; buildMeasures();
  if (id){ $('mroom').scrollIntoView({ block:'nearest' }); const f = st.plan.floors.find(q => q.id === id); if (f) frameRoom(f); }
}
/* inquadro la stanza dall’alto nella parte di vista che il pannello lascia libera (a destra, o sopra sul telefono) */
function frameRoom(f){
  if (st.mode === 'walk' || st.cmpId) return;
  const xs = f.pts.map(p => X(p[0])), zs = f.pts.map(p => Z(p[1]));
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  const cr = canvas.getBoundingClientRect(), W = cr.width || 1, Hh = cr.height || 1;
  let fx0 = 0, fx1 = W, fy0 = 64, fy1 = Hh - 40;
  if (!mpanel.hidden){
    const pr = mpanel.getBoundingClientRect();
    if (pr.width < W * 0.6) fx0 = Math.max(fx0, pr.right - cr.left + 8);
    else fy1 = Math.min(fy1, pr.top - cr.top - 8);
  }
  const vt = $('vtools'); if (vt && !vt.hidden){ const vr = vt.getBoundingClientRect(); if (vr.width) fx1 = Math.min(fx1, vr.left - cr.left - 8); }
  const fw = Math.max(80, fx1 - fx0), fh = Math.max(80, fy1 - fy0);
  const t = Math.tan(camera.fov * Math.PI / 360), m = 1.5;     /* margine attorno alla stanza, per le quote */
  const D = Math.max(6, ((z1 - z0) * m * 1.25) / (2 * t) * Hh / fh, ((x1 - x0) * m) / (2 * t) * Hh / fw);
  const wpp = 2 * D * t / Hh;
  const dx = (fx0 + fx1) / 2 - W / 2, dy = (fy0 + fy1) / 2 - Hh / 2;
  const tt = new THREE.Vector3((x0 + x1) / 2 - dx * wpp, 0, (z0 + z1) / 2 - dy * wpp * 1.1);
  const tp = tt.clone().add(new THREE.Vector3(0, 1, 0.42).normalize().multiplyScalar(D));
  st.tween = { t:0, dur:.8, fp:camera.position.clone(), ft:controls.target.clone(), tp, tt };
}
function fillPanel(rooms, sel){
  const list = $('mlist'); list.textContent = '';
  let tin = 0, tout = 0;
  rooms.slice().sort((a, b) => (a.out - b.out) || (b.net - a.net)).forEach(r => {
    if (r.out) tout += r.net; else tin += r.net;
    const li = el('li', (r.out ? 'out' : '') + (r === sel ? ' on' : ''));
    li.append(el('span', 'mn', r.f.name), el('span', 'md', r.rect ? (misFmtM(r.w.len).replace(' m', '') + ' × ' + misFmtM(r.d.len)) : ''), el('span', 'ma', misFmtA(r.net)));
    li.tabIndex = 0; li.setAttribute('role', 'button');
    li.addEventListener('click', () => selectRoom(r === sel ? null : r.f.id));
    li.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); li.click(); } });
    list.append(li);
  });
  $('mcount').textContent = rooms.length;
  $('mtot').textContent = misFmtA(tin);
  $('mh').textContent = misFmtM(H);
  $('mout').textContent = misFmtA(tout);
  $('mcat').textContent = CATASTO + ' m²';
  const box = $('mroom'), wl = $('mwalls');
  box.hidden = !sel; $('mpick').hidden = !!sel;
  wl.textContent = '';
  if (!sel) return;
  $('mrname').textContent = sel.f.name;
  const rw = sel.rw;
  $('mrarea').textContent = misFmtA(sel.net);
  $('mrper').textContent = rw ? misFmtM(rw.per) : '–';
  $('mrvol').textContent = (sel.out ? '–' : (sel.net * H).toFixed(1).replace('.', ',') + ' m³');
  $('mrpaint').textContent = rw && !sel.out ? misFmtA(Math.max(0, rw.paint)) : '–';
  if (!rw){ wl.append(el('li', 'note', 'Stanza con lati obliqui: solo la superficie.')); return; }
  rw.walls.forEach(w => {
    if (!w.id) return;
    const li = el('li');
    const what = w.kind === 'wall' ? 'muro' : RAILNAME[w.kind] || w.kind;
    const ops = w.ops.map(o => OPNAME[o.t] + ' ' + misFmtM(o.w)).join(', ');
    li.append(el('span', 'wl', w.id), el('span', 'mn', what + (ops ? ' · ' + ops : '')), el('span', 'ma', misFmtM(w.len)));
    wl.append(li);
  });
  const open = rw.walls.filter(w => w.kind === 'open' && w.len >= 0.2).length;
  if (open) wl.append(el('li', 'note', open === 1 ? 'Un lato è aperto verso la stanza accanto.' : open + ' lati sono aperti verso le stanze accanto.'));
}
function setMeasures(on){
  measOn = on; st.measOn = on;
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
$('mback').addEventListener('click', () => selectRoom(null));
$('mall').addEventListener('change', e => { allWalls = e.target.checked; buildMeasures(); });
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
/* tocco una stanza: il punto del pavimento sotto il dito, poi la stanza con nome più piccola che lo contiene */
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.06), floorHit = new THREE.Vector3();
function pickRoom(e){
  const r = canvas.getBoundingClientRect();
  tapeNdc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  tapeRay.setFromCamera(tapeNdc, camera);
  if (!tapeRay.ray.intersectPlane(floorPlane, floorHit)) return;
  const px = floorHit.x / S + CX, py = floorHit.z / S + CY;
  let best = null, ba = Infinity;
  st.plan.floors.forEach(f => { if (!f.name || SKIP.test(f.name) || !pointInPoly(px, py, f.pts)) return;
    const a = polyArea(f.pts); if (a < ba){ ba = a; best = f; } });
  selectRoom(best ? (best.id === selRoom ? null : best.id) : null);
}
let downAt = null;
canvas.addEventListener('pointerdown', e => { downAt = (measOn && e.isPrimary && e.button === 0) ? [e.clientX, e.clientY] : null; });
canvas.addEventListener('pointerup', e => {
  if (!downAt || !measOn || st.editing || st.mode === 'walk') return;
  if (Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
  if (!tapeOn){ pickRoom(e); return; }
  const p = pick(e); if (!p) return;
  const dot = new THREE.Mesh(dotGeo, dotMat); dot.position.copy(p); dot.renderOrder = 13; tapeG.add(dot);
  if (!tapeA){ tapeA = p; return; }
  const a = tapeA, dh = Math.hypot(p.x - a.x, p.z - a.z), dy = Math.abs(p.y - a.y);
  const txt = misFmtM(dh) + (dy > 0.05 ? '  ↕ ' + misFmtM(dy) : '');
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

export { SKIP, boundSegs, measFrame, misFmtA, roomWalls };
