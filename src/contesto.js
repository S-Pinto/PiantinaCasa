import * as THREE from 'three';
import { X, Z, st } from './core.js';
import { labelsG, scene } from './scene.js';
import { holedPlane, holedSlab, plate, road } from './build.js';
import { mergeStatic } from './prestazioni.js';
import { ambState } from './ambiente.js';

/* Il palazzo e il quartiere attorno, ricostruiti dalle viste di Google Earth (Brindisi):
   l’attico è l’unico appartamento al 7° piano, al centro di una lunga stecca bianca con balconi
   continui verso Via Verona; ai lati dell’attico solo il tetto piano a quadrotti con i volumi
   tecnici. Davanti la strada larga con il marciapiede rialzato e il muretto, a est l’incrocio
   con l’asilo dal tetto rosso, a ovest il capannone con i pannelli solari, a sud palazzi ocra,
   rosa e verde acqua. Volumi semplici, senza ombre del sole: servono a dare l’altezza e l’intorno. */

const FLOOR_H = 3, STOREYS = 7;
const GROUND_Y = -FLOOR_H * STOREYS - 0.3;
const ctxG = new THREE.Group();
scene.add(ctxG);

/* ---------- texture delle facciate (una campata di 3,3 m per un piano di 3 m) ---------- */
function facadeTex(balconies){
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 232;
  const g = cv.getContext('2d');
  g.fillStyle = '#eceae5'; g.fillRect(0, 0, 256, 232);
  const px = 256 / 3.3;
  const glass = (x, y, w, h) => {
    const gr = g.createLinearGradient(x, y, x + w, y + h);
    gr.addColorStop(0, '#9aa6b1'); gr.addColorStop(.55, '#b9c3cc'); gr.addColorStop(1, '#8b97a3');
    g.fillStyle = gr; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(60,66,72,.35)'; g.fillRect(x, y, w, 3); g.fillRect(x + w/2 - 1, y, 2, h);
  };
  if (balconies){
    g.fillStyle = '#d3d1cb'; g.fillRect(0, 0, 256, 232);                                /* fondo della loggia, in ombra */
    glass(0.55*px, 0.3*px, 1.25*px, 2.1*px);
    glass(2.1*px, 0.3*px, 0.75*px, 1.25*px);
    g.fillStyle = 'rgba(70,64,58,.22)'; g.fillRect(0, 232 - 1.24*px, 256, 0.09*px);   /* ombra della soletta */
    g.fillStyle = '#f4f2ee'; g.fillRect(0, 232 - 1.15*px, 256, 0.95*px);              /* parapetto */
    g.fillStyle = '#dedad3'; g.fillRect(0, 232 - 0.2*px, 256, 0.2*px);
  } else {
    glass(1.0*px, 0.75*px, 1.2*px, 1.45*px);
    g.fillStyle = '#d9d5ce'; g.fillRect(0.9*px, 0.75*px + 1.45*px, 1.4*px, 5);
    g.fillStyle = 'rgba(0,0,0,.04)'; g.fillRect(0, 229, 256, 3);
  }
  for (let i = 0; i < 200; i++){ g.fillStyle = 'rgba(90,80,70,' + (Math.random()*0.025) + ')'; g.fillRect(Math.random()*256, Math.random()*232, 2 + Math.random()*10, 2 + Math.random()*16); }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
const texBalc = facadeTex(true), texWin = facadeTex(false);
/* finestre accese di sera: 16 campate × 8 piani a caso, così il disegno non si ripete a ogni campata */
const LIT_COLS = 16, LIT_ROWS = 8;
function litTex(balconies){
  const cw = 64, ch = 58, cv = document.createElement('canvas'); cv.width = cw * LIT_COLS; cv.height = ch * LIT_ROWS;
  const g = cv.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, cv.height);
  const px = cw / 3.3;
  for (let r = 0; r < LIT_ROWS; r++) for (let c = 0; c < LIT_COLS; c++){
    if (Math.random() > 0.34) continue;
    g.fillStyle = ['#ffd49a','#ffe3b8','#fff1d6','#ffc27a'][Math.floor(Math.random()*4)];
    const x = c * cw, y = r * ch;
    if (balconies) g.fillRect(x + 0.55*px, y + 0.3*px, 1.25*px, 2.1*px * 0.55);
    else g.fillRect(x + 1.0*px, y + 0.75*px, 1.2*px, 1.45*px);
  }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const litBalc = litTex(true), litWin = litTex(false);
const facadeMats = [];
function facadeMat(tex, len, h, tint){
  const t = tex.clone(); t.needsUpdate = true; t.repeat.set(len / 3.3, h / FLOOR_H);
  const lt = (tex === texBalc ? litBalc : litWin).clone(); lt.needsUpdate = true;
  lt.repeat.set(len / 3.3 / LIT_COLS, h / FLOOR_H / LIT_ROWS); lt.offset.set(Math.floor(Math.random() * LIT_COLS) / LIT_COLS, Math.floor(Math.random() * LIT_ROWS) / LIT_ROWS);
  const m = new THREE.MeshStandardMaterial({ color:tint || '#ffffff', map:t, roughness:.92, emissive:'#ffffff', emissiveMap:lt, emissiveIntensity:0 });
  facadeMats.push(m);
  return m;
}
function noiseTex(base, spots, n, size){
  const cv = document.createElement('canvas'); cv.width = cv.height = size || 256;
  const g = cv.getContext('2d'); g.fillStyle = base; g.fillRect(0, 0, cv.width, cv.height);
  for (let i = 0; i < n; i++){ g.fillStyle = spots[i % spots.length]; const r = 1 + Math.random()*3; g.fillRect(Math.random()*cv.width, Math.random()*cv.height, r, r); }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

/* Tetto piano a quadrotti chiari, come nelle foto (un quadrotto ogni 50 cm) */
function roofTex(){
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const g = cv.getContext('2d'); g.fillStyle = '#9d9b96'; g.fillRect(0, 0, 256, 256);
  const n = 8, c = 256 / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++){
    const v = 205 + Math.floor(Math.random() * 22);
    g.fillStyle = 'rgb(' + v + ',' + (v - 1) + ',' + (v - 4) + ')';
    g.fillRect(i * c + 2, j * c + 2, c - 4, c - 4);
  }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
const roofBase = roofTex();
function roofMatFor(w, d){ const t = roofBase.clone(); t.needsUpdate = true; t.repeat.set(w / 4, d / 4); return new THREE.MeshStandardMaterial({ map:t, roughness:.95 }); }
const whiteMat = new THREE.MeshStandardMaterial({ color:'#efede8', roughness:.9 });
function plainBox(x0, x1, z0, z1, y0, y1, m){
  const b = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), m);
  b.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  ctxG.add(b); return b;
}
/* tetto: piano a quadrotti + muretto d’attico tutto attorno */
function roof(x0, x1, z0, z1, y, parapet){
  const r = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), roofMatFor(x1 - x0, z1 - z0));
  r.rotation.x = -Math.PI / 2; r.position.set((x0 + x1) / 2, y + 0.01, (z0 + z1) / 2); r.receiveShadow = true;
  ctxG.add(r);
  if (parapet){
    const t = 0.25, h = 0.9;
    plainBox(x0, x1, z0, z0 + t, y, y + h, whiteMat); plainBox(x0, x1, z1 - t, z1, y, y + h, whiteMat);
    plainBox(x0, x0 + t, z0, z1, y, y + h, whiteMat); plainBox(x1 - t, x1, z0, z1, y, y + h, whiteMat);
  }
  return r;
}
/* volume tecnico sul tetto (vano scala, ascensore): un cubo bianco con il suo tetto a quadrotti */
function roofBox(cx, cz, w, d, y, h){
  const b = plainBox(cx - w/2, cx + w/2, cz - d/2, cz + d/2, y, y + (h || 2.6), whiteMat);
  roof(cx - w/2 - 0.15, cx + w/2 + 0.15, cz - d/2 - 0.15, cz + d/2 + 0.15, y + (h || 2.6), false);
  return b;
}

/* Un edificio: quattro facciate (texture ripetuta per piano), tetto a quadrotti, volumi tecnici */
function block(x0, x1, z0, z1, y0, y1, o){
  o = o || {};
  const h = y1 - y0, w = x1 - x0, d = z1 - z0, tint = o.tint;
  const faces = [
    [w, [ (x0+x1)/2, z1 ], 0,            o.south === false ? texWin : texBalc],
    [w, [ (x0+x1)/2, z0 ], Math.PI,      o.north ? texBalc : texWin],
    [d, [ x1, (z0+z1)/2 ], Math.PI/2,    texWin],
    [d, [ x0, (z0+z1)/2 ], -Math.PI/2,   texWin]
  ];
  faces.forEach(f => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(f[0], h), facadeMat(f[3], f[0], h, tint));
    m.position.set(f[1][0], y0 + h/2, f[1][1]); m.rotation.y = f[2];
    ctxG.add(m);
  });
  if (o.roof !== false){
    if (o.solar){
      const r = plainBox(x0, x1, z0, z1, y1 - 0.02, y1, new THREE.MeshStandardMaterial({ color:'#e4e4e2', roughness:.9 }));
      r.receiveShadow = false;
      const pm = new THREE.MeshStandardMaterial({ color:'#26324a', roughness:.25, metalness:.4 });
      const rows = Math.floor((d - 4) / 4.5), cols = Math.floor((w - 4) / 9);
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++){
        const px = x0 + 2 + i * 9, pz = z0 + 2 + j * 4.5;
        const p = plainBox(px, px + 8, pz, pz + 2.8, y1, y1 + 0.35, pm); p.rotation.x = -0.18;
      }
    } else roof(x0, x1, z0, z1, y1, true);
    (o.boxes || []).forEach(b => roofBox(b[0], b[1], b[2] || 4.5, b[3] || 4, y1, b[4]));
  }
}

function buildContext(){
  /* piantina: x 62–675 px, y 38–352 px (balcone a sud fino a 352) */
  const west = X(62), east = X(675), north = Z(97), south = Z(352), mid = Z(300);
  const xW = west - 34, xE = east + 34;
  /* la stecca: 7 piani sotto l’attico, balconi continui su Via Verona */
  block(xW, xE, north, south, GROUND_Y, -0.42, { roof:false, north:true });
  block(X(297), X(396), Z(38), north, GROUND_Y, -0.42, { roof:false, south:false });
  /* ala sul retro, perpendicolare, in asse con il vano scala (come da Google Earth): il suo tetto
     arriva al piano dell’attico, così dietro la casa non resta nessuna fessura */
  /* parte dal lato ovest del vano scala e va verso est: la vetrata della cucina guarda nel vuoto */
  const wx0 = X(297) - 0.2, wx1 = X(297) + 9, wz0 = north - 30;
  block(wx0, wx1, wz0, north, GROUND_Y, -0.04, { south:false, roof:false });
  plainBox(wx0, wx1, wz0, wz0 + 0.25, -0.04, 0.9, whiteMat);
  plainBox(wx0, wx0 + 0.25, wz0, north, -0.04, 0.9, whiteMat);
  plainBox(wx1 - 0.25, wx1, wz0, north, -0.04, 0.9, whiteMat);
  roofBox(wx1 - 3.5, north - 24, 5, 4, -0.04);
  /* corpi scala che sporgono sulla facciata dei balconi */
  [xW + 12, -32, 30, xE - 12].forEach(cx => {
    const t = facadeMat(texWin, 4, -0.42 - GROUND_Y);
    const sb = new THREE.Mesh(new THREE.BoxGeometry(4, -0.42 - GROUND_Y + 2.4, 1.4), [whiteMat, whiteMat, whiteMat, whiteMat, t, whiteMat]);
    sb.position.set(cx, (GROUND_Y + 1.98) / 2, south + 0.7); ctxG.add(sb);
  });
  /* copertura attorno all’attico: tetto piano a quadrotti, muretto e volumi tecnici, nessun altro appartamento */
  /* solaio dell’ultimo piano (con il vano scala), bucato dove scende la scala condominiale */
  ctxG.add(holedSlab([[xW, north], [X(297), north], [X(297), Z(38)], [X(396), Z(38)], [X(396), north], [xE, north], [xE, south + 0.1], [xW, south + 0.1]],
    -0.44, -0.04, new THREE.MeshStandardMaterial({ color:'#d9d7d2', roughness:.9 })));
  /* quadrotti su tutta la copertura, anche sulla striscia dietro la casa */
  {
    const t = roofBase.clone(); t.needsUpdate = true; t.repeat.set(0.25, 0.25);
    ctxG.add(holedPlane([[xW, north], [wx0, north], [wx0, wz0], [wx1, wz0], [wx1, north], [xE, north], [xE, south], [xW, south]],
      -0.03, new THREE.MeshStandardMaterial({ map:t, roughness:.95 })));
  }
  /* muretti d’attico sui bordi del tetto (non attraversano l’appartamento né il suo retro) */
  [[xW, west], [east, xE]].forEach(r => plainBox(r[0], r[1], south - 0.25, south, -0.04, 0.9, whiteMat));
  [[xW, X(135) - 0.05], [X(667) + 0.05, xE]].forEach(r => plainBox(r[0], r[1], north, north + 0.25, -0.04, 0.9, whiteMat));
  plainBox(xW, xW + 0.25, north, south, -0.04, 0.9, whiteMat);
  plainBox(xE - 0.25, xE, north, south, -0.04, 0.9, whiteMat);
  [[xW + 7, north + 3.2], [xW + 21, mid - 2], [east + 9, north + 3.2], [xE - 10, mid - 2]].forEach(b => roofBox(b[0], b[1], 5, 4.2, -0.04));

  /* suolo urbano: asfalto chiaro, cemento e qualche aiuola */
  const groundMat = new THREE.MeshStandardMaterial({ map:(() => { const t = noiseTex('#a9a69f', ['#9c9992','#b5b2ab','#a3a097'], 9000, 512); t.repeat.set(40, 40); return t; })(), roughness:1 });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(340, 64), groundMat);
  ground.rotation.x = -Math.PI/2; ground.position.y = GROUND_Y;
  ctxG.add(ground);
  const asphalt = (() => {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
    const g = cv.getContext('2d'); g.fillStyle = '#7d7d7a'; g.fillRect(0, 0, 512, 128);
    for (let i = 0; i < 5000; i++){ g.fillStyle = Math.random() < .5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.06)'; g.fillRect(Math.random()*512, Math.random()*128, 2, 2); }
    g.fillStyle = 'rgba(240,240,235,.8)'; for (let x = 0; x < 512; x += 64) g.fillRect(x, 62, 34, 4);
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return t;
  })();
  const strip = (cx, cz, len, wid, rot, mat, y) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, wid), mat);
    m.rotation.set(-Math.PI/2, 0, rot || 0); m.position.set(cx, GROUND_Y + (y || 0.03), cz);
    ctxG.add(m); return m;
  };
  const roadMat = len => { const t = asphalt.clone(); t.needsUpdate = true; t.repeat.set(len / 40, 1); return new THREE.MeshStandardMaterial({ map:t, roughness:.85 }); };
  const walkMat = new THREE.MeshStandardMaterial({ color:'#c9c5bc', roughness:.95 });
  const green = new THREE.MeshStandardMaterial({ color:'#6f8456', roughness:1 });
  /* Via Verona: larga, con il marciapiede rialzato lungo il palazzo chiuso da un muretto bianco */
  const roadZ = south + 10.5;
  strip(0, roadZ, 600, 14, 0, roadMat(600));
  plainBox(xW - 6, xE + 3, south, south + 2.6, GROUND_Y, GROUND_Y + 0.35, walkMat);
  plainBox(xW - 6, xE + 3, south + 2.6, south + 2.9, GROUND_Y, GROUND_Y + 1.1, whiteMat);
  strip(0, roadZ + 8.6, 600, 3.2, 0, walkMat, 0.12);
  /* incrocio a est con le strisce, strada laterale a ovest */
  const crossX = xE + 26;
  strip(crossX, -60, 260, 11, Math.PI/2, roadMat(260));
  const zebra = new THREE.MeshStandardMaterial({ color:'#efeee9', roughness:.8 });
  for (let i = -5; i <= 5; i++) strip(crossX + i * 0.95, roadZ, 0.5, 12, 0, zebra, 0.05);
  for (let i = -6; i <= 6; i++) strip(crossX, roadZ - 9.5 + i * 0.95, 9, 0.5, 0, zebra, 0.05);
  const sideX = xW - 14;
  strip(sideX, -50, 140, 9, Math.PI/2, roadMat(140));
  /* l’asilo dal tetto rosso fra il palazzo e l’incrocio, con il suo giardino */
  plainBox(xE + 4, xE + 18, south - 12, south - 1, GROUND_Y, GROUND_Y + 3.6, new THREE.MeshStandardMaterial({ color:'#e8d9c8', roughness:.9 }));
  const redRoof = new THREE.Mesh(new THREE.ConeGeometry(9.2, 2.2, 4, 1), new THREE.MeshStandardMaterial({ color:'#b0523c', roughness:.8 }));
  redRoof.rotation.y = Math.PI / 4; redRoof.scale.set(1.05, 1, 0.8);
  redRoof.position.set(xE + 11, GROUND_Y + 4.7, south - 6.5); ctxG.add(redRoof);
  strip(xE + 11, north - 6, 14, 12, 0, green, 0.05);
  /* a ovest il grande capannone con i pannelli solari e il parcheggio */
  block(sideX - 80, sideX - 8, north - 18, south + 2, GROUND_Y, GROUND_Y + 9, { south:false, solar:true, tint:'#f2f2f0' });
  const park = new THREE.MeshStandardMaterial({ color:'#8e8c87', roughness:.9 });
  strip(sideX - 44, south + 7, 70, 7, 0, park, 0.04);
  /* oltre la strada: zona tecnica ribassata, una cabina, i palazzi ocra, rosa e verde acqua */
  plainBox(-48, 6, roadZ + 10.5, roadZ + 26, GROUND_Y - 0.02, GROUND_Y + 0.02, new THREE.MeshStandardMaterial({ color:'#9a978f', roughness:1 }));
  plainBox(-48, 6, roadZ + 10.2, roadZ + 10.6, GROUND_Y, GROUND_Y + 1.2, whiteMat);
  plainBox(-14, 2, roadZ + 13, roadZ + 21, GROUND_Y, GROUND_Y + 3.4, new THREE.MeshStandardMaterial({ color:'#d8d4ce', roughness:.9 }));
  block(-46, -6, roadZ + 30, roadZ + 44, GROUND_Y, GROUND_Y + 22, { tint:'#e6c88f', boxes:[[-38, roadZ + 37], [-16, roadZ + 37]] });
  block(10, 30, roadZ + 26, roadZ + 58, GROUND_Y, GROUND_Y + 24, { tint:'#d79a86', boxes:[[20, roadZ + 40]] });
  block(38, 50, roadZ + 12, roadZ + 26, GROUND_Y, GROUND_Y + 24, { tint:'#b9cfc8', boxes:[[44, roadZ + 19, 4, 4]] });
  block(-110, -60, roadZ + 14, roadZ + 40, GROUND_Y, GROUND_Y + 8, { south:false, tint:'#c9c4bc' });
  /* dietro: palazzi bianchi e rosati, e oltre l’incrocio */
  block(-30, 14, north - 66, north - 50, GROUND_Y, GROUND_Y + 24, { tint:'#f1efe9', boxes:[[-20, north - 58], [4, north - 58]] });
  block(crossX + 9, crossX + 24, north - 60, north - 20, GROUND_Y, GROUND_Y + 27, { tint:'#d9a091' });
  block(crossX + 30, crossX + 50, north - 10, north + 8, GROUND_Y, GROUND_Y + 18, { tint:'#f3f1ec' });
  block(18, 34, north - 44, north - 22, GROUND_Y, GROUND_Y + 15, { tint:'#ece9e2', south:false });

  /* alberi: pini a ombrello e chiome tonde, in due InstancedMesh */
  const spots = [];
  for (let z = -140; z < 30; z += 9) spots.push([crossX + 8.2, z + Math.random()*2]);
  for (let i = 0; i < 18; i++) spots.push([crossX + 14 + Math.random()*30, south + 6 + Math.random()*30]);
  for (let i = 0; i < 14; i++) spots.push([-30 + Math.random()*26, north - 14 - Math.random()*20]);
  for (let x = xW; x < xE; x += 26) spots.push([x + Math.random()*4, north - 6 - Math.random()*3]);
  spots.push([xE + 6, south - 0.5], [xE + 16, north - 2], [-52, roadZ + 22], [-58, roadZ + 30]);
  const trunkG = new THREE.CylinderGeometry(0.16, 0.26, 4.2, 6); trunkG.translate(0, 2.1, 0);
  const crownG = new THREE.IcosahedronGeometry(2.6, 1); crownG.scale(1.25, 0.75, 1.25); crownG.translate(0, 5.6, 0);
  const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshStandardMaterial({ color:'#5b4636', roughness:1 }), spots.length);
  const crowns = new THREE.InstancedMesh(crownG, new THREE.MeshStandardMaterial({ color:'#ffffff', roughness:.95, flatShading:true }), spots.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
  spots.forEach((p, i) => {
    const s = 0.75 + Math.random() * 0.6;
    q.setFromAxisAngle(new THREE.Vector3(0,1,0), Math.random() * 6.28);
    m4.compose(v.set(p[0], GROUND_Y, p[1]), q, sc.set(s, s, s));
    trunks.setMatrixAt(i, m4); crowns.setMatrixAt(i, m4);
    crowns.setColorAt(i, col.setHSL(0.27 + Math.random()*0.06, 0.3 + Math.random()*0.15, 0.2 + Math.random()*0.08));
  });
  ctxG.add(trunks, crowns);
}

let ctxBuilt = false, ctxRev = -1, ctxOn = null;
function contextFrame(on){
  if (on && !ctxBuilt){ buildContext(); mergeStatic(ctxG); ctxBuilt = true; }
  if (on !== ctxOn){
    ctxOn = on; ctxG.visible = on; plate.visible = road.visible = !on;
    ctxRev = -1; st.shadowDirty = true;
  }
  const ni = ambState.night * ambState.night * 0.3;
  if (facadeMats.length && Math.abs(facadeMats[0].emissiveIntensity - ni) > 0.002) facadeMats.forEach(m => { m.emissiveIntensity = ni; });
  if (ctxRev !== st.rev){
    ctxRev = st.rev;
    labelsG.children.forEach(m => { if (m.userData.street) m.position.y = on ? GROUND_Y + 0.08 : 0; });
  }
}

export { contextFrame, roofBase, roofMatFor };
