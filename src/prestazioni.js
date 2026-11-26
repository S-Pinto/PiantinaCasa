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
    if (o.matrixAutoUpdate) o.updateMatrix();
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

/* Arredi: ogni mobile è un gruppo di tanti pezzetti (gambe, ante, maniglie, cuscini…), quasi 500 in tutta la casa.
   I materiali sono condivisi fra i mobili (stessa tinta = stesso materiale), quindi a scena ferma
   unisco tutti i pezzi di tutti i mobili per materiale: da ~480 chiamate di disegno a qualche decina,
   e lo stesso nel calcolo delle ombre. Mentre trascini un mobile gli arredi restano separati
   (si ricostruiscono a ogni movimento); al rilascio tutto si riunisce. */
/* Molti mobili differiscono solo per la tinta (legno, tessuto, laccato…): per unirli lo stesso
   sposto il colore del materiale sui vertici e uso un solo materiale "bianco" per ogni combinazione
   di ruvidità, metallo e lati. L'aspetto non cambia: è lo stesso calcolo della luce, col colore letto dal vertice. */
const tintCache = new Map();
function tintable(m){
  return m && m.isMeshStandardMaterial && !m.isMeshPhysicalMaterial && !m.transparent && !m.map && !m.normalMap && !m.roughnessMap
    && !m.vertexColors && !m.userData.glow && m.emissiveIntensity * (m.emissive.r + m.emissive.g + m.emissive.b) === 0
    && m.opacity === 1 && !m.alphaTest;
}
function tintMat(m){
  const k = [m.roughness, m.metalness, m.side, m.flatShading, m.envMapIntensity, m.wireframe, m.polygonOffset, m.polygonOffsetFactor, m.polygonOffsetUnits, m.depthWrite, m.colorWrite].join('|');
  let t = tintCache.get(k);
  if (!t){
    t = m.clone(); t.color.setRGB(1, 1, 1); t.vertexColors = true; t.name = 'tinta';
    tintCache.set(k, t);
  }
  return t;
}
function tintMesh(o){
  if (Array.isArray(o.material) || !tintable(o.material)) return;
  const g = o.geometry.clone(), n = g.attributes.position.count, c = o.material.color;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++){ a[3*i] = c.r; a[3*i+1] = c.g; a[3*i+2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  o.geometry = g; o.material = tintMat(o.material);
}

function mergeDeep(group){
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const flat = new THREE.Group(), moved = [];
  group.traverse(o => {
    if (o === group || !o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.userData.keep) return;
    const m = new THREE.Mesh(o.geometry, o.material);
    m.matrixAutoUpdate = false;
    m.matrix.multiplyMatrices(inv, o.matrixWorld);
    m.castShadow = o.castShadow; m.receiveShadow = o.receiveShadow; m.renderOrder = o.renderOrder;
    tintMesh(m);
    flat.add(m); moved.push(o);
  });
  if (moved.length < 2) return 0;
  moved.forEach(o => { o.parent.remove(o); });
  /* i gruppi rimasti vuoti se ne vanno */
  group.children.slice().forEach(c => { let any = false; c.traverse(x => { if (x !== c && (x.isMesh || x.isLine || x.isPoints || x.isSprite)) any = true; }); if (!any && !c.isMesh) group.remove(c); });
  const saved = mergeStatic(flat);
  /* i pezzi non uniti (vetri trasparenti) tengono la loro matrice già calcolata */
  flat.children.slice().forEach(m => group.add(m));
  return saved;
}

export { mergeDeep, mergeStatic };
