import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { $, H, X, Z, st } from './core.js';
import { cssVar } from './dom.js';
import { MAING, camera, canvas, cmpVertical, walkFov } from './scene.js';
import { plate, road } from './build.js';
import { EYE, vel } from './walk.js';
import { LEVEL_TIPS, TIPS, setEditing } from './editor.js';

/* Tema chiaro/scuro, camera, modalità di visualizzazione e opzioni di vista. */

/* ------------------------- Tema ------------------------- */
function applyTheme(){
  plate.material.color.set(cssVar('--ground') || '#d7dee4');
  road.material.color.set(cssVar('--road') || '#a9b3bc');
}
function initTheme(){
  applyTheme();
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    (mq.addEventListener ? mq.addEventListener.bind(mq,'change') : mq.addListener.bind(mq))(applyTheme);
  }
  new MutationObserver(applyTheme).observe(document.documentElement, { attributes:true, attributeFilter:['data-theme'] });
}

/* ------------------------- Camera e modalità ------------------------- */
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI/2 - 0.03;
controls.minDistance = 3; controls.maxDistance = 110;


const coarse = !!(window.matchMedia && matchMedia('(pointer:coarse)').matches);
const hints = {
  orbit:'Trascina per ruotare, rotella o pizzico per zoomare.',
  plan:'Vista dall’alto, con Via Mantova in basso. Rotella o pizzico per zoomare.',
  planTall:'Vista dall’alto, girata per lo schermo in verticale: Via Mantova è a destra. Pizzico per zoomare.',
  walk: coarse ? 'Joystick per muoverti, trascina per guardare. Tocca la mappa per spostarti.'
               : 'Clicca la scena per guardare col mouse (Esc per liberarlo), muoviti con W A S D, Maiusc per correre. Clicca la mappa per spostarti.',
  edit: coarse ? 'Tocca un elemento per modificarlo, oppure scegli uno strumento. Due dita per spostare e zoomare.'
               : 'Clicca un elemento per modificarlo, oppure scegli uno strumento. Tasto destro per spostare la vista.'
};
const hintEl = $('hint'), padEl = $('walkui');

function aspect(){
  let w = canvas.clientWidth, h = canvas.clientHeight;
  if (st.cmpId){ if (cmpVertical()) h /= 2; else w /= 2; }      /* nel confronto ogni vista occupa metà schermo */
  return Math.max(.35, w / Math.max(1, h));
}
/* Spazio dello schermo coperto dall’interfaccia (barra in alto, pulsanti a destra, strumenti dell’editor):
   la casa va inquadrata nella parte libera, altrimenti finisce sotto i pannelli. */
function insets(){
  const w = canvas.clientWidth, h = canvas.clientHeight, r = { l:10, r:10, t:10, b:14 };
  if (st.cmpId) return r;                               /* nel confronto le due metà sono già piccole */
  const box = id => { const e = $(id); if (!e || e.hidden || !e.offsetWidth) return null; const b = e.getBoundingClientRect(), c = canvas.getBoundingClientRect();
    return { l:b.left - c.left, r:b.right - c.left, t:b.top - c.top, b:b.bottom - c.top, w:b.width, h:b.height }; };
  const tb = document.querySelector('.topbar');
  if (tb && tb.offsetWidth) r.t = Math.max(r.t, tb.getBoundingClientRect().bottom - canvas.getBoundingClientRect().top + 8);
  if (st.editing){
    const lv = box('levels'); if (lv) r.t = Math.max(r.t, lv.b + 8);
    /* sul telefono il suggerimento del livello resta in alto per tutta la modifica: la casa va sotto di lui */
    const hn = box('hint'); if (hn && hn.w > w * .6){ if (hn.t < h / 2) r.t = Math.max(r.t, hn.b + 6); else r.b = Math.max(r.b, h - hn.t + 6); }
    const dk = box('dock');
    if (dk){ if (dk.h > dk.w) r.l = Math.max(r.l, dk.r + 8); else r.b = Math.max(r.b, h - dk.t + 8); }
  } else {
    const vt = box('vtools'); if (vt) r.r = Math.max(r.r, w - vt.l + 8);
  }
  /* se l’interfaccia mangia troppo (schermi minuscoli) tengo almeno metà vista */
  if (r.l + r.r > w * .5){ const k = w * .5 / (r.l + r.r); r.l *= k; r.r *= k; }
  if (r.t + r.b > h * .5){ const k = h * .5 / (r.t + r.b); r.t *= k; r.b *= k; }
  return r;
}
/* Ingombro della casa (pavimenti e muri) in metri */
function houseBox(){
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const add = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
  if (st.plan){ st.plan.floors.forEach(f => f.pts.forEach(p => add(p[0], p[1]))); st.plan.walls.forEach(wl => { add(wl.x1, wl.y1); add(wl.x2, wl.y2); }); }
  if (!isFinite(x0)){ x0 = 62; x1 = 675; y0 = 38; y1 = 352; }
  return { x0:X(x0), x1:X(x1), z0:Z(y0), z1:Z(y1) };
}
const fitCam = new THREE.PerspectiveCamera(45, 1, .1, 2000), fitV = new THREE.Vector3();
const PLAN_FOV = 30, ORBIT_FOV = 45;
/* Distanza minima perché tutta la casa entri nella parte libera dello schermo, guardando dalla direzione dir */
function fitShot(dir, fov, top){
  const a = aspect(), b = houseBox(), ins = insets();
  const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight);
  const pad = .94, mx = (1 - (ins.l + ins.r) / w) * pad, my = (1 - (ins.t + ins.b) / h) * pad;
  const c = new THREE.Vector3((b.x0 + b.x1) / 2, top ? 0 : H * .35, (b.z0 + b.z1) / 2);
  const pts = [];
  [b.x0, b.x1].forEach(x => [b.z0, b.z1].forEach(z => [0, H].forEach(y => pts.push(new THREE.Vector3(x, y, z)))));
  fitCam.fov = fov; fitCam.aspect = a; fitCam.updateProjectionMatrix();
  /* sx e sy: di quanto il centro della casa deve scostarsi dal centro della parte libera, in proporzione */
  let sx = 0, sy = 0;
  const ok = D => {
    fitCam.position.copy(dir).multiplyScalar(D).add(c); fitCam.up.set(0, 1, 0); if (top) fitCam.up.set(-dir.x, 0, -dir.z).normalize();
    fitCam.lookAt(c); fitCam.updateMatrixWorld();
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const p of pts){ fitV.copy(p).project(fitCam); if (fitV.z > 1) return false;
      x0 = Math.min(x0, fitV.x); x1 = Math.max(x1, fitV.x); y0 = Math.min(y0, fitV.y); y1 = Math.max(y1, fitV.y); }
    sx = (x0 + x1) / 2; sy = (y0 + y1) / 2;
    return (x1 - x0) / 2 <= mx && (y1 - y0) / 2 <= my;
  };
  let lo = 3, hi = 400;
  for (let i = 0; i < 30; i++){ const m = (lo + hi) / 2; if (ok(m)) hi = m; else lo = m; }
  const D = hi; ok(D);
  /* sposto camera e bersaglio di lato: il centro della casa va nel centro della parte libera */
  const tx = (ins.l - ins.r) / w - sx, ty = (ins.b - ins.t) / h - sy;
  const half = D * Math.tan(fov * Math.PI / 360);
  const right = new THREE.Vector3().setFromMatrixColumn(fitCam.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(fitCam.matrixWorld, 1);
  const shift = right.multiplyScalar(-tx * half * a).add(up.multiplyScalar(-ty * half));
  const tgt = c.clone().add(shift);
  return { pos:fitCam.position.clone().add(shift), tgt, fov, dist:D };
}
/* Pianta su uno schermo in verticale (telefono): la casa è lunga e stretta, quindi la giro di 90°
   con Via Mantova a destra; così occupa quasi il doppio dello schermo. */
const planTall = () => aspect() < .8;
function preset(m){
  if (m === 'plan') return fitShot(planTall() ? new THREE.Vector3(-0.0004, 1, 0).normalize() : new THREE.Vector3(0, 1, 0.0004).normalize(), PLAN_FOV, true);
  /* in verticale la casa (lunga e stretta) è limitata dalla larghezza: guardo più dall’alto, così guadagna profondità */
  const a = aspect(), turn = THREE.MathUtils.clamp((1.15 - a) / .55, 0, 1);
  const el = (40 + turn * 16) * Math.PI / 180;
  const dir = new THREE.Vector3(0, Math.sin(el), Math.cos(el));
  return fitShot(dir, ORBIT_FOV, false);
}
function applyLook(){ camera.rotation.set(st.pitch, st.yaw, 0, 'YXZ'); }
function setHint(){
  let t = hints[st.mode === 'plan' && planTall() ? 'planTall' : st.mode];
  if (st.editing) t = st.tool !== 'select' ? TIPS[st.tool] : (st.sel ? '' : (LEVEL_TIPS[st.level] || hints.edit));
  if (st.cmpId) t = '';
  hintEl.textContent = t || ''; hintEl.hidden = !t;
  /* i suggerimenti di navigazione servono solo all’inizio: spariscono dopo qualche secondo o al primo gesto */
  clearTimeout(hintTimer);
  if (t && !st.editing){
    if (hintSeen[st.mode]) hintEl.hidden = true;
    else hintTimer = setTimeout(() => { hintSeen[st.mode] = true; if (!st.editing) hintEl.hidden = true; }, st.mode === 'walk' ? 12000 : 8000);
  }
}
let hintTimer = 0;
const hintSeen = {};
canvas.addEventListener('pointerdown', () => {
  if (st.editing || hintEl.hidden || hintSeen[st.mode]) return;
  hintSeen[st.mode] = true; clearTimeout(hintTimer);
  hintTimer = setTimeout(() => { if (!st.editing) hintEl.hidden = true; }, 1500);
});

function setMode(m){
  if (st.editing && m !== 'plan') setEditing(false);
  st.mode = m;
  if (m !== 'walk' && document.pointerLockElement) document.exitPointerLock();
  document.querySelectorAll('.seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
  setHint();
  padEl.dataset.on = m === 'walk' ? '1' : '0';
  if (m === 'walk'){
    controls.enabled = false; st.tween = null;
    camera.fov = walkFov(camera.aspect); camera.updateProjectionMatrix();
    /* in fondo al corridoio, guardando verso il soggiorno: si vede subito la casa in profondità */
    camera.position.set(X(388), EYE, Z(229)); vel.x = vel.z = 0;
    st.yaw = Math.PI / 2; st.pitch = -0.05; applyLook();
    return;
  }
  controls.enabled = true;
  if (camera.fov > 60){ camera.fov = ORBIT_FOV; camera.updateProjectionMatrix(); }   /* dalla passeggiata */
  const p = preset(m);
  controls.maxDistance = Math.max(110, p.dist * 1.6);
  st.tween = { t:0, dur:.9, fp:camera.position.clone(), ft:controls.target.clone(), tp:p.pos, tt:p.tgt, ff:camera.fov, tf:p.fov };
}
document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));

/* Pareti basse: dal menu, oppure in modifica se lo scegli (pulsante Muri alti/bassi, ricordato sul dispositivo).
   Arredi: nascosti da soli quando modifichi i muri, a meno che non li riaccendi dal pulsante Arredi. */
const EDIT_LOW_KEY = 'piantina-muri-in-modifica';
try { st.editLow = localStorage.getItem(EDIT_LOW_KEY) !== 'alti'; } catch(_){ st.editLow = true; }
function updateLow(){
  st.lowTarget = ($('optLow').checked || (st.editing && st.editLow)) ? 0.07 : 1;
  const hideFurn = st.editing && st.level === 'pareti' && !st.wallFurn;
  MAING.u.visible = st.showFurn && !hideFurn;
  st.redraw = Math.max(st.redraw || 0, 4); st.shadowDirty = true;
}
function setEditLow(on){ st.editLow = on; try { localStorage.setItem(EDIT_LOW_KEY, on ? 'bassi' : 'alti'); } catch(_){} updateLow(); }
$('optLow').addEventListener('change', updateLow);
$('optFurn').addEventListener('change', e => { st.showFurn = e.target.checked; updateLow(); });

/* Sul telefono la colonna degli strumenti parte chiusa: il pulsante ⋮ la apre e la richiude (ricordato) */
const VT_KEY = 'piantina-strumenti';
try { $('vtools').dataset.open = localStorage.getItem(VT_KEY) === '1' ? '1' : '0'; } catch(_){}
$('btnVt').setAttribute('aria-expanded', String($('vtools').dataset.open === '1'));
$('btnVt').addEventListener('click', () => {
  const on = $('vtools').dataset.open !== '1';
  $('vtools').dataset.open = on ? '1' : '0'; $('btnVt').setAttribute('aria-expanded', String(on));
  try { localStorage.setItem(VT_KEY, on ? '1' : '0'); } catch(_){}
});

export { applyLook, controls, hintEl, initTheme, preset, setEditLow, setHint, setMode, updateLow };
