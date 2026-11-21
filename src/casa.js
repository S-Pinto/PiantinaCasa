import * as THREE from 'three';
import { $, CX, CY, H, S, X, Z, pointInPoly, polyArea, st } from './core.js';
import { el } from './dom.js';
import { camera, canvas, scene } from './scene.js';
import { FURN } from './furniture.js';
import { setMode } from './views.js';
import { EYE } from './walk.js';
import { amb } from './ambiente.js';
import { OUTDOOR, SKIP, frameRoom, misFmtA, roomInfo, selectRoom, setMeasures } from './misure.js';
import { roomTags } from './nomi.js';
import { LAYERS, SYS, setLayer } from './impianti.js';

/* Casa: la bussola che riporta la vista su tutta la casa, la scheda di una stanza quando la tocchi,
   e la pagina «Casa» con le stanze e gli impianti, primo passo verso l’app per la domotica. */

/* ---------- bussola: la N segue il nord vero (impostato nel pannello Luce); un tocco inquadra tutta la casa ---------- */
const compassEl = $('bussola'), needle = $('bago');
const cmpV = new THREE.Vector3(), cmpF = new THREE.Vector3();
let compassAng = null;
function compassFrame(){
  compassEl.hidden = st.mode === 'walk' || st.pano || !!st.cmpId;
  if (compassEl.hidden) return;
  /* direzione “verso l’alto dello schermo” sul piano orizzontale */
  const e = camera.matrixWorld.elements;
  cmpV.set(e[4], 0, e[6]); cmpF.set(-e[8], 0, -e[10]);
  cmpV.add(cmpF); if (cmpV.lengthSq() < 1e-8) return;
  const az = Math.atan2(cmpV.x, -cmpV.z);                     /* 0 = alto della piantina */
  const ang = amb.north * Math.PI / 180 - az;
  if (compassAng !== null && Math.abs(ang - compassAng) < 0.002) return;
  compassAng = ang;
  needle.setAttribute('transform', 'rotate(' + (ang * 180 / Math.PI).toFixed(1) + ' 24 24)');
}
compassEl.addEventListener('click', () => { if (st.mode !== 'walk') setMode(st.mode); });

/* ---------- scheda della stanza ---------- */
const cardEl = $('rcard'), cardHl = new THREE.Group(); scene.add(cardHl);
const hlMat = new THREE.LineBasicMaterial({ color:'#1f5f8b', depthTest:false, transparent:true, toneMapped:false });
let cardRoom = null;
/* il nome che si legge in pianta (es. «Letto» al posto di «Camera 1») */
function roomLabel(f){
  const l = st.plan.labels.find(q => !q.g && q.text && pointInPoly(q.x, q.y, f.pts));
  const t = l ? l.text.trim() : '';
  return t && !/\.$/.test(t) ? t : f.name;
}
const inRoom = (f, x, y) => pointInPoly(x, y, f.pts);
function furnIn(f){ return st.plan.furniture.filter(o => inRoom(f, o.x, o.y)); }
function sysIn(f){ return (st.plan.sys || []).filter(o => inRoom(f, o.x, o.y)); }
function countBy(list, key){ const m = {}; list.forEach(o => { const k = key(o); m[k] = (m[k] || 0) + 1; }); return m; }

function openCard(f){
  cardRoom = f;
  const info = roomInfo().find(r => r.f === f), out = OUTDOOR.test(f.name);
  $('rcname').textContent = roomLabel(f);
  const tots = $('rctots'); tots.textContent = '';
  const tile = (k, v) => { const d = el('div'); d.append(el('span', 'k', k), el('b', null, v)); tots.appendChild(d); };
  const fm = v => v.toFixed(2).replace('.', ',') + ' m';
  tile('Superficie', misFmtA(info ? info.net : polyArea(f.pts) * S * S));
  tile(info && info.rect ? 'Misure' : 'Perimetro', info && info.rect ? (info.w.len.toFixed(2).replace('.', ',') + ' × ' + fm(info.d.len)) : (info && info.rw ? fm(info.rw.per) : '–'));
  tile(out ? 'All’aperto' : 'Volume', out ? 'sì' : ((info ? info.net : 0) * H).toFixed(1).replace('.', ',') + ' m³');
  /* arredi */
  const fl = furnIn(f), fu = $('rcfurn'); fu.textContent = '';
  $('rcfn').textContent = fl.length ? '(' + fl.length + ')' : '';
  const fc = countBy(fl, o => (FURN[o.type] && FURN[o.type].n) || o.type);
  Object.keys(fc).sort().forEach(n => fu.appendChild(el('li', 'chip', n + (fc[n] > 1 ? ' × ' + fc[n] : ''))));
  if (!fl.length) fu.appendChild(el('li', 'note', 'Nessun arredo in questa stanza.'));
  /* impianti */
  const sl = sysIn(f), su = $('rcsys'); su.textContent = '';
  $('rcsn').textContent = sl.length ? '(' + sl.length + ')' : '';
  Object.keys(LAYERS).forEach(L => {
    const items = sl.filter(o => SYS[o.t] && SYS[o.t].l === L); if (!items.length) return;
    const c = countBy(items, o => SYS[o.t].n);
    const li = el('li'); const dot = el('span', 'sdot'); dot.style.background = LAYERS[L].c;
    li.append(dot, el('span', 'mn', LAYERS[L].n + ': ' + Object.keys(c).map(n => n + (c[n] > 1 ? ' × ' + c[n] : '')).join(', ')));
    su.appendChild(li);
  });
  if (!sl.length) su.appendChild(el('li', 'note', 'Ancora nessuna presa, luce o sensore: aggiungili da Modifica › Impianti.'));
  cardEl.hidden = false;
  /* contorno della stanza */
  cardHl.children.slice().forEach(o => { cardHl.remove(o); o.geometry.dispose(); });
  const p = f.pts.map(q => new THREE.Vector3(X(q[0]), 0.14, Z(q[1]))); p.push(p[0].clone());
  const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints(p), hlMat); ln.renderOrder = 12; cardHl.add(ln);
  st.redraw = Math.max(st.redraw, 10);
}
function closeCard(){ cardEl.hidden = true; cardRoom = null; cardHl.children.slice().forEach(o => { cardHl.remove(o); o.geometry.dispose(); }); st.redraw = Math.max(st.redraw, 4); }
$('rcclose').addEventListener('click', closeCard);
$('rcmis').addEventListener('click', () => { const f = cardRoom; closeCard(); if (!f) return; setMeasures(true); selectRoom(f.id); });
$('rcwalk').addEventListener('click', () => {
  const f = cardRoom; closeCard(); if (!f) return;
  let x = 0, y = 0; f.pts.forEach(p => { x += p[0]; y += p[1]; }); x /= f.pts.length; y /= f.pts.length;
  setMode('walk'); camera.position.set(X(x), EYE, Z(y));
});

/* un tocco breve su una stanza (non in modifica, né con le misure o il panorama) apre la scheda */
const cardRay = new THREE.Raycaster(), cardNdc = new THREE.Vector2(), cardPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.06), cardHit = new THREE.Vector3();
let cardDown = null;
canvas.addEventListener('pointerdown', e => { cardDown = e.isPrimary && e.button === 0 ? [e.clientX, e.clientY, performance.now()] : null; });
canvas.addEventListener('pointerup', e => {
  if (!cardDown || !st.plan || st.editing || st.measOn || st.pano || st.mode === 'walk' || st.cmpId) return;
  if (Math.hypot(e.clientX - cardDown[0], e.clientY - cardDown[1]) > 6 || performance.now() - cardDown[2] > 600) return;
  const r = canvas.getBoundingClientRect();
  cardNdc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  cardRay.setFromCamera(cardNdc, camera);
  if (!cardRay.ray.intersectPlane(cardPlane, cardHit)) return;
  const px = cardHit.x / S + CX, py = cardHit.z / S + CY;
  let best = null, ba = Infinity;
  st.plan.floors.forEach(f => { if (!f.name || SKIP.test(f.name) || !pointInPoly(px, py, f.pts)) return; const a = polyArea(f.pts); if (a < ba){ ba = a; best = f; } });
  if (!best || best === cardRoom) closeCard(); else openCard(best);
});

/* ---------- pagina «Casa» ---------- */
const homeEl = $('home');
const HOME_TILES = [
  { n:'Luci', t:['luce_soff', 'luce_par', 'rele'], l:'el', d:'punti luce e relè' },
  { n:'Prese', t:['presa', 'schuko', 'presa_usb', 'presa_ded', 'presa_tv', 'presa_lan'], l:'el', d:'prese' },
  { n:'Telecamere', t:['cam', 'citofono'], l:'dom', d:'telecamere e videocitofono' },
  { n:'Sicurezza', t:['pir', 'contatto', 'fumo', 'gas', 'allag', 'sirena'], l:'dom', d:'sensori e sirena' },
  { n:'Clima', t:['clima', 'radiatore', 'caldaia'], l:'h2o', d:'termostati, radiatori, caldaia' },
  { n:'Tapparelle', t:['tapparella'], l:'dom', d:'attuatori' },
  { n:'Consumi', t:['energia', 'quadro'], l:'el', d:'misuratori e quadro' },
  { n:'Rete', t:['hub', 'ap'], l:'dom', d:'hub e Wi-Fi' }
];
function fillHome(){
  const rooms = roomInfo(), tin = rooms.filter(r => !r.out).reduce((a, r) => a + r.net, 0), tout = rooms.filter(r => r.out).reduce((a, r) => a + r.net, 0);
  const tags = roomTags();
  const stats = $('hstats'); stats.textContent = '';
  const stat = (k, v) => { const d = el('div'); d.append(el('span', 'k', k), el('b', null, v)); stats.appendChild(d); };
  stat('Superficie interna', misFmtA(tin)); stat('Balconi e veranda', misFmtA(tout));
  stat('Stanze', String(tags.filter(t => !OUTDOOR.test(t.name)).length)); stat('Arredi', String(st.plan.furniture.length));
  const grid = $('hrooms'); grid.textContent = '';
  tags.slice().sort((a, b) => OUTDOOR.test(a.name) - OUTDOOR.test(b.name) || b.area - a.area).forEach(t => {
    const f = st.plan.floors.find(q => q.name && !SKIP.test(q.name) && pointInPoly(t.x, t.y, q.pts)); if (!f) return;
    const b = el('button', 'hroom'); b.type = 'button';
    b.append(el('b', null, t.name), el('span', null, t.sub || ''));
    const nf = furnIn(f).length; if (nf) b.appendChild(el('small', null, nf + (nf === 1 ? ' arredo' : ' arredi')));
    b.addEventListener('click', () => { showHome(false); if (st.mode === 'walk') setMode('orbit'); frameRoom(f); openCard(f); });
    grid.appendChild(b);
  });
  const sys = st.plan.sys || [], tiles = $('htiles'); tiles.textContent = '';
  HOME_TILES.forEach(T => {
    const n = sys.filter(o => T.t.includes(o.t)).length;
    const b = el('button', 'htile'); b.type = 'button';
    const dot = el('span', 'sdot'); dot.style.background = LAYERS[T.l].c;
    const head = el('div', 'hth'); head.append(dot, el('b', null, T.n));
    b.append(head, el('span', 'hn', n ? n + ' nel progetto' : 'Da progettare'), el('small', null, n ? T.d : 'Aggiungili da Modifica › Impianti'), el('span', 'hst', 'Non ancora collegato'));
    b.addEventListener('click', () => { showHome(false); setLayer(T.l, true); });
    tiles.appendChild(b);
  });
}
function showHome(on){
  homeEl.hidden = !on; $('btnHome').setAttribute('aria-pressed', String(on));
  if (on){ closeCard(); fillHome(); $('hclose').focus(); }
}
$('btnHome').addEventListener('click', () => showHome(homeEl.hidden));
$('hclose').addEventListener('click', () => showHome(false));
homeEl.addEventListener('click', e => { if (e.target === homeEl) showHome(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape'){ if (!homeEl.hidden) showHome(false); else if (!cardEl.hidden) closeCard(); } });

function casaFrame(){
  compassFrame();
  if (!cardEl.hidden && (st.editing || st.measOn || st.mode === 'walk' || st.pano)) closeCard();
  if (cardRoom && !st.plan.floors.includes(cardRoom)) closeCard();
  cardHl.visible = !cardEl.hidden;
}

export { casaFrame, roomLabel };
