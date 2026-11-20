import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* Prestazioni: la scena è fatta di centinaia di piccoli pezzi (muri, davanzali, montanti, facciate…).
   Ogni pezzo costa una chiamata di disegno alla scheda video, anche se è fermo.
   Qui unisco i pezzi fissi di un gruppo che hanno lo stesso materiale in un'unica forma:
   l'immagine resta identica, ma la scheda video lavora molto meno. */

/* una faccia (gruppo) di una geometria multi-materiale come geometria a sé */
function subGeometry(g, grp){
  const out = new THREE.BufferGeometry();
  for (const k in g.attributes) out.setAttribute(k, g.attributes[k]);
  const idx = g.index.array.slice(grp.start, grp.start + grp.count);
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

function mergeStatic(group){
  const buckets = new Map(), done = [];
  group.children.forEach(o => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.userData.keep || o.userData.merged || o.children.length) return;
    const g = o.geometry;
    if (!g || !g.attributes.position || g.morphAttributes.position) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (mats.some(m => !m || m.transparent)) return;      /* il vetro resta a parte: va ordinato per trasparenza */
    o.updateMatrix();
    const parts = [];
    if (Array.isArray(o.material)){
      if (!g.index || !g.groups.length) return;
      g.groups.forEach(grp => parts.push([o.material[grp.materialIndex], subGeometry(g, grp)]));
    } else parts.push([o.material, g]);
    parts.forEach(([m, pg]) => {
      if (!m) return;
      let geo = pg.index ? pg.toNonIndexed() : pg.clone();
      geo.applyMatrix4(o.matrix);
      const keys = Object.keys(geo.attributes).sort().join(',');
      const key = m.uuid + '|' + o.castShadow + '|' + o.receiveShadow + '|' + keys;
      if (!buckets.has(key)) buckets.set(key, { m, cast:o.castShadow, recv:o.receiveShadow, geos:[] });
      buckets.get(key).geos.push(geo);
    });
    done.push(o);
  });
  if (done.length < 2) return 0;
  done.forEach(o => { group.remove(o); o.geometry.dispose(); });
  let n = 0;
  buckets.forEach(b => {
    const geo = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos, false);
    b.geos.forEach(x => { if (x !== geo) x.dispose(); });
    if (!geo) return;
    geo.computeBoundingSphere(); geo.computeBoundingBox();
    const mesh = new THREE.Mesh(geo, b.m);
    mesh.castShadow = b.cast; mesh.receiveShadow = b.recv; mesh.userData.merged = true;
    group.add(mesh); n++;
  });
  return done.length - n;
}

export { mergeStatic };
