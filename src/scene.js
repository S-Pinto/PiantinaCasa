import * as THREE from 'three';
import { $, st } from './core.js';

/* Renderer, scena, camera, luci e gruppi di oggetti. */

const canvas = $('c'), stage = $('stage');
/* Colori e luci fisicamente corretti: i colori esadecimali sono in sRGB, il calcolo avviene in lineare,
   il tone mapping (Khronos PBR Neutral) comprime le alte luci come una macchina fotografica. Luci, cielo e ombre
   cambiano con l’ora del giorno in ambiente.js. */
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true, powerPreference:'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;   /* conserva i colori veri di pavimenti e finiture */
renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;     /* la casa è ferma: ricalcolo le ombre solo quando cambia qualcosa */

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.2, 420);
camera.rotation.order = 'YXZ';

const hemi = new THREE.HemisphereLight(0xdfe9f5, 0x6f675c, 0.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.position.set(9, 21, 13);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
const sc = sun.shadow.camera; sc.left=-17; sc.right=17; sc.top=17; sc.bottom=-17; sc.near=1; sc.far=90;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.025; sun.shadow.radius = 3;
scene.add(sun, sun.target);

const staticG = new THREE.Group();   // base, strada, scale (non modificabili)
/* Pavimenti e parapetti (f), pareti, serramenti, porte e colonne (w), arredi (u) */
const MAING = { f:new THREE.Group(), w:new THREE.Group(), u:new THREE.Group() };
const labelsG = new THREE.Group();
const editG   = new THREE.Group();   // evidenziazioni dell’editor
scene.add(staticG, MAING.f, MAING.w, labelsG, editG);
scene.add(MAING.u);
/* Seconda copia di pavimenti, pareti e arredi: serve al confronto affiancato fra due versioni */
const CMPG  = { f:new THREE.Group(), w:new THREE.Group(), u:new THREE.Group() };
CMPG.f.visible = CMPG.w.visible = CMPG.u.visible = false;
scene.add(CMPG.f, CMPG.w, CMPG.u);


function resize(){
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1,h);
  if (st.mode === 'walk') camera.fov = walkFov(camera.aspect);
  camera.updateProjectionMatrix();
}
/* Campo visivo della passeggiata. 75° in verticale vanno bene su uno schermo orizzontale; sul telefono
   in verticale lascerebbero solo 38° in orizzontale, come guardare in un tubo, e le stanze sembrano strette.
   Lì allargo fino a 100° in verticale (circa 58° in orizzontale). */
function walkFov(aspect){
  if (aspect >= 1) return 75;
  const v = 2 * Math.atan(Math.tan(35 * Math.PI / 180) / aspect) * 180 / Math.PI;
  return Math.max(75, Math.min(100, v));
}
/* nel confronto le due versioni stanno una sopra l’altra se lo schermo è verticale */
function cmpVertical(){ return stage.clientHeight > stage.clientWidth * 1.1; }

export { CMPG, MAING, camera, canvas, cmpVertical, editG, hemi, labelsG, renderer, resize, scene, stage, staticG, sun, walkFov };
