import * as THREE from 'three';
import { $, st } from './core.js';
import { camera, canvas, renderer } from './scene.js';
import { controls, setMode } from './views.js';
import { setEditing } from './editor.js';
import { renderView } from './ambiente.js';

/* Panorama 3D: vista cinematografica a tutto schermo. La camera gira lenta attorno all’attico,
   più bassa e lontana del solito, così si vedono il palazzo, la strada e il cielo.
   Trascinando si prende il controllo; dopo qualche secondo la rotazione riparte da sola. */

let panoSaved = null, idleTimer = 0;
function panoShot(){
  const ang = Math.atan2(-11, 30);                  // da sud-ovest, il lato del balcone lungo
  /* su schermo verticale mi allontano, così la casa entra in larghezza */
  const a = Math.max(.35, canvas.clientWidth / Math.max(1, canvas.clientHeight)), k = Math.pow(Math.max(1, 0.95 / a), 0.85);
  const d = 29 * k, h = 13.5 * k;
  return { pos:new THREE.Vector3(Math.sin(ang) * d, h, Math.cos(ang) * d), tgt:new THREE.Vector3(0, -1.6, 0.6) };
}
function setPano(on){
  if (on === st.pano) return;
  if (on){
    if (st.editing) setEditing(false);
    if (st.mode !== 'orbit') setMode('orbit');
    panoSaved = { maxD:controls.maxDistance, speed:controls.autoRotateSpeed };
    st.pano = true;
    document.body.dataset.pano = '1';
    $('panoui').hidden = false;
    controls.maxDistance = 150;
    controls.autoRotate = true; controls.autoRotateSpeed = -0.55;
    const p = panoShot();
    st.tween = { t:0, dur:2.2, fp:camera.position.clone(), ft:controls.target.clone(), tp:p.pos, tt:p.tgt, ff:camera.fov, tf:45 };
    canvas.focus();
  } else {
    st.pano = false;
    delete document.body.dataset.pano;
    $('panoui').hidden = true;
    clearTimeout(idleTimer);
    controls.autoRotate = false;
    if (panoSaved){ controls.maxDistance = panoSaved.maxD; controls.autoRotateSpeed = panoSaved.speed; }
    setMode('orbit');
  }
  $('btnPano').setAttribute('aria-pressed', String(on));
}
/* collego pulsanti ed eventi (una volta, all’avvio) */
function initPano(){
  controls.addEventListener('start', () => { if (!st.pano) return; controls.autoRotate = false; clearTimeout(idleTimer); });
  controls.addEventListener('end', () => {
    if (!st.pano) return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { if (st.pano && !$('panoPlay').dataset.paused) controls.autoRotate = true; }, 3500);
  });
  $('btnPano').addEventListener('click', () => setPano(!st.pano));
  $('panoExit').addEventListener('click', () => setPano(false));
  $('panoPlay').addEventListener('click', () => {
    const b = $('panoPlay'), paused = !b.dataset.paused;
    if (paused) b.dataset.paused = '1'; else delete b.dataset.paused;
    controls.autoRotate = !paused;
    b.setAttribute('aria-label', paused ? 'Riprendi la rotazione' : 'Ferma la rotazione');
    b.querySelector('use').setAttribute('href', paused ? '#i-play' : '#i-pause');
  });
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && st.pano) setPano(false); });

  /* Foto: disegno il fotogramma e lo salvo subito come PNG */
  $('panoPhoto').addEventListener('click', async () => {
    renderView();
    const url = renderer.domElement.toDataURL('image/png');
    const name = 'via-verona-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.png';
    try {
      const dl = (window.claude && window.claude.use) ? await window.claude.use('downloads') : null;
      if (dl){ await dl.save({ filename:name, data:await (await fetch(url)).blob() }); return; }
    } catch(e){ if (e && e.code === 'declined') return; }
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  });
}

export { initPano };
