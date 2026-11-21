import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WELL, X, Z, st } from './core.js';
import { labelsG, scene } from './scene.js';
import { holedPlane, holedSlab, labelTexture, plate, road } from './build.js';
import { mergeStatic } from './prestazioni.js';
import { ambState } from './ambiente.js';
import { plantTrees, seedRng } from './verde.js';

/* Il palazzo e il quartiere attorno, ricostruiti dalle viste di Google Earth (Brindisi):
   l’attico è l’unico appartamento al 7° piano, al centro di una lunga stecca con balconi
   continui verso Via Mantova; ai lati dell’attico solo il tetto piano a quadrotti con i volumi
   tecnici. Le strade come nelle mappe di Mone: davanti ai balconi Via Mantova, che a ovest gira
   verso nord (Via Appia) lungo il Lidl e a est sbocca nell’incrocio di Via Verona (a est, da
   nord-ovest a sud-est, con il cancello d’ingresso), Via Montebello (verso sud-ovest) e Via Magenta.
   Fra il palazzo e Via Verona l’asilo dal tetto rosso; oltre Via Montebello palazzi ocra, rosa e verde acqua. Volumi semplici, senza ombre del sole: servono a dare l’altezza e l’intorno. */

const FLOOR_H = 3, STOREYS = 7;
const GROUND_Y = -FLOOR_H * STOREYS - 0.3;
const ctxG = new THREE.Group();
scene.add(ctxG);

/* ---------- texture delle facciate ----------
   Ogni texture copre 4 campate da 3,3 m per 2 piani da 3 m, così il disegno si ripete meno:
   finestre con il telaio, tapparelle abbassate a metà o tutte, qualche persiana verde, tende colorate.
   kind: 'balc' balcone disegnato (facciate sul retro), 'loggia' solo il fondo del balcone (davanti
   ci sono soletta e parapetto veri), 'win' finestre semplici.
   Con il prefisso 'c' (cwin, cloggia, cbalc) è il palazzo di casa, come nella foto da Via Mantova:
   intonaco grigio tortora, fasce grigio scuro a ogni piano, tapparelle bianche, ringhiere di metallo. */
const TB = 4, TF = 2, BAY = 3.3;
function facadeTex(kind, seed){
  const casa = kind[0] === 'c';
  if (casa) kind = kind.slice(1);
  const R = seedRng(seed), cw = 256, ch = 232;
  const cv = document.createElement('canvas'); cv.width = cw * TB; cv.height = ch * TF;
  const g = cv.getContext('2d');
  const px = cw / BAY;
  g.fillStyle = casa ? (kind === 'win' ? '#d9d2cc' : '#d2cbc5') : kind === 'win' ? '#eceae5' : '#d6d3cc'; g.fillRect(0, 0, cv.width, cv.height);
  const glass = (x, y, w, h) => {
    const gr = g.createLinearGradient(x, y, x + w, y + h);
    gr.addColorStop(0, '#8e9aa6'); gr.addColorStop(.55, '#b9c3cc'); gr.addColorStop(1, '#7f8b97');
    g.fillStyle = gr; g.fillRect(x, y, w, h);
    if (!casa && R() < .3){ g.fillStyle = ['rgba(232,225,205,.75)','rgba(205,170,150,.6)','rgba(240,240,235,.8)'][Math.floor(R()*3)]; g.fillRect(x + 3, y + 3, w * (.25 + R() * .2), h - 6); }   /* tenda */
    const r = R(), sh = casa ? (r < .15 ? .1 : r < .55 ? .3 + R() * .4 : 1) : r < .25 ? 0 : r < .55 ? .35 + R() * .3 : r < .8 ? 1 : .15;   /* tapparella abbassata */
    if (sh){
      g.fillStyle = casa ? '#f1efeb' : '#c9c1b2'; g.fillRect(x, y, w, h * sh);
      g.fillStyle = casa ? 'rgba(120,116,110,.22)' : 'rgba(90,80,64,.28)'; for (let yy = y + 3; yy < y + h * sh; yy += 4) g.fillRect(x, yy, w, 1);
    }
    g.strokeStyle = '#f7f6f2'; g.lineWidth = 3; g.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);  /* telaio */
    g.fillStyle = 'rgba(60,66,72,.35)'; g.fillRect(x + w/2 - 1, y + h * sh, 2, h * (1 - sh));
    g.fillStyle = 'rgba(70,64,58,.22)'; g.fillRect(x - 2, y - 4, w + 4, 4);                      /* cassonetto */
  };
  const persiane = (x, y, w, h) => {                                                            /* persiane verdi aperte */
    g.fillStyle = '#4e6b55'; g.fillRect(x - w * .5 - 2, y, w * .5, h); g.fillRect(x + w + 2, y, w * .5, h);
    g.fillStyle = 'rgba(0,0,0,.18)'; for (let yy = y + 3; yy < y + h; yy += 5){ g.fillRect(x - w * .5 - 2, yy, w * .5, 1.5); g.fillRect(x + w + 2, yy, w * .5, 1.5); }
  };
  for (let f = 0; f < TF; f++) for (let b = 0; b < TB; b++){
    const ox = b * cw, oy = f * ch;
    if (kind !== 'win'){
      glass(ox + 0.55*px, oy + 0.3*px, 1.25*px, 2.1*px);
      glass(ox + 2.1*px, oy + 0.3*px, 0.75*px, 1.25*px);
      if (kind === 'balc'){
        g.fillStyle = 'rgba(70,64,58,.22)'; g.fillRect(ox, oy + ch - 1.24*px, cw, 0.09*px);       /* ombra della soletta */
        if (casa){                                                                                    /* ringhiera e fascia della soletta */
          g.fillStyle = '#a9aaad'; g.fillRect(ox, oy + ch - 1.15*px, cw, 4); g.fillRect(ox, oy + ch - 0.42*px, cw, 3);
          for (let xx = ox + 3; xx < ox + cw; xx += 7) g.fillRect(xx, oy + ch - 1.15*px, 2, 0.75*px);
          g.fillStyle = '#8f8d90'; g.fillRect(ox, oy + ch - 0.3*px, cw, 0.3*px);
        } else {
          g.fillStyle = '#f4f2ee'; g.fillRect(ox, oy + ch - 1.15*px, cw, 0.95*px);                  /* parapetto */
          g.fillStyle = '#dedad3'; g.fillRect(ox, oy + ch - 0.2*px, cw, 0.2*px);
        }
      } else {
        g.fillStyle = 'rgba(60,54,48,.25)'; g.fillRect(ox, oy, cw, 0.12*px);                       /* ombra della soletta sopra */
      }
    } else {
      const x = ox + 1.0*px, y = oy + 0.75*px, w = 1.2*px, h = 1.45*px;
      if (!casa && R() < .22) persiane(x, y, w, h);
      glass(x, y, w, h);
      g.fillStyle = '#d9d5ce'; g.fillRect(x - 0.1*px, y + h, w + 0.2*px, 5);                       /* davanzale */
      g.fillStyle = 'rgba(0,0,0,.05)'; g.fillRect(ox, oy + ch - 3, cw, 3);                           /* marcapiano */
      if (casa){ g.fillStyle = '#8f8d90'; g.fillRect(ox, oy + ch - 0.32*px, cw, 0.32*px); }          /* fascia grigia all’altezza del solaio */
    }
  }
  for (let i = 0; i < 700; i++){ g.fillStyle = 'rgba(90,80,70,' + (R()*0.025) + ')'; g.fillRect(R()*cv.width, R()*cv.height, 2 + R()*10, 2 + R()*16); }
  for (let i = 0; i < 18; i++){ g.fillStyle = 'rgba(80,72,60,.05)'; g.fillRect(R()*cv.width, R()*cv.height, 3 + R()*4, 30 + R()*120); }   /* colature */
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  t.userData.kind = kind;
  return t;
}
const TEX = { balc:[1, 2].map(i => facadeTex('balc', i)), loggia:[3, 4, 5].map(i => facadeTex('loggia', i)), win:[6, 7, 8].map(i => facadeTex('win', i)),
  cbalc:[11].map(i => facadeTex('cbalc', i)), cloggia:[12, 13].map(i => facadeTex('cloggia', i)), cwin:[14, 15].map(i => facadeTex('cwin', i)) };
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
let texPick = 0;
/* tex: una delle texture di TEX (o il suo tipo: 'balc', 'loggia', 'win'); le varianti si alternano */
function facadeMat(tex, len, h, tint){
  if (typeof tex === 'string') tex = TEX[tex][texPick++ % TEX[tex].length];
  const t = tex.clone(); t.needsUpdate = true; t.repeat.set(len / (BAY * TB), h / (FLOOR_H * TF));
  const lt = (tex.userData.kind === 'win' ? litWin : litBalc).clone(); lt.needsUpdate = true;
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

/* piano terra con i negozi: vetrine scure, saracinesche, insegne colorate (4 negozi per texture) */
function shopTex(){
  const R = seedRng(91), cv = document.createElement('canvas'); cv.width = 1024; cv.height = 128;
  const g = cv.getContext('2d'); g.fillStyle = '#d9d4cb'; g.fillRect(0, 0, 1024, 128);
  for (let i = 0; i < 4; i++){
    const x = i * 256 + 14, w = 228;
    g.fillStyle = ['#2f5d7c','#8c2f2f','#3c6b3f','#c9822b','#5a4a7a'][Math.floor(R() * 5)]; g.fillRect(x, 10, w, 20);   /* insegna */
    g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(x + 30 + R() * 40, 17, 70 + R() * 60, 6);
    if (R() < .3){ g.fillStyle = '#9b9a96'; g.fillRect(x, 36, w, 88); g.fillStyle = 'rgba(0,0,0,.2)'; for (let y = 38; y < 124; y += 5) g.fillRect(x, y, w, 1.5); }  /* saracinesca */
    else {
      const gr = g.createLinearGradient(x, 36, x + w, 124); gr.addColorStop(0, '#3a434c'); gr.addColorStop(1, '#59646e');
      g.fillStyle = gr; g.fillRect(x, 36, w, 88);
      g.fillStyle = 'rgba(255,230,190,.25)'; g.fillRect(x + 8, 60, w - 16, 40);
      g.fillStyle = '#e9e7e2'; g.fillRect(x + w * .62, 36, 4, 88);
    }
  }
  const t = new THREE.CanvasTexture(cv); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
let shopBase = null;
const shopMats = [];
const slabMats = {}, stoneMat = new THREE.MeshStandardMaterial({ color:'#b9b2a6', roughness:.95 });
const slabMat = tint => slabMats[tint || 'w'] || (slabMats[tint || 'w'] = new THREE.MeshStandardMaterial({ color:new THREE.Color(tint || '#ffffff').lerp(new THREE.Color('#f6f4ef'), .55), roughness:.88 }));
const clutterMats = { tank:new THREE.MeshStandardMaterial({ color:'#e9e6df', roughness:.6 }), tankB:new THREE.MeshStandardMaterial({ color:'#4f7fa6', roughness:.6 }),
  panel:new THREE.MeshStandardMaterial({ color:'#283750', roughness:.3, metalness:.4 }), metal:new THREE.MeshStandardMaterial({ color:'#8d9093', roughness:.5, metalness:.6 }),
  ac:new THREE.MeshStandardMaterial({ color:'#d8d8d4', roughness:.7 }) };
/* sul tetto: serbatoi dell’acqua, pannelli solari con il boiler, antenne e condizionatori, come sui tetti di Brindisi */
function roofClutter(x0, x1, z0, z1, y, seed){
  const R = seedRng(seed), area = (x1 - x0) * (z1 - z0), at = () => [x0 + 1.5 + R() * (x1 - x0 - 3), z0 + 1.5 + R() * (z1 - z0 - 3)];
  const cyl = (r, h, m, x, yy, z, rx) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 10), m); c.position.set(x, yy, z); if (rx) c.rotation.z = Math.PI / 2; ctxG.add(c); return c; };
  for (let i = 0, n = Math.max(1, Math.round(area / 160)); i < n; i++){        /* serbatoi in fila */
    const [x, z] = at(), m = R() < .3 ? clutterMats.tankB : clutterMats.tank;
    for (let k = 0; k < 1 + Math.floor(R() * 3); k++) cyl(.55, 1.2, m, x + k * 1.3, y + .6, z);
  }
  for (let i = 0, n = Math.round(area / 220); i < n; i++){                       /* solare termico: pannello inclinato + boiler */
    const [x, z] = at();
    const p = new THREE.Mesh(new THREE.BoxGeometry(2, .06, 1.1), clutterMats.panel); p.position.set(x, y + .7, z); p.rotation.x = -.6; ctxG.add(p);
    cyl(.28, 2, clutterMats.tank, x, y + 1.25, z - .45, true);
    plainBox(x - .9, x - .85, z - .5, z + .4, y, y + 1.2, clutterMats.metal); plainBox(x + .85, x + .9, z - .5, z + .4, y, y + 1.2, clutterMats.metal);
  }
  for (let i = 0, n = 1 + Math.round(area / 300); i < n; i++){                   /* antenne */
    const [x, z] = at(), h = 2.5 + R() * 2;
    cyl(.03, h, clutterMats.metal, x, y + h / 2, z);
    for (let k = 0; k < 3; k++) plainBox(x - .5 + k * .1, x + .5 - k * .1, z - .02, z + .02, y + h - .3 - k * .4, y + h - .27 - k * .4, clutterMats.metal);
  }
  for (let i = 0, n = Math.round(area / 140); i < n; i++){ const [x, z] = at(); plainBox(x, x + .8, z, z + .3, y, y + .55, clutterMats.ac); }   /* condizionatori */
}

/* Ringhiera di metallo: un piano con le sbarre disegnate (le parti vuote si scartano con alphaTest).
   Le coordinate della texture seguono i metri, così tutte le ringhiere usano un solo materiale e si uniscono. */
const bandMat = new THREE.MeshStandardMaterial({ color:'#8f8d90', roughness:.85 });
let railingMat = null;
function railing(xa, za, xb, zb, y, h){
  if (!railingMat){
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
    const g = cv.getContext('2d'); g.fillStyle = '#b9bbbe';
    g.fillRect(0, 0, 128, 10); g.fillRect(0, 112, 128, 8);                       /* corrimano e traverso basso */
    for (let x = 4; x < 128; x += 16) g.fillRect(x, 0, 4, 120);                   /* una sbarra ogni 12 cm */
    const t = new THREE.CanvasTexture(cv); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    railingMat = new THREE.MeshStandardMaterial({ map:t, alphaTest:.5, side:THREE.DoubleSide, roughness:.5, metalness:.4 });
  }
  const L = Math.hypot(xb - xa, zb - za); if (L < 0.05) return;
  const geo = new THREE.PlaneGeometry(L, h), uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * L / 1.0);           /* 1 m di ringhiera = una ripetizione */
  const m = new THREE.Mesh(geo, railingMat);
  m.position.set((xa + xb) / 2, y + h / 2, (za + zb) / 2); m.rotation.y = -Math.atan2(zb - za, xb - xa);
  ctxG.add(m); return m;
}

/* Un edificio: quattro facciate (texture ripetuta per piano), tetto a quadrotti, volumi tecnici.
   Sulla facciata a sud (o.south ≠ false) i balconi sono veri: soletta e parapetto per ogni piano. */
function block(x0, x1, z0, z1, y0, y1, o){
  o = o || {};
  const h = y1 - y0, w = x1 - x0, d = z1 - z0, tint = o.tint;
  const realBalc = o.south !== false && o.slabs !== false && h > 5, dep = 1.3;
  /* o.loggia: balconi incassati, il parapetto è a filo della facciata (la stecca di casa, sotto il terrazzo) */
  const zs = realBalc && o.loggia ? z1 - dep : z1;
  const c = o.casa ? 'c' : '';
  const faces = [
    [w, [ (x0+x1)/2, zs ], 0,            c + (o.south === false ? 'win' : realBalc ? 'loggia' : 'balc')],
    [w, [ (x0+x1)/2, z0 ], Math.PI,      c + (o.north ? 'balc' : 'win')],
    [zs - z0, [ x1, (z0+zs)/2 ], Math.PI/2,    c + 'win'],      /* i fianchi arrivano al fondo della loggia */
    [zs - z0, [ x0, (z0+zs)/2 ], -Math.PI/2,   c + 'win']
  ];
  /* o.gapN / o.gapS: tratto [x0, x1] senza facciata (lì scende il pozzo della scala) */
  const face = (f, x0f, x1f) => {
    const wf = x1f - x0f; if (wf < 0.01) return;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(wf, h), facadeMat(f[3], wf, h, tint));
    m.position.set((x0f + x1f) / 2, y0 + h/2, f[1][1]); m.rotation.y = f[2];
    ctxG.add(m);
  };
  faces.forEach((f, i) => {
    const gap = i === 0 ? o.gapS : i === 1 ? o.gapN : null;
    if (gap){ face(f, x0, gap[0]); face(f, gap[1], x1); return; }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(f[0], h), facadeMat(f[3], f[0], h, tint));
    m.position.set(f[1][0], y0 + h/2, f[1][1]); m.rotation.y = f[2];
    ctxG.add(m);
  });
  /* balconi veri: soletta sporgente 1,3 m e parapetto pieno, a ogni piano sopra il terreno */
  if (realBalc){
    const sm = slabMat(tint), za = zs, zb = zs + dep;
    for (let y = y0 + FLOOR_H; y < y1 - 1; y += FLOOR_H){
      if (o.casa){
        /* come nella foto: soletta con la fascia grigio scuro e ringhiera di metallo, aperta anche ai lati */
        plainBox(x0, x1, za, zb, y - 0.24, y, bandMat);
        railing(x0, zb - 0.04, x1, zb - 0.04, y, 1.0);
        if (o.ends && o.ends[0]) railing(x0 + 0.04, za, x0 + 0.04, zb, y, 1.0);
        if (o.ends && o.ends[1]) railing(x1 - 0.04, za, x1 - 0.04, zb, y, 1.0);
        continue;
      }
      plainBox(x0, x1, za, zb, y - 0.2, y, sm);
      plainBox(x0, x1, zb - 0.1, zb, y, y + 1.0, sm);
      if (!o.loggia){ plainBox(x0, x0 + 0.1, za, zb, y, y + 1.0, sm); plainBox(x1 - 0.1, x1, za, zb, y, y + 1.0, sm); }
    }
    /* loggia: muretti pieni alle due estremità, per tutta l’altezza */
    if (o.loggia && !o.casa){ plainBox(x0, x0 + 0.2, za, zb, y0, y1, sm); plainBox(x1 - 0.2, x1, za, zb, y0, y1, sm); }
  }
  /* zoccolo in pietra al piede dell’edificio */
  if (y0 <= GROUND_Y + 0.1 && !o.casa){
    plainBox(x0 - 0.06, x1 + 0.06, z0 - 0.06, z1 + 0.06, y0, y0 + 0.9, stoneMat);
  }
  /* negozi al piano terra sulla facciata indicata (0 = sud, 1 = nord) */
  if (o.shops !== undefined){
    shopBase = shopBase || shopTex();
    const f = faces[o.shops], t = shopBase.clone(); t.needsUpdate = true; t.repeat.set(f[0] / 18, 1);
    const sm = new THREE.MeshStandardMaterial({ map:t, roughness:.7, emissive:'#ffffff', emissiveMap:t, emissiveIntensity:0 });
    shopMats.push(sm);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(f[0], 3.6), sm);
    const off = o.shops === 0 ? 0.03 : -0.03;
    m.position.set(f[1][0], y0 + 1.8, f[1][1] + off); m.rotation.y = f[2]; ctxG.add(m);
    const aw = o.shops === 0 ? [z1, z1 + 1.4] : [z0 - 1.4, z0];                          /* pensilina */
    plainBox(x0, x1, aw[0], aw[1], y0 + 3.6, y0 + 3.8, slabMat(tint));
  }
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
    } else {
      roof(x0, x1, z0, z1, y1, true);
      plainBox(x0 - 0.3, x1 + 0.3, z0 - 0.3, z1 + 0.3, y1 - 0.45, y1 - 0.05, slabMat(tint));    /* cornicione */
      roofClutter(x0, x1, z0, z1, y1, Math.round(x0 * 7 + z0 * 13));
    }
    (o.boxes || []).forEach(b => roofBox(b[0], b[1], b[2] || 4.5, b[3] || 4, y1, b[4]));
  }
}

/* ---------- auto e lampioni: una forma con i colori sui vertici, ripetuta con InstancedMesh ---------- */
function coloredBox(w, h, d, x, y, z, col, taper){
  const g = new THREE.BoxGeometry(w, h, d);
  if (taper){ const p = g.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) > 0){ p.setX(i, p.getX(i) * taper[0]); p.setZ(i, p.getZ(i) * taper[1]); } g.computeVertexNormals(); }
  g.translate(x, y, z); g.deleteAttribute('uv');
  const c = new THREE.Color(col), a = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < a.length; i += 3){ a[i] = c.r; a[i+1] = c.g; a[i+2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g.toNonIndexed();
}
function carGeo(){
  const parts = [
    coloredBox(4.1, 0.62, 1.74, 0, 0.55, 0, '#ffffff'),                          /* carrozzeria (presa dal colore dell’istanza) */
    coloredBox(2.3, 0.56, 1.6, -0.25, 1.14, 0, '#262b31', [0.82, 0.86]),           /* abitacolo, vetri scuri */
    coloredBox(2.0, 0.06, 1.38, -0.25, 1.43, 0, '#ffffff'),                       /* tetto */
    coloredBox(0.12, 0.14, 1.5, 2.06, 0.62, 0, '#f1eee3'), coloredBox(0.08, 0.14, 1.5, -2.06, 0.62, 0, '#8b1d1d')   /* fari e stop */
  ];
  [[1.3, .82], [1.3, -.82], [-1.3, .82], [-1.3, -.82]].forEach(p => {
    const w = new THREE.CylinderGeometry(0.32, 0.32, 0.22, 8, 1); w.rotateX(Math.PI / 2); w.translate(p[0], 0.32, p[1]); w.deleteAttribute('uv');
    const a = new Float32Array(w.attributes.position.count * 3).fill(0.08); w.setAttribute('color', new THREE.BufferAttribute(a, 3));
    parts.push(w.toNonIndexed());
  });
  return mergeGeometries(parts);
}
const CAR_COLS = ['#f2f2f0','#f2f2f0','#c9ccd0','#9aa0a6','#2b2e33','#1f2f4f','#8f1f22','#5b6b7a','#e9e2d0','#3c4d3a'];
function placeCars(list, R){
  const im = new THREE.InstancedMesh(carGeo(), new THREE.MeshStandardMaterial({ vertexColors:true, roughness:.45, metalness:.15 }), list.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
  list.forEach((p, i) => {
    q.setFromAxisAngle(up, p[2] + (R() - .5) * .05);
    m4.compose(v.set(p[0], GROUND_Y + 0.03, p[1]), q, one.set(0.9 + R() * .2, 1, 1)); im.setMatrixAt(i, m4);
    im.setColorAt(i, c.set(CAR_COLS[Math.floor(R() * CAR_COLS.length)]));
  });
  im.userData.keep = true; im.computeBoundingSphere(); ctxG.add(im);
}
const lampHeadMat = new THREE.MeshStandardMaterial({ color:'#e8e6df', emissive:'#ffcf8a', emissiveIntensity:0, roughness:.4 });
let poolMat = null, poolMesh = null;
function placeLamps(list){
  const poleG = mergeGeometries([coloredBox(0.16, 8, 0.16, 0, 4, 0, '#55595d'), coloredBox(0.1, 0.1, 1.8, 0, 7.9, 0.85, '#55595d'), coloredBox(0.3, 0.35, 0.3, 0, 0.17, 0, '#4a4d50')]);
  const headG = new THREE.BoxGeometry(0.42, 0.12, 0.7); headG.translate(0, 7.82, 1.65);
  const poles = new THREE.InstancedMesh(poleG, new THREE.MeshStandardMaterial({ vertexColors:true, roughness:.6, metalness:.3 }), list.length);
  const heads = new THREE.InstancedMesh(headG, lampHeadMat, list.length);
  /* pozza di luce: un disco a sfumare, sommato al colore dell’asfalto */
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,200,130,1)'); gr.addColorStop(.45, 'rgba(255,190,120,.45)'); gr.addColorStop(1, 'rgba(255,180,110,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const pt = new THREE.CanvasTexture(cv); pt.colorSpace = THREE.SRGBColorSpace;
  poolMat = new THREE.MeshBasicMaterial({ map:pt, transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false, toneMapped:false });
  const poolG = new THREE.PlaneGeometry(11, 11); poolG.rotateX(-Math.PI / 2); poolG.translate(0, 0.06, 1.65);
  poolMesh = new THREE.InstancedMesh(poolG, poolMat, list.length); poolMesh.visible = false; poolMesh.renderOrder = 1;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  list.forEach((p, i) => {
    q.setFromAxisAngle(up, p[2]); m4.compose(v.set(p[0], GROUND_Y, p[1]), q, one);
    poles.setMatrixAt(i, m4); heads.setMatrixAt(i, m4); poolMesh.setMatrixAt(i, m4);
  });
  [poles, heads, poolMesh].forEach(m => { m.userData.keep = true; m.computeBoundingSphere(); ctxG.add(m); });
}

/* ---------- garage al piano -1 ----------
   Il palazzo ha i garage un piano sotto la strada: lungo Via Mantova e sui due fianchi una corsia scende a −3 m,
   con le porte basculanti nel muro del palazzo; verso la strada un muretto con la ringhiera bianca.
   A ovest, dietro il palazzo, la rampa risale al livello della strada. */
const GARAGE_D = 3, GL = 3.2;            /* profondità e larghezza della corsia (oltre la loggia di 1,3 m) */
const casaMat = new THREE.MeshStandardMaterial({ color:'#d6cfc9', roughness:.92 });
function garageHole(xW, xE, north, south, pz){
  const zf = south - 1.3;
  return [[xW - GL, north - 9], [xW - GL, south + GL], [xE + GL, south + GL], [xE + GL, pz + 2], [xE, pz + 2], [xE, zf], [xW, zf], [xW, north - 9]];
}
function garageDoorsTex(){
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 160;
  const g = cv.getContext('2d'); g.fillStyle = '#c9c4bd'; g.fillRect(0, 0, 512, 160);
  for (let i = 0; i < 2; i++){
    const x = i * 256 + 34, w = 188;
    g.fillStyle = '#e8e6e1'; g.fillRect(x, 26, w, 134);
    g.fillStyle = 'rgba(0,0,0,.12)'; for (let y = 34; y < 160; y += 9) g.fillRect(x, y, w, 2);   /* basculante a doghe */
    g.fillStyle = '#8f8d90'; g.fillRect(x - 6, 20, w + 12, 6);
    g.fillStyle = '#6a6c70'; g.fillRect(x + w / 2 - 8, 96, 16, 4);
  }
  g.fillStyle = 'rgba(0,0,0,.08)'; for (let i = 0; i < 400; i++) g.fillRect(Math.random() * 512, Math.random() * 160, 2, 2);
  const t = new THREE.CanvasTexture(cv); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function garages(xW, xE, north, south, pz, walkMat){
  const yb = GROUND_Y - GARAGE_D, zf = south - 1.3, zo = south + GL;
  const conc = new THREE.MeshStandardMaterial({ color:'#b8b3ab', roughness:.95 });
  const floor = new THREE.MeshStandardMaterial({ color:'#8a8883', roughness:.95 });
  const doors = garageDoorsTex();
  /* muro del palazzo con le porte (una coppia ogni 6 m) */
  const doorWall = (xa, za, xb, zb) => {
    const L = Math.hypot(xb - xa, zb - za), t = doors.clone(); t.needsUpdate = true; t.repeat.set(L / 6, 1);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(L, GARAGE_D), new THREE.MeshStandardMaterial({ map:t, roughness:.85 }));
    m.position.set((xa + xb) / 2, yb + GARAGE_D / 2, (za + zb) / 2); m.rotation.y = -Math.atan2(zb - za, xb - xa);
    ctxG.add(m);
  };
  doorWall(xW, zf + 0.02, xE, zf + 0.02);                                     /* sotto i balconi su Via Mantova */
  doorWall(xW - 0.02, north, xW - 0.02, zf);                                  /* fianco ovest (Via Mantova che gira a nord): la faccia guarda a ovest */
  doorWall(xE + 0.02, zf, xE + 0.02, pz + 2);                                 /* fianco est */
  /* fondo della corsia e rampa che risale dietro il palazzo */
  plainBox(xW - GL, xE + GL, zf, zo, yb - 0.1, yb, floor);
  plainBox(xW - GL, xW, north + 6, zf, yb - 0.1, yb, floor);
  plainBox(xE, xE + GL, pz + 2, zf, yb - 0.1, yb, floor);
  const rl = Math.hypot(15, GARAGE_D), ramp = new THREE.Mesh(new THREE.PlaneGeometry(GL, rl), floor);
  ramp.rotation.order = 'YXZ'; ramp.rotation.x = -Math.PI / 2 + Math.atan2(GARAGE_D, 15);      /* sale verso nord */
  ramp.position.set(xW - GL / 2, yb + GARAGE_D / 2, north - 9 + 7.5); ctxG.add(ramp);
  /* muri di contenimento sul lato della strada, sotto il muretto */
  plainBox(xW - GL - 0.25, xE + GL + 0.25, zo, zo + 0.25, yb, GROUND_Y + 0.45, conc);
  plainBox(xW - GL - 0.25, xW - GL, north - 9, zo, yb, GROUND_Y + 0.45, conc);
  plainBox(xE + GL, xE + GL + 0.25, pz + 2, zo, yb, GROUND_Y + 0.45, conc);
  plainBox(xE, xE + GL, pz + 1.75, pz + 2, yb, GROUND_Y + 0.45, conc);
  plainBox(xW, xW + 0.25, north - 9, north, yb, GROUND_Y, conc);             /* lato interno della rampa */
  /* ringhiera bianca sul muretto, come in foto */
  railing(xW - GL, zo + 0.12, xE + GL, zo + 0.12, GROUND_Y + 0.45, 1.2);
  railing(xW - GL - 0.12, north - 9, xW - GL - 0.12, zo, GROUND_Y + 0.45, 1.2);
  railing(xE + GL + 0.12, pz + 2, xE + GL + 0.12, zo, GROUND_Y + 0.45, 1.2);
  railing(xE, pz + 1.88, xE + GL, pz + 1.88, GROUND_Y + 0.45, 1.2);
  /* marciapiedi lungo la ringhiera */
  plainBox(xW - 12, xE + 12, zo + 0.25, zo + 1.8, GROUND_Y, GROUND_Y + 0.12, walkMat);
  plainBox(xW - GL - 2.3, xW - GL - 0.25, north - 30, zo + 0.25, GROUND_Y, GROUND_Y + 0.12, walkMat);
}

/* cancello del palazzo: due pilastri e un’anta scorrevole a sbarre, largo 4 m */
const gateMat = new THREE.MeshStandardMaterial({ color:'#3c4146', roughness:.6, metalness:.5 });
function gate(cx, cz, rot){
  const g = new THREE.Group(); g.position.set(cx, GROUND_Y, cz); g.rotation.y = rot;
  const pil = new THREE.BoxGeometry(0.45, 2.3, 0.45);
  [-2.25, 2.25].forEach(x => { const m = new THREE.Mesh(pil, whiteMat); m.position.set(x, 1.15, 0); g.add(m); });
  const bar = new THREE.BoxGeometry(0.04, 1.8, 0.04);
  for (let i = 0; i < 26; i++){ const m = new THREE.Mesh(bar, gateMat); m.position.set(-1.95 + i * 0.156, 1.05, 0); g.add(m); }
  [0.2, 1.9].forEach(y => { const m = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.08, 0.06), gateMat); m.position.set(0, y, 0); g.add(m); });
  ctxG.add(g);
}
/* nome di una via (o di un cancello) scritto per terra, come quelli della piantina */
function streetName(text, x, z, rot, k){
  const w = 18 * (k || 1);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.25),
    new THREE.MeshBasicMaterial({ map:labelTexture(text, 'rgba(244,246,248,.9)'), transparent:true, depthWrite:false }));
  m.rotation.set(-Math.PI / 2, 0, rot || 0); m.position.set(x, GROUND_Y + 0.08, z); m.renderOrder = 2;
  ctxG.add(m);
}

function buildContext(){
  /* piantina: x 62–675 px, y 38–352 px (balcone a sud fino a 352) */
  const west = X(62), east = X(675), north = Z(97), south = Z(352), mid = Z(300);
  /* la stecca è lunga circa 73 m (Google Earth): finisce prima dell’asilo e della curva di Via Mantova */
  const xW = west - 24, xE = east + 24;
  /* la stecca: 7 piani sotto l’attico, balconi continui su Via Mantova */
  const gap = [X(WELL.x0) - 0.1, X(WELL.x1) + 0.1];
  /* sul retro la facciata segue la casa (Google Earth): a filo sotto la veranda della cucina,
     rientra davanti alla stanza a ovest della veranda, poi torna avanti */
  const nx0 = X(58), nx1 = X(132.5), nz = Z(136);
  block(xW, nx0, north, south, GROUND_Y, -0.42, { roof:false, north:true, loggia:true, casa:true, ends:[true, false] });
  block(nx0, nx1, nz, south, GROUND_Y, -0.42, { roof:false, north:true, loggia:true, casa:true });
  /* il balcone della camera sta in una rientranza (Google Earth): sotto di lui la facciata è a filo del parapetto,
     a est il corpo vicino sporge verso nord, a ovest l’ala sul retro sporge e poi si allarga verso est */
  const bx0 = X(504), bx1 = X(671), bz = Z(99), pz = north - 1.6;
  block(nx1, bx0, north, south, GROUND_Y, -0.42, { roof:false, north:true, loggia:true, casa:true, gapN:gap });
  block(bx0, bx1, bz, south, GROUND_Y, -0.42, { roof:false, north:true, loggia:true, casa:true });
  block(bx1, xE, pz, south, GROUND_Y, -0.42, { roof:false, north:true, loggia:true, casa:true, ends:[false, true] });
  block(X(297), X(396), Z(38), north, GROUND_Y, -0.42, { roof:false, south:false, gapS:gap });
  /* ala sul retro, perpendicolare, in asse con il vano scala (come da Google Earth): il suo tetto
     arriva al piano dell’attico, così dietro la casa non resta nessuna fessura */
  /* parte dal lato ovest del vano scala e va verso est: la vetrata della cucina guarda nel vuoto */
  const wx0 = X(297) - 0.2, wx1 = X(504), wz0 = north - 30;     /* accanto al balcone finisce dove comincia il balcone */
  const wjx = wx1 + 2.4, wjz = bz - 2.0;                           /* più a nord si allarga verso est */
  block(wx0, wx1, wz0, north, GROUND_Y, -0.04, { south:false, roof:false, gapS:gap });
  block(wx1 - 0.01, wjx, wz0, wjz, GROUND_Y, -0.04, { south:false, roof:false });
  plainBox(wx0, wjx, wz0, wz0 + 0.25, -0.04, 0.9, whiteMat);
  plainBox(wx0, wx0 + 0.25, wz0, north, -0.04, 0.9, whiteMat);
  plainBox(wjx - 0.25, wjx, wz0, wjz, -0.04, 0.9, whiteMat);
  plainBox(wx1 - 0.25, wjx, wjz - 0.25, wjz, -0.04, 0.9, whiteMat);
  plainBox(wx1 - 0.25, wx1, wjz, north, -0.04, 0.9, whiteMat);
  roofBox(wx1 - 3.5, north - 24, 5, 4, -0.04);
  /* corpi scala che sporgono sulla facciata dei balconi */
  [-31, 30].forEach(cx => {
    const t = facadeMat('cwin', 4, -0.42 - GROUND_Y + GARAGE_D);
    /* arriva fino al fondo dei balconi incassati e scende fino al piano dei garage */
    const sb = new THREE.Mesh(new THREE.BoxGeometry(4, -0.42 - GROUND_Y + 2.4 + GARAGE_D, 2.7), [casaMat, casaMat, casaMat, casaMat, t, casaMat]);
    sb.position.set(cx, (GROUND_Y - GARAGE_D + 1.98) / 2, south + 0.05); ctxG.add(sb);
  });
  /* copertura attorno all’attico: tetto piano a quadrotti, muretto e volumi tecnici, nessun altro appartamento */
  /* solaio dell’ultimo piano (con il vano scala), bucato dove scende la scala condominiale */
  ctxG.add(holedSlab([[xW, north], [nx0, north], [nx0, nz], [nx1, nz], [nx1, north], [X(297), north], [X(297), Z(38)], [X(396), Z(38)], [X(396), north], [bx0, north], [bx0, bz], [bx1, bz], [bx1, pz], [xE, pz], [xE, south + 0.1], [xW, south + 0.1]],
    -0.44, -0.04, new THREE.MeshStandardMaterial({ color:'#d9d7d2', roughness:.9 })));
  /* quadrotti su tutta la copertura, anche sulla striscia dietro la casa */
  {
    const t = roofBase.clone(); t.needsUpdate = true; t.repeat.set(0.25, 0.25);
    ctxG.add(holedPlane([[xW, north], [nx0, north], [nx0, nz], [nx1, nz], [nx1, north], [wx0, north], [wx0, wz0], [wjx, wz0], [wjx, wjz], [wx1, wjz], [wx1, bz], [bx1, bz], [bx1, pz], [xE, pz], [xE, south], [xW, south]],
      -0.03, new THREE.MeshStandardMaterial({ map:t, roughness:.95 })));
  }
  /* muretti d’attico sui bordi del tetto (non attraversano l’appartamento né il suo retro) */
  [[xW, west], [east, xE]].forEach(r => plainBox(r[0], r[1], south - 0.25, south, -0.04, 0.9, whiteMat));
  plainBox(xW, nx0, north, north + 0.25, -0.04, 0.9, whiteMat);
  plainBox(bx1, xE, pz, pz + 0.25, -0.04, 0.9, whiteMat);
  plainBox(bx1, bx1 + 0.25, pz, bz, -0.04, 0.9, whiteMat);     /* muretto sul lato del corpo che sporge */
  plainBox(nx0 - 0.25, nx0, north, nz, -0.04, 0.9, whiteMat);     /* muretto sul bordo del rientro */
  plainBox(xW, xW + 0.25, north, south, -0.04, 0.9, whiteMat);
  plainBox(xE - 0.25, xE, pz, south, -0.04, 0.9, whiteMat);
  [[xW + 7, north + 3.2], [xW + 21, mid - 2], [east + 9, north + 3.2], [xE - 10, mid - 2]].forEach(b => roofBox(b[0], b[1], 5, 4.2, -0.04));

  /* suolo urbano: asfalto chiaro, cemento e qualche aiuola */
  const groundMat = new THREE.MeshStandardMaterial({ map:(() => { const t = noiseTex('#a9a69f', ['#9c9992','#b5b2ab','#a3a097'], 9000, 512); t.repeat.set(40, 40); return t; })(), roughness:1 });
  /* il suolo ha un buco dove scende la corsia dei garage (vedi garages) */
  const gsh = new THREE.Shape(); gsh.absarc(0, 0, 340, 0, Math.PI * 2, false);
  const hole = new THREE.Path(); garageHole(xW, xE, north, south, pz).forEach((p, i) => { if (i) hole.lineTo(p[0], -p[1]); else hole.moveTo(p[0], -p[1]); });
  gsh.holes.push(hole);
  const ground = new THREE.Mesh(new THREE.ShapeGeometry(gsh, 64), groundMat);
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
  /* Via Mantova davanti ai balconi. Fra la strada e il palazzo, sotto la ringhiera, corre la corsia dei garage
     un piano più in basso (foto da Via Mantova). A ovest Via Mantova gira verso nord, a est finisce nell’incrocio. */
  const roadZ = south + 12;
  const sideX = xW - GL - 7;                 /* Via Mantova, tratto verso nord (lungo il Lidl, fino a Via Appia) */
  const crossX = xE + 18;                    /* Via Verona, a est, da nord-ovest a sud-est */
  const MB = [-0.91, 0.415];                 /* Via Montebello: dall’incrocio verso sud-ovest */
  strip((sideX - 4.5 + crossX) / 2, roadZ, crossX - sideX + 4.5, 14, 0, roadMat(crossX - sideX));
  garages(xW, xE, north, south, pz, walkMat);
  /* marciapiede di fronte: fino a dove Via Montebello si stacca verso sud-ovest */
  const swE = crossX - 30;
  strip((sideX + 4.5 + swE) / 2, roadZ + 8.6, swE - sideX - 4.5, 3.2, 0, walkMat, 0.12);
  strip(sideX, (roadZ + 7 - 140) / 2, roadZ + 7 + 140, 9, Math.PI/2, roadMat(150));
  /* Via Verona a nord dell’incrocio, Via Magenta a sud, sulla stessa linea */
  strip(crossX, -60, 260, 11, Math.PI/2, roadMat(260));
  /* Via Montebello in diagonale: dall’incrocio verso sud-ovest (e un tratto verso nord-est) */
  {
    const mbA = Math.atan2(MB[1], -MB[0]);
    strip(crossX + MB[0] * 80, roadZ + MB[1] * 80, 240, 10, mbA, roadMat(240), 0.035);
  }
  const zebra = new THREE.MeshStandardMaterial({ color:'#efeee9', roughness:.8 });
  for (let i = -5; i <= 5; i++) strip(crossX + i * 0.95, roadZ - 12, 0.5, 4, 0, zebra, 0.05);
  for (let i = -6; i <= 6; i++) strip(crossX - 11, roadZ + i * 0.95, 4, 0.5, 0, zebra, 0.05);
  /* i due cancelli del palazzo: l’ingresso su Via Verona e il secondo su Via Mantova, verso Via Appia */
  gate(crossX - 7.2, -20, Math.PI / 2);
  strip((xE + crossX - 7.2) / 2, -20, crossX - 7.2 - xE, 3, 0, walkMat, 0.06);      /* vialetto dal cancello al retro del palazzo */
  gate(sideX + 6.2, -54, Math.PI / 2);
  /* nomi delle vie sull’asfalto (Via Mantova davanti ai balconi è il nome della piantina) */
  streetName('Via Mantova', sideX, -30, Math.PI / 2);
  streetName('Via Verona', crossX, -45, Math.PI / 2);
  streetName('Via Magenta', crossX, roadZ + 40, Math.PI / 2);
  streetName('Via Montebello', crossX + MB[0] * 55, roadZ + MB[1] * 55, Math.atan2(MB[1], -MB[0]));
  streetName('Cancello ingresso', crossX - 13, -23.5, 0, 0.5);
  streetName('Cancello 2', sideX + 10, -54, 0, 0.5);
  /* l’asilo dal tetto rosso fra il palazzo e Via Verona, con il suo giardino */
  plainBox(xE + 2, xE + 11, south - 12, south - 1, GROUND_Y, GROUND_Y + 3.6, new THREE.MeshStandardMaterial({ color:'#e8d9c8', roughness:.9 }));
  const redRoof = new THREE.Mesh(new THREE.ConeGeometry(7.4, 2.2, 4, 1), new THREE.MeshStandardMaterial({ color:'#b0523c', roughness:.8 }));
  redRoof.rotation.y = Math.PI / 4; redRoof.scale.set(0.9, 1, 1.1);
  redRoof.position.set(xE + 6.5, GROUND_Y + 4.7, south - 6.5); ctxG.add(redRoof);
  strip(xE + 6.5, north - 6, 9, 12, 0, green, 0.05);
  /* a ovest, oltre Via Mantova, il Lidl con i pannelli solari e il suo parcheggio */
  block(sideX - 36, sideX - 8, north - 46, south - 4, GROUND_Y, GROUND_Y + 9, { south:false, solar:true, tint:'#f2f2f0' });
  const park = new THREE.MeshStandardMaterial({ color:'#8e8c87', roughness:.9 });
  strip(sideX - 44, south + 7, 70, 7, 0, park, 0.04);
  /* oltre la strada: zona tecnica ribassata, una cabina, i palazzi ocra, rosa e verde acqua */
  plainBox(-48, 6, roadZ + 10.5, roadZ + 26, GROUND_Y - 0.02, GROUND_Y + 0.02, new THREE.MeshStandardMaterial({ color:'#9a978f', roughness:1 }));
  plainBox(-48, 6, roadZ + 10.2, roadZ + 10.6, GROUND_Y, GROUND_Y + 1.2, whiteMat);
  plainBox(-14, 2, roadZ + 13, roadZ + 21, GROUND_Y, GROUND_Y + 3.4, new THREE.MeshStandardMaterial({ color:'#d8d4ce', roughness:.9 }));
  block(-46, -16, roadZ + 56, roadZ + 70, GROUND_Y, GROUND_Y + 22, { tint:'#e6c88f', boxes:[[-38, roadZ + 63], [-24, roadZ + 63]], shops:1 });
  block(10, 30, roadZ + 26, roadZ + 58, GROUND_Y, GROUND_Y + 24, { tint:'#d79a86', boxes:[[20, roadZ + 40]], shops:1 });
  block(38, 50, roadZ + 12, roadZ + 26, GROUND_Y, GROUND_Y + 24, { tint:'#b9cfc8', boxes:[[44, roadZ + 19, 4, 4]], shops:1 });
  block(-110, -60, roadZ + 14, roadZ + 40, GROUND_Y, GROUND_Y + 8, { south:false, tint:'#c9c4bc' });
  /* dietro: palazzi bianchi e rosati, e oltre l’incrocio */
  block(-30, 14, north - 66, north - 50, GROUND_Y, GROUND_Y + 24, { tint:'#f1efe9', boxes:[[-20, north - 58], [4, north - 58]] });
  block(crossX + 9, crossX + 24, north - 60, north - 20, GROUND_Y, GROUND_Y + 27, { tint:'#d9a091' });
  block(crossX + 30, crossX + 50, north - 10, north + 8, GROUND_Y, GROUND_Y + 18, { tint:'#f3f1ec' });
  block(18, 34, north - 44, north - 22, GROUND_Y, GROUND_Y + 15, { tint:'#ece9e2', south:false });

  /* il verde (verde.js): pini a ombrello, palme, lecci e ficus, cipressi e siepi di oleandro */
  const R = seedRng(2026), T = [];
  const add = (k, x, z, s, y) => T.push({ k, x, z, s, y });
  for (let z = -140; z < roadZ - 10; z += 9) add('palma', crossX + 8.2, z + R() * 2, 0.9 + R() * 0.25);   /* palme lungo Via Verona */
  for (let i = 0; i < 12; i++) add(R() < .7 ? 'pino' : 'leccio', crossX + 16 + R() * 28, south + 8 + R() * 28);
  for (let i = 0; i < 10; i++) add('siepe', crossX + 14 + R() * 30, south + 6 + R() * 30, 1 + R() * .5);
  for (let i = 0; i < 12; i++){ const r = R(); add(r < .45 ? 'pino' : r < .75 ? 'leccio' : 'cipresso', -30 + R() * 26, north - 14 - R() * 20); }
  for (let x = xW; x < xE; x += 13) if (x < wx0 - 4 || x > wjx + 3) add(R() < .5 ? 'leccio' : 'ficus', x + R() * 4, north - 6 - R() * 3);   /* dietro il palazzo, non dentro l’ala */
  /* Via Mantova: alberi sul marciapiede di fronte e oleandri nelle fioriere lungo il muretto */
  for (let x = sideX + 8; x < swE; x += 11) add('ficus', x + R() * 2, roadZ + 8.6, 0.75 + R() * .2);
  for (let x = xW - 3; x < xE + 3; x += 4.5) add('siepe', x, south + GL + 0.9, 0.55 + R() * .15, GROUND_Y + 0.45);   /* fioriere oltre la ringhiera */
  /* il giardino dell’asilo */
  add('palma', xE + 3, south - 0.5, 1.05); add('palma', xE + 10, north - 1.5, 0.95); add('ficus', xE + 6, north - 8);
  for (let i = 0; i < 6; i++) add('siepe', xE + 3 + R() * 7, north - 11 + R() * 8);
  /* lungo il parcheggio a ovest e oltre la strada */
  for (let x = sideX - 76; x < sideX - 10; x += 10) add('leccio', x + R() * 2, south + 11.5, .8 + R() * .2);
  add('pino', -52, roadZ + 22, 1.1); add('pino', -58, roadZ + 30, 1.0); add('cipresso', -54, roadZ + 13); add('cipresso', -50, roadZ + 13);
  for (let i = 0; i < 6; i++) add(R() < .5 ? 'pino' : 'palma', -100 + R() * 40, roadZ + 44 + R() * 12);
  plantTrees(ctxG, T, GROUND_Y);

  /* auto parcheggiate lungo Via Mantova, Via Verona e nel parcheggio del Lidl */
  const cars = [];
  for (let x = sideX + 9; x < crossX - 10; x += 5.4){
    if (R() < .72) cars.push([x + R() * .6, roadZ - 5.6, 0]);
    if (x < swE - 4 && R() < .6) cars.push([x + 2 + R() * .6, roadZ + 5.6, Math.PI]);
  }
  for (let z = -110; z < south - 2; z += 5.4){ if (z < -26 || z > -14){ if (R() < .55) cars.push([crossX - 4.4, z, Math.PI / 2]); } if (R() < .4) cars.push([sideX + 3.4, z, -Math.PI / 2]); }
  for (let x = sideX - 76; x < sideX - 12; x += 2.6) if (R() < .7) cars.push([x, south + 7, R() < .5 ? Math.PI / 2 : -Math.PI / 2]);
  placeCars(cars, R);

  /* lampioni su entrambi i lati, che la sera si accendono e fanno una pozza di luce sull’asfalto */
  const lamps = [];
  for (let x = sideX + 10; x < crossX - 8; x += 24){ lamps.push([x, roadZ - 7.4, 0]); if (x + 12 < swE) lamps.push([x + 12, roadZ + 7.6, Math.PI]); }
  for (let z = -100; z < roadZ - 10; z += 26) lamps.push([sideX - 5.6, z, Math.PI / 2]);
  for (let z = -120; z < south; z += 26) lamps.push([crossX + 6.2, z, -Math.PI / 2]);
  placeLamps(lamps);
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
  /* lampioni e vetrine: accesi quando fa buio */
  const lamp = THREE.MathUtils.smoothstep(ambState.night, 0.35, 0.75);
  if (poolMat && Math.abs(poolMat.opacity - lamp * 0.6) > 0.002){
    poolMat.opacity = lamp * 0.6; poolMesh.visible = lamp > 0.01;
    lampHeadMat.emissiveIntensity = lamp * 2.2;
    shopMats.forEach(m => { m.emissiveIntensity = lamp * 0.35; });
  }
  if (ctxRev !== st.rev){
    ctxRev = st.rev;
    labelsG.children.forEach(m => { if (m.userData.street) m.position.y = on ? GROUND_Y + 0.08 : 0; });
  }
}

export { contextFrame, ctxG, roofBase, roofMatFor };
