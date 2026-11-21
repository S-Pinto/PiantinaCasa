import * as THREE from 'three';
import { $, CX, CY, H, S, X, Z, pointInPoly, polyArea, st } from './core.js';
import { MAING, renderer, scene } from './scene.js';
import { SEASONS, amb, sunAt, sunVec, sunsetHour } from './ambiente.js';
import { ctxG } from './contesto.js';
import { OUTDOOR, SKIP } from './misure.js';
import { roomLabel } from './casa.js';

/* Mappa del sole: quante ore di sole diretto prende ogni punto della casa in un giorno della stagione scelta.
   Per ogni mezz’ora fra alba e tramonto disegno la casa (muri, arredi, soffitti delle stanze e i palazzi vicini)
   vista dal sole in una piccola mappa di profondità, come fa la scheda video per le ombre; un punto è al sole
   se nessun oggetto gli sta davanti. Sui pavimenti compare una griglia colorata: dal blu (sempre in ombra)
   al giallo e all’arancio (molte ore di sole). Tutto si calcola nel telefono in meno di un secondo. */

const sunG = new THREE.Group(); sunG.visible = false; scene.add(sunG);
const SUN_RES = 512, SUN_STEP = 0.5, SUN_GRID = 10;          /* griglia ogni 10 px = 40 cm */
let sunOn = false, sunRev = -1, sunSeason = '', sunNorth = null, sunRooms = [];

/* materiale che scrive la profondità (0..1) nel canale rosso di una mappa a virgola mobile */
const depthMatSun = new THREE.ShaderMaterial({
  vertexShader:'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader:'void main(){ gl_FragColor = vec4(gl_FragCoord.z, 0.0, 0.0, 1.0); }',
  side:THREE.DoubleSide
});
const depthMatSunI = depthMatSun.clone();   /* per gli InstancedMesh */
depthMatSunI.vertexShader = 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }';

function sunPoints(){
  const pts = [], rooms = [];
  st.plan.floors.forEach(f => {
    if (!f.name || SKIP.test(f.name)) return;
    const xs = f.pts.map(p => p[0]), ys = f.pts.map(p => p[1]);
    const r = { f, out:OUTDOOR.test(f.name), n:0, sum:0 };
    for (let x = Math.min(...xs) + SUN_GRID / 2; x < Math.max(...xs); x += SUN_GRID)
      for (let y = Math.min(...ys) + SUN_GRID / 2; y < Math.max(...ys); y += SUN_GRID)
        if (pointInPoly(x, y, f.pts)){ pts.push({ x, y, r, h:0 }); r.n++; }
    rooms.push(r);
  });
  return { pts, rooms };
}

/* scena per la mappa di profondità: muri e arredi opachi, un soffitto sopra ogni stanza chiusa, i palazzi vicini */
function occluders(){
  const occ = new THREE.Scene(), add = (o) => {
    if (!o.visible) return;
    if (o.isMesh){
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      if (ms.every(m => m && (m.transparent && m.opacity < .6))) return;       /* il vetro lascia passare il sole */
      const c = o.isInstancedMesh ? new THREE.InstancedMesh(o.geometry, depthMatSunI, o.count) : new THREE.Mesh(o.geometry, depthMatSun);
      if (o.isInstancedMesh) c.instanceMatrix = o.instanceMatrix;
      c.matrixAutoUpdate = false; c.matrix.copy(o.matrixWorld); c.matrixWorld.copy(o.matrixWorld); c.frustumCulled = false;
      occ.add(c);
    }
    o.children.forEach(add);
  };
  scene.updateMatrixWorld(true);
  [MAING.w, MAING.u].forEach(add);
  if (ctxG.visible) add(ctxG);
  /* soffitti: le stanze chiuse hanno sopra il solaio, i balconi no */
  st.plan.floors.forEach(f => {
    if (!f.name || OUTDOOR.test(f.name)) return;
    const sh = new THREE.Shape(); f.pts.forEach((p, i) => { if (i) sh.lineTo(X(p[0]), -Z(p[1])); else sh.moveTo(X(p[0]), -Z(p[1])); });
    const g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, depthMatSun); m.position.y = H + 0.02; m.updateMatrixWorld(); occ.add(m);
  });
  return occ;
}

function computeSun(){
  sunRev = st.rev; sunSeason = amb.season; sunNorth = amb.north;
  const { pts, rooms } = sunPoints();
  const rt = new THREE.WebGLRenderTarget(SUN_RES, SUN_RES, { type:THREE.FloatType, depthBuffer:true });
  const buf = new Float32Array(SUN_RES * SUN_RES * 4);
  const occ = occluders();
  const cam = new THREE.OrthographicCamera(-20, 20, 20, -20, 1, 160);
  const c = new THREE.Vector3(X(CX), 0, Z(CY)), v = new THREE.Vector3();
  const set = sunsetHour(amb.season), rise = 2 * SEASONS[amb.season].noon - set;
  const prev = renderer.getRenderTarget(), prevTone = renderer.toneMapping, prevClear = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha();
  renderer.setClearColor(0xffffff, 1);
  let samples = 0;
  try {
    for (let h = rise + SUN_STEP / 2; h < set; h += SUN_STEP){
      if (sunAt(h, amb.season, amb.north) < 2) continue;                    /* sole troppo basso: dietro i palazzi e la foschia */
      samples++;
      cam.position.copy(c).addScaledVector(sunVec, 80); cam.up.set(0, 1, 0); cam.lookAt(c); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
      renderer.setRenderTarget(rt); renderer.clear(); renderer.render(occ, cam);
      renderer.readRenderTargetPixels(rt, 0, 0, SUN_RES, SUN_RES, buf);
      pts.forEach(p => {
        v.set(X(p.x), 0.12, Z(p.y)).project(cam);
        const px = Math.floor((v.x * .5 + .5) * SUN_RES), py = Math.floor((v.y * .5 + .5) * SUN_RES);
        if (px < 0 || py < 0 || px >= SUN_RES || py >= SUN_RES) return;
        const d = buf[(py * SUN_RES + px) * 4], z = v.z * .5 + .5;
        if (d >= z - 0.0015) p.h += SUN_STEP;
      });
    }
  } finally {
    renderer.setRenderTarget(prev); renderer.setClearColor(prevClear, prevA); renderer.toneMapping = prevTone;
    rt.dispose(); occ.traverse(o => { if (o.isMesh && o.geometry.type === 'ShapeGeometry') o.geometry.dispose(); });
  }
  pts.forEach(p => { p.r.sum += p.h; });
  sunRooms = rooms.filter(r => r.n);
  drawSun(pts);
  fillSun(samples);
}

/* colori: blu (ombra) → verde acqua → giallo → arancio (8 ore e più) */
const SUN_COLS = ['#3b5b8c', '#3f8f9a', '#8fbf6a', '#f0d04a', '#f39a2b', '#e4572e'];
function sunColor(h, out){
  const t = Math.min(1, h / 8) * (SUN_COLS.length - 1), i = Math.floor(t), k = t - i;
  return out.set(SUN_COLS[i]).lerp(new THREE.Color(SUN_COLS[Math.min(i + 1, SUN_COLS.length - 1)]), k);
}
function drawSun(pts){
  sunG.children.slice().forEach(o => { sunG.remove(o); o.geometry.dispose(); o.material.dispose(); });
  const q = SUN_GRID * S * 0.92, g = new THREE.PlaneGeometry(q, q); g.rotateX(-Math.PI / 2);
  const m = new THREE.MeshBasicMaterial({ transparent:true, opacity:.72, depthWrite:false, toneMapped:false });
  const im = new THREE.InstancedMesh(g, m, pts.length), m4 = new THREE.Matrix4(), col = new THREE.Color();
  pts.forEach((p, i) => { m4.makeTranslation(X(p.x), 0.13, Z(p.y)); im.setMatrixAt(i, m4); im.setColorAt(i, sunColor(p.h, col)); });
  im.renderOrder = 3; sunG.add(im);
}
const sunFmt = h => h.toFixed(1).replace('.', ',').replace(',0', '') + (h === 1 ? ' ora' : ' ore');
function fillSun(samples){
  const box = $('sunres'); box.textContent = '';
  const SEAS = { inverno:'un giorno d’inverno (21 dicembre)', mezza:'un giorno di primavera o autunno', estate:'un giorno d’estate (21 giugno)' };
  const p = document.createElement('p'); p.className = 'note';
  p.textContent = samples ? 'Ore di sole diretto in ' + SEAS[amb.season] + ', media per stanza:' : 'In questa stagione il sole è troppo basso per il calcolo.';
  box.appendChild(p);
  const ul = document.createElement('ul'); ul.className = 'mlist';
  /* stanze con lo stesso nome (i disimpegni) contano insieme */
  const by = {};
  sunRooms.forEach(r => {
    const lab = roomLabel(r.f), k = /disimpegno/i.test(r.f.name) ? lab : r.f.id;
    const g = by[k] || (by[k] = { name:lab, n:0, sum:0, area:0 }); g.n += r.n; g.sum += r.sum; g.area += polyArea(r.f.pts) * S * S;
  });
  /* due stanze con lo stesso nome (i letti, i balconi): le distinguo con la superficie */
  const seen = {}; Object.values(by).forEach(g => { seen[g.name] = (seen[g.name] || 0) + 1; });
  Object.values(by).forEach(g => { if (seen[g.name] > 1) g.name += ' · ' + Math.round(g.area) + ' m²'; });
  Object.values(by).sort((a, b) => b.sum / b.n - a.sum / a.n).forEach(r => {
    const li = document.createElement('li'), h = r.sum / r.n;
    const dot = document.createElement('span'); dot.className = 'sdot'; dot.style.background = '#' + sunColor(h, new THREE.Color()).getHexString();
    const n = document.createElement('span'); n.className = 'mn'; n.textContent = r.name;
    const a = document.createElement('span'); a.className = 'ma'; a.textContent = sunFmt(Math.round(h * 2) / 2);
    li.append(dot, n, a); ul.appendChild(li);
  });
  box.appendChild(ul);
}

function setSunMap(on){
  sunOn = on; $('sunbtn').setAttribute('aria-pressed', String(on));
  $('sunbtn').textContent = on ? 'Nascondi la mappa del sole' : 'Mappa del sole';
  $('sunres').hidden = !on; $('sunleg').hidden = !on;
  if (on) sunRev = -1;
}
$('sunbtn').addEventListener('click', () => setSunMap(!sunOn));

function sunFrame(){
  const vis = sunOn && !st.editing && st.mode !== 'walk';
  sunG.visible = vis;
  if (vis && (sunRev !== st.rev || sunSeason !== amb.season || sunNorth !== amb.north)){
    try { computeSun(); } catch(e){ console.error(e); setSunMap(false); $('sunres').hidden = false; $('sunres').textContent = 'Il calcolo del sole non funziona su questo dispositivo.'; }
    st.redraw = Math.max(st.redraw, 30);
  }
}

export { sunFrame };
