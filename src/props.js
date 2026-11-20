import { $, S, clamp, st } from './core.js';
import { btn, el, fld, note, numIn, section, selIn, txtIn } from './dom.js';
import { TEXDEF, cherryBase, gresBase, makeHerringbone, makeMosaicParquet, makeTerracotta, texCanvas } from './textures.js';
import { FLOORS } from './materials.js';
import { FURN } from './furniture.js';
import { isH } from './model.js';
import { labelWpx } from './build.js';
import { setHint } from './views.js';
import { clearTxt, clearances, deleteSel, duplicateSel, fmtLen, furnHalf, mutate, obstacleFaces, rightAngle, selItem, setSel, splitRail, wallGaps } from './editor.js';
import { RUNK, SYS, buildRunCatalog, buildSysCatalog, runKind, setCatLayer, sysProps, sysType } from './impianti.js';

/* ---------- scheda delle proprietà ---------- */
const propsEl = $('props'), sheetEl = $('sheet');

const PALETTE = ['#ffffff','#efede8','#e6d9c3','#d3bf9a','#c4a98a','#b9c7b2','#9db4c9','#d5dde2','#9aa5b1','#69707b','#3a4048','#1d252d','#d98b73','#a63a2b','#2f6f8f','#4b7f52','#e2bd4f','#e8c6c6'];
const thumbCache = {};
function thumb(id){
  if (thumbCache[id]) return thumbCache[id];
  const cv = document.createElement('canvas'); cv.width = cv.height = 72;
  const g = cv.getContext('2d');
  let src = null, flat = null;
  if (id.indexOf('t:') === 0) src = texCanvas(id.slice(2));
  else if (id === 'f:parquet') src = cherryBase.image;
  else if (id === 'f:gres') src = gresBase.image;
  else if (id === 'f:pietra') src = texCanvas('pietra');
  else if (id === 'f:marmo') src = texCanvas('marmo');
  else if (id === 'f:parquet2') src = makeMosaicParquet();
  else if (id === 'f:spina') src = makeHerringbone();
  else if (id === 'f:cotto') src = makeTerracotta();
  else if (id === 'f:cemento') flat = '#c3c6ca';
  else if (id === 'f:balcone') flat = '#b7a595';
  else if (id === 'f:ascensore') flat = '#3a424b';
  if (src){ const q = Math.min(src.width, src.height); g.drawImage(src, 0, 0, q, q, 0, 0, 72, 72); }
  else { g.fillStyle = flat || '#cccccc'; g.fillRect(0, 0, 72, 72); }
  return (thumbCache[id] = cv.toDataURL('image/png'));
}
function colorRow(cur, onPick, allowNone){
  const row = el('div','sws'), lc = cur ? cur.toLowerCase() : null;
  if (allowNone){
    const b = el('button','swb'); b.type = 'button'; b.title = 'Colore predefinito'; b.setAttribute('aria-label','Colore predefinito');
    b.style.background = 'linear-gradient(135deg,#fff 44%,#d33 44%,#d33 56%,#fff 56%)';
    b.setAttribute('aria-pressed', String(!lc)); b.addEventListener('click', () => onPick(null)); row.appendChild(b);
  }
  PALETTE.forEach(c => {
    const b = el('button','swb'); b.type = 'button'; b.style.background = c; b.title = c; b.setAttribute('aria-label','Colore ' + c);
    b.setAttribute('aria-pressed', String(lc === c)); b.addEventListener('click', () => onPick(c)); row.appendChild(b);
  });
  const cu = el('label','swb custom'); cu.title = 'Scegli un altro colore';
  const inp = document.createElement('input'); inp.type = 'color'; inp.value = lc || '#cccccc'; inp.setAttribute('aria-label','Scegli un altro colore');
  inp.addEventListener('change', () => onPick(inp.value)); cu.appendChild(inp);
  if (lc && PALETTE.indexOf(lc) < 0) cu.setAttribute('aria-pressed','true');
  row.appendChild(cu);
  return row;
}
function tileRow(items, cur, onPick, allowNone){
  const row = el('div','tex');
  if (allowNone){
    const b = el('button','tx none','Nessuna'); b.type = 'button'; b.setAttribute('aria-pressed', String(!cur));
    b.addEventListener('click', () => onPick(null)); row.appendChild(b);
  }
  items.forEach(it => {
    const b = el('button','tx'); b.type = 'button'; b.style.backgroundImage = 'url(' + thumb(it.thumb) + ')';
    b.appendChild(el('span', null, it.label)); b.setAttribute('aria-pressed', String(cur === it.id));
    b.addEventListener('click', () => onPick(it.id)); row.appendChild(b);
  });
  return row;
}
function wallFinish(o){
  propsEl.appendChild(section('Colore'));
  propsEl.appendChild(colorRow(o.col, v => mutate(() => { o.col = v || undefined; }), true));
  propsEl.appendChild(section('Texture'));
  propsEl.appendChild(tileRow(Object.keys(TEXDEF).map(k => ({ id:k, label:TEXDEF[k].name, thumb:'t:' + k })), o.tx,
    v => mutate(() => { o.tx = v || undefined; }), true));
  if (o.tx) propsEl.appendChild(note('Con una texture il colore diventa una tinta. Scegli il colore predefinito per vedere la texture al naturale.'));
}

function wallFinishSides(w, h){
  /* h: true = muro orizzontale, false = verticale, null = parapetto / vetrata (più segmenti) */
  const names = h === null ? ['Entrambi','Nord / Ovest','Sud / Est'] : h ? ['Entrambi','Nord','Sud'] : ['Entrambi','Ovest','Est'];
  propsEl.appendChild(section('Lato da colorare'));
  const seg = el('div','segs');
  [['both',names[0]],['a',names[1]],['b',names[2]]].forEach(p => {
    const b = el('button', null, p[1]); b.type = 'button'; b.setAttribute('aria-pressed', String(st.finishSide === p[0]));
    b.addEventListener('click', () => { st.finishSide = p[0]; st.overlayDirty = true; refreshProps(); });
    seg.appendChild(b);
  });
  propsEl.appendChild(seg);
  if (st.finishSide !== 'both') propsEl.appendChild(note('Il lato scelto è evidenziato in arancione sulla pianta: ' + (st.finishSide === 'a'
    ? (h === null ? 'quello verso nord o ovest (in alto o a sinistra).' : h ? 'quello verso nord, in alto.' : 'quello verso ovest, a sinistra.')
    : (h === null ? 'quello verso sud o est (in basso o a destra).' : h ? 'quello verso sud, in basso.' : 'quello verso est, a destra.'))));
  const base = { col:w.col, tx:w.tx };
  const cur = st.finishSide === 'a' ? (w.sa || base) : st.finishSide === 'b' ? (w.sb || base) : ((w.sa || w.sb) ? {} : base);
  const set = (k, v) => mutate(() => {
    if (st.finishSide === 'both'){ w[k] = v || undefined; delete w.sa; delete w.sb; }
    else { const key = st.finishSide === 'a' ? 'sa' : 'sb'; if (!w[key]) w[key] = { col:w.col, tx:w.tx }; w[key][k] = v || undefined; }
  });
  propsEl.appendChild(section('Colore'));
  propsEl.appendChild(colorRow(cur.col, v => set('col', v), true));
  propsEl.appendChild(section('Texture'));
  propsEl.appendChild(tileRow(Object.keys(TEXDEF).map(k => ({ id:k, label:TEXDEF[k].name, thumb:'t:' + k })), cur.tx, v => set('tx', v), true));
  if (cur.tx) propsEl.appendChild(note('Con una texture il colore diventa una tinta. Scegli il colore predefinito per vedere la texture al naturale.'));
  if (st.finishSide !== 'both' && h !== null){
    propsEl.appendChild(section('Altezza del rivestimento'));
    propsEl.appendChild(fld('Altezza (m, 0 = tutta)', numIn(cur.h || 0, .05, 0, v => set('h', v > 0 ? clamp(v, .1, 4) : undefined))));
    if (cur.h){
      propsEl.appendChild(section('Colore sopra la fascia'));
      propsEl.appendChild(colorRow(cur.tcol, v => set('tcol', v), true));
    }
  }
}

function buildCatalog(){
  const cats = {};
  Object.keys(FURN).forEach(k => { (cats[FURN[k].cat] = cats[FURN[k].cat] || []).push(k); });
  Object.keys(cats).forEach(c => {
    propsEl.appendChild(section(c));
    const row = el('div','tex');
    cats[c].forEach(k => {
      const b = el('button','tx none', FURN[k].n); b.type = 'button';
      b.style.height = 'auto'; b.style.padding = '12px 4px'; b.style.lineHeight = '1.15';
      b.setAttribute('aria-pressed', String(k === st.furnType));
      b.addEventListener('click', () => { st.furnType = k; refreshProps(); });
      row.appendChild(b);
    });
    propsEl.appendChild(row);
  });
  propsEl.appendChild(note('Scegli un arredo e tocca la pianta per metterlo. Poi lo sposti trascinandolo, lo ruoti col cerchio o dalla scheda, e puoi cambiarne misure e colore.'));
}
function refreshProps(){
  propsEl.textContent = '';
  const it = (st.editing && st.tool === 'select') ? selItem() : null;
  const cat = st.editing && st.tool === 'furn', scat = st.editing && st.tool === 'sys', rcat = st.editing && st.tool === 'run';
  sheetEl.hidden = !(it || cat || scat || rcat);
  setHint();
  if (cat){ $('stitle').textContent = 'Arredi'; buildCatalog(); return; }
  if (scat){ setCatLayer(SYS[sysType].l); $('stitle').textContent = 'Impianti: ' + SYS[sysType].n; buildSysCatalog(); return; }
  if (rcat){ $('stitle').textContent = 'Tracciati: ' + RUNK[runKind].n; buildRunCatalog(); return; }
  if (!it) return;
  const add = n => propsEl.appendChild(n);
  const acts = el('div','acts');
  const title = $('stitle');

  if (it.type === 'wall'){
    const w = it.obj, h = isH(w), len = (h ? w.x2 - w.x1 : w.y2 - w.y1) * S;
    title.textContent = w.k === 'e' ? 'Muro esterno' : 'Muro interno';
    add(fld('Tipo', selIn([['e','Muro esterno'],['i','Muro interno']], w.k, v => mutate(() => { w.k = v; }))));
    add(fld('Lunghezza (m)', numIn(len, .05, .2, v => mutate(() => { const L = Math.max(4, v/S); if (h) w.x2 = w.x1 + L; else w.y2 = w.y1 + L; }))));
    const gp = clearTxt(wallGaps(w), h ? ['n','s'] : ['w','e']);
    if (gp) add(note('Spazio libero fino ai muri paralleli: ' + gp + '. Trascina il muro per spostarlo: i muri collegati si allungano con lui.'));
    wallFinishSides(w, isH(w));
    acts.append(btn('Duplica', duplicateSel), btn('Elimina', deleteSel, 'danger'));
  } else if (it.type === 'op'){
    const w = it.wall, o = it.op, h = isH(w);
    title.textContent = { door:'Porta', win:'Finestra', pf:'Porta-finestra', open:'Varco' }[o.t];
    add(fld('Tipo', selIn([['door','Porta'],['win','Finestra'],['pf','Porta-finestra'],['open','Varco'],['lift','Porta ascensore']], o.t, v => mutate(() => { o.t = v; }))));
    add(fld('Larghezza (m)', numIn(o.w * S, .05, .2, v => mutate(() => {
      const a = h ? w.x1 : w.y1, b = h ? w.x2 : w.y2, nw = clamp(v/S, 6, b - a);
      o.w = nw; o.p = clamp(o.p, a + nw/2, b - nw/2);
    }))));
    if (o.t === 'win' || o.t === 'pf'){
      const n = Math.round(o.n || 2), wm = o.w * S;
      add(section('Ante (finestre nello stesso vano)'));
      const ni = numIn(n, 1, 1, v => mutate(() => { o.n = clamp(Math.round(v), 1, 24); })); ni.value = String(n); ni.inputMode = 'numeric';
      add(fld('Numero di ante', ni));
      const seg = el('div','segs');
      [[1,'1'],[2,'2'],[3,'3'],[4,'4'],[0,'2 al metro']].forEach(q => {
        const target = q[0] || clamp(Math.round(wm * 2), 1, 24);
        const b = el('button', null, q[1]); b.type = 'button'; b.setAttribute('aria-pressed', String(q[0] ? n === q[0] : false));
        b.addEventListener('click', () => mutate(() => { o.n = target; }));
        seg.appendChild(b);
      });
      add(seg);
      add(note('Ogni anta è larga ' + fmtLen(o.w / n) + '.'));
    }
    if (o.t === 'door'){
      add(section('Colore della porta'));
      add(colorRow(o.col, v => mutate(() => { o.col = v || undefined; }), true));
    }
    if (o.t === 'door') acts.append(btn('Inverti apertura', () => mutate(() => { o.s = -o.s; })));
    acts.append(btn('Elimina', deleteSel, 'danger'));
  } else if (it.type === 'column'){
    const c = it.obj; title.textContent = 'Colonna';
    add(fld('Larghezza (m)', numIn((c.x1 - c.x0)*S, .05, .1, v => mutate(() => { c.x1 = c.x0 + Math.max(2, v/S); }))));
    add(fld('Profondità (m)', numIn((c.y1 - c.y0)*S, .05, .1, v => mutate(() => { c.y1 = c.y0 + Math.max(2, v/S); }))));
    wallFinish(c);
    acts.append(btn('Duplica', duplicateSel), btn('Elimina', deleteSel, 'danger'));
  } else if (it.type === 'floor'){
    const f = it.obj; title.textContent = 'Pavimento';
    add(fld('Nome', txtIn(f.name, v => mutate(() => { f.name = v; }))));
    add(section('Materiale'));
    const keys = Object.keys(FLOORS).filter(k => k !== 'ascensore' || f.m === 'ascensore');
    add(tileRow(keys.map(k => ({ id:k, label:FLOORS[k].name, thumb:'f:' + k })), f.m === 'colore' ? null : f.m, v => mutate(() => { f.m = v; }), false));
    add(section('Colore unico'));
    add(colorRow(f.m === 'colore' ? f.col : null, v => mutate(() => { f.m = 'colore'; f.col = v; }), false));
    acts.append(btn('Duplica', duplicateSel), btn('Elimina', deleteSel, 'danger'));
  } else if (it.type === 'rail'){
    const r = it.obj; title.textContent = { rail:'Parapetto', glazed:'Vetrata', fence:'Ringhiera' }[r.kind];
    add(fld('Tipo', selIn([['rail','Parapetto pieno'],['glazed','Vetrata'],['fence','Ringhiera']], r.kind, v => mutate(() => { r.kind = v; }))));
    if (r.kind !== 'glazed') add(fld('Altezza (m)', numIn(r.h || 1, .05, .3, v => mutate(() => { r.h = clamp(v, .3, 2); }))));
    if (r.kind === 'fence') add(fld('Muretto alla base (m)', numIn(r.base || 0, .05, 0, v => mutate(() => { r.base = clamp(v, 0, 1.2); }))));
    if (r.kind === 'glazed'){
      const pw = r.pw || 1.6;
      let len = 0; for (let i=0; i<r.pts.length-1; i++) len += Math.hypot(r.pts[i+1][0]-r.pts[i][0], r.pts[i+1][1]-r.pts[i][1]);
      add(section('Finestre nella vetrata'));
      add(fld('Larghezza di ogni vetro (m)', numIn(pw, .05, .2, v => mutate(() => { r.pw = clamp(v, .2, 4); }))));
      const seg = el('div','segs');
      [[1.6,'Grandi'],[1,'1 al metro'],[.5,'2 al metro'],[.33,'3 al metro']].forEach(q => {
        const b = el('button', null, q[1]); b.type = 'button'; b.setAttribute('aria-pressed', String(Math.abs(pw - q[0]) < .01));
        b.addEventListener('click', () => mutate(() => { r.pw = q[0]; }));
        seg.appendChild(b);
      });
      add(seg);
      add(note('Circa ' + Math.max(1, Math.round(len * S / pw)) + ' finestre su ' + fmtLen(len) + '. Colore e texture qui sotto riguardano il muretto sotto la vetrata; il lato interno della veranda è quello verso sud o est.'));
    }
    if (r.kind === 'fence'){
      add(section('Colore della ringhiera'));
      add(colorRow(r.col, v => mutate(() => { r.col = v || undefined; }), true));
      if (r.base > 0){
        add(section('Colore del muretto'));
        add(colorRow(r.bcol, v => mutate(() => { r.bcol = v || undefined; }), true));
      }
    } else wallFinishSides(r, null);
    if (r.pts.length > 2) acts.append(btn('Separa i tratti', splitRail));
    acts.append(btn('Duplica', duplicateSel), btn('Elimina', deleteSel, 'danger'));
  } else if (it.type === 'furn'){
    const f = it.obj; title.textContent = FURN[f.type].n;
    add(fld('Larghezza (m)', numIn(f.w, .05, .1, v => mutate(() => { f.w = clamp(v, .1, 8); }))));
    add(fld('Profondità (m)', numIn(f.d, .05, .1, v => mutate(() => { f.d = clamp(v, .1, 8); }))));
    add(fld('Altezza (m)', numIn(f.h, .05, .01, v => mutate(() => { f.h = clamp(v, .01, 4); }))));
    add(fld('Rotazione (°)', numIn(f.rot, 5, 0, v => mutate(() => { f.rot = ((v % 360) + 360) % 360; }))));
    if (rightAngle(f.rot)){
      const hh = furnHalf(f, f.rot), cl = clearTxt(clearances(f.x - hh[0], f.x + hh[0], f.y - hh[1], f.y + hh[1], obstacleFaces()));
      if (cl) add(note('Distanza dai muri: ' + cl + '. Avvicinalo a un muro e si appoggia da solo; tieni premuto Alt per muoverlo libero.'));
    }
    add(section('Colore'));
    add(colorRow(f.col, v => mutate(() => { f.col = v || undefined; }), true));
    acts.append(btn('Ruota di 90°', () => mutate(() => { f.rot = (f.rot + 90) % 360; })), btn('Duplica', duplicateSel), btn('Elimina', deleteSel, 'danger'));
  } else if (it.type === 'sys' || it.type === 'run'){
    sysProps(it, add, acts, title);
  } else if (it.type === 'label'){
    const l = it.obj; title.textContent = 'Nome sul pavimento';
    add(fld('Testo', txtIn(l.text, v => mutate(() => { l.text = v; }))));
    add(fld('Larghezza (m)', numIn(labelWpx(l)*S, .1, .3, v => mutate(() => { l.w = clamp(v/S*0.03, .3, 8); }))));
    acts.append(btn('Duplica', duplicateSel), btn('Elimina', deleteSel, 'danger'));
  }
  add(acts);
}
$('sclose').addEventListener('click', () => setSel(null));
$('scollapse').addEventListener('click', () => {
  const c = sheetEl.dataset.collapsed === '1';
  sheetEl.dataset.collapsed = c ? '0' : '1';
  $('scollapse').setAttribute('aria-label', c ? 'Riduci la scheda' : 'Apri la scheda');
  $('scollapse').style.transform = c ? '' : 'rotate(180deg)';
});

export { propsEl, refreshProps, sheetEl };
