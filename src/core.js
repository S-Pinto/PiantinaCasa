/* Costanti, stato condiviso e piccole utilità usate da tutti i moduli. */

/* L’interfaccia vive in un <template> inerte: la copio nella pagina e tengo l’originale intatto,
   così posso rigenerare il documento quando salvo la piantina in un file HTML. */
(function(){ const t = document.getElementById('body-src'); document.body.insertBefore(t.content.cloneNode(true), document.body.firstChild); })();

/* Misure: tutto è espresso in pixel della piantina originale (x a destra, y in basso, nord in alto).
   1 px = 4 cm. */
const S = 0.04, CX = 366, CY = 195;
const H = 2.7, SILL = 0.9, HEAD = 2.1;
const X = px => (px - CX) * S;
const Z = py => (py - CY) * S;
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
const $ = id => document.getElementById(id);

function pointInPoly(x, y, pts){
  let inside = false;
  for (let i=0, j=pts.length-1; i<pts.length; j=i++){
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
/* ---------- geometria 2D ---------- */
function segDist(px,py,x1,y1,x2,y2){
  const dx = x2-x1, dy = y2-y1, l2 = dx*dx + dy*dy;
  let t = l2 ? ((px-x1)*dx + (py-y1)*dy) / l2 : 0; t = clamp(t,0,1);
  return Math.hypot(px - (x1+t*dx), py - (y1+t*dy));
}
function polyArea(pts){ let a = 0; for (let i=0,j=pts.length-1;i<pts.length;j=i++) a += (pts[j][0]+pts[i][0])*(pts[j][1]-pts[i][1]); return Math.abs(a/2); }
function isRectPts(pts){
  if (pts.length !== 4) return false;
  const xs = [...new Set(pts.map(p => Math.round(p[0]*100)))], ys = [...new Set(pts.map(p => Math.round(p[1]*100)))];
  return xs.length === 2 && ys.length === 2;
}
const byId = (arr, id) => arr.find(x => x.id === id);
const clone = o => JSON.parse(JSON.stringify(o));

/* Stato condiviso fra i moduli (un modulo ES non può riassegnare le variabili di un altro) */
const st = {
  plan: null,            // la piantina in uso (vedi model.js)
  mode: 'orbit',         // 'orbit' | 'plan' | 'walk'
  editing: false,
  tool: 'select', sel: null, drag: null, draft: null, finishSide: 'both',
  needRebuild: false, overlayDirty: false,
  cmpId: null,           // versione mostrata nel confronto affiancato
  tween: null,           // animazione della camera
  yaw: Math.PI, pitch: 0,
  lowTarget: 1, showFurn: true, furnType: 'divano',
  viewOnlyFile: false, publishedTs: 0, publishedJson: '',
  planKey: '',           // identifica la piantina pubblicata (per i salvataggi locali)
  artifactApi: null,     // null = non ancora noto, false = non disponibile
  rev: 0,                // cresce a ogni ricostruzione della scena
  shadowDirty: true,     // le ombre vanno ricalcolate al prossimo fotogramma
  pano: false            // Panorama 3D attivo
};

export { $, CX, CY, H, HEAD, S, SILL, X, Z, byId, clamp, clone, isRectPts, pointInPoly, polyArea, segDist, st };
