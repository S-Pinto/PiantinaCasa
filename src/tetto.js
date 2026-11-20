import * as THREE from 'three';
import { $, H, S, X, Z, st } from './core.js';
import { MAING, scene } from './scene.js';
import { wallT } from './model.js';
import { roofBase, roofMatFor } from './contesto.js';

/* Il tetto dell’attico, da mostrare o nascondere: solaio piano sopra le stanze, a quadrotti chiari
   come il resto della copertura del palazzo, muretto bianco sopra i muri perimetrali, il volume
   del vano scala che sale oltre il tetto. Da sotto è il soffitto bianco delle stanze.
   Si nasconde da solo in modifica e con "Pareti basse", perché lì serve vedere dentro. */

const roofG = new THREE.Group();
roofG.visible = false;
scene.add(roofG);
const ROOF_KEY = 'piantina-tetto';
const SLAB = 0.3, PARAPET = 0.75;
let roofOn = false, roofRev = -1, roofVis = null;
try { roofOn = localStorage.getItem(ROOF_KEY) === '1'; } catch(_){}

const ceilMat = new THREE.MeshStandardMaterial({ color:'#f4f2ee', roughness:.95 });
const tileMat = (() => { const t = roofBase.clone(); t.needsUpdate = true; t.repeat.set(0.25, 0.25); return new THREE.MeshStandardMaterial({ map:t, roughness:.95 }); })();

function roofBoxAt(x0, x1, z0, z1, y0, y1, m){
  const b = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), m);
  b.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  b.castShadow = true; b.receiveShadow = true;
  roofG.add(b); return b;
}
function buildRoof(){
  roofRev = st.rev;
  roofG.children.slice().forEach(o => { roofG.remove(o); if (o.geometry) o.geometry.dispose(); });
  /* solaio sopra ogni ambiente chiuso (non sui balconi) */
  st.plan.floors.filter(f => !/balcon|terrazz/i.test(f.name) && f.m !== 'ascensore').forEach(f => {
    const sh = new THREE.Shape();
    f.pts.forEach((p, i) => { const x = X(p[0]), y = -Z(p[1]); if (i === 0) sh.moveTo(x, y); else sh.lineTo(x, y); });
    const g = new THREE.ExtrudeGeometry(sh, { depth:SLAB, bevelEnabled:false }); g.rotateX(-Math.PI / 2);
    const slab = new THREE.Mesh(g, ceilMat); slab.position.y = H; slab.castShadow = true; slab.receiveShadow = true;
    roofG.add(slab);
    const tg = new THREE.ShapeGeometry(sh); tg.rotateX(-Math.PI / 2);
    const top = new THREE.Mesh(tg, tileMat); top.position.y = H + SLAB + 0.005; top.receiveShadow = true;
    roofG.add(top);
  });
  /* muretto bianco sopra i muri perimetrali */
  st.plan.walls.filter(w => w.k === 'e').forEach(w => {
    const t = wallT(w) / 2;
    const x0 = Math.min(w.x1, w.x2) - t, x1 = Math.max(w.x1, w.x2) + t, y0 = Math.min(w.y1, w.y2) - t, y1 = Math.max(w.y1, w.y2) + t;
    roofBoxAt(X(x0), X(x1), Z(y0), Z(y1), H, H + SLAB + PARAPET, ceilMat);
  });
  /* il vano scala e l’ascensore salgono oltre il tetto */
  roofBoxAt(X(297.5), X(395.5), Z(38), Z(168), H, H + SLAB + 2.4, ceilMat);
  const cw = (395.5 - 297.5) * S + 0.3, cd = (168 - 38) * S + 0.3;
  const cap = new THREE.Mesh(new THREE.PlaneGeometry(cw, cd), roofMatFor(cw, cd));
  cap.rotation.x = -Math.PI / 2; cap.position.set(X((297.5 + 395.5) / 2), H + SLAB + 2.41, Z((38 + 168) / 2));
  roofG.add(cap);
  st.shadowDirty = true;
}

function setRoof(on){
  roofOn = on;
  try { localStorage.setItem(ROOF_KEY, on ? '1' : '0'); } catch(_){}
  ['btnRoof', 'panoRoof'].forEach(id => { const b = $(id); if (b) b.setAttribute('aria-pressed', String(on)); });
}
function initRoof(){
  $('btnRoof').addEventListener('click', () => setRoof(!roofOn));
  $('panoRoof').addEventListener('click', () => setRoof(!roofOn));
  setRoof(roofOn);
}
function roofFrame(){
  if (!st.plan) return;
  const vis = roofOn && !st.editing && MAING.w.scale.y > 0.98;
  if (vis && roofRev !== st.rev) buildRoof();
  if (vis !== roofVis){ roofVis = vis; roofG.visible = vis; st.shadowDirty = true; }
}

export { initRoof, roofFrame };
