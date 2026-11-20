import * as THREE from 'three';
import { S, X, Z } from './core.js';
import { TEXDEF, baseTex, cherryBase, gresBase, liftBase, makeHerringbone, makeMosaicParquet, makeTerracotta, toTex } from './textures.js';

/* ------------------------- Materiali ------------------------- */
const mat = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color:c, roughness:.9, metalness:0 }, o||{}));
const wallSide = mat('#efede8'), wallTop = mat('#2b323a', {roughness:.7});
const wallMats = [wallSide, wallSide, wallTop, wallSide, wallSide, wallSide];
const parSide = mat('#e4e1da'), parTop = mat('#cbc7be');
const parMats = [parSide, parSide, parTop, parSide, parSide, parSide];
const frameMat = mat('#39414a', {roughness:.5, metalness:.3});
/* colore degli infissi scelto per finestra o vetrata (se non c’è, il grigio antracite di sempre) */
const frameCols = {};
const frameMatFor = c => c ? (frameCols[c] || (frameCols[c] = mat(c, { roughness:.5, metalness:.2 }))) : frameMat;
const glassMat = new THREE.MeshStandardMaterial({ color:0x9ec3d6, transparent:true, opacity:.28, roughness:.1, metalness:.1, depthWrite:false });
const doorMat = mat('#b99d7b', {roughness:.7});
const doorCols = {};
const doorColorMat = c => doorCols[c] || (doorCols[c] = mat(c, { roughness:.6 }));
const stairMat = mat('#c6c9cd');

function tiled(base, tw, th, ox, oy){
  const t = base.clone(); t.needsUpdate = true; t.repeat.set(1/tw, 1/th);
  if (ox !== undefined) t.offset.set(ox, oy);
  return t;
}
const FLOORS = {
  parquet:   { name:'Parquet ciliegio',      mk:() => mat('#ffffff', { map:tiled(cherryBase,1,1), roughness:.5 }) },
  gres:      { name:'Gres effetto legno',    mk:() => mat('#ffffff', { map:tiled(gresBase,1.2,1), roughness:.42 }) },
  pietra:    { name:'Piastrelle di pietra',  mk:() => mat('#ffffff', { map:tiled(baseTex('pietra'),.8,.8), roughness:.75 }) },
  marmo:     { name:'Marmo',                 mk:() => mat('#ffffff', { map:tiled(baseTex('marmo'),1.6,1.6), roughness:.2 }) },
  parquet2:  { name:'Parquet a mosaico',     mk:() => mat('#ffffff', { map:tiled(toTex(makeMosaicParquet()),1,1), roughness:.5 }) },
  spina:     { name:'Parquet a spina di pesce', mk:() => mat('#ffffff', { map:tiled(toTex(makeHerringbone()),0.48,0.48), roughness:.28 }) },
  cemento:   { name:'Cemento',               mk:() => mat('#c3c6ca', { roughness:.9 }) },
  balcone:   { name:'Gres da esterno',       mk:() => mat('#b7a595', { roughness:.9 }), top:.02 },
  cotto:     { name:'Cotto da terrazzo',     mk:() => mat('#ffffff', { map:tiled(toTex(makeTerracotta()),1.2,1.2), roughness:.8 }), top:.02 },
  ascensore: { name:'Ascensore',             mk:() => mat('#ffffff', { map:tiled(liftBase, 38*S, 28*S, -X(297)/(38*S), Z(168)/(28*S)), roughness:.6 }), top:.07 }
};
const floorMatCache = {}, flatCache = {};
function flatMat(c, r){ return flatCache[c] || (flatCache[c] = mat(c, { roughness:r || .8 })); }
function floorMat(k){ if (!FLOORS[k]) k = 'parquet'; return floorMatCache[k] || (floorMatCache[k] = FLOORS[k].mk()); }
function floorMatFor(f){ return f.m === 'colore' ? flatMat(f.col || '#cccccc') : floorMat(f.m); }

/* Materiali dei muri: colore piatto e/o texture (il colore fa da tinta) */
const fmCache = {}, wmCache = {};
function finishMat(col, tx){
  if (!col && !tx) return wallSide;
  const key = (col || '') + '|' + (tx || '');
  if (fmCache[key]) return fmCache[key];
  const d = tx ? TEXDEF[tx] : null;
  return (fmCache[key] = mat(col || (tx ? '#ffffff' : '#efede8'), { map: d ? baseTex(tx) : null, roughness: d ? d.rough : .9 }));
}
const tileOf = tx => tx ? TEXDEF[tx].tile : 0;
const finishMatD = (col, tx, def) => (!col && !tx) ? def : finishMat(col, tx);
function wallMatsFor(col, tx){
  if (!col && !tx) return wallMats;
  const key = (col || '') + '|' + (tx || '');
  if (wmCache[key]) return wmCache[key];
  const side = finishMat(col, tx);
  return (wmCache[key] = [side, side, wallTop, side, side, side]);
}

export { FLOORS, doorColorMat, doorMat, finishMat, finishMatD, flatMat, floorMatFor, frameMatFor, glassMat, mat, parSide, parTop, stairMat, tileOf, wallMatsFor, wallTop };
