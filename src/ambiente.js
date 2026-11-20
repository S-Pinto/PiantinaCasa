import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { $, H, X, Z, clamp, polyArea, st } from './core.js';
import { MAING, camera, hemi, renderer, resize, scene, stage, sun } from './scene.js';
import { glassMat } from './materials.js';

/* Luce e resa: ora del giorno (sole, cielo, stelle, luci di casa), qualità grafica, post-produzione.
   Nord in alto nella piantina: x = est, z = sud. Il sole segue il percorso vero per la latitudine
   di Brindisi; "Orientamento" ruota il nord se la piantina non è allineata. */

const DEG = Math.PI / 180;
const LAT = 40.63 * DEG;            // Brindisi
/* mezzogiorno solare a Brindisi (17,9° E): 11:48 in ora solare, 12:48 con l’ora legale */
const SEASONS = { inverno:{ dec:-20, noon:11.8 }, mezza:{ dec:4, noon:12.8 }, estate:{ dec:22, noon:12.85 } };
const QUALITY = {
  alta:  { pr:2,   map:4096, post:true,  pointShadows:3 },
  media: { pr:1.5, map:2048, post:false, pointShadows:0 },
  bassa: { pr:1,   map:1024, post:false, pointShadows:0 }
};
const AMB_KEY = 'piantina-ambiente';
/* Dalla freccia della planimetria catastale: il nord è circa 25° a destra dell’alto della piantina,
   quindi il balcone su Via Verona guarda a sud-sud-ovest. */
const NORTH_PLAN = 25;
const ambState = { night:0 };      // letto da contesto.js per accendere le finestre del quartiere
const coarsePointer = !!(window.matchMedia && matchMedia('(pointer:coarse)').matches);

const amb = {
  preset: 'giorno', hour: 0, season: 'mezza',
  north: NORTH_PLAN,       // gradi: il nord vero rispetto all’alto della piantina (positivo = verso destra)
  quality: coarsePointer ? 'media' : 'alta',
  lights: 'auto',          // 'auto' | 'on' | 'off'
  context: true
};
try { Object.assign(amb, JSON.parse(localStorage.getItem(AMB_KEY) || '{}')); } catch(_){}
/* prima versione salvata: il nord era ancora in alto, lo porto a quello della planimetria catastale */
if (amb.v !== 2){ amb.north = NORTH_PLAN; amb.v = 2; }
if (!QUALITY[amb.quality]) amb.quality = 'alta';
if (!SEASONS[amb.season]) amb.season = 'mezza';
function saveAmb(){ try { localStorage.setItem(AMB_KEY, JSON.stringify(amb)); } catch(_){} }

/* ------------------------- Il sole ------------------------- */
function sunsetHour(season){
  const s = SEASONS[season], d = s.dec * DEG;
  return s.noon + Math.acos(clamp(-Math.tan(LAT) * Math.tan(d), -1, 1)) / DEG / 15;
}
function presetHour(p, season){
  const s = SEASONS[season], set = sunsetHour(season);
  if (p === 'tramonto') return set - 0.3;
  if (p === 'notte') return Math.min(23.6, set + 2.6);
  return s.noon + 1.6;                         // primo pomeriggio: ombre lunghe ma luce piena
}
/* direzione verso il sole (vettore unitario) e altezza sull’orizzonte in gradi */
const sunVec = new THREE.Vector3();
function sunAt(hour, season, north){
  const s = SEASONS[season], d = s.dec * DEG, h = (hour - s.noon) * 15 * DEG;
  const el = Math.asin(Math.sin(LAT)*Math.sin(d) + Math.cos(LAT)*Math.cos(d)*Math.cos(h));
  const az = Math.atan2(Math.sin(h), Math.cos(h)*Math.sin(LAT) - Math.tan(d)*Math.cos(LAT));   // da sud, positivo verso ovest
  const a = az + north * DEG;
  sunVec.set(-Math.sin(a) * Math.cos(el), Math.sin(el), Math.cos(a) * Math.cos(el));
  return el / DEG;
}
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function fmtHour(h){ h = ((h % 24) + 24) % 24; const m = Math.round(h * 60); return String(Math.floor(m/60) % 24).padStart(2,'0') + ':' + String(m % 60).padStart(2,'0'); }

/* ------------------------- Cielo, stelle, nebbia ------------------------- */
const sky = new Sky();
sky.scale.setScalar(1000);          // oltre il piano lontano: invisibile ai passaggi di occlusione, il cielo si disegna comunque all’infinito
sky.frustumCulled = false;
const skyU = sky.material.uniforms;
skyU.turbidity.value = 4; skyU.rayleigh.value = 1.4; skyU.mieCoefficient.value = 0.004; skyU.mieDirectionalG.value = 0.82;
if (skyU.cloudCoverage){ skyU.cloudCoverage.value = 0.32; skyU.cloudDensity.value = 0.35; skyU.cloudScale.value = 0.00025; }
scene.add(sky);

/* Cupola notturna: gradiente blu e stelle disegnate nello shader, dissolta in base all’altezza del sole */
const nightMat = new THREE.ShaderMaterial({
  uniforms: { uFade:{ value:0 }, uTime:{ value:0 } },
  vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); p.z = p.w; gl_Position = p; }`,
  fragmentShader: `uniform float uFade; uniform float uTime; varying vec3 vDir;
    float hash(vec3 p){ p = fract(p * 0.3183099 + .1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    void main(){
      float y = max(vDir.y, 0.0);
      vec3 col = mix(vec3(0.045,0.07,0.12), vec3(0.006,0.012,0.03), pow(y, 0.45));
      vec3 c = floor(vDir * 260.0);
      float h = hash(c);
      float star = step(0.9965, h) * smoothstep(0.02, 0.18, vDir.y);
      float tw = 0.65 + 0.35 * sin(uTime * 2.0 + h * 80.0);
      col += vec3(0.9,0.93,1.0) * star * tw * (0.6 + 2.4 * fract(h * 37.0));
      gl_FragColor = vec4(col, uFade);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  side: THREE.BackSide, transparent: true, depthWrite: false, fog: false
});
const nightDome = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), nightMat);
nightDome.frustumCulled = false; nightDome.renderOrder = -1;
scene.add(nightDome);

scene.fog = new THREE.Fog(0xcfdbe6, 90, 400);

/* ------------------------- Ambiente riflesso (PMREM dal cielo) ------------------------- */
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
const envSky = new Sky(); envSky.scale.setScalar(100);
envScene.add(envSky);
let envRT = null, envAt = -1, envT = 0;
function refreshEnv(force){
  const now = performance.now();
  if (!force && (Math.abs(envAt - amb.hour) < 0.04 || now - envT < 180)) return;
  envAt = amb.hour; envT = now;
  const u = envSky.material.uniforms;
  ['turbidity','rayleigh','mieCoefficient','mieDirectionalG'].forEach(k => { u[k].value = skyU[k].value; });
  u.sunPosition.value.copy(skyU.sunPosition.value);
  if (u.cloudCoverage) u.cloudCoverage.value = 0;
  const old = envRT;
  envRT = pmrem.fromScene(envScene, 0, 0.1, 200);
  scene.environment = envRT.texture;
  if (old) old.dispose();
}

/* ------------------------- Luci di casa ------------------------- */
const roomLights = new THREE.Group();
scene.add(roomLights);
let roomLightsRev = -1, roomLightsQ = '';
const WARM = new THREE.Color('#ffd3a1');   /* circa 2700 K, luce calda da casa */
function buildRoomLights(){
  roomLightsRev = st.rev; roomLightsQ = amb.quality;
  roomLights.children.slice().forEach(l => { roomLights.remove(l); if (l.shadow && l.shadow.map) l.shadow.map.dispose(); if (l.dispose) l.dispose(); });
  const rooms = st.plan.floors.filter(f => f.m !== 'ascensore' && !/scale/i.test(f.name))
    .map(f => {
      const a = polyArea(f.pts) * 0.0016;
      let cx = 0, cy = 0; f.pts.forEach(p => { cx += p[0]; cy += p[1]; }); cx /= f.pts.length; cy /= f.pts.length;
      return { f, a, cx, cy, out: /balcon|veranda|terrazz/i.test(f.name) };
    })
    .filter(r => r.a > 1.2)
    .sort((p, q) => q.a - p.a);
  const nShadow = QUALITY[amb.quality].pointShadows;
  let given = 0;
  rooms.forEach(r => {
    /* nelle stanze lunghe due punti luce */
    const xs = r.f.pts.map(p => p[0]), ys = r.f.pts.map(p => p[1]);
    const w = Math.max(...xs) - Math.min(...xs), d = Math.max(...ys) - Math.min(...ys);
    const spots = (!r.out && Math.max(w, d) > 2.6 * Math.min(w, d) && r.a > 6)
      ? (w > d ? [[r.cx - w/4, r.cy], [r.cx + w/4, r.cy]] : [[r.cx, r.cy - d/4], [r.cx, r.cy + d/4]])
      : [[r.cx, r.cy]];
    spots.forEach(s => {
      const l = new THREE.PointLight(WARM, 0, r.out ? 7 : 9, 2);
      l.position.set(X(s[0]), r.out ? 2.2 : H - 0.35, Z(s[1]));
      l.userData.base = (r.out ? 1.2 : 2.2 + Math.min(r.a, 30) * 0.12) / spots.length * (spots.length > 1 ? 1.3 : 1);
      if (!r.out && given < nShadow){
        given++;
        l.castShadow = true; l.shadow.mapSize.set(512, 512); l.shadow.bias = -0.002; l.shadow.radius = 4;
        l.shadow.camera.near = 0.1; l.shadow.camera.far = 9;
      }
      roomLights.add(l);
    });
  });
  st.shadowDirty = true;
}

/* ------------------------- Qualità e post-produzione ------------------------- */
let composer = null, aoPass = null, bloomPass = null;
function buildComposer(){
  const w = stage.clientWidth, h = stage.clientHeight, pr = renderer.getPixelRatio();
  const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  aoPass = new GTAOPass(scene, camera, w, h, undefined, { radius:0.45, distanceExponent:1.6, thickness:1.2, scale:1.1, samples:16 }, { lumaPhi:10, depthPhi:2, normalPhi:3, radius:4, rings:2, samples:16 });
  aoPass.blendIntensity = 0.9;
  composer.addPass(aoPass);
  bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.25, 0.55, 0.9);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  composer.setPixelRatio(pr); composer.setSize(w, h);
}
function applyQuality(){
  const q = QUALITY[amb.quality];
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pr));
  sun.shadow.mapSize.set(q.map, q.map);
  if (sun.shadow.map){ sun.shadow.map.dispose(); sun.shadow.map = null; }
  if (q.post && !composer) buildComposer();
  resize(); sizeComposer();
  roomLightsRev = -1;                // ricostruisco le luci: cambiano le ombre
  st.shadowDirty = true;
}
function sizeComposer(){
  if (!composer) return;
  const w = stage.clientWidth, h = stage.clientHeight;
  composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h);
}
new ResizeObserver(sizeComposer).observe(stage);

/* ------------------------- Ora del giorno: transizioni ------------------------- */
let hourTarget = presetHour(amb.preset, amb.season), hourFrom = hourTarget, hourT = 1, lastLook = '';
amb.hour = typeof amb.hour === 'number' && amb.hour > 4 ? amb.hour : hourTarget;
hourFrom = amb.hour; hourTarget = amb.hour;
const listeners = [];
function onAmbChange(fn){ listeners.push(fn); }
function setHour(h, animate){
  h = clamp(h, 5, 23.99);
  if (animate){ hourFrom = amb.hour; hourTarget = h; hourT = 0; }
  else { amb.hour = hourTarget = hourFrom = h; hourT = 1; }
  saveAmb();
  listeners.forEach(f => f());
}
function setPreset(p){
  amb.preset = p;
  setHour(presetHour(p, amb.season), true);
}
function setSeason(s){
  if (!SEASONS[s]) return;
  amb.season = s;
  if (amb.preset !== 'custom') setHour(presetHour(amb.preset, s), true); else { saveAmb(); listeners.forEach(f => f()); }
}
function setQuality(q){ if (!QUALITY[q]) return; amb.quality = q; saveAmb(); applyQuality(); listeners.forEach(f => f()); }
function setLights(v){ amb.lights = v; saveAmb(); lastLook = ''; listeners.forEach(f => f()); }
function setNorth(v){ amb.north = v; saveAmb(); lastLook = ''; listeners.forEach(f => f()); }
function presetOf(h){
  const set = sunsetHour(amb.season);
  if (h >= set + 0.9 || h < 5.8) return 'notte';
  if (h >= set - 1.2) return 'tramonto';
  return 'giorno';
}

const C1 = new THREE.Color(), C2 = new THREE.Color(), FOGC = new THREE.Color();
function applyAmbLook(){
  const el = sunAt(amb.hour, amb.season, amb.north);
  const day = smooth(-4, 8, el);                     // 0 notte, 1 giorno
  const low = 1 - smooth(2, 28, el);                 // luce radente e calda
  /* sole o luna */
  if (el > -3){
    sun.position.copy(sunVec).multiplyScalar(40);
    C1.set('#fff4e3'); C2.set('#ff9a52'); sun.color.copy(C1).lerp(C2, low * 0.85);
    sun.intensity = 5.2 * smooth(-3, 6, el);
  } else {
    sun.position.set(-14, 30, -12);
    sun.color.set('#9db4ff'); sun.intensity = 0.45;
  }
  sun.target.position.set(0, 0, 0);
  /* cielo diurno */
  skyU.sunPosition.value.copy(sunVec);
  skyU.rayleigh.value = 1.2 + low * 2.4;
  skyU.turbidity.value = 3.5 + low * 7;
  skyU.mieCoefficient.value = 0.004 + low * 0.006;
  sky.visible = el > -10;
  nightMat.uniforms.uFade.value = 1 - smooth(-9, 1, el);
  /* luce diffusa */
  C1.set('#dce8f6'); C2.set('#ffd0a8');
  hemi.color.copy(C1).lerp(C2, low * 0.6).lerp(new THREE.Color('#3a4f7a'), 1 - day);
  hemi.groundColor.set('#6f675c').lerp(new THREE.Color('#151a24'), 1 - day);
  hemi.intensity = 0.1 + 0.26 * day + 0.25 * low * day;
  scene.environmentIntensity = 0.006 + 0.016 * day;     /* il cielo di Sky è in HDR: ne basta poco */
  renderer.toneMappingExposure = 0.9 + (1 - day) * 0.5 + low * 0.15 * day;
  ambState.night = 1 - day;
  /* nebbia del colore dell’orizzonte */
  C1.set('#c9d8e6'); C2.set('#e7b48c'); FOGC.copy(C1).lerp(C2, low * day).lerp(new THREE.Color('#0b111d'), 1 - day);
  scene.fog.color.copy(FOGC);
  /* luci di casa */
  const k = amb.lights === 'on' ? 1 : amb.lights === 'off' ? 0 : 1 - smooth(-3, 7, el);
  roomLights.children.forEach(l => { l.intensity = l.userData.base * k; });
  /* di giorno le luci di casa sono spente: le tolgo del tutto, così ogni pixel non le calcola a vuoto */
  roomLights.visible = k > 0.001;
  glassMat.emissive.copy(WARM); glassMat.emissiveIntensity = 0.35 * k;
  if (bloomPass){ bloomPass.strength = 0.1 + 0.25 * (1 - day); bloomPass.threshold = day > 0.5 ? 1.0 : 0.85; }
  st.shadowDirty = true;
  refreshEnv(hourT >= 1);
  return el;
}

/* ------------------------- Un fotogramma ------------------------- */
let wallsScale = 1, wasEditing = false;
function ambFrame(dt){
  if (!st.plan) return;
  if (roomLightsRev !== st.rev || roomLightsQ !== amb.quality){ buildRoomLights(); lastLook = ''; }
  if (hourT < 1){
    hourT = Math.min(1, hourT + dt / 2.2);
    const k = hourT < .5 ? 4*hourT*hourT*hourT : 1 - Math.pow(-2*hourT+2, 3)/2;
    amb.hour = hourFrom + (hourTarget - hourFrom) * k;
    listeners.forEach(f => f());
  }
  const look = amb.hour.toFixed(3) + amb.season + amb.north + amb.lights + amb.quality;
  if (look !== lastLook){ lastLook = look; applyAmbLook(); if (hourT >= 1) refreshEnv(true); }
  nightMat.uniforms.uTime.value += dt;
  if (skyU.time) skyU.time.value += dt;
  /* ombre: ricalcolo solo se qualcosa si muove */
  const ws = MAING.w.scale.y;
  if (ws !== wallsScale || st.editing || wasEditing){ st.shadowDirty = true; wallsScale = ws; }
  wasEditing = st.editing;
  if (st.cmpId) renderer.shadowMap.autoUpdate = true;
  else { renderer.shadowMap.autoUpdate = false; if (st.shadowDirty){ renderer.shadowMap.needsUpdate = true; st.shadowDirty = false; } }
}
function renderView(){
  if (composer && QUALITY[amb.quality].post && !st.editing){ aoPass.enabled = !st.fastMotion; composer.render(); }
  else renderer.render(scene, camera);
}

/* ------------------------- Pannello "Luce" ------------------------- */
const apanel = $('apanel'), btnAmb = $('btnAmb');
function toggleAmb(open){
  apanel.hidden = !open; btnAmb.setAttribute('aria-expanded', String(open));
  if (open){ const mp = $('menu'); if (mp && !mp.hidden) $('btnMenu').click(); }
}
btnAmb.addEventListener('click', e => { e.stopPropagation(); toggleAmb(apanel.hidden); });
document.addEventListener('pointerdown', e => {
  if (!apanel.hidden && !apanel.contains(e.target) && !btnAmb.contains(e.target)) toggleAmb(false);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !apanel.hidden) toggleAmb(false); });
function bindSeg(id, attr, fn){
  $(id).querySelectorAll('button').forEach(b => b.addEventListener('click', () => fn(b.dataset[attr])));
}
document.querySelectorAll('[data-tod]').forEach(b => b.addEventListener('click', () => setPreset(b.dataset.tod)));
bindSeg('ambSeason', 'season', setSeason);
bindSeg('ambQ', 'q', setQuality);
bindSeg('ambLights', 'lights', setLights);
$('ambRange').addEventListener('input', e => { amb.preset = 'custom'; setHour(+e.target.value, false); });
$('ambNorth').addEventListener('input', e => setNorth(+e.target.value));
const TOD_ICON = { giorno:'#i-sun', tramonto:'#i-sunset', notte:'#i-moon' };
function syncAmbUi(){
  const p = presetOf(hourT < 1 ? hourTarget : amb.hour);
  document.querySelectorAll('[data-tod]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tod === p)));
  $('ambSeason').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.season === amb.season)));
  $('ambQ').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.q === amb.quality)));
  $('ambLights').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lights === amb.lights)));
  const r = $('ambRange'); if (document.activeElement !== r) r.value = amb.hour.toFixed(2);
  $('ambHour').textContent = fmtHour(amb.hour);
  $('ambNorth').value = amb.north; $('ambNorthV').textContent = (amb.north > 0 ? '+' : '') + amb.north + '°';
  $('ambSunset').textContent = 'Tramonto alle ' + fmtHour(sunsetHour(amb.season));
  btnAmb.querySelector('use').setAttribute('href', TOD_ICON[p]);
  btnAmb.querySelector('.vl').textContent = p === 'giorno' ? 'Giorno' : p === 'tramonto' ? 'Tramonto' : 'Notte';
}
onAmbChange(syncAmbUi);

function initAmbiente(){
  applyQuality();
  syncAmbUi();
}






export { amb, ambFrame, ambState, initAmbiente, renderView };
