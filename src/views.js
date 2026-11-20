import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { $, X, Z, st } from './core.js';
import { cssVar } from './dom.js';
import { MAING, camera, canvas, cmpVertical, labelsG } from './scene.js';
import { plate, road } from './build.js';
import { EYE, vel } from './walk.js';
import { TIPS, setEditing } from './editor.js';

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
  plan:'Vista dall’alto, con Via Verona in basso. Rotella o pizzico per zoomare.',
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
function preset(m){
  const a = aspect();
  if (m === 'plan'){
    const d = Math.min(95, Math.max(21, 35 / a));
    return { pos:new THREE.Vector3(0, d, 0.01), tgt:new THREE.Vector3(0,0,0) };
  }
  const k = Math.max(1, 1.7 / a);
  return { pos:new THREE.Vector3(0, 16.5*k, 19.5*k), tgt:new THREE.Vector3(0,0,0.4) };
}
function applyLook(){ camera.rotation.set(st.pitch, st.yaw, 0, 'YXZ'); }
function setHint(){
  let t = hints[st.mode];
  if (st.editing) t = st.tool !== 'select' ? TIPS[st.tool] : (st.sel ? '' : hints.edit);
  if (st.cmpId) t = '';
  hintEl.textContent = t || ''; hintEl.hidden = !t;
}

function setMode(m){
  if (st.editing && m !== 'plan') setEditing(false);
  st.mode = m;
  if (m !== 'walk' && document.pointerLockElement) document.exitPointerLock();
  document.querySelectorAll('.seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
  setHint();
  padEl.dataset.on = m === 'walk' ? '1' : '0';
  if (m === 'walk'){
    controls.enabled = false; st.tween = null;
    camera.fov = 75; camera.updateProjectionMatrix();
    camera.position.set(X(365), EYE, Z(190)); vel.x = vel.z = 0;
    st.yaw = Math.PI; st.pitch = 0; applyLook();
    return;
  }
  controls.enabled = true;
  camera.fov = 45; camera.updateProjectionMatrix();
  const p = preset(m);
  st.tween = { t:0, dur:.9, fp:camera.position.clone(), ft:controls.target.clone(), tp:p.pos, tt:p.tgt };
}
document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));

$('optLabels').addEventListener('change', e => { labelsG.visible = e.target.checked; });
function updateLow(){ st.lowTarget = ($('optLow').checked || st.editing) ? 0.07 : 1; }
$('optLow').addEventListener('change', updateLow);
$('optFurn').addEventListener('change', e => { st.showFurn = e.target.checked; MAING.u.visible = st.showFurn; });

export { applyLook, controls, hintEl, initTheme, preset, setHint, setMode, updateLow };
