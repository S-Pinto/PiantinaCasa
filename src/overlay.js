import * as THREE from 'three';
import { S, X, Z, st } from './core.js';
import { editG } from './scene.js';
import { isH, wallT } from './model.js';
import { clearGroup, labelWpx } from './build.js';
import { getHandles, selItem } from './editor.js';

/* ---------- evidenziazioni 3D ---------- */
const ACC = 0x2f8fff, ORG = 0xff9f1a;
const ovMat = (c,o) => new THREE.MeshBasicMaterial({ color:c, transparent:true, opacity:o, depthTest:false, side:THREE.DoubleSide });
function ovRot(cx, cy, wp, hp, rot, h, c, o){
  const m = new THREE.Mesh(new THREE.BoxGeometry(wp*S, h, hp*S), ovMat(c, o));
  m.position.set(X(cx), h/2, Z(cy)); m.rotation.y = -rot * Math.PI / 180; m.renderOrder = 20; editG.add(m);
}
function ovBox(x0,x1,y0,y1,h0,h1,c,o){
  const m = new THREE.Mesh(new THREE.BoxGeometry((x1-x0)*S, h1-h0, (y1-y0)*S), ovMat(c,o));
  m.position.set(X((x0+x1)/2), (h0+h1)/2, Z((y0+y1)/2)); m.renderOrder = 20; editG.add(m);
}
function ovPoly(pts,c,o,y){
  const sh = new THREE.Shape();
  pts.forEach((p,i) => { const x = X(p[0]), yy = -Z(p[1]); if (i === 0) sh.moveTo(x,yy); else sh.lineTo(x,yy); });
  const g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI/2);
  const m = new THREE.Mesh(g, ovMat(c,o)); m.position.y = y; m.renderOrder = 19; editG.add(m);
}
function ovHandle(x,y,c){
  const grp = new THREE.Group();
  const a = new THREE.Mesh(new THREE.CylinderGeometry(.34,.34,.06,24), ovMat(0xffffff,1)); a.renderOrder = 30;
  const b = new THREE.Mesh(new THREE.CylinderGeometry(.24,.24,.08,24), ovMat(c,1)); b.renderOrder = 31;
  grp.add(a,b); grp.position.set(X(x), .5, Z(y)); grp.userData.handle = true; editG.add(grp);
}
function drawOverlay(){
  clearGroup(editG, true);
  if (!st.editing) return;
  const it = selItem();
  if (it){
    const col = it.type === 'op' ? ORG : ACC;
    if (it.type === 'wall'){
      const w = it.obj, t = wallT(w) + 3;
      ovBox(w.x1 - t/2, w.x2 + t/2, w.y1 - t/2, w.y2 + t/2, 0, .34, ACC, .5);
      if (st.finishSide !== 'both'){
        const t2 = wallT(w), th = 3;
        if (isH(w)){ const y0 = st.finishSide === 'a' ? w.y1 - t2/2 - th : w.y1 + t2/2; ovBox(w.x1 - t2/2, w.x2 + t2/2, y0, y0 + th, 0, .42, ORG, .9); }
        else       { const x0 = st.finishSide === 'a' ? w.x1 - t2/2 - th : w.x1 + t2/2; ovBox(x0, x0 + th, w.y1 - t2/2, w.y2 + t2/2, 0, .42, ORG, .9); }
      }
    } else if (it.type === 'op'){
      const w = it.wall, o = it.op, h = isH(w), c = h ? w.y1 : w.x1, t = wallT(w) + 4;
      if (h) ovBox(o.p - o.w/2, o.p + o.w/2, c - t/2, c + t/2, 0, .4, ORG, .6);
      else   ovBox(c - t/2, c + t/2, o.p - o.w/2, o.p + o.w/2, 0, .4, ORG, .6);
    } else if (it.type === 'column'){
      const c = it.obj; ovBox(c.x0-1, c.x1+1, c.y0-1, c.y1+1, 0, .34, ACC, .5);
    } else if (it.type === 'floor'){
      ovPoly(it.obj.pts, ACC, .28, .12);
    } else if (it.type === 'rail'){
      const r = it.obj;
      for (let i=0; i<r.pts.length-1; i++){
        const a = r.pts[i], b = r.pts[i+1];
        const hz = Math.abs(b[1]-a[1]) <= Math.abs(b[0]-a[0]);
        if (hz) ovBox(Math.min(a[0],b[0])-5, Math.max(a[0],b[0])+5, a[1]-5, a[1]+5, 0, .34, ACC, .5);
        else ovBox(a[0]-5, a[0]+5, Math.min(a[1],b[1])-5, Math.max(a[1],b[1])+5, 0, .34, ACC, .5);
        if (st.finishSide !== 'both'){
          const th = 3, tt = 8;
          if (hz){ const y0 = st.finishSide === 'a' ? a[1] - tt/2 - th : a[1] + tt/2; ovBox(Math.min(a[0],b[0]) - tt/2, Math.max(a[0],b[0]) + tt/2, y0, y0 + th, 0, .42, ORG, .9); }
          else   { const x0 = st.finishSide === 'a' ? a[0] - tt/2 - th : a[0] + tt/2; ovBox(x0, x0 + th, Math.min(a[1],b[1]) - tt/2, Math.max(a[1],b[1]) + tt/2, 0, .42, ORG, .9); }
        }
      }
    } else if (it.type === 'furn'){
      const f = it.obj; ovRot(f.x, f.y, f.w / S + 2, f.d / S + 2, f.rot, .06, ACC, .45);
    } else if (it.type === 'label'){
      const l = it.obj, wp = labelWpx(l), hp = wp/4;
      ovBox(l.x - wp/2, l.x + wp/2, l.y - hp/2, l.y + hp/2, .1, .14, ACC, .3);
    }
    getHandles().forEach(h => ovHandle(h.x, h.y, col));
  }
  if (st.draft){
    if (st.draft.kind === 'rect'){
      const x0 = Math.min(st.draft.x0,st.draft.x1), x1 = Math.max(st.draft.x0,st.draft.x1), y0 = Math.min(st.draft.y0,st.draft.y1), y1 = Math.max(st.draft.y0,st.draft.y1);
      if (x1 > x0 && y1 > y0) ovPoly([[x0,y0],[x1,y0],[x1,y1],[x0,y1]], ACC, .35, .12);
    } else {
      const t = st.tool === 'wallE' ? 8 : st.tool === 'wallI' ? 4 : 8;
      ovBox(Math.min(st.draft.x0,st.draft.x1) - t/2, Math.max(st.draft.x0,st.draft.x1) + t/2, Math.min(st.draft.y0,st.draft.y1) - t/2, Math.max(st.draft.y0,st.draft.y1) + t/2, 0, .34, ACC, .6);
    }
  }
}

export { drawOverlay };
