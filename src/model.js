import { clamp, st } from './core.js';
import { TEXDEF } from './textures.js';
import { FLOORS } from './materials.js';
import { FURN } from './furniture.js';
import { RUNK, SYS } from './impianti.js';

/* ------------------------- Il modello dati -------------------------
   La piantina è un oggetto JSON (vedi data/plan.json): muri con aperture, colonne, pavimenti,
   parapetti, nomi delle stanze, arredi e versioni di arredo. normalize() la ripulisce e la completa. */
let idn = 1;
const uid = () => 'i' + (idn++) + Math.random().toString(36).slice(2,5);
const isH = w => Math.abs(w.y2 - w.y1) < 1e-6;
const wallT = w => w.k === 'e' ? 8 : 4;

/* ------------------------- Incroci dei muri -------------------------
   Un’estremità di muro "si aggancia" al muro perpendicolare che le sta davanti (o in cui entra un poco)
   se il buco fra i due è al massimo JOIN_GAP (24 cm). Serve in due posti:
   - nel disegno 3D, per chiudere sempre l’incrocio (niente fessure, niente spigoli che sporgono dall’altra parte);
   - nell’editor, per portare l’estremità esattamente sull’asse dell’altro muro dopo una modifica. */
const JOIN_GAP = 6;
function wallJoin(walls, w, end){
  const h = isH(w), t = wallT(w), dir = end ? 1 : -1, cr = h ? w.y1 : w.x1;
  const e = end ? (h ? w.x2 : w.y2) : (h ? w.x1 : w.y1);
  let best = null;
  for (const o of walls){
    if (o.id === w.id || isH(o) === h) continue;
    const ot = wallT(o), oc = h ? o.x1 : o.y1, lo = h ? o.y1 : o.x1, hi = h ? o.y2 : o.x2;
    if (cr < lo - ot/2 - JOIN_GAP || cr > hi + ot/2 + JOIN_GAP) continue;
    const d = (oc - e) * dir;                       /* quanto manca all’asse dell’altro muro (negativo: l’ho già passato) */
    if (d < -ot/2 - 0.01 || d > ot/2 + t/2 + JOIN_GAP) continue;
    const tee = cr > lo + ot/2 && cr < hi - ot/2;   /* l’altro muro continua dai due lati: incrocio a T */
    if (!best || Math.abs(d) < Math.abs(best.d)) best = { o:o, oc:oc, ot:ot, d:d, tee:tee, dir:dir };
  }
  return best;
}
/* fin dove disegnare le due estremità di un muro (lungo il suo asse) */
function wallRenderEnds(walls, w){
  const h = isH(w), t = wallT(w), a = h ? w.x1 : w.y1, b = h ? w.x2 : w.y2;
  return [0, 1].map(end => {
    const j = wallJoin(walls, w, end), e = end ? b : a, dir = end ? 1 : -1;
    if (!j) return e + dir * (t/2 + 0.04);
    /* a T entro a metà dell’altro muro; ad angolo arrivo fino alla sua faccia esterna */
    return j.oc + dir * (j.tee ? j.ot/4 : j.ot/2);
  });
}
/* porta sull’asse del muro agganciato le estremità dei muri indicati; restituisce quante ne ha sistemate */
function snapWallEnds(walls, ids){
  let n = 0;
  walls.forEach(w => {
    if (ids && ids.indexOf(w.id) < 0) return;
    const h = isH(w);
    [0, 1].forEach(end => {
      const j = wallJoin(walls, w, end);
      if (!j || Math.abs(j.d) < 0.01) return;
      const k = h ? (end ? 'x2' : 'x1') : (end ? 'y2' : 'y1');
      const other = h ? (end ? w.x1 : w.x2) : (end ? w.y1 : w.y2);
      if (end ? j.oc < other + 4 : j.oc > other - 4) return;   /* il muro diventerebbe troppo corto */
      w[k] = j.oc; n++;
    });
  });
  return n;
}
const okCol = c => (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c)) ? c.toLowerCase() : undefined;
const okTex = t => (typeof t === 'string' && TEXDEF[t]) ? t : undefined;
const normSide = o => (o && typeof o === 'object') ? { col:okCol(o.col), tx:okTex(o.tx), h:(typeof o.h === 'number' && isFinite(o.h) && o.h > 0) ? clamp(o.h, .1, 4) : undefined, tcol:okCol(o.tcol) } : undefined;
function normalize(p){
  const num = v => (typeof v === 'number' && isFinite(v));
  const out = { v:1, walls:[], columns:[], floors:[], rails:[], labels:[], furniture:[], sys:[], runs:[], variants:[], active:'' };
  (p.walls || []).forEach(w => {
    if (![w.x1,w.y1,w.x2,w.y2].every(num)) return;
    let x1 = w.x1, y1 = w.y1, x2 = w.x2, y2 = w.y2;
    if (Math.abs(x2-x1) >= Math.abs(y2-y1)) y2 = y1; else x2 = x1;
    if (Math.abs(x2-x1) + Math.abs(y2-y1) < 0.5) return;
    out.walls.push({ id:w.id || uid(), x1:Math.min(x1,x2), y1:Math.min(y1,y2), x2:Math.max(x1,x2), y2:Math.max(y1,y2),
      k:w.k === 'e' ? 'e' : 'i', col:okCol(w.col), tx:okTex(w.tx), sa:normSide(w.sa), sb:normSide(w.sb),
      ops:(w.ops || []).filter(o => num(o.p) && num(o.w)).map(o => ({ p:o.p, w:Math.max(6,o.w), col:okCol(o.col),
        t:['door','win','pf','open','lift'].indexOf(o.t) >= 0 ? o.t : 'door', s:o.s === -1 ? -1 : 1,
        n:num(o.n) && o.n >= 1 ? clamp(Math.round(o.n), 1, 24) : undefined, fc:okCol(o.fc) })) });
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
    out.rails.push({ id:r.id || uid(), kind:(r.kind === 'glazed' || r.kind === 'fence') ? r.kind : 'rail', h:(typeof r.h === 'number' && isFinite(r.h)) ? clamp(r.h, .3, 2) : undefined, col:okCol(r.col), tx:okTex(r.tx), base:(typeof r.base === 'number' && isFinite(r.base)) ? clamp(r.base, 0, 1.2) : undefined, bcol:okCol(r.bcol), pw:num(r.pw) ? clamp(r.pw, .2, 4) : undefined, fc:okCol(r.fc), sa:normSide(r.sa), sb:normSide(r.sb), pts:r.pts.map(q => [q[0],q[1]]) });
  });
  (p.labels || []).forEach(l => {
    if (!num(l.x) || !num(l.y)) return;
    out.labels.push({ id:l.id || uid(), text:String(l.text || ''), x:l.x, y:l.y, w:clamp(num(l.w) ? l.w : 1.2, .3, 8), g:l.g ? 1 : 0 });
  });
  out.furniture = normFurn(p.furniture);
  /* impianti: comuni a tutte le versioni di arredo */
  const note = v => (typeof v === 'string' && v.trim()) ? v.trim().slice(0, 80) : undefined;
  (p.sys || []).forEach(o => {
    if (!o || !SYS[o.t] || !num(o.x) || !num(o.y)) return;
    out.sys.push({ id:o.id || uid(), t:o.t, x:o.x, y:o.y, z:clamp(num(o.z) ? o.z : SYS[o.t].z, 0, 4),
      rot:num(o.rot) ? ((o.rot % 360) + 360) % 360 : 0, circ:note(o.circ) });
  });
  (p.runs || []).forEach(r => {
    if (!r || !RUNK[r.k] || !Array.isArray(r.pts) || r.pts.length < 2 || !r.pts.every(q => Array.isArray(q) && num(q[0]) && num(q[1]))) return;
    out.runs.push({ id:r.id || uid(), k:r.k, h:clamp(num(r.h) ? r.h : RUNK[r.k].h, 0, 4), circ:note(r.circ), pts:r.pts.map(q => [q[0],q[1]]) });
  });
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

/* ------------------------- Unione dei salvataggi -------------------------
   Il salvataggio sul dispositivo nasce da una certa piantina pubblicata (base). Se nel frattempo
   ne è stata pubblicata una nuova, unisco le due cose elemento per elemento (per id):
   quello che hai cambiato tu resta com'è, quello che non hai toccato prende la versione nuova,
   gli elementi aggiunti da una parte o dall'altra ci sono tutti, quelli che hai eliminato restano eliminati.
   Le versioni di arredo si uniscono allo stesso modo (arredi e finiture di ciascuna). */
const sameJ = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/* copia con tutte le versioni complete (anche quella attiva) e senza finiture sugli elementi comuni */
function expandPlan(p){
  const c = jc(p); storeActive(c);
  Object.keys(FIN_KEYS).forEach(k => c[k].forEach(o => {
    FIN_KEYS[k].forEach(f => { if (f !== 'm') delete o[f]; });
    if (k === 'floors') delete o.m;
    if (k === 'walls') o.ops.forEach(op => { delete op.col; });
  }));
  delete c.furniture;
  return c;
}
function mergeList(base, mine, pub){
  const B = new Map((base || []).map(o => [o.id, o])), M = new Set(mine.map(o => o.id)), out = [];
  const U = new Map(pub.map(o => [o.id, o]));
  mine.forEach(o => {
    if (!B.has(o.id)){ out.push(o); return; }                  /* aggiunto da te */
    if (!sameJ(o, B.get(o.id))){ out.push(o); return; }       /* cambiato da te */
    if (U.has(o.id)) out.push(U.get(o.id));                    /* non toccato: versione nuova (o tolto se non c'è più) */
  });
  pub.forEach(o => { if (!M.has(o.id) && !B.has(o.id)) out.push(o); });   /* aggiunto nella nuova */
  return out;
}
function mergeMap(base, mine, pub){
  const out = {}, b = base || {}, m = mine || {}, u = pub || {};
  Object.keys(m).forEach(id => {
    if (!(id in b) || !sameJ(m[id], b[id])) out[id] = m[id];
    else if (id in u) out[id] = u[id];
  });
  Object.keys(u).forEach(id => { if (!(id in m) && !(id in b)) out[id] = u[id]; });
  return out;
}
/* base può mancare (salvataggi della versione precedente dell'app): allora muri, pavimenti, colonne e parapetti
   vengono dalla piantina nuova, e del mio salvataggio tengo arredi, finiture, nomi e impianti */
function mergePlans(baseP, mineP, pubP){
  const m = expandPlan(mineP), u = expandPlan(pubP), b = baseP ? expandPlan(baseP) : null;
  const out = m;
  ['walls','columns','floors','rails'].forEach(k => { out[k] = b ? mergeList(b[k], m[k], u[k]) : u[k]; });
  ['labels','sys','runs'].forEach(k => { out[k] = mergeList(b && b[k], m[k], u[k]); });
  out.variants = mergeList(b && b.variants, m.variants, u.variants).map(v => {
    const bv = b && b.variants.find(x => x.id === v.id), mv = m.variants.find(x => x.id === v.id), uv = u.variants.find(x => x.id === v.id);
    if (!mv || !uv) return v;
    const fin = {};
    Object.keys(FIN_KEYS).forEach(k => { fin[k] = mergeMap(bv && bv.fin[k], mv.fin[k], uv.fin[k]); });
    return { id:v.id, name:(!bv || mv.name !== bv.name) ? mv.name : uv.name,
      furniture:bv ? mergeList(bv.furniture, mv.furniture, uv.furniture) : mv.furniture, fin:fin };
  });
  if (!out.variants.length) return normalize(mineP);
  const act = out.variants.some(v => v.id === m.active) ? m.active : out.variants[0].id;
  const a = out.variants.find(v => v.id === act);
  out.furniture = a.furniture || []; out.active = act;
  putFinishes(out, a.fin);
  return normalize(out);
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

export { activeVar, isH, loadVariant, mergePlans, normalize, planToJson, snapWallEnds, storeActive, uid, variantPlan, wallJoin, wallRenderEnds, wallT };
