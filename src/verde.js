import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/* Il verde del quartiere: le specie che si vedono davvero a Brindisi (pini domestici a ombrello,
   palme delle Canarie, lecci e ficus a chioma tonda, cipressi, siepi di oleandro).
   Ogni specie è una sola forma con i colori già “dipinti” sui vertici (chioma più scura sotto e più chiara
   in cima, tronco marrone) e viene ripetuta con un InstancedMesh: centinaia di alberi costano
   alla scheda video una chiamata di disegno per specie. Le forme nascono da un seme fisso:
   a ogni apertura gli alberi sono gli stessi. */

function seedRng(seed){ let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash3 = (x, y, z) => { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return s - Math.floor(s); };
const C = (h) => new THREE.Color(h);

/* colora ogni vertice con fn(x, y, z, colore) */
function paint(g, fn){
  const p = g.attributes.position, a = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++){ fn(p.getX(i), p.getY(i), p.getZ(i), c); a[i*3] = c.r; a[i*3+1] = c.g; a[i*3+2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
const clean = g => { g.deleteAttribute('uv'); return g.index ? g.toNonIndexed() : g; };

/* un ramo o un tronco: cilindro rastremato dal punto a al punto b */
const _up = new THREE.Vector3(0, 1, 0);
function limb(a, b, r0, r1, col, rings){
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), L = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, L, 7, rings || 1, true);
  g.translate(0, L / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(_up, d.normalize()));
  g.translate(A.x, A.y, A.z);
  const c0 = C(col);
  paint(g, (x, y, z, c) => {
    const k = rings ? (0.82 + 0.18 * Math.sin(y * 9)) : 1;     /* anelli del tronco della palma */
    c.copy(c0).multiplyScalar(k * (0.9 + 0.2 * hash3(x, y, z)));
  });
  return clean(g);
}

/* un ciuffo di foglie: sfera bitorzoluta, normali che guardano fuori dalla chioma (luce morbida),
   colore che va dallo scuro (sotto, dentro) al chiaro (sopra), con macchie di foglie più chiare */
function lobe(cx, cy, cz, sx, sy, sz, crown, dark, light, opt){
  opt = opt || {};
  let g = new THREE.IcosahedronGeometry(1, opt.detail ?? 2);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position, seed = cx * 3.1 + cz * 1.7 + cy;
  for (let i = 0; i < p.count; i++){
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + (opt.bump ?? 0.22) * (hash3(x * 2.3 + seed, y * 2.3, z * 2.3) - 0.5) * 2;
    p.setXYZ(i, cx + x * sx * k, cy + y * sy * k, cz + z * sz * k);
  }
  g.computeVertexNormals();
  const n = g.attributes.normal, v = new THREE.Vector3(), o = new THREE.Vector3();
  for (let i = 0; i < p.count; i++){
    o.set(p.getX(i) - crown[0], (p.getY(i) - crown[1]) * 1.4, p.getZ(i) - crown[2]).normalize();
    v.set(n.getX(i), n.getY(i), n.getZ(i)).multiplyScalar(0.35).addScaledVector(o, 0.65).normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  const d = C(dark), l = C(light), fl = opt.flower ? C(opt.flower) : null;
  paint(g, (x, y, z, c) => {
    const t = THREE.MathUtils.clamp((y - crown[1] + crown[3]) / (2 * crown[3]), 0, 1);
    const r = hash3(x * 5.1, y * 5.1, z * 5.1);
    c.copy(d).lerp(l, t * 0.85 + r * 0.15);
    if (fl && r > 0.86 && t > 0.35) c.copy(fl).multiplyScalar(0.85 + 0.3 * hash3(z, x, y));
  });
  return clean(g);
}

/* ---------- le specie ---------- */
function pino(){
  const R = seedRng(11), parts = [], bark = '#6a5240';
  const top = [1.0, 8.6, 0.3];
  parts.push(limb([0, 0, 0], [0.35, 4.6, 0.1], 0.32, 0.24, bark), limb([0.35, 4.6, 0.1], top, 0.24, 0.16, bark));
  [[-1.6, 8.3, 0.9], [2.6, 8.4, -0.4], [0.4, 8.5, -1.9], [1.2, 8.4, 2.0]].forEach(b => parts.push(limb([0.75, 7.2, 0.25], b, 0.12, 0.06, bark)));
  const crown = [top[0], 9.1, top[2], 1.1];
  parts.push(lobe(top[0], 9.3, top[2], 2.4, 1.0, 2.4, crown, '#2f4a26', '#7c9550'));
  for (let i = 0; i < 8; i++){
    const a = i / 8 * Math.PI * 2 + R() * 0.4, r = 2.6 + R() * 0.8;
    parts.push(lobe(top[0] + Math.cos(a) * r, 8.8 + R() * 0.6, top[2] + Math.sin(a) * r, 1.6 + R() * 0.4, 0.75 + R() * 0.2, 1.6 + R() * 0.4, crown, '#2f4a26', '#7c9550', { detail:1 }));
  }
  return mergeGeometries(parts);
}
function tondo(seed, dark, light){
  const R = seedRng(seed), parts = [], bark = '#5d4a3b';
  parts.push(limb([0, 0, 0], [0.1, 2.6, 0], 0.26, 0.2, bark));
  [[1.2, 4.4, 0.4], [-1.0, 4.6, -0.6], [0.2, 5.0, 1.1]].forEach(b => parts.push(limb([0.1, 2.4, 0], b, 0.14, 0.08, bark)));
  const crown = [0, 5.2, 0, 2.3];
  parts.push(lobe(0, 5.3, 0, 2.0, 1.7, 2.0, crown, dark, light));
  for (let i = 0; i < 8; i++){
    const a = i / 8 * Math.PI * 2 + R() * 0.5, r = 1.6 + R() * 0.6, y = 4.6 + R() * 1.8;
    const s = 1.1 + R() * 0.5;
    parts.push(lobe(Math.cos(a) * r, y, Math.sin(a) * r, s, s * 0.85, s, crown, dark, light, { detail:1 }));
  }
  return mergeGeometries(parts);
}
function cipresso(){
  const parts = [limb([0, 0, 0], [0, 1.4, 0], 0.18, 0.15, '#5a4636')];
  const crown = [0, 5.2, 0, 4.2];
  for (let i = 0; i < 6; i++){
    const y = 1.6 + i * 1.35, r = 0.95 * (1 - i / 7.5) + 0.2;
    parts.push(lobe(0, y, 0, r, 1.15, r, crown, '#2a4626', '#5d7d44', { bump:0.2, detail:1 }));
  }
  return mergeGeometries(parts);
}
function siepe(){
  const R = seedRng(5), parts = [], crown = [0, 0.8, 0, 0.8];
  for (let i = 0; i < 5; i++){
    const a = i * 1.3, r = i ? 0.55 : 0;
    parts.push(lobe(Math.cos(a) * r, 0.7 + R() * 0.3, Math.sin(a) * r, 0.7, 0.62, 0.7, crown, '#2f4d2b', '#6e8f4e', { flower:i % 2 ? '#d8789c' : '#e9c3d2', detail:1 }));
  }
  return mergeGeometries(parts);
}
/* Palma delle Canarie: tronco grosso ad anelli, “ananas” in cima e una corona di foglie lunghe e arcuate */
function palma(){
  const parts = [limb([0, 0, 0], [0.15, 6.6, 0], 0.42, 0.36, '#7d6a55', 14)];
  const knob = new THREE.SphereGeometry(0.6, 9, 6); knob.scale(1, 1.2, 1); knob.translate(0.15, 6.9, 0);
  paint(knob, (x, y, z, c) => c.set('#8a7350').multiplyScalar(0.85 + 0.3 * hash3(x, y, z)));
  parts.push(clean(knob));
  const base = C('#8c8a3f'), mid = C('#4f7a33'), tip = C('#6f9244');
  const N = 24, SEG = 6;
  for (let f = 0; f < N; f++){
    const a = f * 2.399, el = 0.85 - (f % 3) * 0.4, L = 4.4 + (f % 4) * 0.3;   /* tre giri: in alto, di lato, ricadenti */
    const pos = [], col = [], idx = [];
    for (let s = 0; s <= SEG; s++){
      const t = s / SEG, ang = el - t * t * 1.6;
      const r = L * t, cx = 0.15 + Math.cos(a) * (0.3 + r * Math.cos(ang) * 0.95), cz = Math.sin(a) * (0.3 + r * Math.cos(ang) * 0.95);
      const cy = 7.1 + L * t * Math.sin(el) - t * t * L * 0.55;
      const w = 0.75 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.05)), 0.7), px = -Math.sin(a) * w, pz = Math.cos(a) * w;
      pos.push(cx - px, cy - 0.12 * w, cz - pz,  cx, cy + 0.1 * w, cz,  cx + px, cy - 0.12 * w, cz + pz);
      const c = t < 0.4 ? base.clone().lerp(mid, t / 0.4) : mid.clone().lerp(tip, (t - 0.4) / 0.6);
      const k = 0.9 + 0.2 * ((f * 7) % 5) / 5;
      for (let j = 0; j < 3; j++) col.push(c.r * k * (j === 1 ? 1.12 : 1), c.g * k * (j === 1 ? 1.12 : 1), c.b * k);
      if (s){ const o = (s - 1) * 3; idx.push(o, o + 3, o + 1, o + 1, o + 3, o + 4, o + 1, o + 4, o + 2, o + 2, o + 4, o + 5); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    parts.push(g.toNonIndexed());
  }
  return mergeGeometries(parts);
}

const SPECIES = {
  pino:     { geo:pino,                                             side:THREE.FrontSide },
  leccio:   { geo:() => tondo(21, '#263f22', '#5f7d43'),            side:THREE.FrontSide },
  ficus:    { geo:() => tondo(37, '#2c5128', '#7aa055'),            side:THREE.FrontSide },
  cipresso: { geo:cipresso,                                         side:THREE.FrontSide },
  siepe:    { geo:siepe,                                            side:THREE.FrontSide },
  palma:    { geo:palma,                                            side:THREE.DoubleSide }
};

/* items: [{ k:'pino', x, z, s?, y? }]; y è la quota del suolo. Un InstancedMesh per specie. */
function plantTrees(group, items, groundY){
  const R = seedRng(7), by = {};
  items.forEach(it => { (by[it.k] = by[it.k] || []).push(it); });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
  Object.keys(by).forEach(k => {
    const sp = SPECIES[k]; if (!sp) return;
    const list = by[k], geo = sp.geo();
    geo.computeBoundingSphere();
    const mat = new THREE.MeshStandardMaterial({ vertexColors:true, roughness:.9, side:sp.side });
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((it, i) => {
      const s = it.s || (0.8 + R() * 0.45);
      q.setFromAxisAngle(_up, R() * Math.PI * 2);
      m4.compose(v.set(it.x, it.y ?? groundY, it.z), q, sc.set(s * (0.92 + R() * 0.16), s, s * (0.92 + R() * 0.16)));
      im.setMatrixAt(i, m4);
      const l = 0.86 + R() * 0.24; im.setColorAt(i, col.setRGB(l * (0.96 + R() * 0.08), l, l * (0.92 + R() * 0.1)));
    });
    im.computeBoundingSphere();
    im.userData.keep = true;
    group.add(im);
  });
}

export { plantTrees, seedRng };
