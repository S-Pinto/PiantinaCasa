import { clamp, st } from './core.js';
import { TEXDEF } from './textures.js';
import { FLOORS } from './materials.js';
import { FURN } from './furniture.js';

/* ------------------------- Il modello dati -------------------------
   La piantina è un oggetto JSON (vedi data/plan.json): muri con aperture, colonne, pavimenti,
   parapetti, nomi delle stanze, arredi e versioni di arredo. normalize() la ripulisce e la completa. */
let idn = 1;
const uid = () => 'i' + (idn++) + Math.random().toString(36).slice(2,5);
const isH = w => Math.abs(w.y2 - w.y1) < 1e-6;
const wallT = w => w.k === 'e' ? 8 : 4;

const okCol = c => (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c)) ? c.toLowerCase() : undefined;
const okTex = t => (typeof t === 'string' && TEXDEF[t]) ? t : undefined;
const normSide = o => (o && typeof o === 'object') ? { col:okCol(o.col), tx:okTex(o.tx), h:(typeof o.h === 'number' && isFinite(o.h) && o.h > 0) ? clamp(o.h, .1, 4) : undefined, tcol:okCol(o.tcol) } : undefined;
function normalize(p){
  const num = v => (typeof v === 'number' && isFinite(v));
  const out = { v:1, walls:[], columns:[], floors:[], rails:[], labels:[], furniture:[], variants:[], active:'' };
  (p.walls || []).forEach(w => {
    if (![w.x1,w.y1,w.x2,w.y2].every(num)) return;
    let x1 = w.x1, y1 = w.y1, x2 = w.x2, y2 = w.y2;
    if (Math.abs(x2-x1) >= Math.abs(y2-y1)) y2 = y1; else x2 = x1;
    if (Math.abs(x2-x1) + Math.abs(y2-y1) < 0.5) return;
    out.walls.push({ id:w.id || uid(), x1:Math.min(x1,x2), y1:Math.min(y1,y2), x2:Math.max(x1,x2), y2:Math.max(y1,y2),
      k:w.k === 'e' ? 'e' : 'i', col:okCol(w.col), tx:okTex(w.tx), sa:normSide(w.sa), sb:normSide(w.sb),
      ops:(w.ops || []).filter(o => num(o.p) && num(o.w)).map(o => ({ p:o.p, w:Math.max(6,o.w), col:okCol(o.col),
        t:['door','win','pf','open'].indexOf(o.t) >= 0 ? o.t : 'door', s:o.s === -1 ? -1 : 1 })) });
  });
  (p.columns || []).forEach(c => {
    if (![c.x0,c.x1,c.y0,c.y1].every(num)) return;
    out.columns.push({ col:okCol(c.col), tx:okTex(c.tx), id:c.id || uid(), x0:Math.min(c.x0,c.x1), x1:Math.max(c.x0,c.x1), y0:Math.min(c.y0,c.y1), y1:Math.max(c.y0,c.y1) });
  });
  (p.floors || []).forEach(f => {
    if (!Array.isArray(f.pts) || f.pts.length < 3 || !f.pts.every(q => Array.isArray(q) && num(q[0]) && num(q[1]))) return;
    out.floors.push({ id:f.id || uid(), name:String(f.name || ''), m:(FLOORS[f.m] || f.m === 'colore') ? f.m : 'parquet', col:okCol(f.col), pts:f.pts.map(q => [q[0],q[1]]) });
  });
  (p.rails || []).forEach(r => {
    if (!Array.isArray(r.pts) || r.pts.length < 2 || !r.pts.every(q => Array.isArray(q) && num(q[0]) && num(q[1]))) return;
    out.rails.push({ id:r.id || uid(), kind:(r.kind === 'glazed' || r.kind === 'fence') ? r.kind : 'rail', h:(typeof r.h === 'number' && isFinite(r.h)) ? clamp(r.h, .3, 2) : undefined, col:okCol(r.col), tx:okTex(r.tx), base:(typeof r.base === 'number' && isFinite(r.base)) ? clamp(r.base, 0, 1.2) : undefined, bcol:okCol(r.bcol), sa:normSide(r.sa), sb:normSide(r.sb), pts:r.pts.map(q => [q[0],q[1]]) });
  });
  (p.labels || []).forEach(l => {
    if (!num(l.x) || !num(l.y)) return;
    out.labels.push({ id:l.id || uid(), text:String(l.text || ''), x:l.x, y:l.y, w:clamp(num(l.w) ? l.w : 1.2, .3, 8), g:l.g ? 1 : 0 });
  });
  out.furniture = normFurn(p.furniture);
  (Array.isArray(p.variants) ? p.variants : []).forEach(v => {
    if (!v || typeof v !== 'object') return;
    const id = (typeof v.id === 'string' && v.id) ? v.id : uid();
    if (out.variants.some(x => x.id === id)) return;
    out.variants.push({ id:id, name:String(v.name || '').trim().slice(0,40) || ('Versione ' + (out.variants.length + 1)),
      furniture:normFurn(v.furniture), fin:normFin(v.fin) });
  });
  if (!out.variants.length) out.variants.push({ id:'v1', name:'Versione 1' });
  out.active = out.variants.some(v => v.id === p.active) ? p.active : out.variants[0].id;
  /* i dati della versione attiva sono quelli della piantina stessa */
  const a = out.variants.find(v => v.id === out.active); delete a.furniture; delete a.fin;
  return out;
}
function normFurn(list){
  const num = v => (typeof v === 'number' && isFinite(v)), out = [];
  (Array.isArray(list) ? list : []).forEach(f => {
    if (!f || !FURN[f.type] || !num(f.x) || !num(f.y)) return;
    const d = FURN[f.type];
    out.push({ id:f.id || uid(), type:f.type, x:f.x, y:f.y, rot:num(f.rot) ? ((f.rot % 360) + 360) % 360 : 0,
      w:clamp(num(f.w) ? f.w : d.w, .1, 8), d:clamp(num(f.d) ? f.d : d.d, .1, 8), h:clamp(num(f.h) ? f.h : d.h, .01, 4), col:okCol(f.col) });
  });
  return out;
}

/* ------------------------- Versioni di arredo -------------------------
   Muri, porte, finestre, forma delle stanze, colonne, parapetti e nomi sono comuni a tutte le versioni.
   Ogni versione ha i suoi arredi e le sue finiture: materiale dei pavimenti, colori e rivestimenti
   di muri, colonne e parapetti, colore delle porte.
   La versione attiva vive direttamente nella piantina (st.plan.furniture, f.m, w.col…);
   le altre sono conservate in st.plan.variants come { id, name, furniture, fin }. */
const FIN_KEYS = { walls:['col','tx','sa','sb'], columns:['col','tx'], rails:['col','tx','bcol','sa','sb'], floors:['m','col'] };
const jc = o => o === undefined ? undefined : JSON.parse(JSON.stringify(o));
function normFin(fin){
  const out = {};
  if (!fin || typeof fin !== 'object') return out;
  Object.keys(FIN_KEYS).forEach(k => {
    const src = fin[k]; if (!src || typeof src !== 'object') return;
    const m = out[k] = {};
    Object.keys(src).forEach(id => {
      const e = src[id]; if (!e || typeof e !== 'object') return;
      const o = {};
      FIN_KEYS[k].forEach(f => {
        const v = f === 'm' ? ((FLOORS[e.m] || e.m === 'colore') ? e.m : 'parquet')
                : f === 'tx' ? okTex(e.tx) : (f === 'sa' || f === 'sb') ? normSide(e[f]) : okCol(e[f]);
        if (v !== undefined) o[f] = v;
      });
      if (k === 'walls' && Array.isArray(e.dc)) o.dc = e.dc.map(c => okCol(c) || null);
      m[id] = o;
    });
  });
  return out;
}
function takeFinishes(p){
  const fin = {};
  Object.keys(FIN_KEYS).forEach(k => {
    const m = fin[k] = {};
    p[k].forEach(o => {
      const e = {};
      FIN_KEYS[k].forEach(f => { if (o[f] !== undefined) e[f] = jc(o[f]); });
      if (k === 'walls' && o.ops.some(op => op.col)) e.dc = o.ops.map(op => op.col || null);
      m[o.id] = e;
    });
  });
  return fin;
}
function putFinishes(p, fin){
  Object.keys(FIN_KEYS).forEach(k => {
    const m = (fin && fin[k]) || {};
    p[k].forEach(o => {
      const e = m[o.id]; if (!e) return;        /* elemento aggiunto dopo: tiene le finiture attuali */
      FIN_KEYS[k].forEach(f => { if (f !== 'm') o[f] = jc(e[f]); });
      if (k === 'floors' && e.m) o.m = e.m;
      if (k === 'walls') o.ops.forEach((op, i) => { op.col = (e.dc && e.dc[i]) || undefined; });
    });
  });
}
const activeVar = p => p.variants.find(v => v.id === p.active);
/* conserva nella lista i dati della versione attiva */
function storeActive(p){ const a = activeVar(p); a.furniture = jc(p.furniture); a.fin = takeFinishes(p); }
/* porta nella piantina i dati di un’altra versione (dopo storeActive) */
function loadVariant(p, id){
  const v = p.variants.find(x => x.id === id); if (!v) return;
  p.furniture = jc(v.furniture || []); putFinishes(p, v.fin);
  delete v.furniture; delete v.fin; p.active = id;
}
/* una copia della piantina con la versione indicata attiva (per il confronto) */
function variantPlan(id){
  if (id === st.plan.active) return st.plan;
  const c = jc(st.plan); storeActive(c); loadVariant(c, id); return c;
}

/* Testo JSON leggibile e adatto a git: un elemento per riga dentro ogni elenco */
function planToJson(p){
  const keys = Object.keys(p), out = ['{'];
  keys.forEach((k, i) => {
    const v = p[k], comma = i < keys.length - 1 ? ',' : '';
    if (Array.isArray(v) && v.length && v[0] && typeof v[0] === 'object')
      out.push('  ' + JSON.stringify(k) + ': [\n' + v.map(o => '    ' + JSON.stringify(o)).join(',\n') + '\n  ]' + comma);
    else out.push('  ' + JSON.stringify(k) + ': ' + JSON.stringify(v) + comma);
  });
  out.push('}');
  return out.join('\n') + '\n';
}

export { activeVar, isH, loadVariant, normalize, planToJson, storeActive, uid, variantPlan, wallT };
