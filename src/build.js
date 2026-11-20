import * as THREE from 'three';
import { H, HEAD, S, SILL, X, Z, clamp, pointInPoly, st } from './core.js';
import { CMPG, MAING, labelsG, staticG } from './scene.js';
import { TEXDEF, toTex } from './textures.js';
import { FLOORS, doorColorMat, doorMat, finishMat, finishMatD, flatMat, floorMatFor, frameMat, glassMat, mat, parSide, parTop, stairMat, tileOf, wallMatsFor, wallTop } from './materials.js';
import { FURN } from './furniture.js';
import { isH, variantPlan, wallT } from './model.js';
import { syncVariants } from './variants.js';
import { rebuildSys } from './impianti.js';

/* ------------------------- Utilità di costruzione ------------------------- */
const colliders = [], staticColliders = [];
/* Gruppi in cui costruisco: quelli principali, o quelli del confronto durante buildCmp */
let floorsG = MAING.f, wallsG = MAING.w, furnG = MAING.u;

/* tile: un numero (tutte le facce) oppure 6 numeri, uno per faccia (+x,-x,+y,-y,+z,-z); 0 = lascia com'è */
function worldUV(mesh, tile){
  const tiles = Array.isArray(tile) ? tile : [tile,tile,tile,tile,tile,tile];
  const g = mesh.geometry, pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
  const ox = mesh.position.x, oy = mesh.position.y, oz = mesh.position.z;
  for (let f=0; f<6; f++){
    const t = tiles[f]; if (!t) continue;
    for (let i=f*4; i<f*4+4; i++){
      const x = pos.getX(i) + ox, y = pos.getY(i) + oy, z = pos.getZ(i) + oz;
      let u, v;
      if (Math.abs(nor.getY(i)) > .5){ u = x; v = z; }
      else if (Math.abs(nor.getX(i)) > .5){ u = z; v = y; }
      else { u = x; v = y; }
      uv.setXY(i, u/t, v/t);
    }
  }
  uv.needsUpdate = true;
}
function box(x0,x1,y0,y1,h0,h1,m,parent,cast,recv,uvTile){
  const g = new THREE.BoxGeometry((x1-x0)*S, h1-h0, (y1-y0)*S);
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(X((x0+x1)/2), (h0+h1)/2, Z((y0+y1)/2));
  mesh.castShadow = cast !== false; mesh.receiveShadow = recv !== false;
  if (uvTile) worldUV(mesh, uvTile);
  parent.add(mesh);
  return mesh;
}
function collide(x0,x1,y0,y1,arr){ (arr || colliders).push({ x0:X(x0), x1:X(x1), z0:Z(y0), z1:Z(y1) }); }
function clearGroup(g, disposeMats){
  for (let i = g.children.length - 1; i >= 0; i--){
    const c = g.children[i];
    c.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (disposeMats && o.material) o.material.dispose();
    });
    g.remove(c);
  }
}

/* ------------------------- Costruzione della scena dal modello ------------------------- */
function buildFloor(f){
  const m = FLOORS[f.m] || FLOORS.parquet;
  const top = f.top !== undefined ? f.top : (m.top !== undefined ? m.top : .06), bottom = -0.02;
  const sh = new THREE.Shape();
  f.pts.forEach((p,i) => { const x = X(p[0]), y = -Z(p[1]); if (i === 0) sh.moveTo(x,y); else sh.lineTo(x,y); });
  const g = new THREE.ExtrudeGeometry(sh, { depth: top - bottom, bevelEnabled:false });
  g.rotateX(-Math.PI/2);
  const mesh = new THREE.Mesh(g, floorMatFor(f));
  mesh.position.y = bottom; mesh.receiveShadow = true;
  floorsG.add(mesh);
}

function buildWall(w, wi){
  const t = wallT(w), horiz = isH(w), eps = ((wi || 0) % 6 + 1) * 0.06;   // spessore leggermente diverso per muro: niente facce sovrapposte (sfarfallio)
  const c = horiz ? w.y1 : w.x1;
  const a = horiz ? w.x1 : w.y1, b = horiz ? w.x2 : w.y2;
  if (b - a < 0.5) return;
  /* lato a = nord (muro orizzontale) o ovest (verticale); lato b = sud o est */
  const sa = w.sa || { col:w.col, tx:w.tx }, sb = w.sb || { col:w.col, tx:w.tx };
  const mE = finishMat(w.col, w.tx), mA = finishMat(sa.col, sa.tx), mB = finishMat(sb.col, sb.tx);
  const tE = tileOf(w.tx), tA = tileOf(sa.tx), tB = tileOf(sb.tx);
  const wm  = horiz ? [mE,mE,wallTop,mE,mB,mA] : [mB,mA,wallTop,mE,mE,mE];
  const uvT = horiz ? [tE,tE,0,0,tB,tA]       : [tB,tA,0,0,tE,tE];
  /* rivestimento solo in basso (fascia): sopra l'altezza scelta resta il colore del muro o il colore "sopra" */
  const hA = sa.h || 0, hB = sb.h || 0;
  const upA = hA ? (sa.tcol ? finishMat(sa.tcol) : mE) : mA, upB = hB ? (sb.tcol ? finishMat(sb.tcol) : mE) : mB;
  const tUpA = hA ? (sa.tcol ? 0 : tE) : tA, tUpB = hB ? (sb.tcol ? 0 : tE) : tB;
  const bandM = b1 => { const x = (hA && b1 > hA + 1e-6) ? upA : mA, y = (hB && b1 > hB + 1e-6) ? upB : mB; return horiz ? [mE,mE,wallTop,mE,y,x] : [y,x,wallTop,mE,mE,mE]; };
  const bandU = b1 => { const x = (hA && b1 > hA + 1e-6) ? tUpA : tA, y = (hB && b1 > hB + 1e-6) ? tUpB : tB; return horiz ? [tE,tE,0,0,y,x] : [y,x,0,0,tE,tE]; };

  const ops = (w.ops || []).map(o => Object.assign({}, o, { lo:o.p - o.w/2, hi:o.p + o.w/2 }))
    .filter(o => o.lo >= a - 0.01 && o.hi <= b + 0.01).sort((p,q) => p.lo - q.lo);
  const iv = []; let last = -Infinity;
  ops.forEach(o => { if (o.lo >= last - 0.01){ iv.push(o); last = o.hi; } });

  const part = (lo,hi,h0,h1,th,m,solid) => {
    const tt = (th === t) ? th + eps : th;
    const emit = (a0,a1,mm,uv) => horiz
      ? box(lo,hi,c-tt/2,c+tt/2,a0,a1,mm,wallsG, solid !== false, true, uv)
      : box(c-tt/2,c+tt/2,lo,hi,a0,a1,mm,wallsG, solid !== false, true, uv);
    if (m === wm && (hA || hB)){
      const cuts = [h0, h1];
      [hA, hB].forEach(x => { if (x > h0 + 0.001 && x < h1 - 0.001 && cuts.indexOf(x) < 0) cuts.push(x); });
      cuts.sort((p,q) => p - q);
      for (let i=0; i<cuts.length-1; i++) emit(cuts[i], cuts[i+1], bandM(cuts[i+1]), bandU(cuts[i+1]));
    } else emit(h0, h1, m, m === wm ? uvT : 0);
    if (solid === true && h0 === 0){ if (horiz) collide(lo,hi,c-th/2,c+th/2); else collide(c-th/2,c+th/2,lo,hi); }
  };
  const solidPiece = (lo,hi,h0,h1) => { if (hi - lo > 0.01) part(lo,hi,h0,h1,t,wm,true); };
  const lintel = (lo,hi,h0,h1) => part(lo,hi,h0,h1,t,wm,'nocol');

  const frame = (lo,hi,h0,h1) => {
    const ft = 3, fw = 1.6;
    part(lo,lo+fw,h0,h1,ft,frameMat,false);
    part(hi-fw,hi,h0,h1,ft,frameMat,false);
    part(lo,hi,h1-0.05,h1,ft,frameMat,false);
    if (h0 > 0) part(lo,hi,h0,h0+0.05,ft,frameMat,false);
    const mid = (lo+hi)/2;
    part(mid-fw/2,mid+fw/2,h0,h1,ft,frameMat,false);
    if (horiz) box(lo+fw,hi-fw,c-0.35,c+0.35,h0,h1,glassMat,wallsG,false,false);
    else box(c-0.35,c+0.35,lo+fw,hi-fw,h0,h1,glassMat,wallsG,false,false);
  };
  const leaf = o => {
    const lw = (o.hi - o.lo) * S - 0.03;
    const grp = new THREE.Group();
    let geo, off;
    if (horiz){ geo = new THREE.BoxGeometry(lw, 2.05, 0.04); off = [lw/2, 1.025, 0]; grp.position.set(X(o.lo), 0, Z(c)); }
    else      { geo = new THREE.BoxGeometry(0.04, 2.05, lw); off = [0, 1.025, lw/2]; grp.position.set(X(c), 0, Z(o.lo)); }
    const m = new THREE.Mesh(geo, o.col ? doorColorMat(o.col) : doorMat);
    m.position.set(off[0], off[1], off[2]); m.castShadow = true; m.receiveShadow = true;
    grp.add(m); grp.rotation.y = 1.25 * (o.s || 1);
    wallsG.add(grp);
  };

  let cur = a - t/2 - 0.04;
  iv.forEach(o => {
    solidPiece(cur, o.lo, 0, H);
    cur = o.hi;
    if (o.t === 'win'){ solidPiece(o.lo, o.hi, 0, SILL); lintel(o.lo, o.hi, HEAD, H); frame(o.lo, o.hi, SILL, HEAD); }
    else if (o.t === 'pf'){ lintel(o.lo, o.hi, HEAD, H); frame(o.lo, o.hi, 0, HEAD); }
    else if (o.t === 'door'){ lintel(o.lo, o.hi, HEAD, H); leaf(o); }
    else { lintel(o.lo, o.hi, HEAD, H); }
  });
  solidPiece(cur, b + t/2 + 0.04, 0, H);
}

function buildColumn(c){
  box(c.x0,c.x1,c.y0,c.y1,0,H,wallMatsFor(c.col,c.tx),wallsG,true,true,c.tx ? TEXDEF[c.tx].tile : 0);
  collide(c.x0,c.x1,c.y0,c.y1);
}

function buildRail(r){
  const t = 8;
  for (let i=0; i<r.pts.length-1; i++){
    const a = r.pts[i], b = r.pts[i+1];
    const horiz = Math.abs(b[1]-a[1]) <= Math.abs(b[0]-a[0]);
    /* lato a = nord/ovest, lato b = sud/est */
    const ra = r.sa || { col:r.col, tx:r.tx }, rb = r.sb || { col:r.col, tx:r.tx };
    const rE = finishMatD(r.col, r.tx, parSide), rA = finishMatD(ra.col, ra.tx, parSide), rB = finishMatD(rb.col, rb.tx, parSide);
    const rM  = horiz ? [rE,rE,parTop,rE,rB,rA] : [rB,rA,parTop,rE,rE,rE];
    const rUV = horiz ? [tileOf(r.tx),tileOf(r.tx),0,0,tileOf(rb.tx),tileOf(ra.tx)] : [tileOf(rb.tx),tileOf(ra.tx),0,0,tileOf(r.tx),tileOf(r.tx)];
    if (r.kind === 'fence'){
      buildFence(r, a, b, horiz);
    } else if (r.kind === 'glazed'){
      const sill = 0.9, pitchPx = 40;
      const lo = (horiz ? Math.min(a[0],b[0]) : Math.min(a[1],b[1])) - t/2;
      const hi = (horiz ? Math.max(a[0],b[0]) : Math.max(a[1],b[1])) + t/2;
      const c = horiz ? a[1] : a[0];
      const put = (p,q,h0,h1,th,m,cast,recv,uv) => horiz
        ? box(p,q,c-th/2,c+th/2,h0,h1,m,wallsG,cast,recv,uv) : box(c-th/2,c+th/2,p,q,h0,h1,m,wallsG,cast,recv,uv);
      put(lo,hi,0,sill,5,rM,true,true,rUV);
      if (horiz) collide(lo,hi,c-2.5,c+2.5); else collide(c-2.5,c+2.5,lo,hi);
      put(lo,hi,sill,H,0.7,glassMat,false,false);
      put(lo,hi,sill,sill+0.05,3,frameMat,false,true);
      put(lo,hi,H-0.06,H,3,frameMat,false,true);
      const n = Math.max(1, Math.round((hi-lo)/pitchPx));
      for (let k=0; k<=n; k++){ const q = lo + k*(hi-lo)/n; put(q-0.8,q+0.8,sill,H,3,frameMat,false,true); }
    } else {
      if (horiz){
        const lo = Math.min(a[0],b[0]) - t/2, hi = Math.max(a[0],b[0]) + t/2, c = a[1];
        box(lo,hi,c-t/2,c+t/2,0,clamp(r.h || 1, .3, 2),rM,floorsG,true,true,rUV); collide(lo,hi,c-t/2,c+t/2);
      } else {
        const lo = Math.min(a[1],b[1]) - t/2, hi = Math.max(a[1],b[1]) + t/2, c = a[0];
        box(c-t/2,c+t/2,lo,hi,0,clamp(r.h || 1, .3, 2),rM,floorsG,true,true,rUV); collide(c-t/2,c+t/2,lo,hi);
      }
    }
  }
}

/* Ringhiera: corrimano, montanti, traverso e sbarre (le sbarre sono una texture con trasparenza) */
const metalCache = {}, barMatCache = {};
function metalMat(c){ return metalCache[c] || (metalCache[c] = mat(c, { roughness:.5, metalness:.15 })); }
let barTexture = null;
function barMat(c){
  if (!barTexture){
    const cv = document.createElement('canvas'); cv.width = 16; cv.height = 16;
    const g = cv.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(6, 0, 3, 16);
    barTexture = toTex(cv);
  }
  return barMatCache[c] || (barMatCache[c] = new THREE.MeshStandardMaterial({ color:c, map:barTexture, alphaTest:.5, side:THREE.DoubleSide, roughness:.5, metalness:.15 }));
}
function buildFence(r, a, b, horiz){
  const h = clamp(r.h || 1.0, .4, 1.6), col = r.col || '#3b4048', base = clamp(r.base || 0, 0, h - 0.3);
  const mm = metalMat(col), bm = barMat(col);
  const c = horiz ? a[1] : a[0];
  const lo = horiz ? Math.min(a[0],b[0]) : Math.min(a[1],b[1]), hi = horiz ? Math.max(a[0],b[0]) : Math.max(a[1],b[1]);
  if (hi - lo < 1) return;
  /* muretto in cemento chiaro con copertina, come sul terrazzo vero; sopra la ringhiera zincata */
  if (base > 0){
    const bt = 6, bw = flatMat(r.bcol || '#e6dcc9', .85), cap = flatMat('#efe8da', .7);
    const wall = (p,q,th,h0,h1,m) => horiz ? box(p,q,c-th/2,c+th/2,h0,h1,m,floorsG,true,true) : box(c-th/2,c+th/2,p,q,h0,h1,m,floorsG,true,true);
    wall(lo - bt/2, hi + bt/2, bt, 0, base - 0.04, bw);
    wall(lo - bt/2 - 0.5, hi + bt/2 + 0.5, bt + 1, base - 0.04, base, cap);
  }
  const put = (p,q,h0,h1,th) => horiz ? box(p,q,c-th/2,c+th/2,h0,h1,mm,floorsG,true,true) : box(c-th/2,c+th/2,p,q,h0,h1,mm,floorsG,true,true);
  put(lo-1, hi+1, h-0.05, h, 1.6);      // corrimano piatto
  put(lo-1, hi+1, base + 0.06, base + 0.11, 0.8);     // traverso basso
  /* montanti a piatto largo, circa ogni metro e mezzo */
  const n = Math.max(1, Math.round((hi-lo)/38));
  for (let k=0; k<=n; k++){ const q = lo + k*(hi-lo)/n; put(q-1.1, q+1.1, base, h, 0.5); }
  const lenM = (hi-lo)*S, ph = h - base - 0.16;
  const pg = new THREE.PlaneGeometry(lenM, ph), uv = pg.attributes.uv;
  for (let i=0; i<uv.count; i++) uv.setX(i, uv.getX(i) * lenM / 0.13);
  const pm = new THREE.Mesh(pg, bm);
  const mid = (lo+hi)/2;
  if (horiz) pm.position.set(X(mid), base + 0.11 + ph/2, Z(c));
  else { pm.position.set(X(c), base + 0.11 + ph/2, Z(mid)); pm.rotation.y = Math.PI/2; }
  floorsG.add(pm);
  if (horiz) collide(lo-1, hi+1, c-1.5, c+1.5); else collide(c-1.5, c+1.5, lo-1, hi+1);
}

const labelTexCache = {};
function labelTexture(text, color){
  const key = color + '|' + text;
  if (labelTexCache[key]) return labelTexCache[key];
  const cv = document.createElement('canvas'); cv.width = 768; cv.height = 192;
  const cx = cv.getContext('2d');
  let size = 84; cx.font = '700 ' + size + 'px Figtree, system-ui, sans-serif';
  while (cx.measureText(text).width > 730 && size > 20){ size -= 4; cx.font = '700 ' + size + 'px Figtree, system-ui, sans-serif'; }
  cx.textAlign = 'center'; cx.textBaseline = 'middle';
  cx.fillStyle = color; cx.fillText(text, cv.width/2, cv.height/2 + 4);
  const tx = new THREE.CanvasTexture(cv);
  tx.anisotropy = 8; tx.colorSpace = THREE.SRGBColorSpace;
  return (labelTexCache[key] = tx);
}
const labelWpx = l => l.w / 0.03;
function buildLabel(l){
  if (!l.text) return;
  const color = l.g ? 'rgba(244,246,248,.9)' : 'rgba(36,46,58,.92)';
  const wm = labelWpx(l) * S;
  const m = new THREE.MeshBasicMaterial({ map:labelTexture(l.text, color), transparent:true, depthWrite:false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(wm, wm*0.25), m);
  mesh.rotation.set(-Math.PI/2, 0, 0);
  mesh.position.set(X(l.x), l.g ? 0.0 : 0.085, Z(l.y));
  mesh.userData.street = !!l.g;      /* le scritte della strada scendono al livello del suolo (contesto.js) */
  mesh.renderOrder = 2;
  labelsG.add(mesh);
}

function floorElev(px, py){
  let t = null;
  st.plan.floors.forEach(f => {
    if (pointInPoly(px, py, f.pts)){
      const m = FLOORS[f.m] || FLOORS.parquet, top = f.top !== undefined ? f.top : (m.top !== undefined ? m.top : .06);
      if (t === null || top > t) t = top;
    }
  });
  return t === null ? .06 : t;
}
function buildFurn(f){
  const d = FURN[f.type]; if (!d) return;
  const g = new THREE.Group();
  d.draw(g, f.w, f.d, f.h, f.col || d.c);
  g.position.set(X(f.x), floorElev(f.x, f.y) + (d.z || 0), Z(f.y));
  g.rotation.y = -f.rot * Math.PI / 180;
  furnG.add(g);
  if (f.h >= 0.1 && !(d.z && d.z >= 0.9)){
    const th = f.rot * Math.PI / 180, c = Math.abs(Math.cos(th)), s = Math.abs(Math.sin(th));
    const hx = (f.w * c + f.d * s) / 2 / S, hy = (f.w * s + f.d * c) / 2 / S;
    collide(f.x - hx, f.x + hx, f.y - hy, f.y + hy);
  }
}

function rebuild(){
  clearGroup(floorsG); clearGroup(wallsG); clearGroup(labelsG, true); clearGroup(furnG);
  colliders.length = 0; staticColliders.forEach(c => colliders.push(c));
  st.plan.floors.forEach(buildFloor);
  st.plan.walls.forEach(buildWall);
  st.plan.columns.forEach(buildColumn);
  st.plan.rails.forEach(buildRail);
  st.plan.labels.forEach(buildLabel);
  st.plan.furniture.forEach(buildFurn);
  st.rev++; st.shadowDirty = true;     /* misure, luci di casa e ombre si aggiornano */
  rebuildSys();
  syncVariants();
}
/* Costruisce la seconda versione nei gruppi del confronto, riusando le stesse funzioni */
function buildCmp(){
  clearGroup(CMPG.f); clearGroup(CMPG.w); clearGroup(CMPG.u);
  if (!st.cmpId) return;
  const keep = st.plan, nCol = colliders.length;
  try {
    st.plan = variantPlan(st.cmpId);
    floorsG = CMPG.f; wallsG = CMPG.w; furnG = CMPG.u;
    st.plan.floors.forEach(buildFloor); st.plan.walls.forEach(buildWall); st.plan.columns.forEach(buildColumn);
    st.plan.rails.forEach(buildRail); st.plan.furniture.forEach(buildFurn);
  } finally {
    st.plan = keep; floorsG = MAING.f; wallsG = MAING.w; furnG = MAING.u;
    colliders.length = nCol; st.shadowDirty = true;
  }
}

/* Elementi fissi: base, strada, scale */
const plate = box(-130,830,20,450,-0.4,-0.02,mat('#d7dee4'),staticG,false,true);
const road  = box(-130,830,378,450,-0.05,-0.01,mat('#a9b3bc'),staticG,false,true);
(function stairs(){
  const rise = 0.17, n = 8, d = 11;
  for (let i=0;i<n;i++) box(303,333, 133-(i+1)*d, 133-i*d, 0,(i+1)*rise, stairMat, staticG);
  for (let i=0;i<n;i++) box(354,388, 45+i*d, 45+(i+1)*d, 0, n*rise+(i+1)*rise, stairMat, staticG);
  box(303,388,42,45,0,n*rise,stairMat,staticG);
  collide(303,333,45,133,staticColliders);
  collide(354,388,42,133,staticColliders);
})();

export { buildCmp, clearGroup, colliders, floorElev, labelWpx, plate, rebuild, road };
