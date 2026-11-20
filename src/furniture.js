import * as THREE from 'three';

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
    fbox(g,.03,H-.1,.03,W/2,.06,D/2,'#aeb4b9',{ metalness:.5 }); } },
  vasca:    { n:'Vasca', cat:'Bagno', w:1.7, d:.7, h:.55, c:'#f4f4f2', draw:(g,W,D,H,C) => {
    fbox(g,W,H,D,0,0,0,C); fbox(g,W-.14,.02,D-.14,0,H-.02,0,'#dfe6ea'); } }
};

export { FURN, fbox, fcyl };
