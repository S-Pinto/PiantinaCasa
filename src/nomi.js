import * as THREE from 'three';
import { $, H, S, X, Z, pointInPoly, polyArea, st } from './core.js';
import { camera, canvas, labelsG, scene } from './scene.js';
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
    return { name, x:t.x, y:t.y, area:t.area, sub:t.area ? misFmtA(t.area) : '' };
  });
}

/* ogni cartellino: due versioni (nome + m², solo nome), linea guida e piedino; la più grande ha la precedenza */
let tagItems = [];
function buildNames(){
  namesRev = st.rev; namesSizeKey = '';
  namesG.children.slice().forEach(o => { namesG.remove(o); if (o.isLine) o.geometry.dispose(); if (o.isSprite) o.material.dispose(); });
  tagItems = roomTags().sort((a, b) => b.area - a.area).map(t => {
    const mk = sub => {
      const tx = nameTexture(t.name, sub);
      const m = new THREE.SpriteMaterial({ map:tx, transparent:true, opacity:.96, depthTest:false, depthWrite:false, sizeAttenuation:false, toneMapped:false });
      const s = new THREE.Sprite(m); s.center.set(0.5, 0); s.position.set(X(t.x), NAME_Y, Z(t.y)); s.renderOrder = 9; s.userData.tex = tx;
      namesG.add(s); return s;
    };
    const full = mk(t.sub), short = mk('');
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(X(t.x), 0.1, Z(t.y)), new THREE.Vector3(X(t.x), NAME_Y, Z(t.y))]);
    const l = new THREE.Line(g, leaderMat); l.renderOrder = 8; namesG.add(l);
    const d = new THREE.Mesh(footGeo, footMat); d.position.set(X(t.x), 0.1, Z(t.y)); d.renderOrder = 8; namesG.add(d);
    return { full, short, l, d, anchor:new THREE.Vector3(X(t.x), NAME_Y, Z(t.y)) };
  });
}

/* dimensione in pixel che dipende dallo schermo: sul telefono cartellini più piccoli e, se lo spazio è poco, senza m².
   Poi, dal più grande al più piccolo, salto quelli che coprirebbero un cartellino già messo. */
let namesSizeKey = '';
const tagNdc = new THREE.Vector3();
function layoutNames(){
  const W = canvas.clientWidth || 1, Hh = canvas.clientHeight || 1;
  const small = W < 600, rowPx = small ? 13 : 17;       /* altezza della riga del nome, in pixel */
  const key = W + 'x' + Hh + '@' + camera.fov.toFixed(2);     /* in Pianta il campo visivo cambia: senza, i cartellini restano giganti */
  if (key !== namesSizeKey){
    namesSizeKey = key;
    tagItems.forEach(it => [it.full, it.short].forEach(s => {
      const tx = s.userData.tex, px = rowPx * tx.userData.h / 60;      /* 60 = riga del nome nella texture (disegnata al doppio) */
      const k = px / Hh * 2 * Math.tan(camera.fov * Math.PI / 360);     /* sizeAttenuation:false: scala in unità a distanza 1 */
      s.scale.set(k * tx.userData.aspect, k, 1);
      s.userData.wpx = px * tx.userData.aspect; s.userData.hpx = px;
    }));
  }
  const placed = [], fits = (x, y, w, h) => !placed.some(r => x < r[0] + r[2] && x + w > r[0] && y < r[1] + r[3] && y + h > r[1]);
  tagItems.forEach(it => {
    tagNdc.copy(it.anchor).project(camera);
    const sx = (tagNdc.x + 1) / 2 * W, sy = (1 - tagNdc.y) / 2 * Hh;
    let pick = null;
    for (const s of [it.full, it.short]){
      const w = s.userData.wpx + 4, h = s.userData.hpx + 2, x = sx - w / 2, y = sy - h;
      if (tagNdc.z < 1 && fits(x, y, w, h)){ pick = s; placed.push([x, y, w, h]); break; }
    }
    it.full.visible = pick === it.full; it.short.visible = pick === it.short;
    it.l.visible = it.d.visible = !!pick && !small;
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
  const floating = st.namesOn && !st.editing && st.mode !== 'walk' && !st.pano && !st.measOn;   /* con le misure accese parlano le quote */
  if (floating && namesRev !== st.rev) buildNames();
  namesG.visible = floating;
  if (floating) layoutNames();
  /* nomi scritti sul pavimento: in modifica sempre, mentre si cammina se i nomi sono accesi */
  const flat = st.editing || (st.namesOn && st.mode === 'walk');
  /* in modifica (vista dall’alto) i nomi stanno sopra agli arredi, così non spariscono sotto un divano */
  labelsG.children.forEach(m => { if (!m.userData.street){ m.visible = flat; m.material.depthTest = !st.editing; m.renderOrder = st.editing ? 7 : 2; } });
}

export { namesFrame, roomTags };
