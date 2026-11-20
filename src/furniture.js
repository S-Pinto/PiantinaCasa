import * as THREE from 'three';
import { H } from './core.js';

/* ------------------------- Arredi ------------------------- */
const furnMatCache = {};
const fm = (c, o) => { const k = c + (o ? JSON.stringify(o) : ''); return furnMatCache[k] || (furnMatCache[k] = new THREE.MeshStandardMaterial(Object.assign({ color:c, roughness:.75, metalness:0 }, o || {}))); };
const shade = (hex, f) => {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const m = v => Math.max(0, Math.min(255, Math.round(f < 1 ? v * f : v + (255 - v) * (f - 1))));
  return '#' + [m(r), m(g), m(b)].map(v => v.toString(16).padStart(2, '0')).join('');
};
const GLS = { transparent:true, opacity:.3, roughness:.1, depthWrite:false };
function fbox(g, w, h, d, x, y, z, c, o){
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), fm(c, o));
  m.position.set(x, y + h/2, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
}
function fcyl(g, r, h, x, y, z, c, o){
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20), fm(c, o));
  m.position.set(x, y + h/2, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
}
function fsph(g, r, x, y, z, c){
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), fm(c));
  m.position.set(x, y, z); m.castShadow = true; g.add(m); return m;
}

/* Luci e schermi: materiali che brillano. ambiente.js ne regola l'intensità:
   le lampade (night) si accendono solo con le luci di casa, schermi e LED restano accesi. */
const GLOW = [];
/* altezza del soffitto (H di core.js; nei disegni H è l'altezza dell'arredo) */
function ceilH(){ return H; }
function gm(c, e, base, night){
  const k = 'glow' + c + e + base + night;
  if (furnMatCache[k]) return furnMatCache[k];
  const m = new THREE.MeshStandardMaterial({ color:c, emissive:e, emissiveIntensity:base, roughness:.6, side:THREE.DoubleSide });
  m.userData.glow = { base:base, night:!!night }; GLOW.push(m);
  return (furnMatCache[k] = m);
}
function gbox(g, w, h, d, x, y, z, m){
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y + h/2, z); g.add(mesh); return mesh;
}
/* un'asta sottile da a a b (cavi, steli) */
const UP = new THREE.Vector3(0,1,0);
function rod(g, r, a, b, c, o){
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), L = d.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 6), fm(c, o));
  m.position.copy(A).addScaledVector(d, .5); m.quaternion.setFromUnitVectors(UP, d.normalize()); g.add(m); return m;
}
const INOX = { metalness:.6, roughness:.32 };
const LEGS4 = [[-1,-1],[1,-1],[-1,1],[1,1]];
/* In locale: x = larghezza, z = profondità; il FRONTE è verso +z (a rotazione 0 guarda a sud). */
const FURN = {
  divano:   { n:'Divano 3 posti', cat:'Zona giorno', w:2.2, d:.95, h:.85, c:'#3d4147', draw:(g,W,D,H,C) => {
    fbox(g,W,.4,D,0,.08,0,C); fbox(g,W,H-.4,.22,0,.4,-D/2+.11,C);
    fbox(g,.18,.28,D-.1,-W/2+.09,.4,.03,shade(C,.85)); fbox(g,.18,.28,D-.1,W/2-.09,.4,.03,shade(C,.85));
    const n = Math.max(1, Math.round(W/.75)), sw = (W-.36)/n;
    for (let i=0;i<n;i++) fbox(g,sw-.03,.13,D-.3,-W/2+.18+sw*(i+.5),.48,.1,shade(C,1.12));
    [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(p => fbox(g,.05,.08,.05,p[0]*(W/2-.1),0,p[1]*(D/2-.1),'#222')); } },
  poltrona: { n:'Poltrona', cat:'Zona giorno', w:.9, d:.9, h:.85, c:'#3d4147', draw:(g,W,D,H,C) => {
    fbox(g,W,.4,D,0,.08,0,C); fbox(g,W,H-.4,.2,0,.4,-D/2+.1,C);
    fbox(g,.16,.25,D-.1,-W/2+.08,.4,.03,shade(C,.85)); fbox(g,.16,.25,D-.1,W/2-.08,.4,.03,shade(C,.85));
    fbox(g,W-.4,.13,D-.3,0,.48,.08,shade(C,1.12)); } },
  tavolino: { n:'Tavolino', cat:'Zona giorno', w:1, d:.6, h:.4, c:'#d9d1c4', draw:(g,W,D,H,C) => {
    fbox(g,W,.04,D,0,H-.04,0,C); [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(p => fbox(g,.05,H-.04,.05,p[0]*(W/2-.05),0,p[1]*(D/2-.05),'#6a6258')); } },
  mobiletv: { n:'Mobile TV con TV', cat:'Zona giorno', w:1.8, d:.45, h:1, c:'#e9e3d7', draw:(g,W,D,H,C) => {
    fbox(g,W,.4,D,0,.08,0,C); fbox(g,W*.9,.012,.012,0,.3,D/2+.002,shade(C,.8));
    fbox(g,W*.72,.5,.05,0,.5,0,'#0c0c0e'); fbox(g,.3,.02,.18,0,.48,0,'#222'); } },
  libreria: { n:'Libreria', cat:'Zona giorno', w:.9, d:.35, h:2, c:'#4a3b33', draw:(g,W,D,H,C) => {
    fbox(g,W,H,D,0,0,0,C); fbox(g,W-.08,H-.08,.02,0,.04,D/2-.005,shade(C,.55));
    for (let k=1;k<5;k++) fbox(g,W-.06,.025,D-.02,0,k*H/5,0.005,shade(C,1.25)); } },
  vetrina:  { n:'Vetrina bianca', cat:'Zona giorno', w:.9, d:.4, h:1.9, c:'#f1efea', draw:(g,W,D,H,C) => {
    fbox(g,W,H*.5,D,0,0,0,C); fbox(g,W,H*.5,D,0,H*.5,0,C);
    fbox(g,W-.1,H*.4,.01,0,H*.55,D/2+.003,'#a9cbd9',GLS); fbox(g,.012,H*.5,.012,0,0,D/2+.003,shade(C,.7)); } },
  tappeto:  { n:'Tappeto', cat:'Zona giorno', w:2.4, d:1.7, h:.02, c:'#7b5d4b', draw:(g,W,D,H,C) => { fbox(g,W,H,D,0,0,0,C); fbox(g,W-.2,H+.003,D-.2,0,0,0,shade(C,1.25)); } },
  pianta:   { n:'Pianta', cat:'Zona giorno', w:.45, d:.45, h:1.1, c:'#4f7a45', draw:(g,W,D,H,C) => {
    fcyl(g,W*.38,H*.28,0,0,0,'#a4512f'); fsph(g,W*.62,0,H*.28+W*.5,0,C); fsph(g,W*.45,W*.25,H*.28+W*.9,0,shade(C,1.1)); } },
  tavolo:   { n:'Tavolo da pranzo', cat:'Pranzo e cucina', w:1.6, d:.9, h:.75, c:'#8fcfc0', draw:(g,W,D,H,C) => {
    fbox(g,W,.04,D,0,H-.04,0,C,{ transparent:true, opacity:.82, roughness:.15 });
    fbox(g,W-.12,.04,D-.12,0,H-.08,0,'#9aa0a5',{ metalness:.4 });
    [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(p => fbox(g,.06,H-.08,.06,p[0]*(W/2-.07),0,p[1]*(D/2-.07),'#9aa0a5',{ metalness:.4 })); } },
  sedia:    { n:'Sedia', cat:'Pranzo e cucina', w:.45, d:.45, h:.9, c:'#575c62', draw:(g,W,D,H,C) => {
    fbox(g,W,.05,D,0,.42,0,C); fbox(g,W,.45,.05,0,.47,-D/2+.025,C);
    [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(p => fbox(g,.03,.42,.03,p[0]*(W/2-.03),0,p[1]*(D/2-.03),'#222')); } },
  sgabello: { n:'Sgabello', cat:'Pranzo e cucina', w:.36, d:.36, h:.65, c:'#8a7a68', draw:(g,W,D,H,C) => {
    fcyl(g,W/2,.04,0,H-.04,0,C); [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(p => fbox(g,.03,H-.04,.03,p[0]*(W/2-.05),0,p[1]*(D/2-.05),'#2a2a2c')); } },
  cucina:   { n:'Base cucina', cat:'Pranzo e cucina', w:2.8, d:.6, h:.9, c:'#7a6a5d', draw:(g,W,D,H,C) => {
    fbox(g,W,H-.04,D-.02,0,0,-.01,C); fbox(g,W+.02,.04,D+.03,0,H-.04,.005,'#4b3e35');
    const n = Math.max(1, Math.round(W/.6));
    for (let k=1;k<n;k++) fbox(g,.012,H-.1,.012,-W/2+k*W/n,.04,D/2,'#2b241f');
    for (let k=0;k<n;k++) fbox(g,.12,.014,.016,-W/2+(k+.5)*W/n,H-.14,D/2+.006,'#c9ccd0');
    fbox(g,.58,.012,.5,-W/4,H,0,'#1b1b1d'); fbox(g,.7,.012,.4,W/4,H,0,'#c8ccd0'); } },
  pensile:  { n:'Pensili cucina', cat:'Pranzo e cucina', w:2, d:.35, h:.7, z:1.4, c:'#7a6a5d', draw:(g,W,D,H,C) => {
    fbox(g,W,H,D,0,0,0,C); const n = Math.max(1, Math.round(W/.5));
    for (let k=1;k<n;k++) fbox(g,.012,H-.04,.012,-W/2+k*W/n,.02,D/2,'#2b241f'); } },
  frigo:    { n:'Frigorifero', cat:'Pranzo e cucina', w:.65, d:.65, h:1.8, c:'#b9bdc1', draw:(g,W,D,H,C) => {
    fbox(g,W,H,D,0,0,0,C,{ metalness:.4, roughness:.35 }); fbox(g,W-.02,.01,.01,0,H*.68,D/2+.004,'#6a6e72');
    fbox(g,.02,.5,.02,W/2-.07,H*.72,D/2+.015,'#444'); fbox(g,.02,.4,.02,W/2-.07,H*.2,D/2+.015,'#444'); } },
  penisola: { n:'Penisola', cat:'Pranzo e cucina', w:1.8, d:.8, h:.9, c:'#b8672f', draw:(g,W,D,H,C) => {
    fbox(g,W-.04,H-.04,D-.14,0,0,-.04,C); fbox(g,W,.04,D,0,H-.04,0,'#6b3b24'); } },
  lavatrice:{ n:'Lavatrice', cat:'Pranzo e cucina', w:.6, d:.6, h:.85, c:'#f0f0f0', draw:(g,W,D,H,C) => {
    fbox(g,W,H,D,0,0,0,C); fbox(g,.36,.36,.02,0,.24,D/2+.002,'#6f7a85'); fbox(g,.3,.05,.02,0,.75,D/2+.002,'#c9ccd0'); } },
  letto2:   { n:'Letto matrimoniale', cat:'Camera', w:1.6, d:2.05, h:.5, c:'#b8452e', draw:(g,W,D,H,C) => {
    fbox(g,W,.25,D,0,.04,0,'#3a2a26'); fbox(g,W-.08,H-.25,D-.14,0,.29,.03,C); fbox(g,W,.9,.1,0,0,-D/2+.05,'#3a2a26');
    fbox(g,.55,.12,.35,-W*.22,H+.04,-D/2+.35,'#efe6da'); fbox(g,.55,.12,.35,W*.22,H+.04,-D/2+.35,'#efe6da'); } },
  letto1:   { n:'Letto singolo', cat:'Camera', w:.9, d:2, h:.5, c:'#4b6a86', draw:(g,W,D,H,C) => {
    fbox(g,W,.25,D,0,.04,0,'#3a2a26'); fbox(g,W-.08,H-.25,D-.14,0,.29,.03,C); fbox(g,W,.8,.1,0,0,-D/2+.05,'#3a2a26');
    fbox(g,.55,.12,.35,0,H+.04,-D/2+.35,'#efe6da'); } },
  comodino: { n:'Comodino', cat:'Camera', w:.45, d:.4, h:.5, c:'#2f2a28', draw:(g,W,D,H,C) => {
    fbox(g,W,H,D,0,0,0,C); fbox(g,W-.06,.012,.012,0,H*.55,D/2+.003,shade(C,1.6)); fbox(g,.1,.012,.016,0,H*.75,D/2+.006,'#c9ccd0'); } },
  armadio:  { n:'Armadio', cat:'Camera', w:2.4, d:.65, h:2.4, c:'#d9532f', draw:(g,W,D,H,C) => {
    fbox(g,W,H,D,0,0,0,'#4a403a'); const n = Math.max(2, Math.round(W/1.2));
    for (let k=0;k<n;k++) fbox(g,W/n-.03,H-.12,.03,-W/2+(k+.5)*W/n,.06,D/2+(k%2 ? .015 : -.005),C); } },
  cassettiera:{ n:'Cassettiera', cat:'Camera', w:.8, d:.45, h:1, c:'#8a8f87', draw:(g,W,D,H,C) => {
    fbox(g,W,H,D,0,0,0,C); for (let k=1;k<4;k++) fbox(g,W-.04,.012,.012,0,k*H/4,D/2+.003,shade(C,.55));
    for (let k=0;k<4;k++) fbox(g,.12,.014,.016,0,(k+.6)*H/4,D/2+.008,'#c9ccd0'); } },
  scrivania:{ n:'Scrivania', cat:'Camera', w:1.4, d:.7, h:.75, c:'#2f2a28', draw:(g,W,D,H,C) => {
    fbox(g,W,.04,D,0,H-.04,0,C); fbox(g,.04,H-.04,D-.05,-W/2+.04,0,0,C); fbox(g,.04,H-.04,D-.05,W/2-.04,0,0,C); } },
  lavabo:   { n:'Lavabo con mobile', cat:'Bagno', w:.8, d:.45, h:.85, c:'#7b5a46', draw:(g,W,D,H,C) => {
    fbox(g,W,.45,D,0,.3,0,C); fbox(g,W,.05,D,0,.75,0,'#f4f4f2'); fbox(g,W*.8,.015,D*.7,0,.8,.02,'#dfe5e8');
    fcyl(g,.015,.12,0,.8,-D/2+.06,'#c9ccd0'); } },
  wc:       { n:'WC', cat:'Bagno', w:.38, d:.65, h:.4, c:'#f4f4f2', draw:(g,W,D,H,C) => {
    fbox(g,W,H,D*.72,0,0,D*.14,C); fbox(g,W,.4,.18,0,H,-D/2+.09,C); fbox(g,W-.06,.02,D*.6,0,H,D*.16,shade(C,.92)); } },
  bidet:    { n:'Bidet', cat:'Bagno', w:.38, d:.55, h:.4, c:'#f4f4f2', draw:(g,W,D,H,C) => {
    fbox(g,W,H,D,0,0,0,C); fbox(g,W-.08,.012,D-.1,0,H,0,shade(C,.9)); } },
  doccia:   { n:'Doccia', cat:'Bagno', w:.9, d:1.2, h:2, c:'#f4f4f2', draw:(g,W,D,H,C) => {
    fbox(g,W,.06,D,0,0,0,C); fbox(g,W,H-.1,.015,0,.06,D/2,'#bfe0ee',GLS); fbox(g,.015,H-.1,D,W/2,.06,0,'#bfe0ee',GLS);
    fbox(g,.03,H-.1,.03,W/2,.06,D/2,'#aeb4b9',{ metalness:.5 });
    fbox(g,W,.03,.03,0,H-.04,D/2,'#aeb4b9',{ metalness:.5 }); fbox(g,.03,.03,D,W/2,H-.04,0,'#aeb4b9',{ metalness:.5 });
    fbox(g,.02,H-.2,.02,0,.1,D/2+.02,'#aeb4b9',{ metalness:.5 }); } },
  vasca:    { n:'Vasca', cat:'Bagno', w:1.7, d:.7, h:.55, c:'#f4f4f2', draw:(g,W,D,H,C) => {
    fbox(g,W,H,D,0,0,0,C); fbox(g,W-.14,.02,D-.14,0,H-.02,0,'#dfe6ea'); } },
  /* ---------- arredi reali della casa (dalle foto) ---------- */
  pouf:     { n:'Pouf imbottito', cat:'Zona giorno', w:1.1, d:.7, h:.42, c:'#34373b', draw:(g,W,D,H,C) => {
    fbox(g,W,H-.07,D,0,.06,0,C,{ roughness:.95 }); fbox(g,W-.04,.03,D-.04,0,H-.04,0,shade(C,1.12),{ roughness:.95 });
    for (let k=1;k<4;k++) fbox(g,.012,.012,D-.08,-W/2+k*W/4,H-.012,0,shade(C,.7));
    LEGS4.forEach(p => fbox(g,.04,.06,.04,p[0]*(W/2-.08),0,p[1]*(D/2-.08),'#b8bcc0',INOX)); } },
  tvparete: { n:'TV a parete e mobile sospeso', cat:'Zona giorno', w:2, d:.4, h:.42, c:'#f2f0eb', draw:(g,W,D,H,C) => {
    fbox(g,W,H-.14,D,0,.14,0,C,{ roughness:.35 });
    fbox(g,.008,H-.18,.01,-W/6,.16,D/2+.003,shade(C,.82)); fbox(g,.008,H-.18,.01,W/6,.16,D/2+.003,shade(C,.82));
    const tw = 1.23, th = .72;
    fbox(g,tw,th,.045,0,1.02,-D/2+.035,'#141416',{ roughness:.25, metalness:.2 });
    fbox(g,tw-.03,th-.03,.004,0,1.035,-D/2+.059,'#06080b',{ roughness:.08, metalness:.4 });
    fcyl(g,.17,.06,W*.18,H,.02,'#c9a46a'); fcyl(g,.06,.08,-W*.3,H,0,'#dcd6cc'); } },
  nuvola:   { n:'Lampadario a nuvola', cat:'Luci', w:.75, d:.75, h:.5, z:1.85, c:'#f7f5f0', draw:(g,W,D,H,C) => {
    const m = gm(C,'#ffdcaa',.9,true); m.flatShading = true;
    [[0,0,0,.62],[.5,.1,.2,.45],[-.48,.05,.25,.44],[.22,-.05,-.5,.46],[-.32,.12,-.42,.42],[.05,.4,.05,.44],
     [.42,.3,-.22,.36],[-.38,.32,.12,.36],[.12,-.32,.42,.38],[-.12,-.3,-.32,.4],[.35,-.25,.1,.34],[-.2,.2,.45,.32]].forEach(p => {
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(1,1), m);
      s.scale.set(W/2*p[3], H/2*p[3]*1.2, D/2*p[3]); s.position.set(p[0]*W/2, H/2 + p[1]*H/2, p[2]*D/2);
      s.rotation.set(p[0]*3, p[1]*5, p[2]*4); g.add(s); });
    fbox(g,.006,Math.max(.05, ceilH() - 1.85 - H),.006,0,H,0,'#eeeeee'); fcyl(g,.05,.02,0,ceilH()-1.87,0,'#f4f4f4'); } },
  campana:  { n:'Lampada a campana', cat:'Luci', w:.3, d:.3, h:.28, z:1.7, c:'#f4f2ec', draw:(g,W,D,H,C) => {
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(.04, W/2, H*.85, 28, 1, true), fm(C,{ side:THREE.DoubleSide, roughness:.5 }));
    sh.position.y = H*.15 + H*.85/2; sh.castShadow = true; g.add(sh);
    fcyl(g,.045,H*.12,0,H*.88,0,C);
    const b = new THREE.Mesh(new THREE.SphereGeometry(.045,12,8), gm('#fff6e0','#ffd28a',1.6,true)); b.position.y = H*.25; g.add(b);
    fbox(g,.006,Math.max(.05, ceilH() - 1.7 - H),.006,0,H,0,'#eeeeee'); } },
  colonnaforno:{ n:'Colonna forno', cat:'Pranzo e cucina', w:.6, d:.6, h:1.45, c:'#6f6157', draw:(g,W,D,H,C) => {
    fbox(g,W,H,D-.02,0,0,-.01,C); fbox(g,W-.02,.6,.02,0,.75,D/2,'#2a2b2d',{ roughness:.3 });
    fbox(g,W-.06,.36,.006,0,.84,D/2+.012,'#0e0f10',{ roughness:.1, metalness:.3 });
    fbox(g,W-.02,.12,.02,0,1.23,D/2,'#b9bdc1',INOX); fbox(g,W-.12,.015,.02,0,1.2,D/2+.025,'#d0d3d6',INOX);
    fbox(g,W-.04,.6,.012,0,.1,D/2,shade(C,1.05)); fbox(g,.2,.012,.02,0,.66,D/2+.012,'#c9ccd0');
    fbox(g,.5,.3,.38,0,H,-.04,'#b9bdc1',INOX); fbox(g,.32,.22,.006,-.05,H+.04,.155,'#121314',{ roughness:.1 }); } },
  cappa:    { n:'Cappa in acciaio', cat:'Pranzo e cucina', w:.6, d:.5, h:.12, z:1.6, c:'#c3c7cb', draw:(g,W,D,H,C) => {
    fbox(g,W,H,D,0,0,0,C,INOX); fbox(g,W*.45,.06,D*.6,0,H,-D*.18,C,INOX);
    fbox(g,.26,Math.max(.1, ceilH() - 1.6 - H - .06),.24,0,H+.06,-D/2+.13,C,INOX); } },
  sgabellobar:{ n:'Sgabello alto', cat:'Pranzo e cucina', w:.36, d:.36, h:.68, c:'#a88b6a', draw:(g,W,D,H,C) => {
    fbox(g,W,.035,D,0,H-.035,0,C,{ roughness:.6 }); const k = '#232325';
    LEGS4.forEach(p => fbox(g,.025,H-.035,.025,p[0]*(W/2-.03),0,p[1]*(D/2-.03),k));
    [-1,1].forEach(s => { fbox(g,W-.05,.02,.02,0,.25,s*(D/2-.03),k); fbox(g,.02,.02,D-.05,s*(W/2-.03),.25,0,k); }); } },
  mobilealto:{ n:'Mobile alto bianco', cat:'Ingresso e servizio', w:.8, d:.45, h:1.9, c:'#f3f2ee', draw:(g,W,D,H,C) => {
    fbox(g,W,H,D,0,0,0,C,{ roughness:.4 }); fbox(g,.006,H-.04,.008,0,.02,D/2+.002,shade(C,.75));
    fbox(g,.012,.14,.016,-.03,H*.5,D/2+.008,'#9a9ea2',INOX); fbox(g,.012,.14,.016,.03,H*.5,D/2+.008,'#9a9ea2',INOX); } },
  cassettone:{ n:'Cassettiera bianca', cat:'Ingresso e servizio', w:1, d:.42, h:.85, c:'#f6f5f2', draw:(g,W,D,H,C) => {
    fbox(g,W,H-.02,D,0,.02,0,C,{ roughness:.35 }); fbox(g,.006,H-.06,.008,0,.03,D/2+.002,shade(C,.78));
    for (let k=1;k<3;k++) fbox(g,W-.02,.006,.008,0,.02+k*(H-.02)/3,D/2+.002,shade(C,.78));
    for (let k=0;k<3;k++) [-1,1].forEach(s => fbox(g,.14,.012,.01,s*W/4,.02+(k+.82)*(H-.02)/3,D/2+.006,'#3a3a3c'));
    fcyl(g,.05,.22,-W*.3,H,-.05,'#e9e3d6'); } },
  scaffale: { n:'Scaffale metallico', cat:'Ingresso e servizio', w:.9, d:.4, h:1.9, c:'#2a2c30', draw:(g,W,D,H,C) => {
    LEGS4.forEach(p => fbox(g,.03,H,.03,p[0]*(W/2-.015),0,p[1]*(D/2-.015),C,{ metalness:.4, roughness:.5 }));
    const cols = ['#c85a3c','#e9e2d3','#3d6fb4','#d9b24c','#7c8a5a','#b8bcc0'];
    for (let k=0;k<5;k++){
      const y = .1 + k*(H-.12)/4; fbox(g,W,.02,D,0,y,0,C,{ metalness:.4, roughness:.5 });
      if (k < 4) for (let j=0;j<3;j++){ const bw = .18 + ((k*3+j)%3)*.04, bh = .14 + ((k+j)%3)*.06;
        fbox(g,bw,bh,D*.7,-W/2+.15+j*(W-.3)/2,y+.02,0,cols[(k*2+j)%cols.length]); }
    } } },
  lavabososp:{ n:'Lavabo su mobile sospeso', cat:'Bagno', w:.8, d:.48, h:.85, c:'#3a2a22', draw:(g,W,D,H,C) => {
    fbox(g,W,.04,D,0,.66,0,C); fbox(g,W,.03,D,0,.2,0,C);
    fbox(g,.03,.46,D,-W/2+.015,.2,0,C); fbox(g,.03,.46,D,W/2-.015,.2,0,C); fbox(g,W,.46,.02,0,.2,-D/2+.01,C);
    fbox(g,W-.06,.14,.02,0,.5,D/2-.01,shade(C,1.25)); fbox(g,.16,.012,.016,0,.56,D/2+.003,'#c9ccd0',INOX);
    fbox(g,W*.5,.12,D*.5,-.06,.23,0,'#d9d6cf');
    const s = new THREE.Mesh(new THREE.CylinderGeometry(1,.82,1,32), fm('#f7f7f5',{ roughness:.2 }));
    s.scale.set(W*.4, .15, D*.44); s.position.set(0,.7+.075,.02); s.castShadow = true; g.add(s);
    const b = new THREE.Mesh(new THREE.CylinderGeometry(1,1,1,32), fm('#dfe5e8',{ roughness:.15 }));
    b.scale.set(W*.33, .01, D*.34); b.position.set(0,.85,.03); g.add(b);
    rod(g,.012,[0,.85,-D/2+.06],[0,.98,-D/2+.06],'#d0d3d6',INOX); rod(g,.01,[0,.97,-D/2+.06],[0,.97,-D/2+.15],'#d0d3d6',INOX); } },
  specchio: { n:'Specchio', cat:'Bagno', w:.8, d:.03, h:.75, z:1.05, c:'#c4c8cc', draw:(g,W,D,H,C) => {
    fbox(g,W,H,D*.6,0,0,-D*.2,C,INOX); fbox(g,W-.03,H-.03,.004,0,.015,D*.12,'#dfe7ea',{ metalness:.95, roughness:.04 }); } },
  postazionepc:{ n:'Postazione PC', cat:'Studio', w:1.6, d:.75, h:.75, c:'#1d1e21', draw:(g,W,D,H,C) => {
    fbox(g,W,.03,D,0,H-.03,0,C,{ roughness:.5 });
    [-1,1].forEach(s => { fbox(g,.07,H-.03,.07,s*(W/2-.25),0,-.05,C,{ metalness:.4 }); fbox(g,.07,.04,D-.1,s*(W/2-.25),0,0,C,{ metalness:.4 }); });
    fbox(g,W-.5,.06,.04,0,H-.12,-.1,C);
    fbox(g,1.0,.004,.42,-.12,H,.1,'#e8e8ec');
    fbox(g,.44,.025,.14,-.22,H+.004,.16,'#f2f2f4'); gbox(g,.42,.004,.12,-.22,H+.029,.16,gm('#d8d0ff','#9a6bff',.7,false));
    fbox(g,.07,.03,.11,.12,H+.004,.16,'#f2f2f4');
    [-.5,.12].forEach(x => {
      fbox(g,.04,.3,.04,x,H,-.2,'#2a2a2c'); fbox(g,.24,.015,.18,x,H,-.2,'#2a2a2c');
      fbox(g,.62,.37,.03,x,H+.18,-.22,'#111214',{ roughness:.3 });
      gbox(g,.59,.34,.004,x,H+.195,-.203,gm('#0d1a4a','#2f55e0',.9,false)); });
    [-.86,.48].forEach(x => { fcyl(g,.06,.12,x*.95,H,-.15,'#151517'); const r = new THREE.Mesh(new THREE.TorusGeometry(.058,.006,6,20), gm('#bfe','#38c8ff',1.2,false)); r.rotation.x = Math.PI/2; r.position.set(x*.95,H+.002,-.15); g.add(r); });
    const px = W/2-.16;
    fbox(g,.24,.48,.46,px,H,-.1,'#f4f4f6',{ roughness:.35 });
    gbox(g,.2,.42,.004,px,H+.03,.132,gm('#2a1450','#b44dff',.7,false));
    [.1,.24,.38].forEach(y => { const r = new THREE.Mesh(new THREE.TorusGeometry(.045,.008,6,20), gm('#cff','#38e1ff',1.6,false)); r.position.set(px,H+y,.136); g.add(r); });
    const hp = new THREE.Mesh(new THREE.TorusGeometry(.08,.015,6,16,Math.PI), fm('#151517')); hp.position.set(W/2+.02,H+.25,-.1); hp.rotation.y = Math.PI/2; g.add(hp); } },
  sediaufficio:{ n:'Sedia da ufficio', cat:'Studio', w:.62, d:.62, h:1.2, c:'#2b2c2f', draw:(g,W,D,H,C) => {
    const al = { metalness:.7, roughness:.3 };
    for (let k=0;k<5;k++){ const a = k*Math.PI*2/5, ex = Math.cos(a)*W*.45, ez = Math.sin(a)*D*.45;
      rod(g,.018,[0,.1,0],[ex,.07,ez],'#b9bdc1',al); fsph(g,.028,ex,.03,ez,'#1b1b1d'); }
    fcyl(g,.025,.36,0,.1,0,'#b9bdc1',al);
    fbox(g,.5,.07,.48,0,.44,.03,C,{ roughness:.9 });
    fbox(g,.46,.56,.025,0,.6,-.23,C,{ transparent:true, opacity:.88, roughness:.9 });
    fbox(g,.5,.03,.04,0,1.15,-.23,'#1b1b1d'); fbox(g,.03,.6,.04,-.24,.57,-.23,'#1b1b1d'); fbox(g,.03,.6,.04,.24,.57,-.23,'#1b1b1d');
    fbox(g,.3,.1,.04,0,1.08,-.25,C);
    [-1,1].forEach(s => { fbox(g,.03,.22,.03,s*.25,.48,-.02,'#1b1b1d'); fbox(g,.07,.03,.26,s*.25,.69,0,'#1b1b1d'); }); } },
  listelli: { n:'Pannello a listelli', cat:'Studio', w:1.3, d:.04, h:1.4, z:.75, c:'#b8875a', draw:(g,W,D,H,C) => {
    fbox(g,W,H,.012,0,0,-D/2+.006,'#18181a');
    const n = Math.max(2, Math.round(W/.055));
    for (let k=0;k<n;k++) fbox(g,.028,H,D-.012,-W/2+(k+.5)*W/n,0,.006,shade(C, k%3 ? 1 : .9)); } },
  mensoleled:{ n:'Mensole con LED', cat:'Studio', w:1.6, d:.22, h:.38, z:2.2, c:'#f4f4f2', draw:(g,W,D,H,C) => {
    const led = gm('#efe6ff','#a45cff',1.4,false), cols = ['#2c3e8f','#d8443a','#f1c232','#3a3a3c','#1f8f6a'];
    [0, H-.035].forEach((y, i) => {
      fbox(g,W,.035,D,0,y,0,C); gbox(g,W-.04,.01,.01,0,y-.008,D/2-.012,led);
      for (let k=0;k<6;k++) fbox(g,.1,.16,.08,-W/2+.15+k*(W-.3)/5,y+.035,-.02,cols[(k+i*2)%cols.length]); }); } },
  gradinigatto:{ n:'Mensole per gatti', cat:'Studio', w:1.1, d:.25, h:1.5, z:.3, c:'#6b4a33', draw:(g,W,D,H,C) => {
    const steps = [[-.4,0],[.05,.3],[-.25,.62],[.3,.9],[-.05,1.2],[.4,1.48]];
    steps.forEach(p => { fbox(g,.32,.04,D,p[0]*W,p[1]*H/1.5,0,C); fbox(g,.3,.008,D-.02,p[0]*W,p[1]*H/1.5+.04,0,'#8d8f92',{ roughness:1 }); });
    /* il gatto bianco e nero sul quarto gradino */
    const cx = .3*W, cy = .9*H/1.5 + .045, blk = '#141416', wht = '#f2f2f0';
    const body = new THREE.Mesh(new THREE.SphereGeometry(1,14,10), fm(blk)); body.scale.set(.15,.09,.09); body.position.set(cx,cy+.09,0); g.add(body);
    const chest = new THREE.Mesh(new THREE.SphereGeometry(1,12,8), fm(wht)); chest.scale.set(.05,.07,.07); chest.position.set(cx+.12,cy+.1,.02); g.add(chest);
    fsph(g,.065,cx+.15,cy+.2,.03,blk); fsph(g,.04,cx+.19,cy+.18,.06,wht);
    [[-1],[1]].forEach(s => { const e = new THREE.Mesh(new THREE.ConeGeometry(.025,.05,4), fm(blk)); e.position.set(cx+.15,cy+.27,.03+s[0]*.035); g.add(e); });
    rod(g,.015,[cx-.14,cy+.05,0],[cx-.22,cy-.12,.04],blk); } },
  veletta:  { n:'Veletta con LED', cat:'Luci', w:3, d:3.6, h:.18, z:2.82, c:'#f2f1ee', draw:(g,W,D,H,C) => {
    const b = .26, m = gm('#fff3dc','#ffc878',1.5,false);
    fbox(g,W,H,b,0,0,-D/2+b/2,C); fbox(g,W,H,b,0,0,D/2-b/2,C); fbox(g,b,H,D-2*b,-W/2+b/2,0,0,C); fbox(g,b,H,D-2*b,W/2-b/2,0,0,C);
    gbox(g,W-2*b,.015,.015,0,H-.03,-D/2+b+.01,m); gbox(g,W-2*b,.015,.015,0,H-.03,D/2-b-.01,m);
    gbox(g,.015,.015,D-2*b,-W/2+b+.01,H-.03,0,m); gbox(g,.015,.015,D-2*b,W/2-b-.01,H-.03,0,m);
    g.traverse(o => { o.castShadow = false; }); } },
  tende:    { n:'Tende', cat:'Zona giorno', w:1.6, d:.12, h:2.75, c:'#6c7077', draw:(g,W,D,H,C) => {
    fbox(g,W+.12,.022,.022,0,H-.04,-.02,'#2a2a2c');
    fbox(g,W-.08,H-.1,.008,0,.03,.03,'#ffffff',{ transparent:true, opacity:.5, roughness:.95, depthWrite:false });
    const n = 5, dw = W*.17;
    [-1,1].forEach(s => { for (let k=0;k<n;k++){
      const c = new THREE.Mesh(new THREE.CylinderGeometry(dw/n*.75, dw/n*.75, H-.08, 8), fm(C,{ roughness:.95 }));
      c.position.set(s*(W/2 - dw/2) + (k-(n-1)/2)*dw/n, .02+(H-.08)/2, -.015 + (k%2)*.012); c.castShadow = true; g.add(c); } }); } },
  monstera: { n:'Pianta grande', cat:'Zona giorno', w:.8, d:.8, h:1.25, c:'#2f6b34', draw:(g,W,D,H,C) => {
    fcyl(g,W*.2,H*.26,0,0,0,'#2c2c2e'); fcyl(g,W*.19,.01,0,H*.26,0,'#3b2a20');
    for (let i=0;i<11;i++){
      const a = i*2.4, rr = W*(.12 + .3*((i*37)%10)/10), y = H*(.42 + .55*((i*53)%10)/10);
      const lx = Math.cos(a)*rr, lz = Math.sin(a)*rr;
      rod(g,.008,[0,H*.26,0],[lx,y,lz],'#3d6b2f');
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(1,12,6), fm(i%3 ? C : shade(C,1.25),{ roughness:.55, side:THREE.DoubleSide }));
      leaf.scale.set(W*.2, .012, W*.15); leaf.position.set(lx*1.1, y, lz*1.1); leaf.rotation.set(0, -a, .35); leaf.castShadow = true; g.add(leaf);
    } } }
};

export { FURN, GLOW, fbox, fcyl };
