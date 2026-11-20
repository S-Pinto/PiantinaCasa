import * as THREE from 'three';
import { $ } from './core.js';

/* Renderer, scena, camera, luci e gruppi di oggetti. */

const canvas = $('c'), stage = $('stage');
/* Colori come in three r128: i valori esadecimali sono usati così come sono (niente conversione sRGB → lineare)
   e le luci hanno le intensità di allora (moltiplicate per π con l’illuminazione fisica attuale). */
THREE.ColorManagement.enabled = false;
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.2, 400);
camera.rotation.order = 'YXZ';

scene.add(new THREE.HemisphereLight(0xffffff, 0x8794a1, 0.8 * Math.PI));
const sun = new THREE.DirectionalLight(0xffffff, 0.85 * Math.PI);
sun.position.set(9, 21, 13);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
const sc = sun.shadow.camera; sc.left=-26; sc.right=26; sc.top=14; sc.bottom=-14; sc.near=1; sc.far=80;
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
scene.add(sun);

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
  camera.aspect = w / Math.max(1,h); camera.updateProjectionMatrix();
}
/* nel confronto le due versioni stanno una sopra l’altra se lo schermo è verticale */
function cmpVertical(){ return stage.clientHeight > stage.clientWidth * 1.1; }

export { CMPG, MAING, camera, canvas, cmpVertical, editG, labelsG, renderer, resize, scene, stage, staticG };
