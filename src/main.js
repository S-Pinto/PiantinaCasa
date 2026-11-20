import * as THREE from 'three';
import { $, st } from './core.js';
import { CMPG, MAING, camera, canvas, cmpVertical, editG, renderer, resize, scene, stage } from './scene.js';
import { normalize } from './model.js';
import { rebuild } from './build.js';
import { controls, initTheme, preset, setMode } from './views.js';
import { walk, walkPointerDown, walkPointerMove, walkPointerUp } from './walk.js';
import { buildDock, editorDown, editorMove, editorUp, histBtns } from './editor.js';
import { drawOverlay } from './overlay.js';
import { initArtifact, initFileUi, initStorage } from './storage.js';

/* Punto di ingresso: carica la piantina, collega il puntatore e fa girare il ciclo di render. */

/* ------------------------- Caricamento della piantina -------------------------
   Nel sito la piantina sta in data/plan.json. Nel file HTML scaricato (tutto in uno)
   è incorporata in <script id="plan-data">, insieme all’eventuale modalità "solo da guardare". */
function hashText(s){ let h = 5381; for (let i=0; i<s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
async function loadPlan(){
  let pd = null, key = '';
  const embedded = document.getElementById('plan-data');
  try {
    if (embedded) pd = JSON.parse(embedded.textContent);
    else {
      const r = await fetch(new URL('../data/plan.json', import.meta.url), { cache:'no-cache' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const text = await r.text();
      pd = JSON.parse(text); key = hashText(text);
    }
  } catch(e){ console.error('Piantina non caricata', e); }
  const raw = pd && pd.plan ? pd.plan : pd;          /* formato {ts, plan, view} oppure la piantina da sola */
  const n = raw ? normalize(raw) : null;
  if (!n || !n.walls.length) return false;
  st.plan = n;
  st.viewOnlyFile = !!(pd && pd.view);
  st.publishedTs = (pd && pd.ts) || 0;
  st.planKey = st.publishedTs ? String(st.publishedTs) : key;
  st.publishedJson = JSON.stringify(st.plan);
  return true;
}

/* ------------------------- Puntatore: passeggiata o editor ------------------------- */
canvas.addEventListener('pointerdown', e => { if (st.mode === 'walk') walkPointerDown(e); else editorDown(e); });
canvas.addEventListener('pointermove', e => { if (st.mode === 'walk') walkPointerMove(e); else editorMove(e); });
canvas.addEventListener('pointerup', e => { walkPointerUp(); editorUp(e, false); });
canvas.addEventListener('pointercancel', e => { walkPointerUp(); editorUp(e, true); });

/* ------------------------- Ciclo di render ------------------------- */

const timer = new THREE.Timer();
timer.connect(document);      /* niente salto di tempo quando la scheda torna visibile */
function ease(t){ return t<.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2; }
function frame(time){
  timer.update(time);
  const dt = Math.min(timer.getDelta(), .05);
  if (st.tween){
    st.tween.t += dt / st.tween.dur;
    const k = ease(Math.min(1, st.tween.t));
    camera.position.lerpVectors(st.tween.fp, st.tween.tp, k);
    controls.target.lerpVectors(st.tween.ft, st.tween.tt, k);
    if (st.tween.t >= 1) st.tween = null;
  }
  if (st.mode === 'walk') walk(dt); else controls.update();
  if (st.needRebuild){ rebuild(); st.needRebuild = false; }
  if (st.overlayDirty){ drawOverlay(); st.overlayDirty = false; }
  if (st.editing){
    const ks = Math.max(.6, camera.position.distanceTo(controls.target) / 26);
    editG.children.forEach(o => { if (o.userData.handle) o.scale.set(ks, 1, ks); });
  }
  const walls = MAING.w, cur = walls.scale.y;
  if (Math.abs(cur - st.lowTarget) > 0.002) walls.scale.y = cur + (st.lowTarget - cur) * Math.min(1, dt*8);
  else walls.scale.y = st.lowTarget;
  CMPG.w.scale.y = walls.scale.y;
  if (st.cmpId) renderSplit(); else renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

/* Confronto: la stessa inquadratura disegnata due volte, una per metà schermo */
function renderSplit(){
  const w = stage.clientWidth, h = stage.clientHeight, v = cmpVertical();
  const hw = v ? w : Math.floor(w/2), hh = v ? Math.floor(h/2) : h;
  const halves = [ v ? [0, h - hh] : [0, 0], v ? [0, 0] : [w - hw, 0] ];
  camera.aspect = hw / Math.max(1, hh); camera.updateProjectionMatrix();
  renderer.setScissorTest(true);
  halves.forEach((o, i) => {
    const a = i === 0;
    MAING.f.visible = MAING.w.visible = a; MAING.u.visible = a && st.showFurn;
    CMPG.f.visible = CMPG.w.visible = !a; CMPG.u.visible = !a && st.showFurn;
    renderer.setViewport(o[0], o[1], hw, hh); renderer.setScissor(o[0], o[1], hw, hh);
    renderer.render(scene, camera);
  });
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, w, h);
  MAING.f.visible = MAING.w.visible = true; MAING.u.visible = st.showFurn;
  CMPG.f.visible = CMPG.w.visible = CMPG.u.visible = false;
  camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
  $('cmpui').dataset.dir = v ? 'v' : 'h';
}

/* ------------------------- Avvio ------------------------- */
function start(){
  initTheme();
  buildDock();
  initFileUi();
  new ResizeObserver(resize).observe(stage);
  resize();
  rebuild();
  setMode('orbit');
  camera.position.copy(preset('orbit').pos);
  controls.target.copy(preset('orbit').tgt);
  st.tween = null; controls.update();
  histBtns();
  frame();
  initStorage();
  initArtifact();
}
async function boot(){
  /* attendo il font per le etichette (con tempo massimo) mentre carico la piantina */
  const font = (document.fonts && document.fonts.load)
    ? Promise.race([ document.fonts.load('700 84px Figtree'), new Promise(r => setTimeout(r, 1500)) ]).catch(() => {})
    : Promise.resolve();
  const ok = await loadPlan();
  await font;
  if (!ok){
    const h = $('hint'); h.hidden = false;
    h.textContent = 'Non riesco a caricare la piantina (data/plan.json). Apri il sito da un server web, non come file.';
    return;
  }
  start();
}
boot();
