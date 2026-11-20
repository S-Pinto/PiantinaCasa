import * as THREE from 'three';
import { X, Z, st } from './core.js';
import { labelsG, scene } from './scene.js';
import { plate, road } from './build.js';
import { ambState } from './ambiente.js';

/* Il palazzo e il quartiere attorno: l’appartamento è un attico al 7° piano di una stecca di
   palazzine bianche, con altre unità ai lati ("altra U.I.U." nella piantina) e Via Verona a sud.
   È solo contesto: volumi semplici, senza ombre del sole, per dare la sensazione dell’altezza. */

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
function facadeMat(tex, len, h){
  const t = tex.clone(); t.needsUpdate = true; t.repeat.set(len / 3.3, h / FLOOR_H);
  const lt = (tex === texBalc ? litBalc : litWin).clone(); lt.needsUpdate = true;
  lt.repeat.set(len / 3.3 / LIT_COLS, h / FLOOR_H / LIT_ROWS); lt.offset.set(Math.floor(Math.random() * LIT_COLS) / LIT_COLS, Math.floor(Math.random() * LIT_ROWS) / LIT_ROWS);
  const m = new THREE.MeshStandardMaterial({ map:t, roughness:.92, emissive:'#ffffff', emissiveMap:lt, emissiveIntensity:0 });
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

/* Un volume con quattro facciate (texture ripetuta per piano) e il tetto */
const roofMat = new THREE.MeshStandardMaterial({ map:(() => { const t = noiseTex('#cfccc5', ['rgba(0,0,0,.08)','rgba(255,255,255,.25)'], 2600); t.repeat.set(6, 6); return t; })(), roughness:.95 });
function block(x0, x1, z0, z1, y0, y1, south, opts){
  const g = new THREE.Group(), h = y1 - y0, w = x1 - x0, d = z1 - z0;
  const faces = [
    [w, [ (x0+x1)/2, z1 ], 0, south ? texBalc : texWin],          // sud
    [w, [ (x0+x1)/2, z0 ], Math.PI, texWin],                     // nord
    [d, [ x1, (z0+z1)/2 ], Math.PI/2, texWin],                   // est
    [d, [ x0, (z0+z1)/2 ], -Math.PI/2, texWin]                   // ovest
  ];
  faces.forEach(f => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(f[0], h), facadeMat(f[3], f[0], h));
    m.position.set(f[1][0], y0 + h/2, f[1][1]); m.rotation.y = f[2];
    g.add(m);
  });
  if (!(opts && opts.noRoof)){
    const r = new THREE.Mesh(new THREE.PlaneGeometry(w, d), roofMat);
    r.rotation.x = -Math.PI/2; r.position.set((x0+x1)/2, y1, (z0+z1)/2);
    r.receiveShadow = !!(opts && opts.recv);
    g.add(r);
    if (!(opts && opts.flat)){
      /* volumi tecnici sul tetto, come nella vista dal satellite */
      const n = Math.max(1, Math.round(w / 22));
      for (let i = 0; i < n; i++){
        const bx = x0 + (i + .5) * w / n, bw = Math.min(6, w / n * .4), bd = Math.min(5, d * .4);
        const b = new THREE.Mesh(new THREE.BoxGeometry(bw, 2.6, bd), facadeMat(texWin, bw, 2.6));
        b.position.set(bx, y1 + 1.3, (z0+z1)/2 - d*.1); g.add(b);
      }
    }
  }
  ctxG.add(g);
  return g;
}

function buildContext(){
  /* piantina: x 62–675 px, y 38–352 px (balcone a sud fino a 352) */
  const west = X(62), east = X(675), north = Z(97), south = Z(352);
  const xW = west - 26, xE = east + 26;
  /* il palazzo sotto l’attico: corpo principale con balconi a sud, vano scala che sporge a nord */
  block(xW, xE, north, south, GROUND_Y, -0.42, true, { noRoof:true });
  block(X(297), X(396), Z(38), north, GROUND_Y, -0.42, false, { noRoof:true });
  /* solaio di copertura attorno all’appartamento (riceve le ombre della casa) */
  const slab = new THREE.Mesh(new THREE.BoxGeometry(xE - xW + 0.3, 0.4, south - north + 0.6), new THREE.MeshStandardMaterial({ color:'#dcd8d0', roughness:.9 }));
  slab.position.set((xW+xE)/2, -0.22, (north+south)/2 + 0.1); slab.receiveShadow = true;
  ctxG.add(slab);
  const core = new THREE.Mesh(new THREE.BoxGeometry(X(396) - X(297), 0.4, north - Z(38)), slab.material);
  core.position.set((X(297)+X(396))/2, -0.22, (Z(38)+north)/2); core.receiveShadow = true;
  ctxG.add(core);
  /* le unità vicine allo stesso piano (sinistra e destra) */
  const nb = (x0, x1) => {
    block(x0, x1, north + 0.2, Z(300), -0.02, 2.95, true, { flat:true, recv:false });
    const bal = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 1.05, 0.12), new THREE.MeshStandardMaterial({ color:'#e8e4dc', roughness:.9 }));
    bal.position.set((x0+x1)/2, 0.52, south - 0.08); ctxG.add(bal);
  };
  nb(xW, west - 0.25); nb(east + 0.25, xE);

  /* suolo, marciapiedi, strade */
  const groundMat = new THREE.MeshStandardMaterial({ map:(() => { const t = noiseTex('#8d9580', ['#7f8a70','#9aa18c','#868c7a'], 9000, 512); t.repeat.set(40, 40); return t; })(), roughness:1 });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(340, 64), groundMat);
  ground.rotation.x = -Math.PI/2; ground.position.y = GROUND_Y;
  ctxG.add(ground);
  const asphalt = (() => {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
    const g = cv.getContext('2d'); g.fillStyle = '#4b4f54'; g.fillRect(0, 0, 512, 128);
    for (let i = 0; i < 5000; i++){ g.fillStyle = Math.random() < .5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.08)'; g.fillRect(Math.random()*512, Math.random()*128, 2, 2); }
    g.fillStyle = 'rgba(240,240,235,.85)'; for (let x = 0; x < 512; x += 64) g.fillRect(x, 62, 34, 4);
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return t;
  })();
  const strip = (cx, cz, len, wid, rot, mat, y) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, wid), mat);
    m.rotation.set(-Math.PI/2, 0, rot || 0); m.position.set(cx, GROUND_Y + (y || 0.03), cz);
    ctxG.add(m); return m;
  };
  const roadMat = len => { const t = asphalt.clone(); t.needsUpdate = true; t.repeat.set(len / 40, 1); return new THREE.MeshStandardMaterial({ map:t, roughness:.85 }); };
  const walkMat = new THREE.MeshStandardMaterial({ color:'#bdb7ad', roughness:.95 });
  const roadZ = south + 6.2;
  strip(0, roadZ, 600, 9, 0, roadMat(600));                         // Via Verona
  strip(0, south + 0.9, 600, 3.6, 0, walkMat, 0.12);                // marciapiede lato casa
  strip(0, roadZ + 6.2, 600, 3.4, 0, walkMat, 0.12);
  const crossX = xE + 14;
  strip(crossX, -60, 260, 9, Math.PI/2, roadMat(260));              // traversa a est
  strip(crossX - 6.2, -60, 260, 3.4, Math.PI/2, walkMat, 0.12);
  /* strisce pedonali */
  const zebra = new THREE.MeshStandardMaterial({ color:'#ecebe6', roughness:.8 });
  for (let i = -4; i <= 4; i++) strip(crossX + i * 0.95, roadZ, 0.5, 8, 0, zebra, 0.05);

  /* le altre palazzine del quartiere */
  [[-84, -14, 48, 62, 24], [crossX + 12, crossX + 30, 30, 90, 21], [-60, 20, -66, -52, 27],
   [crossX + 12, crossX + 26, -84, -26, 24], [xW - 36, xW - 22, -50, 14, 21], [12, 70, 52, 66, 18]]
    .forEach(b => block(b[0], b[1], b[2], b[3], GROUND_Y, GROUND_Y + b[4], true, {}));

  /* alberi: tronchi e chiome in due InstancedMesh */
  const spots = [];
  for (let x = xW - 40; x < crossX + 40; x += 9) spots.push([x + Math.random()*2, roadZ + 9.2 + Math.random()]);
  for (let x = xW; x < xE; x += 11) spots.push([x + Math.random()*3, south + 3 + Math.random()*.5]);
  for (let i = 0; i < 26; i++) spots.push([-30 + Math.random()*70, north - 12 - Math.random()*30]);
  for (let z = -140; z < 20; z += 10) spots.push([crossX + 7.8, z + Math.random()*2]);
  const trunkG = new THREE.CylinderGeometry(0.16, 0.24, 3.4, 6); trunkG.translate(0, 1.7, 0);
  const crownG = new THREE.IcosahedronGeometry(2.6, 1); crownG.scale(1, 1.15, 1); crownG.translate(0, 5.6, 0);
  const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshStandardMaterial({ color:'#5b4636', roughness:1 }), spots.length);
  const crowns = new THREE.InstancedMesh(crownG, new THREE.MeshStandardMaterial({ color:'#ffffff', roughness:.95, flatShading:true }), spots.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
  spots.forEach((p, i) => {
    const s = 0.75 + Math.random() * 0.6;
    q.setFromAxisAngle(new THREE.Vector3(0,1,0), Math.random() * 6.28);
    m4.compose(v.set(p[0], GROUND_Y, p[1]), q, sc.set(s, s, s));
    trunks.setMatrixAt(i, m4); crowns.setMatrixAt(i, m4);
    crowns.setColorAt(i, col.setHSL(0.24 + Math.random()*0.08, 0.32 + Math.random()*0.15, 0.24 + Math.random()*0.1));
  });
  ctxG.add(trunks, crowns);
}

let ctxBuilt = false, ctxRev = -1, ctxOn = null;
function contextFrame(on){
  if (on && !ctxBuilt){ buildContext(); ctxBuilt = true; }
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

export { contextFrame };
