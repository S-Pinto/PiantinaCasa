import * as THREE from 'three';
import { $, H, S, X, Z, pointInPoly, polyArea, st } from './core.js';
import { labelsG, scene } from './scene.js';
import { SKIP, boundSegs, misFmtA, roomWalls } from './misure.js';

/* Nomi delle stanze in 3D: un cartellino quasi trasparente sospeso sopra ogni stanza, sempre rivolto verso chi guarda,
   con il nome e la superficie netta. Si accendono e spengono col tasto "Nomi" (e dal menu); la scelta resta salvata.
   In modifica tornano i nomi scritti sul pavimento, che si possono spostare e correggere. */

const namesG = new THREE.Group();
scene.add(namesG);
const NAMES_KEY = 'piantina-nomi-3d';
st.namesOn = true;
try { const v = localStorage.getItem(NAMES_KEY); if (v !== null) st.namesOn = v === '1'; } catch(_){}
let namesRev = -1;
const NAME_Y = H + 0.75;

const nameTexCache = {};
function nameTexture(name, sub){
  const key = name + '|' + sub;
  if (nameTexCache[key]) return nameTexCache[key];
  const k = 2, f1 = 30 * k, f2 = 21 * k, padX = 18 * k, padY = 10 * k, gap = 4 * k;
  const cv = document.createElement('canvas'), g = cv.getContext('2d');
  const font1 = '700 ' + f1 + 'px Figtree, system-ui, sans-serif', font2 = '600 ' + f2 + 'px Figtree, system-ui, sans-serif';
  g.font = font1; const w1 = g.measureText(name).width;
  g.font = font2; const w2 = sub ? g.measureText(sub).width : 0;
  const w = Math.ceil(Math.max(w1, w2) + padX * 2), h = Math.ceil(padY * 2 + f1 + (sub ? gap + f2 : 0));
  cv.width = w; cv.height = h;
  const r = 16 * k;
  const path = () => { g.beginPath(); g.moveTo(r, 1); g.lineTo(w - r, 1); g.quadraticCurveTo(w - 1, 1, w - 1, r); g.lineTo(w - 1, h - r); g.quadraticCurveTo(w - 1, h - 1, w - r, h - 1);
    g.lineTo(r, h - 1); g.quadraticCurveTo(1, h - 1, 1, h - r); g.lineTo(1, r); g.quadraticCurveTo(1, 1, r, 1); g.closePath(); };
  path(); g.fillStyle = 'rgba(255,255,255,0.62)'; g.fill();
  g.lineWidth = 2 * k; g.strokeStyle = 'rgba(255,255,255,0.95)'; g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'top';
  g.font = font1; g.fillStyle = '#15202b'; g.fillText(name, w / 2, padY + 2);
  if (sub){ g.font = font2; g.fillStyle = '#3d4a57'; g.fillText(sub, w / 2, padY + f1 + gap + 2); }
  const tx = new THREE.CanvasTexture(cv);
  tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4; tx.userData = { aspect: w / h, h };
  return (nameTexCache[key] = tx);
}
const leaderMat = new THREE.LineBasicMaterial({ color:'#ffffff', transparent:true, opacity:.75, depthWrite:false, toneMapped:false });
const footMat = new THREE.MeshBasicMaterial({ color:'#ffffff', transparent:true, opacity:.85, depthWrite:false, toneMapped:false });
const footGeo = new THREE.RingGeometry(0.07, 0.12, 24).rotateX(-Math.PI / 2);

/* un cartellino per ogni nome scritto in pianta; la superficie somma i pavimenti con lo stesso nome più vicini a lui.
   Le abbreviazioni della planimetria ("Rip.", "Dis.") diventano il nome del pavimento ("Ripostiglio"). */
function roomTags(){
  const labs = st.plan.labels.filter(l => !l.g && l.text);
  const floors = st.plan.floors.filter(f => f.name && !SKIP.test(f.name));
  const tags = labs.map(l => ({ l, x:l.x, y:l.y, area:0, floors:[] }));
  const segs = boundSegs(), cen = f => { let x = 0, y = 0; f.pts.forEach(p => { x += p[0]; y += p[1]; }); return [x / f.pts.length, y / f.pts.length]; };
  floors.forEach(f => {
    const rw = roomWalls(f, segs), a = rw ? rw.area : polyArea(f.pts) * S * S, c = cen(f);
    let t = tags.find(t => pointInPoly(t.x, t.y, f.pts));
    if (!t){
      /* stesso nome: al cartellino più vicino che sta in un pavimento con quel nome */
      let bd = Infinity;
      tags.forEach(q => { if (!q.floors.length || q.floors[0].name !== f.name) return; const d = Math.hypot(q.x - c[0], q.y - c[1]); if (d < bd){ bd = d; t = q; } });
    }
    if (!t){ t = { l:null, x:c[0], y:c[1], area:0, floors:[] }; tags.push(t); }
    t.floors.push(f); t.area += a;
  });
  return tags.filter(t => t.floors.length || t.l).map(t => {
    const f = t.floors[0], lt = t.l ? t.l.text.trim() : '';
    const name = (!lt || (/\.$/.test(lt) && f)) ? (f ? f.name : lt) : lt;
    return { name, x:t.x, y:t.y, sub:t.area ? misFmtA(t.area) : '' };
  });
}

function buildNames(){
  namesRev = st.rev;
  namesG.children.slice().forEach(o => { namesG.remove(o); if (o.isLine) o.geometry.dispose(); if (o.isSprite) o.material.dispose(); });
  roomTags().forEach(t => {
    const tx = nameTexture(t.name, t.sub);
    const m = new THREE.SpriteMaterial({ map:tx, transparent:true, opacity:.96, depthTest:false, depthWrite:false, sizeAttenuation:false, toneMapped:false });
    const s = new THREE.Sprite(m);
    const hh = 0.00062 * tx.userData.h / 2;      /* altezza costante sullo schermo */
    s.scale.set(hh * tx.userData.aspect, hh, 1);
    s.center.set(0.5, 0);
    s.position.set(X(t.x), NAME_Y, Z(t.y)); s.renderOrder = 9;
    namesG.add(s);
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(X(t.x), 0.1, Z(t.y)), new THREE.Vector3(X(t.x), NAME_Y, Z(t.y))]);
    const l = new THREE.Line(g, leaderMat); l.renderOrder = 8; namesG.add(l);
    const d = new THREE.Mesh(footGeo, footMat); d.position.set(X(t.x), 0.1, Z(t.y)); d.renderOrder = 8; namesG.add(d);
  });
}

function setNames(on){
  st.namesOn = on;
  try { localStorage.setItem(NAMES_KEY, on ? '1' : '0'); } catch(_){}
  $('btnNames').setAttribute('aria-pressed', String(on));
  $('optLabels').checked = on;
}
$('btnNames').addEventListener('click', () => setNames(!st.namesOn));
$('optLabels').addEventListener('change', e => setNames(e.target.checked));
setNames(st.namesOn);

function namesFrame(){
  const floating = st.namesOn && !st.editing && st.mode !== 'walk' && !st.pano && !st.measSel;   /* con una stanza scelta nelle misure parlano le quote */
  if (floating && namesRev !== st.rev) buildNames();
  namesG.visible = floating;
  /* nomi scritti sul pavimento: in modifica sempre, mentre si cammina se i nomi sono accesi */
  const flat = st.editing || (st.namesOn && st.mode === 'walk');
  labelsG.children.forEach(m => { if (!m.userData.street) m.visible = flat; });
}

export { namesFrame };
