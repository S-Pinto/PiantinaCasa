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
  divano:   { n:'Divano 3 posti', cat:'Divani e sedute', w:2.2, d:.95, h:.85, c:'#3d4147', draw:(g,W,D,H,C) => {
    fbox(g,W,.4,D,0,.08,0,C); fbox(g,W,H-.4,.22,0,.4,-D/2+.11,C);
    fbox(g,.18,.28,D-.1,-W/2+.09,.4,.03,shade(C,.85)); fbox(g,.18,.28,D-.1,W/2-.09,.4,.03,shade(C,.85));
    const n = Math.max(1, Math.round(W/.75)), sw = (W-.36)/n;
    for (let i=0;i<n;i++) fbox(g,sw-.03,.13,D-.3,-W/2+.18+sw*(i+.5),.48,.1,shade(C,1.12));
    [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(p => fbox(g,.05,.08,.05,p[0]*(W/2-.1),0,p[1]*(D/2-.1),'#222')); } },
  poltrona: { n:'Poltrona', cat:'Divani e sedute', w:.9, d:.9, h:.85, c:'#3d4147', draw:(g,W,D,H,C) => {
    fbox(g,W,.4,D,0,.08,0,C); fbox(g,W,H-.4,.2,0,.4,-D/2+.1,C);
    fbox(g,.16,.25,D-.1,-W/2+.08,.4,.03,shade(C,.85)); fbox(g,.16,.25,D-.1,W/2-.08,.4,.03,shade(C,.85));
    fbox(g,W-.4,.13,D-.3,0,.48,.08,shade(C,1.12)); } },
  tavolino: { n:'Tavolino', cat:'Tavoli e scrivanie', w:1, d:.6, h:.4, c:'#d9d1c4', draw:(g,W,D,H,C) => {
    fbox(g,W,.04,D,0,H-.04,0,C); [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(p => fbox(g,.05,H-.04,.05,p[0]*(W/2-.05),0,p[1]*(D/2-.05),'#6a6258')); } },
  mobiletv: { n:'Mobile TV con TV', cat:'TV e multimedia', w:1.8, d:.45, h:1, c:'#e9e3d7', draw:(g,W,D,H,C) => {
    fbox(g,W,.4,D,0,.08,0,C); fbox(g,W*.9,.012,.012,0,.3,D/2+.002,shade(C,.8));
    fbox(g,W*.72,.5,.05,0,.5,0,'#0c0c0e'); fbox(g,.3,.02,.18,0,.48,0,'#222'); } },
  libreria: { n:'Libreria', cat:'Armadi e contenitori', w:.9, d:.35, h:2, c:'#4a3b33', draw:(g,W,D,H,C) => {
    fbox(g,W,H,D,0,0,0,C); fbox(g,W-.08,H-.08,.02,0,.04,D/2-.005,shade(C,.55));
    for (let k=1;k<5;k++) fbox(g,W-.06,.025,D-.02,0,k*H/5,0.005,shade(C,1.25)); } },
  vetrina:  { n:'Vetrina bianca', cat:'Armadi e contenitori', w:.9, d:.4, h:1.9, c:'#f1efea', draw:(g,W,D,H,C) => {
    fbox(g,W,H*.5,D,0,0,0,C); fbox(g,W,H*.5,D,0,H*.5,0,C);
    fbox(g,W-.1,H*.4,.01,0,H*.55,D/2+.003,'#a9cbd9',GLS); fbox(g,.012,H*.5,.012,0,0,D/2+.003,shade(C,.7)); } },
  tappeto:  { n:'Tappeto', cat:'Decorazioni e tessili', w:2.4, d:1.7, h:.02, c:'#7b5d4b', draw:(g,W,D,H,C) => { fbox(g,W,H,D,0,0,0,C); fbox(g,W-.2,H+.003,D-.2,0,0,0,shade(C,1.25)); } },
  pianta:   { n:'Pianta', cat:'Piante', w:.45, d:.45, h:1.1, c:'#4f7a45', draw:(g,W,D,H,C) => {
    fcyl(g,W*.38,H*.28,0,0,0,'#a4512f'); fsph(g,W*.62,0,H*.28+W*.5,0,C); fsph(g,W*.45,W*.25,H*.28+W*.9,0,shade(C,1.1)); } },
  tavolo:   { n:'Tavolo da pranzo', cat:'Tavoli e scrivanie', w:1.6, d:.9, h:.75, c:'#8fcfc0', draw:(g,W,D,H,C) => {
    fbox(g,W,.04,D,0,H-.04,0,C,{ transparent:true, opacity:.82, roughness:.15 });
    fbox(g,W-.12,.04,D-.12,0,H-.08,0,'#9aa0a5',{ metalness:.4 });
    [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(p => fbox(g,.06,H-.08,.06,p[0]*(W/2-.07),0,p[1]*(D/2-.07),'#9aa0a5',{ metalness:.4 })); } },
  sedia:    { n:'Sedia', cat:'Divani e sedute', w:.45, d:.45, h:.9, c:'#575c62', draw:(g,W,D,H,C) => {
    fbox(g,W,.05,D,0,.42,0,C); fbox(g,W,.45,.05,0,.47,-D/2+.025,C);
    [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(p => fbox(g,.03,.42,.03,p[0]*(W/2-.03),0,p[1]*(D/2-.03),'#222')); } },
  sgabello: { n:'Sgabello', cat:'Divani e sedute', w:.36, d:.36, h:.65, c:'#8a7a68', draw:(g,W,D,H,C) => {
    fcyl(g,W/2,.04,0,H-.04,0,C); [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(p => fbox(g,.03,H-.04,.03,p[0]*(W/2-.05),0,p[1]*(D/2-.05),'#2a2a2c')); } },
  cucina:   { n:'Base cucina', cat:'Cucina', w:2.8, d:.6, h:.9, c:'#7a6a5d', draw:(g,W,D,H,C) => {
    fbox(g,W,H-.04,D-.02,0,0,-.01,C); fbox(g,W+.02,.04,D+.03,0,H-.04,.005,'#4b3e35');
    const n = Math.max(1, Math.round(W/.6));
    for (let k=1;k<n;k++) fbox(g,.012,H-.1,.012,-W/2+k*W/n,.04,D/2,'#2b241f');
    for (let k=0;k<n;k++) fbox(g,.12,.014,.016,-W/2+(k+.5)*W/n,H-.14,D/2+.006,'#c9ccd0');
    fbox(g,.58,.012,.5,-W/4,H,0,'#1b1b1d'); fbox(g,.7,.012,.4,W/4,H,0,'#c8ccd0'); } },
  pensile:  { n:'Pensili cucina', cat:'Cucina', w:2, d:.35, h:.7, z:1.4, c:'#7a6a5d', draw:(g,W,D,H,C) => {
    fbox(g,W,H,D,0,0,0,C); const n = Math.max(1, Math.round(W/.5));
    for (let k=1;k<n;k++) fbox(g,.012,H-.04,.012,-W/2+k*W/n,.02,D/2,'#2b241f'); } },
  frigo:    { n:'Frigorifero', cat:'Elettrodomestici', w:.65, d:.65, h:1.8, c:'#b9bdc1', draw:(g,W,D,H,C) => {
    fbox(g,W,H,D,0,0,0,C,{ metalness:.4, roughness:.35 }); fbox(g,W-.02,.01,.01,0,H*.68,D/2+.004,'#6a6e72');
    fbox(g,.02,.5,.02,W/2-.07,H*.72,D/2+.015,'#444'); fbox(g,.02,.4,.02,W/2-.07,H*.2,D/2+.015,'#444'); } },
  penisola: { n:'Penisola', cat:'Cucina', w:1.8, d:.8, h:.9, c:'#b8672f', draw:(g,W,D,H,C) => {
    fbox(g,W-.04,H-.04,D-.14,0,0,-.04,C); fbox(g,W,.04,D,0,H-.04,0,'#6b3b24'); } },
  lavatrice:{ n:'Lavatrice', cat:'Elettrodomestici', w:.6, d:.6, h:.85, c:'#f0f0f0', draw:(g,W,D,H,C) => {
    laundry(g,W,D,H,C,0,false); } },
  letto2:   { n:'Letto matrimoniale', cat:'Letti', w:1.6, d:2.05, h:.5, c:'#b8452e', draw:(g,W,D,H,C) => {
    fbox(g,W,.25,D,0,.04,0,'#3a2a26'); fbox(g,W-.08,H-.25,D-.14,0,.29,.03,C); fbox(g,W,.9,.1,0,0,-D/2+.05,'#3a2a26');
    fbox(g,.55,.12,.35,-W*.22,H+.04,-D/2+.35,'#efe6da'); fbox(g,.55,.12,.35,W*.22,H+.04,-D/2+.35,'#efe6da'); } },
  letto1:   { n:'Letto singolo', cat:'Letti', w:.9, d:2, h:.5, c:'#4b6a86', draw:(g,W,D,H,C) => {
    fbox(g,W,.25,D,0,.04,0,'#3a2a26'); fbox(g,W-.08,H-.25,D-.14,0,.29,.03,C); fbox(g,W,.8,.1,0,0,-D/2+.05,'#3a2a26');
    fbox(g,.55,.12,.35,0,H+.04,-D/2+.35,'#efe6da'); } },
  comodino: { n:'Comodino', cat:'Armadi e contenitori', w:.45, d:.4, h:.5, c:'#2f2a28', draw:(g,W,D,H,C) => {
    fbox(g,W,H,D,0,0,0,C); fbox(g,W-.06,.012,.012,0,H*.55,D/2+.003,shade(C,1.6)); fbox(g,.1,.012,.016,0,H*.75,D/2+.006,'#c9ccd0'); } },
  armadio:  { n:'Armadio', cat:'Armadi e contenitori', w:2.4, d:.65, h:2.4, c:'#d9532f', draw:(g,W,D,H,C) => {
    fbox(g,W,H,D,0,0,0,'#4a403a'); const n = Math.max(2, Math.round(W/1.2));
    for (let k=0;k<n;k++) fbox(g,W/n-.03,H-.12,.03,-W/2+(k+.5)*W/n,.06,D/2+(k%2 ? .015 : -.005),C); } },
  cassettiera:{ n:'Cassettiera', cat:'Armadi e contenitori', w:.8, d:.45, h:1, c:'#8a8f87', draw:(g,W,D,H,C) => {
    fbox(g,W,H,D,0,0,0,C); for (let k=1;k<4;k++) fbox(g,W-.04,.012,.012,0,k*H/4,D/2+.003,shade(C,.55));
    for (let k=0;k<4;k++) fbox(g,.12,.014,.016,0,(k+.6)*H/4,D/2+.008,'#c9ccd0'); } },
  scrivania:{ n:'Scrivania', cat:'Tavoli e scrivanie', w:1.4, d:.7, h:.75, c:'#2f2a28', draw:(g,W,D,H,C) => {
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
  pouf:     { n:'Pouf imbottito', cat:'Divani e sedute', w:1.1, d:.7, h:.42, c:'#34373b', draw:(g,W,D,H,C) => {
    fbox(g,W,H-.07,D,0,.06,0,C,{ roughness:.95 }); fbox(g,W-.04,.03,D-.04,0,H-.04,0,shade(C,1.12),{ roughness:.95 });
    for (let k=1;k<4;k++) fbox(g,.012,.012,D-.08,-W/2+k*W/4,H-.012,0,shade(C,.7));
    LEGS4.forEach(p => fbox(g,.04,.06,.04,p[0]*(W/2-.08),0,p[1]*(D/2-.08),'#b8bcc0',INOX)); } },
  tvparete: { n:'TV a parete e mobile sospeso', cat:'TV e multimedia', w:2, d:.4, h:.42, c:'#f2f0eb', draw:(g,W,D,H,C) => {
    fbox(g,W,H-.14,D,0,.14,0,C,{ roughness:.35 });
    fbox(g,.008,H-.18,.01,-W/6,.16,D/2+.003,shade(C,.82)); fbox(g,.008,H-.18,.01,W/6,.16,D/2+.003,shade(C,.82));
    const tw = 1.23, th = .72;
    fbox(g,tw,th,.045,0,1.02,-D/2+.035,'#141416',{ roughness:.25, metalness:.2 });
    fbox(g,tw-.03,th-.03,.004,0,1.035,-D/2+.059,'#06080b',{ roughness:.08, metalness:.4 });
    fcyl(g,.17,.06,W*.18,H,.02,'#c9a46a'); fcyl(g,.06,.08,-W*.3,H,0,'#dcd6cc'); } },
  nuvola:   { n:'Lampadario a nuvola', cat:'Illuminazione', w:.75, d:.75, h:.5, z:1.85, c:'#f7f5f0', draw:(g,W,D,H,C) => {
    const m = gm(C,'#ffdcaa',.9,true); m.flatShading = true;
    [[0,0,0,.62],[.5,.1,.2,.45],[-.48,.05,.25,.44],[.22,-.05,-.5,.46],[-.32,.12,-.42,.42],[.05,.4,.05,.44],
     [.42,.3,-.22,.36],[-.38,.32,.12,.36],[.12,-.32,.42,.38],[-.12,-.3,-.32,.4],[.35,-.25,.1,.34],[-.2,.2,.45,.32]].forEach(p => {
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(1,1), m);
      s.scale.set(W/2*p[3], H/2*p[3]*1.2, D/2*p[3]); s.position.set(p[0]*W/2, H/2 + p[1]*H/2, p[2]*D/2);
      s.rotation.set(p[0]*3, p[1]*5, p[2]*4); g.add(s); });
    fbox(g,.006,Math.max(.05, ceilH() - 1.85 - H),.006,0,H,0,'#eeeeee'); fcyl(g,.05,.02,0,ceilH()-1.87,0,'#f4f4f4'); } },
  campana:  { n:'Lampada a campana', cat:'Illuminazione', w:.3, d:.3, h:.28, z:1.7, c:'#f4f2ec', draw:(g,W,D,H,C) => {
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(.04, W/2, H*.85, 28, 1, true), fm(C,{ side:THREE.DoubleSide, roughness:.5 }));
    sh.position.y = H*.15 + H*.85/2; sh.castShadow = true; g.add(sh);
    fcyl(g,.045,H*.12,0,H*.88,0,C);
    const b = new THREE.Mesh(new THREE.SphereGeometry(.045,12,8), gm('#fff6e0','#ffd28a',1.6,true)); b.position.y = H*.25; g.add(b);
    fbox(g,.006,Math.max(.05, ceilH() - 1.7 - H),.006,0,H,0,'#eeeeee'); } },
  colonnaforno:{ n:'Colonna forno', cat:'Cucina', w:.6, d:.6, h:1.45, c:'#6f6157', draw:(g,W,D,H,C) => {
    fbox(g,W,H,D-.02,0,0,-.01,C); fbox(g,W-.02,.6,.02,0,.75,D/2,'#2a2b2d',{ roughness:.3 });
    fbox(g,W-.06,.36,.006,0,.84,D/2+.012,'#0e0f10',{ roughness:.1, metalness:.3 });
    fbox(g,W-.02,.12,.02,0,1.23,D/2,'#b9bdc1',INOX); fbox(g,W-.12,.015,.02,0,1.2,D/2+.025,'#d0d3d6',INOX);
    fbox(g,W-.04,.6,.012,0,.1,D/2,shade(C,1.05)); fbox(g,.2,.012,.02,0,.66,D/2+.012,'#c9ccd0');
    fbox(g,.5,.3,.38,0,H,-.04,'#b9bdc1',INOX); fbox(g,.32,.22,.006,-.05,H+.04,.155,'#121314',{ roughness:.1 }); } },
  cappa:    { n:'Cappa in acciaio', cat:'Cucina', w:.6, d:.5, h:.12, z:1.6, c:'#c3c7cb', draw:(g,W,D,H,C) => {
    fbox(g,W,H,D,0,0,0,C,INOX); fbox(g,W*.45,.06,D*.6,0,H,-D*.18,C,INOX);
    fbox(g,.26,Math.max(.1, ceilH() - 1.6 - H - .06),.24,0,H+.06,-D/2+.13,C,INOX); } },
  sgabellobar:{ n:'Sgabello alto', cat:'Divani e sedute', w:.36, d:.36, h:.68, c:'#a88b6a', draw:(g,W,D,H,C) => {
    fbox(g,W,.035,D,0,H-.035,0,C,{ roughness:.6 }); const k = '#232325';
    LEGS4.forEach(p => fbox(g,.025,H-.035,.025,p[0]*(W/2-.03),0,p[1]*(D/2-.03),k));
    [-1,1].forEach(s => { fbox(g,W-.05,.02,.02,0,.25,s*(D/2-.03),k); fbox(g,.02,.02,D-.05,s*(W/2-.03),.25,0,k); }); } },
  mobilealto:{ n:'Mobile alto bianco', cat:'Armadi e contenitori', w:.8, d:.45, h:1.9, c:'#f3f2ee', draw:(g,W,D,H,C) => {
    fbox(g,W,H,D,0,0,0,C,{ roughness:.4 }); fbox(g,.006,H-.04,.008,0,.02,D/2+.002,shade(C,.75));
    fbox(g,.012,.14,.016,-.03,H*.5,D/2+.008,'#9a9ea2',INOX); fbox(g,.012,.14,.016,.03,H*.5,D/2+.008,'#9a9ea2',INOX); } },
  cassettone:{ n:'Cassettiera bianca', cat:'Armadi e contenitori', w:1, d:.42, h:.85, c:'#f6f5f2', draw:(g,W,D,H,C) => {
    fbox(g,W,H-.02,D,0,.02,0,C,{ roughness:.35 }); fbox(g,.006,H-.06,.008,0,.03,D/2+.002,shade(C,.78));
    for (let k=1;k<3;k++) fbox(g,W-.02,.006,.008,0,.02+k*(H-.02)/3,D/2+.002,shade(C,.78));
    for (let k=0;k<3;k++) [-1,1].forEach(s => fbox(g,.14,.012,.01,s*W/4,.02+(k+.82)*(H-.02)/3,D/2+.006,'#3a3a3c'));
    fcyl(g,.05,.22,-W*.3,H,-.05,'#e9e3d6'); } },
  scaffale: { n:'Scaffale metallico', cat:'Armadi e contenitori', w:.9, d:.4, h:1.9, c:'#2a2c30', draw:(g,W,D,H,C) => {
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
  postazionepc:{ n:'Postazione PC', cat:'Tavoli e scrivanie', w:1.6, d:.75, h:.75, c:'#1d1e21', draw:(g,W,D,H,C) => {
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
  sediaufficio:{ n:'Sedia da ufficio', cat:'Divani e sedute', w:.62, d:.62, h:1.2, c:'#2b2c2f', draw:(g,W,D,H,C) => {
    const al = { metalness:.7, roughness:.3 };
    for (let k=0;k<5;k++){ const a = k*Math.PI*2/5, ex = Math.cos(a)*W*.45, ez = Math.sin(a)*D*.45;
      rod(g,.018,[0,.1,0],[ex,.07,ez],'#b9bdc1',al); fsph(g,.028,ex,.03,ez,'#1b1b1d'); }
    fcyl(g,.025,.36,0,.1,0,'#b9bdc1',al);
    fbox(g,.5,.07,.48,0,.44,.03,C,{ roughness:.9 });
    fbox(g,.46,.56,.025,0,.6,-.23,C,{ transparent:true, opacity:.88, roughness:.9 });
    fbox(g,.5,.03,.04,0,1.15,-.23,'#1b1b1d'); fbox(g,.03,.6,.04,-.24,.57,-.23,'#1b1b1d'); fbox(g,.03,.6,.04,.24,.57,-.23,'#1b1b1d');
    fbox(g,.3,.1,.04,0,1.08,-.25,C);
    [-1,1].forEach(s => { fbox(g,.03,.22,.03,s*.25,.48,-.02,'#1b1b1d'); fbox(g,.07,.03,.26,s*.25,.69,0,'#1b1b1d'); }); } },
  listelli: { n:'Pannello a listelli', cat:'Decorazioni e tessili', w:1.3, d:.04, h:1.4, z:.75, c:'#b8875a', draw:(g,W,D,H,C) => {
    fbox(g,W,H,.012,0,0,-D/2+.006,'#18181a');
    const n = Math.max(2, Math.round(W/.055));
    for (let k=0;k<n;k++) fbox(g,.028,H,D-.012,-W/2+(k+.5)*W/n,0,.006,shade(C, k%3 ? 1 : .9)); } },
  mensoleled:{ n:'Mensole con LED', cat:'Decorazioni e tessili', w:1.6, d:.22, h:.38, z:2.2, c:'#f4f4f2', draw:(g,W,D,H,C) => {
    const led = gm('#efe6ff','#a45cff',1.4,false), cols = ['#2c3e8f','#d8443a','#f1c232','#3a3a3c','#1f8f6a'];
    [0, H-.035].forEach((y, i) => {
      fbox(g,W,.035,D,0,y,0,C); gbox(g,W-.04,.01,.01,0,y-.008,D/2-.012,led);
      for (let k=0;k<6;k++) fbox(g,.1,.16,.08,-W/2+.15+k*(W-.3)/5,y+.035,-.02,cols[(k+i*2)%cols.length]); }); } },
  gradinigatto:{ n:'Mensole per gatti', cat:'Animali', w:1.1, d:.25, h:1.5, z:.3, c:'#6b4a33', draw:(g,W,D,H,C) => {
    const steps = [[-.4,0],[.05,.3],[-.25,.62],[.3,.9],[-.05,1.2],[.4,1.48]];
    steps.forEach(p => { fbox(g,.32,.04,D,p[0]*W,p[1]*H/1.5,0,C); fbox(g,.3,.008,D-.02,p[0]*W,p[1]*H/1.5+.04,0,'#8d8f92',{ roughness:1 }); });
    /* il gatto bianco e nero sul quarto gradino */
    const cx = .3*W, cy = .9*H/1.5 + .045, blk = '#141416', wht = '#f2f2f0';
    const body = new THREE.Mesh(new THREE.SphereGeometry(1,14,10), fm(blk)); body.scale.set(.15,.09,.09); body.position.set(cx,cy+.09,0); g.add(body);
    const chest = new THREE.Mesh(new THREE.SphereGeometry(1,12,8), fm(wht)); chest.scale.set(.05,.07,.07); chest.position.set(cx+.12,cy+.1,.02); g.add(chest);
    fsph(g,.065,cx+.15,cy+.2,.03,blk); fsph(g,.04,cx+.19,cy+.18,.06,wht);
    [[-1],[1]].forEach(s => { const e = new THREE.Mesh(new THREE.ConeGeometry(.025,.05,4), fm(blk)); e.position.set(cx+.15,cy+.27,.03+s[0]*.035); g.add(e); });
    rod(g,.015,[cx-.14,cy+.05,0],[cx-.22,cy-.12,.04],blk); } },
  veletta:  { n:'Veletta con LED', cat:'Illuminazione', w:3, d:3.6, h:.18, z:2.82, c:'#f2f1ee', draw:(g,W,D,H,C) => {
    const b = .26, m = gm('#fff3dc','#ffc878',1.5,false);
    fbox(g,W,H,b,0,0,-D/2+b/2,C); fbox(g,W,H,b,0,0,D/2-b/2,C); fbox(g,b,H,D-2*b,-W/2+b/2,0,0,C); fbox(g,b,H,D-2*b,W/2-b/2,0,0,C);
    gbox(g,W-2*b,.015,.015,0,H-.03,-D/2+b+.01,m); gbox(g,W-2*b,.015,.015,0,H-.03,D/2-b-.01,m);
    gbox(g,.015,.015,D-2*b,-W/2+b+.01,H-.03,0,m); gbox(g,.015,.015,D-2*b,W/2-b-.01,H-.03,0,m);
    g.traverse(o => { o.castShadow = false; }); } },
  tende:    { n:'Tende', cat:'Decorazioni e tessili', w:1.6, d:.12, h:2.75, c:'#6c7077', draw:(g,W,D,H,C) => {
    fbox(g,W+.12,.022,.022,0,H-.04,-.02,'#2a2a2c');
    fbox(g,W-.08,H-.1,.008,0,.03,.03,'#ffffff',{ transparent:true, opacity:.5, roughness:.95, depthWrite:false });
    const n = 5, dw = W*.17;
    [-1,1].forEach(s => { for (let k=0;k<n;k++){
      const c = new THREE.Mesh(new THREE.CylinderGeometry(dw/n*.75, dw/n*.75, H-.08, 8), fm(C,{ roughness:.95 }));
      c.position.set(s*(W/2 - dw/2) + (k-(n-1)/2)*dw/n, .02+(H-.08)/2, -.015 + (k%2)*.012); c.castShadow = true; g.add(c); } }); } },
  monstera: { n:'Pianta grande', cat:'Piante', w:.8, d:.8, h:1.25, c:'#2f6b34', draw:(g,W,D,H,C) => {
    fcyl(g,W*.2,H*.26,0,0,0,'#2c2c2e'); fcyl(g,W*.19,.01,0,H*.26,0,'#3b2a20');
    for (let i=0;i<11;i++){
      const a = i*2.4, rr = W*(.12 + .3*((i*37)%10)/10), y = H*(.42 + .55*((i*53)%10)/10);
      const lx = Math.cos(a)*rr, lz = Math.sin(a)*rr;
      rod(g,.008,[0,H*.26,0],[lx,y,lz],'#3d6b2f');
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(1,12,6), fm(i%3 ? C : shade(C,1.25),{ roughness:.55, side:THREE.DoubleSide }));
      leaf.scale.set(W*.2, .012, W*.15); leaf.position.set(lx*1.1, y, lz*1.1); leaf.rotation.set(0, -a, .35); leaf.castShadow = true; g.add(leaf);
    } } },
  /* ---------- versione rinnovata (immagini AI) ---------- */
  quadri:   { n:'Quadri', cat:'Decorazioni e tessili', w:1.6, d:.03, h:.8, z:1.15, c:'#e8dcc6', draw:(g,W,D,H,C) => {
    const fr = [[-.36,.18,.2,.46],[.02,.33,.34,.3],[.42,.12,.4,.56],[-.02,-.02,.14,.2],[.17,-.02,.16,.2]];
    fr.forEach((f, i) => { const fw = f[2]*W/1.6*2, fh = f[3]*H/.8, x = f[0]*W/1.6*1.1, y = f[1]*H/.8 + (H - fh)/2 - .1;
      fbox(g,fw,fh,D,x,y,0,'#f3eee4',{ roughness:.8 });
      fbox(g,fw*.55,fh*.45,.004,x+fw*.08*(i%2 ? 1 : -1),y+fh*.25,D/2+.002,i%2 ? '#b89870' : '#8a6e52',{ roughness:.9 }); }); } },
  faretti:  { n:'Binario con faretti', cat:'Illuminazione', w:1.6, d:.06, h:.2, z:2.78, c:'#f2f2f0', draw:(g,W,D,H,C) => {
    fbox(g,W,.035,D,0,H-.035,0,C);
    const lit = gm('#fff6e0','#ffd9a0',2,true);
    [-.33,0,.33].forEach(k => { rod(g,.012,[k*W,H-.035,0],[k*W,H-.07,0],C); const c = fcyl(g,.035,.11,k*W,H-.18,.02,C); c.rotation.x = -.35;
      const b = new THREE.Mesh(new THREE.CircleGeometry(.03,14), lit); b.rotation.x = Math.PI/2+.35; b.position.set(k*W,H-.185,.04); g.add(b); }); } },
  scaffalescala:{ n:'Libreria a scala', cat:'Armadi e contenitori', w:.45, d:.32, h:1.85, c:'#f4f4f2', draw:(g,W,D,H,C) => {
    [-1,1].forEach(s => rod(g,.018,[s*(W/2-.02),0,D/2-.02],[s*(W/2-.02),H,-D/2+.04],C));
    const cols = ['#4fa3b8','#e0858a','#2f8fbf','#d8d2c4','#7fb0a8'];
    for (let k=0;k<6;k++){ const t = (k+.4)/6, y = t*H, dz = (D/2-.02) - t*(D-.06), dd = D*(1-t*.6);
      fbox(g,W-.04,.02,dd,0,y,dz-dd/2+.02,C); fbox(g,W*.5,.12,dd*.5,-.05,y+.02,dz-dd/2+.02,cols[k%cols.length]); } } },
  lettoimb: { n:'Letto imbottito', cat:'Letti', w:1.7, d:2.15, h:.5, c:'#e8e0d4', draw:(g,W,D,H,C) => {
    fbox(g,W,.32,D-.12,0,.06,.06,C,{ roughness:.95 }); fbox(g,W-.06,.2,D-.2,0,.38,.08,'#ece8e1',{ roughness:.95 });
    fbox(g,W+.04,1.05,.18,0,0,-D/2+.09,C,{ roughness:.95 });
    [-1,1].forEach(s => fbox(g,W/2-.03,.36,.14,s*W/4,.62,-D/2+.2,shade(C,1.04),{ roughness:.95 }));
    fbox(g,W+.06,.025,.75,0,.58,.42,'#3f6b5a',{ roughness:.95 }); fbox(g,W+.08,.02,1.0,0,.575,.32,'#9a9a96',{ roughness:.95 });
    [[-.45,'#f2eee6'],[.45,'#f2eee6'],[-.25,'#3f6b5a'],[.25,'#7c837f'],[0,'#3f6b5a']].forEach((q,i) => {
      const c = fbox(g,.45 - (i>1 ? .1 : 0),.3 - (i>1 ? .08 : 0),.12,q[0]*W/1.7,.58,-D/2+.33+(i>1 ? .08 : 0),q[1],{ roughness:.95 }); c.rotation.x = -.25; }); } },
  armadiospecchi:{ n:'Armadio con specchi', cat:'Armadi e contenitori', w:2.7, d:.62, h:2.5, c:'#e3dbd0', draw:(g,W,D,H,C) => {
    fbox(g,W,H,D-.03,0,0,-.015,C,{ roughness:.6 });
    const n = 6, mir = { metalness:.95, roughness:.05 };
    for (let k=0;k<n;k++){ const x = -W/2+(k+.5)*W/n, m = k === 1 || k === 4;
      fbox(g,W/n-.012,H-.04,.02,x,.02,D/2-.01,m ? '#dfe6ea' : C,m ? mir : { roughness:.5 });
      if (!m) fbox(g,.015,.9,.02,x+(k%2 ? -1 : 1)*(W/n/2-.05),.7,D/2+.01,'#b9b1a5'); } } },
  plafoniera:{ n:'Plafoniera di cristallo', cat:'Illuminazione', w:.5, d:.5, h:.16, z:2.82, c:'#f4f4f6', draw:(g,W,D,H,C) => {
    fcyl(g,W/2,.03,0,H-.03,0,C,INOX);
    const m = gm('#ffffff','#fff0d0',1.2,true); m.flatShading = true;
    for (let k=0;k<3;k++){ const r = new THREE.Mesh(new THREE.CylinderGeometry(W/2*(.95-k*.22),W/2*(.95-k*.22),.05,12,1,true), m); r.position.y = H-.06-k*.04; g.add(r); } } },
  ledparete:{ n:'Cornice LED a parete', cat:'Illuminazione', w:3, d:.04, h:2.7, c:'#ffe2b0', draw:(g,W,D,H,C) => {
    const m = gm('#fff1d6',C,2,false);
    gbox(g,W,.03,D,0,H-.03,0,m); gbox(g,.03,H,D,-W/2,0,0,m); gbox(g,.03,H,D,W/2,0,0,m); } },
  paretetv: { n:'Parete attrezzata TV', cat:'TV e multimedia', w:3.4, d:.45, h:2.25, c:'#f1ece4', draw:(g,W,D,H,C) => {
    const wood = '#c49a6c', led = gm('#fff0d8','#ffcf8f',1.3,false), sw = .55;
    fbox(g,W-2*sw,.42,D,0,.12,0,C,{ roughness:.4 }); fbox(g,(W-2*sw)*.3,.1,.02,0,.3,D/2+.002,wood);
    fbox(g,W-2*sw,1.1,.06,0,.54,-D/2+.03,shade(C,.96),{ roughness:.5 });
    fbox(g,1.45,.84,.05,0,.75,-D/2+.08,'#141416',{ roughness:.25 }); fbox(g,1.41,.8,.004,0,.77,-D/2+.106,'#06080b',{ roughness:.08, metalness:.4 });
    fbox(g,.8,.07,.09,0,.56,-D/2+.15,'#1b1b1d');
    fbox(g,W-2*sw,.4,D*.8,0,1.75,-D*.1,C,{ roughness:.4 }); fbox(g,.5,.4,D*.8,.4,1.75,-D*.1+.002,wood);
    [-1,1].forEach(s => { const x = s*(W/2-sw/2);
      fbox(g,sw,.75,D,x,.12,0,C,{ roughness:.4 });
      fbox(g,sw,H-.87,.02,x,.87,-D/2+.01,wood); fbox(g,.02,H-.87,D,x-sw/2+.01,.87,0,C); fbox(g,.02,H-.87,D,x+sw/2-.01,.87,0,C); fbox(g,sw,.03,D,x,H-.03,0,C);
      for (let k=0;k<3;k++){ const y = .87+.02+k*(H-.9)/3; fbox(g,sw-.04,.025,D-.03,x,y,0,wood); gbox(g,sw-.06,.008,.01,x,y+(H-.9)/3-.05,D/2-.03,led);
        fbox(g,.12,.18-.05*k,.1,x-.08*s,y+.025,0,['#d9d2c4','#8c9a8a','#b8a58c'][k]); } }); } },
  tavolinomarmo:{ n:'Tavolino in marmo', cat:'Tavoli e scrivanie', w:1.1, d:.65, h:.4, c:'#f2f0ec', draw:(g,W,D,H,C) => {
    fbox(g,W,.03,D,0,H-.03,0,C,{ roughness:.2 }); const k = '#8d8a85';
    LEGS4.forEach(p => fbox(g,.02,H-.03,.02,p[0]*(W/2-.02),0,p[1]*(D/2-.02),k,INOX));
    [-1,1].forEach(s => { fbox(g,W-.04,.02,.02,0,.05,s*(D/2-.02),k,INOX); fbox(g,.02,.02,D-.04,s*(W/2-.02),.05,0,k,INOX); });
    fcyl(g,.12,.05,0,H,0,'#cfc6b8'); } },
  tavolomarmo:{ n:'Tavolo in marmo', cat:'Tavoli e scrivanie', w:2, d:1.0, h:.76, c:'#eeece8', draw:(g,W,D,H,C) => {
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1,1,1,40), fm(C,{ roughness:.18 }));
    top.scale.set(W/2,.03,D/2); top.position.y = H-.015; top.castShadow = top.receiveShadow = true; g.add(top);
    fbox(g,W*.86,.03,D*.86,0,H-.06,0,C,{ roughness:.18 }).scale.set(1,1,.7);
    const k = '#5d5f62'; [-1,1].forEach(s => { [-1,1].forEach(t => { const l = rod(g,.035,[s*W*.12,H-.06,0],[s*W*.33,0,t*D*.3],k,{ metalness:.5, roughness:.4 }); l.castShadow = true; }); }); } },
  sediaimb: { n:'Sedia imbottita', cat:'Divani e sedute', w:.5, d:.55, h:.86, c:'#ddd3c4', draw:(g,W,D,H,C) => {
    const k = '#1d1d1f';
    [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(p => rod(g,.012,[p[0]*(W/2-.08),.44,p[1]*(D/2-.1)],[p[0]*(W/2-.03),0,p[1]*(D/2-.03)],k));
    fbox(g,W,.09,D-.04,0,.43,.02,C,{ roughness:.95 });
    const b = fbox(g,W,.44,.07,0,.5,-D/2+.06,C,{ roughness:.95 }); b.rotation.x = -.12; } },
  sgabelloimb:{ n:'Sgabello imbottito', cat:'Divani e sedute', w:.45, d:.48, h:1.0, c:'#d9cdbd', draw:(g,W,D,H,C) => {
    const k = '#3b2a20';
    LEGS4.forEach(p => rod(g,.014,[p[0]*(W/2-.08),.66,p[1]*(D/2-.1)],[p[0]*(W/2-.04),0,p[1]*(D/2-.04)],k));
    fbox(g,W-.1,.02,.02,0,.25,D/2-.08,k);
    fbox(g,W,.08,D-.06,0,.64,.02,C,{ roughness:.95 }); const b = fbox(g,W,.32,.06,0,.72,-D/2+.06,C,{ roughness:.95 }); b.rotation.x = -.12; } },
  globo:    { n:'Lampada a sfera di vetro', cat:'Illuminazione', w:.3, d:.3, h:.32, z:1.75, c:'#6e6b6a', draw:(g,W,D,H,C) => {
    const s = new THREE.Mesh(new THREE.SphereGeometry(W/2,24,16), fm(C,{ transparent:true, opacity:.55, roughness:.08, metalness:.3, depthWrite:false }));
    s.position.y = W/2; g.add(s);
    const b = new THREE.Mesh(new THREE.SphereGeometry(.035,12,8), gm('#fff6e0','#ffcf8a',2,true)); b.position.y = W/2; g.add(b);
    fcyl(g,.03,.05,0,W-.02,0,'#2a2a2c'); fbox(g,.006,Math.max(.05, ceilH() - 1.75 - W),.006,0,W+.03,0,'#2a2a2c'); } },
  lampadageo:{ n:'Lampadario geometrico', cat:'Illuminazione', w:.55, d:.55, h:.6, z:1.9, c:'#c9a45a', draw:(g,W,D,H,C) => {
    const geo = new THREE.OctahedronGeometry(1,0), e = new THREE.EdgesGeometry(geo);
    const l = new THREE.LineSegments(e, new THREE.LineBasicMaterial({ color:C })); l.scale.set(W/2,H/2,D/2); l.position.y = H/2; g.add(l);
    const b = new THREE.Mesh(new THREE.SphereGeometry(.05,12,8), gm('#fff6e0','#ffcf8a',2,true)); b.position.y = H/2; g.add(b);
    fbox(g,.006,Math.max(.05, ceilH() - 1.9 - H),.006,0,H,0,C); } },
  piantana:{ n:'Lampada da terra', cat:'Illuminazione', w:.3, d:.3, h:1.6, c:'#1d1d1f', draw:(g,W,D,H,C) => {
    fcyl(g,.13,.02,0,0,0,C); rod(g,.01,[0,0,0],[0,H-.15,0],C); rod(g,.01,[0,H-.15,0],[.12,H-.1,0],C);
    const b = new THREE.Mesh(new THREE.SphereGeometry(.11,20,14), gm('#fbf8f2','#ffe2b0',1.2,true)); b.position.set(.14,H-.12,0); g.add(b); } },
  mobileled:{ n:'Mobile con nicchie e LED', cat:'Armadi e contenitori', w:.9, d:.42, h:2.1, c:'#f1ece4', draw:(g,W,D,H,C) => {
    const wood = '#c49a6c', led = gm('#fff0d8','#ffcf8f',1.3,false);
    fbox(g,W,.85,D,0,0,0,C,{ roughness:.4 }); fbox(g,.006,.8,.01,0,.03,D/2+.002,shade(C,.8));
    fbox(g,W,.55,D,0,.85,-.01,wood); fbox(g,W,.03,D,0,.85,0,C); fbox(g,W-.04,.012,.01,0,1.36,D/2-.03,led);
    fcyl(g,.05,.16,-.2,.88,0,'#efe9df'); fcyl(g,.04,.1,.15,.88,0,'#cbbfa8');
    fbox(g,W,H-1.4,D,0,1.4,0,C,{ roughness:.4 }); fbox(g,.006,H-1.44,.01,0,1.42,D/2+.002,shade(C,.8)); } },
  penisolamarmo:{ n:'Penisola in marmo', cat:'Cucina', w:1.8, d:.7, h:.92, c:'#f0eeea', draw:(g,W,D,H,C) => {
    const mm = { roughness:.2 }; fbox(g,W,.05,D,0,H-.05,0,C,mm);
    fbox(g,.05,H-.05,D,-W/2+.025,0,0,C,mm); fbox(g,.05,H-.05,D,W/2-.025,0,0,C,mm); fbox(g,W-.1,H-.05,.04,0,0,-D/2+.02,C,mm);
    fbox(g,W-.1,H-.05,D-.35,0,0,-.1,'#bdb3a7'); } },
  pensilevetro:{ n:'Pensili con vetrina', cat:'Cucina', w:1.6, d:.35, h:.9, z:1.45, c:'#1b1b1d', draw:(g,W,D,H,C) => {
    fbox(g,W,H,D-.03,0,0,-.015,'#2b2a29');
    const n = Math.max(1, Math.round(W/.4)), led = gm('#fff0d8','#ffcf8f',1.6,false);
    for (let k=0;k<n;k++){ const x = -W/2+(k+.5)*W/n;
      fbox(g,W/n-.05,H-.05,.006,x,.025,D/2,'#cfdbe0',{ transparent:true, opacity:.3, roughness:.05, depthWrite:false });
      [[-1,0],[1,0]].forEach(q => fbox(g,.02,H,.02,x+q[0]*(W/n/2-.01),0,D/2,C));
      fbox(g,W/n-.03,.015,D-.06,x,H*.5,0,'#cfdbe0',{ transparent:true, opacity:.5 });
      [.18,H*.5+.03].forEach(y => { fcyl(g,.03,.12,x-.06,y,0,'#f4f4f2'); fcyl(g,.03,.12,x+.06,y,0,'#f4f4f2'); });
      gbox(g,W/n-.05,.01,.01,x,H-.03,D/2-.05,led); }
    fbox(g,W,.02,D,0,H-.02,0,C); fbox(g,W,.02,D,0,0,0,C);
    gbox(g,W-.04,.01,.01,0,-.012,D/2-.05,led); } },
  /* terrazzo */
  pergola:  { n:'Pergola bioclimatica', cat:'Esterno', w:4, d:3, h:2.6, c:'#e6e3dd', draw:(g,W,D,H,C) => {
    const p = .12;
    LEGS4.forEach(q => fbox(g,p,H,p,q[0]*(W/2-p/2),0,q[1]*(D/2-p/2),C,{ roughness:.5 }));
    [-1,1].forEach(s => { fbox(g,W,.2,p,0,H-.2,s*(D/2-p/2),C,{ roughness:.5 }); fbox(g,p,.2,D,s*(W/2-p/2),H-.2,0,C,{ roughness:.5 }); });
    const n = Math.round((W-2*p)/.2);
    for (let k=0;k<n;k++){ const l = fbox(g,.16,.02,D-2*p,-W/2+p+(k+.5)*(W-2*p)/n,H-.1,0,C,{ roughness:.5 }); l.rotation.z = .5; }
    const led = gm('#fff1d6','#ffcf8a',1.8,true);
    [-1,1].forEach(s => { gbox(g,W-2*p,.015,.015,0,H-.21,s*(D/2-p-.01),led); gbox(g,.015,.015,D-2*p,s*(W/2-p-.01),H-.21,0,led); });
    const bulbs = gm('#fff6e0','#ffd28a',2.2,true);
    for (let k=0;k<4;k++) for (let j=0;j<14;j++){ const x = -W/2+p+(j+.5)*(W-2*p)/14, z = -D/2+p+(k+.5)*(D-2*p)/4;
      const b = new THREE.Mesh(new THREE.SphereGeometry(.02,6,4), bulbs); b.position.set(x,H-.35-Math.sin((j+.5)/14*Math.PI)*.15,z); g.add(b); } } },
  tavoloesterno:{ n:'Tavolo da esterno', cat:'Esterno', w:2.2, d:.95, h:.75, c:'#a97e55', draw:(g,W,D,H,C) => {
    const n = 6; for (let k=0;k<n;k++) fbox(g,W,.035,D/n-.01,0,H-.035,-D/2+(k+.5)*D/n,shade(C,k%2 ? 1 : .94),{ roughness:.8 });
    const k = '#3a3a3c'; [-1,1].forEach(s => { fbox(g,.06,H-.035,D-.15,s*(W/2-.2),0,0,k); });
    [-.6,-.2,.2,.6].forEach((x,i) => { fcyl(g,.03,.08,x*W/2,H,(i%2 ? .15 : -.15),'#f3efe6'); fcyl(g,.13,.01,x*W/2,H,(i%2 ? -.25 : .25),'#f6f3ee'); });
    const c = new THREE.Mesh(new THREE.SphereGeometry(.025,8,6), gm('#fff3dc','#ffc878',2,true)); c.position.set(0,H+.06,0); g.add(c); fcyl(g,.04,.04,0,H,0,'#e9e2d3'); } },
  sediaesterna:{ n:'Sedia da esterno', cat:'Esterno', w:.52, d:.55, h:.82, c:'#cfc5b6', draw:(g,W,D,H,C) => {
    const k = '#7a6a58'; LEGS4.forEach(p => rod(g,.015,[p[0]*(W/2-.07),.44,p[1]*(D/2-.08)],[p[0]*(W/2-.03),0,p[1]*(D/2-.03)],k));
    fbox(g,W,.07,D-.05,0,.42,.02,C,{ roughness:.95 }); const b = fbox(g,W,.4,.06,0,.48,-D/2+.05,C,{ roughness:.95 }); b.rotation.x = -.15;
    [-1,1].forEach(s => fbox(g,.05,.18,D-.1,s*(W/2-.025),.48,0,C,{ roughness:.95 })); } },
  lettino:  { n:'Lettino prendisole', cat:'Esterno', w:.7, d:1.95, h:.4, c:'#d9d3c8', draw:(g,W,D,H,C) => {
    const k = '#a07a52'; fbox(g,W,.08,D,0,.18,0,k,{ roughness:.7 }); LEGS4.forEach(p => fbox(g,.05,.18,.05,p[0]*(W/2-.05),0,p[1]*(D/2-.08),k));
    fbox(g,W-.06,.08,D*.66,0,.26,D*.17,C,{ roughness:.95 });
    const b = fbox(g,W-.06,.08,D*.36,0,.3,-D*.32,C,{ roughness:.95 }); b.rotation.x = .6; b.position.y += .17;
    fbox(g,W*.5,.1,.2,0,.55,-D*.4,'#efebe3',{ roughness:.95 }).rotation.x = .6; } },
  barbecue: { n:'Barbecue a gas', cat:'Esterno', w:1.3, d:.6, h:.95, c:'#b9bdc1', draw:(g,W,D,H,C) => {
    fbox(g,W,.85,D,0,0,0,'#3a3b3d'); fbox(g,W-.4,.8,.02,0,.03,D/2,C,INOX); fbox(g,.006,.75,.03,0,.06,D/2+.005,'#7e8286');
    fbox(g,W,.03,D,0,.85,0,'#2a2b2d');
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(.22,.22,W-.42,20,1,false,0,Math.PI), fm(C,INOX)); lid.rotation.z = Math.PI/2; lid.position.set(0,.88,-.02); lid.castShadow = true; g.add(lid);
    fbox(g,W-.5,.02,.03,0,1.05,.22,'#d0d3d6',INOX); } },
  vasopianta:{ n:'Pianta in vaso grande', cat:'Piante', w:.6, d:.6, h:1.6, c:'#3e7a3a', draw:(g,W,D,H,C) => {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(W*.42,W*.32,H*.3,20), fm('#8d8172',{ roughness:.95 }));
    pot.position.y = H*.15; pot.castShadow = true; g.add(pot);
    for (let i=0;i<9;i++){
      const a = i*2.4, rr = W*(.05 + .25*((i*37)%10)/10), y = H*(.5 + .48*((i*53)%10)/10), lx = Math.cos(a)*rr, lz = Math.sin(a)*rr;
      rod(g,.01,[0,H*.3,0],[lx,y-.1,lz],'#4d6b2c');
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(1,10,6), fm(i%2 ? C : shade(C,1.2),{ roughness:.55, side:THREE.DoubleSide }));
      leaf.scale.set(.06, W*.35, .015); leaf.position.set(lx*1.15, y, lz*1.15); leaf.rotation.set(Math.sin(a)*.35, -a, Math.cos(a)*.35); leaf.castShadow = true; g.add(leaf); } } }
};

/* ---------- catalogo ampliato ---------- */
/* disco verticale che guarda il fronte (+z): oblò, griglie, manopole */
function fdisc(g, r, t, x, y, z, c, o){
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, t, 24), fm(c, o));
  m.rotation.x = Math.PI/2; m.position.set(x, y, z); g.add(m); return m;
}
/* foglia: un'ellisse schiacciata */
function leaf(g, x, y, z, sx, sy, sz, rx, ry, c){
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), fm(c, { roughness:.55, side:THREE.DoubleSide }));
  m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); m.castShadow = true; g.add(m); return m;
}
function pot(g, rt, rb, h, c){
  const p = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 20), fm(c, { roughness:.9 }));
  p.position.y = h/2; p.castShadow = true; p.receiveShadow = true; g.add(p);
  fcyl(g, rt*.92, .012, 0, h-.03, 0, '#4a3a2c', { roughness:1 }); return p;
}
/* lavatrice e asciugatrice hanno lo stesso corpo; cambia l'oblò */
function laundry(g, W, D, H, C, y0, dry){
  fbox(g,W,H,D,0,y0,0,C,{ roughness:.4 });
  fbox(g,W-.04,.1,.012,0,y0+H-.13,D/2+.002,shade(C,.92));
  fbox(g,.16,.05,.012,-W/2+.13,y0+H-.11,D/2+.008,'#cfd6dc');
  fdisc(g,.03,.02,W/2-.12,y0+H-.085,D/2+.01,'#9aa0a6',INOX);
  gbox(g,.06,.025,.008,-.02,y0+H-.1,D/2+.014,gm('#bfe9ff','#5fc8ff',1.1,false));
  const cy = y0 + (H-.15)*.48;
  fdisc(g,.19,.03,0,cy,D/2+.012,dry ? '#d6d9dc' : '#a9b0b6',INOX);
  fdisc(g,.145,.03,0,cy,D/2+.022,dry ? '#3a3d41' : '#2d3a46',{ transparent:true, opacity:.75, roughness:.1 });
}
const ARIA = '#f6f7f8';
const FURN2 = {
  /* sedute */
  divanoang:{ n:'Divano angolare', cat:'Divani e sedute', w:2.7, d:1.7, h:.85, c:'#8b8f94', draw:(g,W,D,H,C) => {
    const s = .95;
    fbox(g,W,.4,s,0,.08,-D/2+s/2,C); fbox(g,s,.4,D-s,W/2-s/2,.08,s/2,C);
    fbox(g,W,H-.4,.22,0,.4,-D/2+.11,C); fbox(g,.22,H-.4,D,W/2-.11,.4,0,C);
    fbox(g,.18,.28,s-.1,-W/2+.09,.4,-D/2+s/2,shade(C,.88));
    const n = Math.max(1, Math.round((W-s)/.75)), sw = (W-s-.18)/n;
    for (let i=0;i<n;i++) fbox(g,sw-.03,.13,s-.3,-W/2+.18+sw*(i+.5),.48,-D/2+s/2+.1,shade(C,1.12));
    fbox(g,s-.3,.13,s-.3,W/2-s/2-.1,.48,-D/2+s/2+.1,shade(C,1.12));
    fbox(g,s-.3,.13,D-s-.05,W/2-s/2-.1,.48,s/2-.02,shade(C,1.12));
    [[-W/2+.1,-D/2+.1],[-W/2+.1,-D/2+s-.1],[W/2-.1,-D/2+.1],[W/2-.1,D/2-.1],[W/2-s+.1,D/2-.1]].forEach(p => fbox(g,.05,.08,.05,p[0],0,p[1],'#222')); } },
  panca:    { n:'Panca', cat:'Divani e sedute', w:1.2, d:.38, h:.46, c:'#a57c55', draw:(g,W,D,H,C) => {
    fbox(g,W,.05,D,0,H-.05,0,C,{ roughness:.7 }); [-1,1].forEach(s => fbox(g,.05,H-.05,D-.04,s*(W/2-.1),0,0,shade(C,.8)));
    fbox(g,W-.3,.02,.04,0,.12,0,shade(C,.8)); } },
  chaise:   { n:'Poltrona relax', cat:'Divani e sedute', w:.8, d:1.5, h:.9, c:'#c7b9a6', draw:(g,W,D,H,C) => {
    fbox(g,W,.3,D-.4,0,.1,.2,C,{ roughness:.95 }); const b = fbox(g,W,.6,.22,0,.3,-D/2+.25,C,{ roughness:.95 }); b.rotation.x = -.35;
    fbox(g,W-.1,.1,D-.5,0,.4,.22,shade(C,1.1),{ roughness:.95 });
    [[-1,-D/2+.42],[1,-D/2+.42],[-1,D/2-.06],[1,D/2-.06]].forEach(p => fbox(g,.04,.1,.04,p[0]*(W/2-.08),0,p[1],'#3a2c22')); } },
  /* tavoli */
  tavolotondo:{ n:'Tavolo rotondo', cat:'Tavoli e scrivanie', w:1.2, d:1.2, h:.75, c:'#c9a57e', draw:(g,W,D,H,C) => {
    fcyl(g,W/2,.04,0,H-.04,0,C,{ roughness:.55 }); fcyl(g,.05,H-.08,0,.04,0,'#2c2c2e'); fcyl(g,.25,.04,0,0,0,'#2c2c2e'); } },
  consolle:{ n:'Consolle', cat:'Tavoli e scrivanie', w:1.1, d:.35, h:.8, c:'#5b4636', draw:(g,W,D,H,C) => {
    fbox(g,W,.04,D,0,H-.04,0,C); fbox(g,W-.06,.1,D-.04,0,H-.14,0,C);
    LEGS4.forEach(p => fbox(g,.03,H-.14,.03,p[0]*(W/2-.04),0,p[1]*(D/2-.04),'#1f1f21')); } },
  /* letti */
  lettopiazza:{ n:'Letto a una piazza e mezza', cat:'Letti', w:1.2, d:2.05, h:.5, c:'#6f8a7a', draw:(g,W,D,H,C) => {
    fbox(g,W,.25,D,0,.04,0,'#d9d2c6'); fbox(g,W-.06,H-.25,D-.12,0,.29,.03,C); fbox(g,W,.95,.08,0,0,-D/2+.04,'#d9d2c6');
    fbox(g,.6,.12,.35,0,H+.04,-D/2+.35,'#efe6da'); } },
  culla:    { n:'Culla / lettino bimbo', cat:'Letti', w:.7, d:1.3, h:.9, c:'#f1ece4', draw:(g,W,D,H,C) => {
    fbox(g,W,.08,D,0,.3,0,C); fbox(g,W-.06,.1,D-.06,0,.38,0,'#e8f0f4');
    [-1,1].forEach(s => { fbox(g,W,.05,.05,0,H-.05,s*(D/2-.025),C); fbox(g,.05,.05,D,s*(W/2-.025),H-.05,0,C); });
    LEGS4.forEach(p => fbox(g,.05,H,.05,p[0]*(W/2-.025),0,p[1]*(D/2-.025),C));
    for (let k=1;k<12;k++){ const z = -D/2+k*D/12; [-1,1].forEach(s => fbox(g,.02,H-.43,.02,s*(W/2-.025),.38,z,C)); }
    for (let k=1;k<6;k++){ const x = -W/2+k*W/6; [-1,1].forEach(s => fbox(g,.02,H-.43,.02,x,.38,s*(D/2-.025),C)); } } },
  /* contenitori */
  madia:    { n:'Madia', cat:'Armadi e contenitori', w:1.8, d:.45, h:.8, c:'#6e5442', draw:(g,W,D,H,C) => {
    fbox(g,W,H-.12,D,0,.12,0,C); const n = Math.max(2, Math.round(W/.45));
    for (let k=1;k<n;k++) fbox(g,.01,H-.16,.01,-W/2+k*W/n,.14,D/2+.002,shade(C,.6));
    LEGS4.forEach(p => rod(g,.015,[p[0]*(W/2-.08),.12,p[1]*(D/2-.08)],[p[0]*(W/2-.04),0,p[1]*(D/2-.04)],'#222')); } },
  scarpiera:{ n:'Scarpiera', cat:'Armadi e contenitori', w:.8, d:.3, h:1.1, c:'#f3f1ec', draw:(g,W,D,H,C) => {
    fbox(g,W,H,D-.04,0,0,-.02,C); for (let k=0;k<3;k++){ const y = k*H/3;
      const a = fbox(g,W-.02,H/3-.02,.025,0,y+.01,D/2-.02,shade(C,.97)); a.rotation.x = -.06;
      fbox(g,.14,.012,.02,0,y+H/3-.06,D/2+.005,'#8a8d90'); } } },
  appendiabiti:{ n:'Appendiabiti', cat:'Armadi e contenitori', w:.45, d:.45, h:1.8, c:'#3a2c22', draw:(g,W,D,H,C) => {
    fcyl(g,.18,.03,0,0,0,C); rod(g,.018,[0,0,0],[0,H,0],C);
    for (let k=0;k<6;k++){ const a = k*Math.PI/3; rod(g,.01,[0,H-.12,0],[Math.cos(a)*.17,H-.04,Math.sin(a)*.17],C); }
    leaf(g,.08,H-.5,.06,.12,.35,.06,0,.5,'#4b5560'); } },
  /* tv */
  tvpiedistallo:{ n:'TV su supporto', cat:'TV e multimedia', w:1.45, d:.4, h:1.45, c:'#121315', draw:(g,W,D,H,C) => {
    fbox(g,.5,.03,.35,0,0,0,'#2b2c2f',INOX); fbox(g,.08,H-.85,.04,0,.03,-.05,'#2b2c2f',INOX);
    fbox(g,W,.82,.05,0,H-.84,0,C,{ roughness:.25 }); gbox(g,W-.04,.78,.006,0,H-.82,.026,gm('#20262d','#3a4c63',.35,false)); } },
  soundbar: { n:'Soundbar', cat:'TV e multimedia', w:.95, d:.1, h:.07, z:.45, c:'#1d1e21', draw:(g,W,D,H,C) => {
    fbox(g,W,H,D,0,0,0,C,{ roughness:.9 }); fbox(g,W-.04,H-.02,.004,0,.01,D/2,'#2c2e31',{ roughness:1 }); } },
  casse:    { n:'Casse da terra', cat:'TV e multimedia', w:.25, d:.3, h:1, c:'#2a2623', draw:(g,W,D,H,C) => {
    fbox(g,W,H,D,0,0,0,C,{ roughness:.5 }); [.25,.55,.82].forEach((y,i) => fdisc(g,i===2 ? .03 : .08,.02,0,H*y,D/2+.005,'#111'));
  } },
  console:  { n:'Console da gioco', cat:'TV e multimedia', w:.3, d:.25, h:.08, z:.45, c:'#f2f2f2', draw:(g,W,D,H,C) => {
    fbox(g,W,H,D,0,0,0,C,{ roughness:.4 }); fbox(g,W*.3,.003,D-.02,0,H,0,'#1b1b1d'); gbox(g,.02,.005,.003,W/2-.04,H*.5,D/2+.001,gm('#cfe8ff','#4aa8ff',1.3,false)); } },
  /* elettrodomestici */
  asciugatrice:{ n:'Asciugatrice', cat:'Elettrodomestici', w:.6, d:.6, h:.85, c:'#f0f0f0', draw:(g,W,D,H,C) => laundry(g,W,D,H,C,0,true) },
  colonnabucato:{ n:'Colonna lavatrice + asciugatrice', cat:'Elettrodomestici', w:.6, d:.65, h:1.75, c:'#f0f0f0', draw:(g,W,D,H,C) => {
    const h = (H-.05)/2; laundry(g,W,D,h,C,0,false); fbox(g,W,.05,D,0,h,0,'#c9ccd0'); laundry(g,W,D,h,C,h+.05,true); } },
  lavastoviglie:{ n:'Lavastoviglie', cat:'Elettrodomestici', w:.6, d:.6, h:.85, c:'#c3c7cb', draw:(g,W,D,H,C) => {
    fbox(g,W,H-.1,D,0,.1,0,C,INOX); fbox(g,W-.04,.1,D-.06,0,0,-.03,'#2a2b2d');
    fbox(g,W-.02,.08,.01,0,H-.1,D/2+.004,'#2a2b2d'); fbox(g,W-.16,.02,.025,0,H-.18,D/2+.012,'#9aa0a6',INOX);
    gbox(g,.05,.02,.006,W/2-.08,H-.06,D/2+.01,gm('#d6ffd9','#4be06a',1,false)); } },
  frigoamericano:{ n:'Frigo side by side', cat:'Elettrodomestici', w:.92, d:.72, h:1.78, c:'#9fa4a9', draw:(g,W,D,H,C) => {
    fbox(g,W,H,D,0,0,0,C,{ metalness:.5, roughness:.3 }); fbox(g,.008,H-.04,.01,0,.02,D/2+.003,'#55595d');
    [-1,1].forEach(s => fbox(g,.022,.9,.03,s*.05,H*.35,D/2+.02,'#3d4044',INOX));
    fbox(g,.2,.32,.012,-W/4,H*.5,D/2+.006,'#3a3d41'); } },
  microonde:{ n:'Forno a microonde', cat:'Elettrodomestici', w:.5, d:.38, h:.3, z:.92, c:'#2a2b2d', draw:(g,W,D,H,C) => {
    fbox(g,W,H,D,0,0,0,C,{ roughness:.4 }); fbox(g,W*.7,H-.06,.01,-W*.12,.03,D/2+.003,'#111316',{ roughness:.1 });
    fbox(g,W*.2,H-.06,.01,W*.38,.03,D/2+.003,'#3a3b3e'); gbox(g,.06,.02,.004,W*.38,H-.08,D/2+.01,gm('#fff0d8','#7bdcff',1,false)); } },
  caffe:    { n:'Macchina del caffè', cat:'Elettrodomestici', w:.22, d:.35, h:.33, z:.92, c:'#1d1d1f', draw:(g,W,D,H,C) => {
    fbox(g,W,H,D*.7,0,0,-D*.15,C,{ roughness:.35 }); fbox(g,W,.05,D*.3,0,0,D*.35,C); fbox(g,W,.08,D*.3,0,H-.08,D*.35,C);
    fcyl(g,.035,.07,0,.05,D*.33,'#f4f2ec'); fbox(g,W*.7,.012,D*.25,0,.05,D*.35,'#9aa0a6',INOX); } },
  robot:    { n:'Robot aspirapolvere con base', cat:'Elettrodomestici', w:.45, d:.5, h:.12, c:'#26282b', draw:(g,W,D,H,C) => {
    fbox(g,.32,.11,.13,0,0,-D/2+.065,'#e9eaec',{ roughness:.4 }); fbox(g,.3,.06,.08,0,0,-D/2+.17,'#dfe1e3');
    gbox(g,.03,.01,.004,0,.08,-D/2+.132,gm('#d6ffd9','#4be06a',1.4,false));
    const r = Math.min(W, D-.15)/2-.01, z = D/2-r-.02;
    fcyl(g,r,.08,0,.01,z,C,{ roughness:.35 }); fcyl(g,r*.96,.004,0,.09,z,'#3a3d42',{ roughness:.2, metalness:.3 });
    fcyl(g,.045,.02,0,.09,z-r*.35,'#5b6067'); fbox(g,r*1.4,.04,.02,0,.02,z+r-.02,'#4a4d52');
    gbox(g,.03,.004,.01,0,.096,z+r*.4,gm('#cfe8ff','#4aa8ff',1.4,false));
    [-1,1].forEach(s => { const b = fcyl(g,.03,.004,s*r*.62,.004,z+r*.62,'#8a8f95'); b.scale.set(1,1,1); }); } },
  aspirapolvere:{ n:'Scopa elettrica con base', cat:'Elettrodomestici', w:.28, d:.25, h:1.15, c:'#5b4a8f', draw:(g,W,D,H,C) => {
    fbox(g,W,.03,D,0,0,0,'#d9dbde'); fbox(g,.06,H-.1,.03,0,0,-D/2+.02,'#d9dbde');
    fbox(g,W-.02,.05,.08,0,.03,.03,C); rod(g,.014,[0,.08,.03],[0,H-.3,.02],'#a5a9ae',INOX);
    fbox(g,.09,.22,.1,0,H-.32,.03,C); fbox(g,.03,.12,.04,0,H-.12,.0,'#2a2b2d'); } },
  cantinetta:{ n:'Cantinetta vini', cat:'Elettrodomestici', w:.6, d:.57, h:.85, c:'#1d1e21', draw:(g,W,D,H,C) => {
    fbox(g,W,H,D,0,0,0,C,{ roughness:.4 }); fbox(g,W-.06,H-.1,.01,0,.05,D/2+.002,'#9a8a80',{ transparent:true, opacity:.28, roughness:.05, depthWrite:false });
    gbox(g,W-.1,.008,.008,0,H-.08,D/2-.03,gm('#fff0d8','#ffb35a',1.2,false));
    for (let r=0;r<5;r++) for (let k=0;k<5;k++) fdisc(g,.03,.02,-W/2+.1+k*(W-.2)/4,.12+r*(H-.25)/4,D/2-.04,'#4a1a22'); } },
  stendino: { n:'Stendino per il bucato', cat:'Elettrodomestici', w:1.75, d:.55, h:1, c:'#e8e8e8', draw:(g,W,D,H,C) => {
    [-1,1].forEach(s => { rod(g,.01,[-W/2+.05,0,s*D/2],[-W/2+.15,H,0],C); rod(g,.01,[W/2-.05,0,s*D/2],[W/2-.15,H,0],C); });
    for (let k=0;k<8;k++) rod(g,.004,[-W/2+.15,H,-D/2+.05+k*(D-.1)/7],[W/2-.15,H,-D/2+.05+k*(D-.1)/7],C);
    rod(g,.008,[-W/2+.15,H,0],[W/2-.15,H,0],C);
    [['#7ea2c6',-.4],['#e8dcc6',.1],['#c66a5a',.5]].forEach(t => { const m = fbox(g,.35,.4,.006,t[1],H-.4,-.1,t[0],{ roughness:1, side:THREE.DoubleSide }); m.castShadow = true; }); } },
  /* clima */
  split:    { n:'Condizionatore (split a parete)', cat:'Clima', w:.85, d:.22, h:.3, z:2.3, c:ARIA, draw:(g,W,D,H,C) => {
    fbox(g,W,H-.06,D,0,.06,0,C,{ roughness:.35 }); fbox(g,W,.06,D-.05,0,0,-.025,shade(C,.94),{ roughness:.35 });
    const fl = fbox(g,W-.06,.012,.07,0,.03,D/2-.05,shade(C,.85)); fl.rotation.x = .5;
    fbox(g,W-.1,.006,.004,0,H*.62,D/2+.001,shade(C,.9));
    gbox(g,.04,.018,.004,W/2-.1,.1,D/2+.002,gm('#d6f5ff','#5fd0ff',1.2,false)); } },
  splitpavimento:{ n:'Climatizzatore portatile', cat:'Clima', w:.45, d:.38, h:.75, c:ARIA, draw:(g,W,D,H,C) => {
    fbox(g,W,H,D,0,.02,0,C,{ roughness:.4 }); for (let k=0;k<6;k++) fbox(g,W-.1,.008,.01,0,H-.18+k*.025,D/2+.004,shade(C,.82));
    LEGS4.forEach(p => fcyl(g,.02,.02,p[0]*(W/2-.05),0,p[1]*(D/2-.05),'#555'));
    rod(g,.06,[0,.4,-D/2],[0,.5,-D/2-.25],'#d9dcdf'); } },
  unitaesterna:{ n:'Unità esterna condizionatore', cat:'Clima', w:.8, d:.3, h:.6, c:'#e9e9e6', draw:(g,W,D,H,C) => {
    [-1,1].forEach(s => fbox(g,.06,.05,D+.04,s*(W/2-.08),0,0,'#7c8086'));
    fbox(g,W,H-.05,D,0,.05,0,C,{ roughness:.5 }); const cx = -W*.14, cy = .05+(H-.05)/2;
    fdisc(g,.22,.01,cx,cy,D/2+.002,'#2a2c2f'); for (let k=0;k<4;k++) fdisc(g,.22-k*.05,.004,cx,cy,D/2+.012,'#c9ccd0').scale.set(1,1,1);
    for (let k=0;k<3;k++){ const b = fbox(g,.02,.004,.36,cx,cy,D/2+.014,'#9aa0a6'); b.rotation.set(Math.PI/2,0,k*Math.PI/3); b.position.y = cy; }
    fbox(g,.14,.1,.02,W/2-.12,.12,D/2+.005,'#cfd2d4');
    [.16,.22].forEach(y => { rod(g,.01,[W/2,y,D/2-.06],[W/2+.06,y,D/2-.06],'#c38d58',INOX); rod(g,.01,[W/2+.06,y,D/2-.06],[W/2+.06,y,-D/2],'#c38d58',INOX); }); } },
  ventilatore:{ n:'Ventilatore a piantana', cat:'Clima', w:.42, d:.42, h:1.25, c:'#f2f2f0', draw:(g,W,D,H,C) => {
    fcyl(g,.17,.03,0,0,0,'#cfd2d4'); rod(g,.018,[0,0,0],[0,H-.22,0],'#cfd2d4'); fbox(g,.09,.1,.14,0,H-.27,-.06,C);
    const hd = new THREE.Group(); hd.position.set(0,H-.2,.04); g.add(hd);
    const cage = new THREE.Mesh(new THREE.TorusGeometry(.2,.008,6,32), fm('#cfd2d4')); hd.add(cage);
    fdisc(hd,.2,.002,0,0,-.03,C,{ transparent:true, opacity:.25, depthWrite:false }); fdisc(hd,.04,.05,0,0,0,C);
    for (let k=0;k<3;k++){ const p = new THREE.Group(); p.rotation.z = k*Math.PI*2/3; hd.add(p);
      const b = new THREE.Mesh(new THREE.SphereGeometry(1,12,6), fm('#a9c3d6',{ transparent:true, opacity:.85 })); b.scale.set(.06,.1,.008); b.position.y = .11; b.rotation.y = .3; p.add(b); } } },
  ventsoffitto:{ n:'Ventilatore a soffitto', cat:'Clima', w:1.3, d:1.3, h:.4, z:2.55, c:'#f2f1ee', draw:(g,W,D,H,C) => {
    fbox(g,.02,Math.max(.05, ceilH() - 2.55 - .12),.02,0,.12,0,C);
    fcyl(g,.1,.1,0,.02,0,C); const b = new THREE.Mesh(new THREE.SphereGeometry(.09,16,10,0,Math.PI*2,Math.PI/2,Math.PI/2), gm('#fff8ea','#ffd9a0',1.4,true)); b.position.y = .02; g.add(b);
    for (let k=0;k<4;k++){ const a = k*Math.PI/2, bl = fbox(g,W/2-.1,.012,.13,Math.cos(a)*(W/4+.05),.08,Math.sin(a)*(W/4+.05),'#b08a62'); bl.rotation.y = -a; } } },
  deumidificatore:{ n:'Deumidificatore', cat:'Clima', w:.35, d:.25, h:.6, c:ARIA, draw:(g,W,D,H,C) => {
    fbox(g,W,H,D,0,0,0,C,{ roughness:.4 }); fbox(g,W-.06,.2,.01,0,.06,D/2+.002,'#d9e4ec',{ transparent:true, opacity:.6 });
    for (let k=0;k<5;k++) fbox(g,W-.08,.008,.02,0,H-.02,-D/2+.04+k*.04,shade(C,.8));
    gbox(g,.05,.02,.004,0,H-.1,D/2+.004,gm('#d6f5ff','#5fd0ff',1.1,false)); } },
  termoarredo:{ n:'Scaldasalviette', cat:'Clima', w:.5, d:.08, h:1.2, z:.2, c:'#f4f4f2', draw:(g,W,D,H,C) => {
    [-1,1].forEach(s => fcyl(g,.018,H,s*(W/2-.02),0,0,C,{ roughness:.3 }));
    for (let k=0;k<14;k++){ const y = .05 + k*(H-.1)/13 + (k>8 ? .06 : 0); if (y > H-.03) continue; const r = rod(g,.011,[-W/2+.02,y,.0],[W/2-.02,y,.0],C,{ roughness:.3 }); }
    fbox(g,W*.6,.2,.02,0,H*.6,.03,'#c9d8e0',{ roughness:1 }); } },
  radiatoreart:{ n:'Termosifone', cat:'Clima', w:.9, d:.1, h:.65, z:.12, c:'#f4f4f2', draw:(g,W,D,H,C) => {
    const n = Math.max(3, Math.round(W/.08)); for (let k=0;k<n;k++) fbox(g,W/n-.012,H,D,-W/2+(k+.5)*W/n,0,0,C,{ roughness:.4 });
    fcyl(g,.02,.06,-W/2-.03,.0,0,'#c9ccd0',INOX); } },
  stufapellet:{ n:'Stufa a pellet', cat:'Clima', w:.5, d:.5, h:1, c:'#2b2b2d', draw:(g,W,D,H,C) => {
    fbox(g,W,H,D,0,0,0,C,{ roughness:.5, metalness:.3 }); fbox(g,W-.14,.35,.01,0,.35,D/2+.002,'#141416',{ roughness:.1 });
    gbox(g,W-.22,.12,.008,0,.38,D/2-.01,gm('#ffb060','#ff7a22',2.2,true)); fbox(g,W,.03,D,0,H-.03,0,'#3c3c3f'); } },
  /* piante */
  olivo:    { n:'Ulivo in vaso', cat:'Piante', w:.9, d:.9, h:2, c:'#7f8f62', draw:(g,W,D,H,C) => {
    pot(g,W*.33,W*.26,.5,'#b9a88f'); rod(g,.05,[0,.48,0],[.05,H*.55,.02],'#6b5a48'); rod(g,.03,[.05,H*.5,.02],[-.15,H*.68,.05],'#6b5a48');
    for (let i=0;i<14;i++){ const a = i*2.4, r = W*(.12+.25*((i*37)%10)/10), y = H*(.62+.3*((i*53)%10)/10);
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(.17+.05*(i%3),0), fm(i%2 ? C : shade(C,1.15),{ roughness:.9 }));
      s.scale.y = .7; s.position.set(Math.cos(a)*r, y, Math.sin(a)*r); s.castShadow = true; g.add(s); } } },
  limone:   { n:'Limone in vaso', cat:'Piante', w:.7, d:.7, h:1.5, c:'#3d6e32', draw:(g,W,D,H,C) => {
    pot(g,W*.34,W*.28,.42,'#b2633e'); rod(g,.035,[0,.4,0],[0,H*.5,0],'#5c4a3a');
    for (let i=0;i<10;i++){ const a = i*2.4, r = W*(.08+.22*((i*37)%10)/10), y = H*(.58+.3*((i*53)%10)/10);
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(.13,0), fm(shade(C,i%2 ? 1 : 1.12),{ roughness:.7 })); s.position.set(Math.cos(a)*r, y, Math.sin(a)*r); s.castShadow = true; g.add(s); }
    for (let i=0;i<7;i++){ const a = i*1.9+.4; fsph(g,.04,Math.cos(a)*W*.3,H*(.58+.06*(i%4)),Math.sin(a)*W*.3,'#f2c62b'); } } },
  palma:    { n:'Palma Kentia', cat:'Piante', w:.9, d:.9, h:1.8, c:'#3f7a3c', draw:(g,W,D,H,C) => {
    pot(g,.2,.16,.4,'#e9e5de');
    for (let i=0;i<9;i++){ const a = i*2.4, t = .55 + .4*((i*37)%10)/10, L = H*t - .4;
      const tip = [Math.cos(a)*W*.45*t, .4+L, Math.sin(a)*W*.45*t]; rod(g,.008,[0,.4,0],tip,'#4d6b2c');
      for (let k=1;k<6;k++){ const f = k/6, x = tip[0]*f, y = .4+L*f-(f*f*.15), z = tip[2]*f;
        [-1,1].forEach(s => leaf(g,x,y,z,.025,.17,.01,s*.9,-a,i%2 ? C : shade(C,1.15))); } } } },
  cactus:   { n:'Cactus', cat:'Piante', w:.35, d:.35, h:1, c:'#4c7d4a', draw:(g,W,D,H,C) => {
    pot(g,.15,.12,.25,'#c9b49a'); const m = { roughness:.8 };
    fcyl(g,.07,H-.4,0,.25,0,C,m); fsph(g,.07,0,H-.15,0,C);
    fcyl(g,.045,.25,.12,.55,0,C,m); fsph(g,.045,.12,.8,0,C); rod(g,.04,[0,.5,0],[.12,.55,0],C,m);
    fcyl(g,.04,.18,-.11,.45,.02,C,m); fsph(g,.04,-.11,.63,.02,C); rod(g,.035,[0,.42,0],[-.11,.45,.02],C,m); } },
  sansevieria:{ n:'Sansevieria', cat:'Piante', w:.35, d:.35, h:.85, c:'#3e6b3a', draw:(g,W,D,H,C) => {
    pot(g,.15,.13,.3,'#2f2f31');
    for (let i=0;i<11;i++){ const a = i*2.4, r = .02+.08*((i*37)%10)/10, h = .3+(H-.35)*(.6+.4*((i*53)%10)/10);
      const l = fbox(g,.05,h-.3,.008,Math.cos(a)*r,.3,Math.sin(a)*r,i%3 ? C : '#7e9a4f',{ roughness:.5 }); l.rotation.set(Math.sin(a)*.12,a,Math.cos(a)*.12); } } },
  ricadente:{ n:'Pianta ricadente (sospesa)', cat:'Piante', w:.4, d:.4, h:.7, z:1.5, c:'#4f8f3d', draw:(g,W,D,H,C) => {
    pot(g,.14,.1,.18,'#f1ece2'); [0,2.1,4.2].forEach(a => rod(g,.003,[Math.cos(a)*.13,.18,Math.sin(a)*.13],[0,Math.max(.4, ceilH()-1.5),0],'#d8c9a8'));
    for (let s=0;s<7;s++){ const a = s*.9; for (let k=0;k<6;k++){ const r = .12+k*.015, y = .16-k*.1;
      leaf(g,Math.cos(a)*r,y,Math.sin(a)*r,.035,.025,.035,.3,a,k%2 ? C : shade(C,1.2)); } } } },
  fioriera: { n:'Fioriera con lavanda', cat:'Piante', w:1, d:.35, h:.75, c:'#8a6bb8', draw:(g,W,D,H,C) => {
    fbox(g,W,.4,D,0,0,0,'#7c6a58',{ roughness:.95 }); fbox(g,W-.04,.02,D-.04,0,.38,0,'#3e3226');
    const n = Math.round(W*D*120);
    for (let i=0;i<n;i++){ const x = -W/2+.05+((i*.618)%1)*(W-.1), z = -D/2+.05+((i*.382+.13)%1)*(D-.1), h = .18+.14*((i*53)%10)/10, lx = ((i*7)%5-2)*.012;
      rod(g,.004,[x,.4,z],[x+lx,.4+h,z],'#6c8a5a'); fcyl(g,.014,.08,x+lx,.4+h,z,i%3 ? C : shade(C,1.15)); }
    for (let i=0;i<Math.round(W*8);i++) fsph(g,.06,-W/2+.08+((i*.618)%1)*(W-.16),.44,-D/2+.08+((i*.41)%1)*(D-.16),'#5f7d4f'); } },
  bonsai:   { n:'Piantina da tavolo', cat:'Piante', w:.2, d:.2, h:.3, z:.75, c:'#5e9a4c', draw:(g,W,D,H,C) => {
    pot(g,.07,.055,.1,'#d3c2ad'); for (let i=0;i<7;i++){ const a = i*2.4; leaf(g,Math.cos(a)*.04,.15+.03*(i%3),Math.sin(a)*.04,.03,.07,.012,Math.sin(a)*.5,-a,i%2 ? C : shade(C,1.15)); } } },
  /* luci */
  abatjour: { n:'Lampada da comodino', cat:'Illuminazione', w:.28, d:.28, h:.45, z:.5, c:'#efe6d6', draw:(g,W,D,H,C) => {
    fcyl(g,.07,.02,0,0,0,'#b08a5a',INOX); rod(g,.008,[0,0,0],[0,H-.18,0],'#b08a5a',INOX);
    const s = new THREE.Mesh(new THREE.CylinderGeometry(.09,W/2,.2,20,1,true), gm(C,'#ffd9a0',.9,true)); s.position.y = H-.1; g.add(s); } },
  applique: { n:'Applique a parete', cat:'Illuminazione', w:.18, d:.12, h:.2, z:1.8, c:'#2a2a2c', draw:(g,W,D,H,C) => {
    fbox(g,.08,.12,.02,0,.04,-D/2+.01,C); rod(g,.008,[0,.1,-D/2+.02],[0,.1,D/2-.04],C);
    const s = new THREE.Mesh(new THREE.CylinderGeometry(.04,.055,.1,16,1,true), gm('#fbf6ec','#ffd9a0',1,true)); s.position.set(0,.1,D/2-.05); g.add(s); } },
  lampadarco:{ n:'Lampada ad arco', cat:'Illuminazione', w:1.5, d:.4, h:2, c:'#c9ccd0', draw:(g,W,D,H,C) => {
    fbox(g,.3,.06,.3,-W/2+.15,0,0,'#efece6',{ roughness:.3 });
    const N = 12; let prev = [-W/2+.15,.06,0];
    for (let k=1;k<=N;k++){ const t = k/N, x = -W/2+.15 + t*(W-.3), y = .06 + Math.sin(t*Math.PI*.75)*(H-.1); const p = [x, y, 0]; rod(g,.012,prev,p,C,INOX); prev = p; }
    const s = new THREE.Mesh(new THREE.SphereGeometry(.2,20,10,0,Math.PI*2,0,Math.PI/2), fm(C,{ metalness:.6, roughness:.3, side:THREE.DoubleSide })); s.position.set(prev[0],prev[1]-.12,0); g.add(s);
    const b = new THREE.Mesh(new THREE.SphereGeometry(.05,10,8), gm('#fff6e0','#ffcf8a',2,true)); b.position.set(prev[0],prev[1]-.1,0); g.add(b); } },
  striscialed:{ n:'Striscia LED', cat:'Illuminazione', w:2, d:.02, h:.02, z:2.6, c:'#ffe2b0', draw:(g,W,D,H,C) => {
    gbox(g,W,H,D,0,0,0,gm('#fff4e0',C,1.6,false)); } },
  /* bagno */
  piattodoccia:{ n:'Doccia walk-in', cat:'Bagno', w:1.4, d:.9, h:2, c:'#e9e6e1', draw:(g,W,D,H,C) => {
    fbox(g,W,.03,D,0,0,0,C,{ roughness:.4 }); fbox(g,W-.3,.004,.05,0,.03,-D/2+.08,'#9aa0a6',INOX);
    fbox(g,W*.6,H-.05,.012,-W*.2,.03,D/2-.01,'#bfe0ee',GLS); fbox(g,.02,.02,D,-W*.2-W*.3+.01,H-.02,0,'#2a2a2c');
    fcyl(g,.12,.01,W*.25,H-.15,-D/2+.15,'#2a2a2c'); fbox(g,.02,H-.2,.02,W*.25,.1,-D/2+.03,'#2a2a2c'); } },
  cesto:    { n:'Cesto biancheria', cat:'Bagno', w:.4, d:.35, h:.6, c:'#c9b48f', draw:(g,W,D,H,C) => {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(W/2,W/2-.03,H,18,1,true), fm(C,{ roughness:1, side:THREE.DoubleSide })); c.position.y = H/2; c.castShadow = true; g.add(c);
    fcyl(g,W/2-.03,.01,0,0,0,shade(C,.8)); fcyl(g,W/2+.005,.03,0,H-.03,0,shade(C,.8)); } },
  mobilebagno:{ n:'Colonna bagno', cat:'Bagno', w:.35, d:.3, h:1.7, c:'#f3f1ec', draw:(g,W,D,H,C) => {
    fbox(g,W,H,D,0,0,0,C,{ roughness:.4 }); fbox(g,W-.02,.006,.01,0,H*.45,D/2+.002,shade(C,.8)); fbox(g,.012,.12,.016,W/2-.05,H*.55,D/2+.006,'#9aa0a6',INOX); } },
  /* esterno */
  ombrellone:{ n:'Ombrellone', cat:'Esterno', w:2.6, d:2.6, h:2.45, c:'#e8dfcc', draw:(g,W,D,H,C) => {
    fbox(g,.45,.08,.45,0,0,0,'#6d6f72'); rod(g,.025,[0,.08,0],[0,H-.05,0],'#8a7058');
    const c = new THREE.Mesh(new THREE.ConeGeometry(W/2,.4,8,1,true), fm(C,{ roughness:1, side:THREE.DoubleSide })); c.position.y = H-.25; c.castShadow = true; g.add(c); } },
  divanoesterno:{ n:'Divano da esterno', cat:'Esterno', w:1.9, d:.85, h:.7, c:'#e9e4da', draw:(g,W,D,H,C) => {
    const k = '#5a5f66'; fbox(g,W,.32,D,0,.06,0,k,{ roughness:.8 }); fbox(g,W,H-.06,.12,0,.06,-D/2+.06,k,{ roughness:.8 });
    [-1,1].forEach(s => fbox(g,.12,.55-.06,D,s*(W/2-.06),.06,0,k,{ roughness:.8 }));
    fbox(g,W-.26,.14,D-.18,0,.38,.06,C,{ roughness:1 }); fbox(g,W-.3,.32,.14,0,.45,-D/2+.18,C,{ roughness:1 });
    LEGS4.forEach(p => fbox(g,.04,.06,.04,p[0]*(W/2-.06),0,p[1]*(D/2-.06),'#333')); } },
  idromassaggio:{ n:'Minipiscina idromassaggio', cat:'Esterno', w:2.1, d:2.1, h:.85, c:'#6d5a48', draw:(g,W,D,H,C) => {
    fbox(g,W,H-.06,D,0,0,0,C,{ roughness:.85 });
    [-1,1].forEach(s => { fbox(g,W+.04,.06,.2,0,H-.06,s*(D/2-.08),'#d9d5cf'); fbox(g,.2,.06,D+.04,s*(W/2-.08),H-.06,0,'#d9d5cf'); });
    fbox(g,W-.3,.01,D-.3,0,H-.035,0,'#66c6d8',{ transparent:true, opacity:.8, roughness:.05 });
    gbox(g,W-.36,.006,D-.36,0,H-.45,0,gm('#c8f2ff','#3fbbe0',.6,true)); } },
  docciaesterna:{ n:'Doccia da esterno', cat:'Esterno', w:.5, d:.5, h:2.2, c:'#b9bdc1', draw:(g,W,D,H,C) => {
    fbox(g,W,.04,D,0,0,0,'#a97e55'); rod(g,.02,[0,.04,-D/2+.06],[0,H-.05,-D/2+.06],C,INOX);
    rod(g,.015,[0,H-.05,-D/2+.06],[0,H-.05,.05],C,INOX); fcyl(g,.1,.015,0,H-.08,.05,C,INOX); } },
  amaca:    { n:'Poltrona sospesa', cat:'Esterno', w:1, d:1, h:1.95, c:'#d8cbb4', draw:(g,W,D,H,C) => {
    fcyl(g,.38,.04,0,0,0,'#2a2a2c'); rod(g,.025,[0,.04,0],[0,H-.05,0],'#2a2a2c'); rod(g,.02,[0,H-.05,0],[.3,H-.15,0],'#2a2a2c');
    const s = new THREE.Mesh(new THREE.SphereGeometry(.42,22,14,Math.PI*.85,Math.PI*1.3), fm(C,{ roughness:1, side:THREE.DoubleSide }));
    s.scale.y = 1.25; s.position.set(.3,.95,0); s.castShadow = true; g.add(s); rod(g,.006,[.3,H-.15,0],[.3,.95+.52,0],'#2a2a2c');
    fcyl(g,.3,.1,.3,.62,.04,'#efe9de',{ roughness:1 }); } },
  /* decorazioni */
  specchioterra:{ n:'Specchio da terra', cat:'Decorazioni e tessili', w:.6, d:.3, h:1.7, c:'#b08a5a', draw:(g,W,D,H,C) => {
    const m = new THREE.Group(); m.position.set(0,0,-D/2+.15); m.rotation.x = -.12; g.add(m);
    fbox(m,W,H,.03,0,0,0,C,INOX); fbox(m,W-.06,H-.06,.01,0,.03,.016,'#c4ccd2',{ metalness:.3, roughness:.12 }); } },
  vasodeco: { n:'Vaso decorativo', cat:'Decorazioni e tessili', w:.3, d:.3, h:.7, c:'#d8cfc2', draw:(g,W,D,H,C) => {
    const pts = [[.0,0],[.1,0],[.14,.15],[.15,.35],[.08,.55],[.06,H]].map(p => new THREE.Vector2(p[0],p[1]));
    const v = new THREE.Mesh(new THREE.LatheGeometry(pts,20), fm(C,{ roughness:.6 })); v.castShadow = true; g.add(v);
    for (let i=0;i<5;i++){ const a = i*1.3; rod(g,.004,[0,H-.05,0],[Math.cos(a)*.15,H+.3+.1*(i%2),Math.sin(a)*.15],'#c9b58d'); } } },
  cuscinoterra:{ n:'Cuscini da terra', cat:'Decorazioni e tessili', w:1, d:.6, h:.18, c:'#b67e5c', draw:(g,W,D,H,C) => {
    const a = fbox(g,.55,H,.55,-W/2+.3,0,0,C,{ roughness:1 }); a.rotation.y = .2; const b = fbox(g,.45,H*.9,.45,W/2-.24,0,.05,shade(C,1.25),{ roughness:1 }); b.rotation.y = -.3; } },
  orologio:{ n:'Orologio da parete', cat:'Decorazioni e tessili', w:.4, d:.04, h:.4, z:1.9, c:'#f4f2ec', draw:(g,W,D,H,C) => {
    fdisc(g,W/2,D,0,H/2,0,'#2a2a2c'); fdisc(g,W/2-.02,D,0,H/2,.004,C);
    fbox(g,.012,.13,.006,0,H/2,D/2+.006,'#1b1b1d'); const m = fbox(g,.01,.1,.006,0,H/2,D/2+.01,'#1b1b1d'); m.rotation.z = -1.1; m.position.x = .045; } },
  /* animali */
  tiragraffi:{ n:'Tiragraffi per gatti', cat:'Animali', w:.55, d:.5, h:1.4, c:'#d9cbb3', draw:(g,W,D,H,C) => {
    fbox(g,W,.05,D,0,0,0,C,{ roughness:1 }); const sisal = '#c2a878';
    fcyl(g,.05,.55,-.12,.05,-.1,sisal,{ roughness:1 }); fcyl(g,.05,.85,.14,.05,.1,sisal,{ roughness:1 });
    fbox(g,.4,.04,.35,-.05,.6,-.05,C,{ roughness:1 }); fbox(g,.38,.05,.3,.08,.9,.08,C,{ roughness:1 });
    fcyl(g,.045,.45,.08,.95,.08,sisal,{ roughness:1 }); fcyl(g,.2,.06,.08,H-.06,.08,C,{ roughness:1 }); fsph(g,.04,-.2,.5,-.1,'#e86a5a'); } },
  lettiera:{ n:'Lettiera', cat:'Animali', w:.55, d:.42, h:.42, c:'#9aa2a8', draw:(g,W,D,H,C) => {
    fbox(g,W,.14,D,0,0,0,shade(C,.8),{ roughness:.6 });
    const t = new THREE.Mesh(new THREE.SphereGeometry(1,20,10,0,Math.PI*2,0,Math.PI/2), fm(C,{ roughness:.5 })); t.scale.set(W/2,H-.14,D/2); t.position.y = .14; t.castShadow = true; g.add(t);
    fdisc(g,.1,.02,0,.24,D/2-.03,'#3a3d41'); } },
  cuccia:   { n:'Cuccia / cuscino', cat:'Animali', w:.6, d:.5, h:.16, c:'#8a7a6c', draw:(g,W,D,H,C) => {
    const t = new THREE.Mesh(new THREE.TorusGeometry(.2,.07,10,24), fm(C,{ roughness:1 })); t.rotation.x = Math.PI/2; t.scale.set(W/.54,D/.54,1); t.position.y = .08; t.castShadow = true; g.add(t);
    fcyl(g,.2,.05,0,0,0,shade(C,1.25),{ roughness:1 }).scale.set(W/.5,1,D/.5); } },
  ciotole:  { n:'Ciotole', cat:'Animali', w:.35, d:.18, h:.07, c:'#c9ccd0', draw:(g,W,D,H,C) => {
    fbox(g,W,.015,D,0,0,0,'#e86a5a'); [-1,1].forEach(s => { const b = new THREE.Mesh(new THREE.CylinderGeometry(.07,.055,H-.015,18), fm(C,INOX)); b.position.set(s*W/4,(H-.015)/2+.015,0); g.add(b); fcyl(g,.055,.005,s*W/4,H-.02,0,s<0 ? '#7a5638' : '#a8d4e6'); }); } }
};
Object.assign(FURN, FURN2);
/* ordine delle categorie nel catalogo (per tipo di arredo, non per stanza) */
const CATS = ['Divani e sedute','Tavoli e scrivanie','Letti','Armadi e contenitori','TV e multimedia','Cucina','Elettrodomestici','Clima',
  'Illuminazione','Piante','Bagno','Esterno','Decorazioni e tessili','Animali'];

export { CATS, FURN, GLOW, fbox, fcyl };
