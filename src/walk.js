import { $, CX, CY, S, X, Z, clamp, pointInPoly, st } from './core.js';
import { cssVar, typing } from './dom.js';
import { camera, canvas } from './scene.js';
import { colliders } from './build.js';
import { applyLook } from './views.js';

/* Passeggiata in prima persona: movimento con collisioni, joystick, tastiera e minimappa. */

/* ------------------------- Passeggiata ------------------------- */
const RADIUS = 0.22;
const EYE = 1.62;
const keys = {};
const toPx = (x,z) => [x/S + CX, z/S + CY];

function roomAt(x,z){
  const p = toPx(x,z);
  for (let i = st.plan.floors.length - 1; i >= 0; i--){
    const f = st.plan.floors[i];
    if (f.name && pointInPoly(p[0], p[1], f.pts)) return f.name;
  }
  return 'Esterno';
}

function resolve(nx, nz){
  for (let it=0; it<4; it++){
    for (const b of colliders){
      const cx = clamp(nx, b.x0, b.x1), cz = clamp(nz, b.z0, b.z1);
      const ex = nx - cx, ez = nz - cz, d2 = ex*ex + ez*ez;
      if (d2 < RADIUS*RADIUS){
        if (d2 > 1e-9){ const d = Math.sqrt(d2); nx = cx + ex/d*RADIUS; nz = cz + ez/d*RADIUS; }
        else {
          const dl = nx-b.x0, dr = b.x1-nx, du = nz-b.z0, dd = b.z1-nz, mn = Math.min(dl,dr,du,dd);
          if (mn === dl) nx = b.x0 - RADIUS; else if (mn === dr) nx = b.x1 + RADIUS;
          else if (mn === du) nz = b.z0 - RADIUS; else nz = b.z1 + RADIUS;
        }
      }
    }
  }
  return [clamp(nx, X(-120), X(820)), clamp(nz, Z(30), Z(440))];
}
function blocked(x,z){
  for (const b of colliders){
    const cx = clamp(x,b.x0,b.x1), cz = clamp(z,b.z0,b.z1);
    if ((x-cx)*(x-cx)+(z-cz)*(z-cz) < (RADIUS-0.02)*(RADIUS-0.02)) return true;
  }
  return false;
}

const joy = { x:0, y:0 };
const vel = { x:0, z:0 };
let bob = 0, dragging = false, lx = 0, ly = 0;

function look(dx, dy, k){
  st.yaw -= dx * k;
  st.pitch = clamp(st.pitch - dy * k, -1.25, 1.25);
  applyLook();
}
document.addEventListener('pointerlockchange', () => {});

/* Puntatore sulla scena durante la passeggiata: trascina (o mouse catturato) per guardarsi intorno */
function walkPointerDown(e){
  dragging = true; lx = e.clientX; ly = e.clientY; canvas.focus();
  try { canvas.setPointerCapture(e.pointerId); } catch(_){}
  if (e.pointerType === 'mouse' && !document.pointerLockElement && canvas.requestPointerLock){
    try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch(_){}
  }
}
function walkPointerMove(e){
  if (document.pointerLockElement === canvas){ look(e.movementX || 0, e.movementY || 0, 0.0022); return; }
  if (!dragging) return;
  look(e.clientX - lx, e.clientY - ly, 0.005); lx = e.clientX; ly = e.clientY;
}
function walkPointerUp(){ dragging = false; }

const keyMap = { w:'f', arrowup:'f', s:'b', arrowdown:'b', a:'l', d:'r', arrowleft:'tl', arrowright:'tr' };
window.addEventListener('keydown', e => {
  if (typing(e.target)) return;
  if (st.mode !== 'walk') return;
  if (e.key === 'Shift') keys.shift = true;
  const k = keyMap[e.key.toLowerCase()];
  if (k){ keys[k] = true; e.preventDefault(); }
});
window.addEventListener('keyup', e => {
  if (e.key === 'Shift') keys.shift = false;
  const k = keyMap[e.key.toLowerCase()]; if (k) keys[k] = false;
});
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; joy.x = joy.y = 0; });

(function(){
  const el = $('joy'), kn = $('knob'), R = 40;
  let id = null;
  const upd = e => {
    const r = el.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width/2), dy = e.clientY - (r.top + r.height/2);
    const d = Math.hypot(dx,dy); if (d > R){ dx = dx/d*R; dy = dy/d*R; }
    joy.x = dx/R; joy.y = dy/R; kn.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
  };
  el.addEventListener('pointerdown', e => { id = e.pointerId; el.setPointerCapture(id); upd(e); });
  el.addEventListener('pointermove', e => { if (e.pointerId === id) upd(e); });
  const end = e => { if (e.pointerId !== id) return; id = null; joy.x = joy.y = 0; kn.style.transform = ''; };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
})();

/* Mappa */
const mm = $('mm'), mctx = mm.getContext('2d');
const whereEl = $('where');
const MB = { x0:36, y0:30, x1:696, y1:360 };
function mmScale(){ return Math.min(mm.width/(MB.x1-MB.x0), mm.height/(MB.y1-MB.y0)); }
function drawMap(){
  const W = mm.width, Hh = mm.height, sc = mmScale();
  const ox = (W - (MB.x1-MB.x0)*sc)/2, oy = (Hh - (MB.y1-MB.y0)*sc)/2;
  const mx = px => ox + (px - MB.x0)*sc, my = py => oy + (py - MB.y0)*sc;
  const ink = cssVar('--ink') || '#1c2630', acc = cssVar('--accent') || '#1f5f8b';
  mctx.clearRect(0,0,W,Hh);
  mctx.globalAlpha = .1; mctx.fillStyle = ink;
  st.plan.floors.forEach(f => {
    mctx.beginPath();
    f.pts.forEach((p,i) => { if (i === 0) mctx.moveTo(mx(p[0]), my(p[1])); else mctx.lineTo(mx(p[0]), my(p[1])); });
    mctx.closePath(); mctx.fill();
  });
  mctx.globalAlpha = .85;
  for (const b of colliders){
    const a = toPx(b.x0,b.z0), c = toPx(b.x1,b.z1);
    mctx.fillRect(mx(a[0]), my(a[1]), Math.max(1.2,(c[0]-a[0])*sc), Math.max(1.2,(c[1]-a[1])*sc));
  }
  mctx.globalAlpha = 1;
  const pp = toPx(camera.position.x, camera.position.z);
  const cx = mx(pp[0]), cy = my(pp[1]), fx = -Math.sin(st.yaw), fz = -Math.cos(st.yaw), a = Math.atan2(fz,fx);
  mctx.fillStyle = acc; mctx.globalAlpha = .28;
  mctx.beginPath(); mctx.moveTo(cx,cy); mctx.arc(cx,cy,34,a-0.6,a+0.6); mctx.closePath(); mctx.fill();
  mctx.globalAlpha = 1; mctx.beginPath(); mctx.arc(cx,cy,6,0,7); mctx.fill();
}
mm.addEventListener('pointerdown', e => {
  if (st.mode !== 'walk') return;
  const r = mm.getBoundingClientRect(), sc = mmScale(), k = mm.width / r.width;
  const ox = (mm.width - (MB.x1-MB.x0)*sc)/2, oy = (mm.height - (MB.y1-MB.y0)*sc)/2;
  const px = MB.x0 + ((e.clientX - r.left)*k - ox)/sc, py = MB.y0 + ((e.clientY - r.top)*k - oy)/sc;
  const x = X(px), z = Z(py);
  if (!blocked(x,z)){ camera.position.x = x; camera.position.z = z; vel.x = vel.z = 0; }
});

function walk(dt){
  const turn = (keys.tr?1:0) - (keys.tl?1:0);
  if (turn){ st.yaw -= turn * 1.8 * dt; applyLook(); }
  let f = (keys.f?1:0) - (keys.b?1:0) - joy.y;
  let r = (keys.r?1:0) - (keys.l?1:0) + joy.x;
  const len = Math.hypot(f,r); if (len > 1){ f /= len; r /= len; }
  const speed = keys.shift ? 4.0 : 2.0;
  const fx = -Math.sin(st.yaw), fz = -Math.cos(st.yaw), rx = Math.cos(st.yaw), rz = -Math.sin(st.yaw);
  const tx = (fx*f + rx*r) * speed, tz = (fz*f + rz*r) * speed;
  const k = 1 - Math.exp(-dt * 11);
  vel.x += (tx - vel.x) * k; vel.z += (tz - vel.z) * k;
  const dist = Math.hypot(vel.x, vel.z) * dt;
  if (dist > 1e-5){
    const steps = Math.max(1, Math.ceil(dist / 0.08));
    for (let i=0; i<steps; i++){
      const p = resolve(camera.position.x + vel.x*dt/steps, camera.position.z + vel.z*dt/steps);
      camera.position.x = p[0]; camera.position.z = p[1];
    }
  }
  const sp = Math.hypot(vel.x, vel.z);
  bob += sp * dt * 3.4;
  camera.position.y = EYE + (sp > .25 ? Math.sin(bob) * 0.012 * Math.min(1, sp/2) : 0);
  drawMap();
  const name = roomAt(camera.position.x, camera.position.z);
  if (whereEl.textContent !== name) whereEl.textContent = name;
}

export { EYE, vel, walk, walkPointerDown, walkPointerMove, walkPointerUp };
