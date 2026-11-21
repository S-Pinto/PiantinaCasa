import { $, st } from './core.js';
import { activeVar, mergePlans, normalize, planToJson } from './model.js';
import { rebuild } from './build.js';
import { flash, pushUndo, validateSel } from './editor.js';
import { refreshProps } from './props.js';

/* Salvataggi (dispositivo, account Claude), file condiviso, file HTML da inviare, import/export. */

/* ---------- salvataggio ----------
   Un solo salvataggio sul dispositivo, che non dipende dalla piantina pubblicata: prima la chiave
   cambiava a ogni aggiornamento del sito e le modifiche sembravano sparite. Insieme alla piantina
   salvo anche la piantina pubblicata da cui è partita (base): se il sito viene aggiornato,
   unisco le novità alle tue modifiche (mergePlans) invece di buttarne via una delle due. */
const LOCAL_KEY = 'piantina-via-verona-v3';
const OLD_PREFIX = 'piantina-via-verona-v2';
/* nel file HTML scaricato ogni file ha il suo salvataggio (la piantina è dentro il file) */
const storageKey = () => LOCAL_KEY + (st.publishedTs ? '-' + st.publishedTs : '');
let dbDoc = null, saveTimer = null, userEdited = false, dirty = false;
function statusMsg(t){
  $('status').textContent = t;
  /* fuori dalla modifica la riga di stato è nascosta: il messaggio compare in basso per qualche secondo */
  if ($('status').hidden && t) flash(t, 3500);
}
function updateFileNote(){
  const same = JSON.stringify(st.plan) === st.publishedJson;
  $('fileNote').textContent = st.artifactApi === false
    ? 'In questa vista non puoi salvare nel file condiviso.'
    : same ? 'La piantina condivisa è aggiornata: chi apre il link vede questa versione.'
           : 'Ci sono modifiche non ancora nel file condiviso. Premi il pulsante per farle vedere a chi apre il link.';
}
function scheduleSave(){
  updateFileNote();
  userEdited = true; dirty = true; statusMsg('Modifiche non ancora salvate…');
  clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 400);
}
function saveRecord(ts){ return { ts:ts, json:JSON.stringify(st.plan), base:st.publishedJson, key:st.planKey }; }
function saveLocal(rec){
  try { localStorage.setItem(storageKey(), JSON.stringify(rec)); return true; }
  catch(e){
    /* spazio pieno: tolgo i salvataggi vecchi e riprovo */
    try { oldKeys().forEach(k => localStorage.removeItem(k)); localStorage.setItem(storageKey(), JSON.stringify(rec)); return true; } catch(_){ return false; }
  }
}
async function saveNow(){
  clearTimeout(saveTimer);
  const rec = saveRecord(Date.now());
  const local = saveLocal(rec);
  dirty = false;
  let remote = false;
  if (dbDoc){ try { await dbDoc.set(rec); remote = true; } catch(e){} }
  const t = new Date().toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' });
  const v = activeVar(st.plan), vn = (v && st.plan.variants.length > 1) ? ' (versione «' + v.name + '»)' : '';
  statusMsg(remote ? 'Salvato alle ' + t + ' sul tuo account' + vn + '.'
          : local  ? 'Salvato alle ' + t + ' su questo dispositivo' + vn + '.'
                   : 'Non sono riuscito a salvare. Usa Esporta per conservare la piantina.');
}
/* salvataggio immediato quando la pagina va in secondo piano o si chiude (sul telefono il timer non partirebbe più) */
function flushSave(){ if (dirty){ clearTimeout(saveTimer); saveLocal(saveRecord(Date.now())); dirty = false; if (dbDoc) dbDoc.set(saveRecord(Date.now())).catch(() => {}); } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSave(); });
window.addEventListener('pagehide', flushSave);
/* salvataggi della versione precedente, uno per ogni piantina pubblicata */
function oldKeys(){
  const out = [];
  try { for (let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i); if (k && k.indexOf(OLD_PREFIX) === 0) out.push(k); } } catch(e){}
  return out;
}
/* Porta nella pagina un salvataggio: uguale alla piantina pubblicata di oggi, oppure unito alle sue novità */
function applySaved(o){
  try {
    if (!o || !o.json) return false;
    const mine = normalize(JSON.parse(o.json));
    if (!mine.walls.length) return false;
    const pub = JSON.parse(st.publishedJson);
    let n = mine, merged = false;
    if (o.base !== st.publishedJson){
      const base = o.base ? normalize(JSON.parse(o.base)) : null;
      n = mergePlans(base, mine, pub); merged = true;
    }
    st.plan = n; rebuild(); validateSel(); st.overlayDirty = true; refreshProps();
    if (merged) setTimeout(() => flash('La piantina è stata aggiornata: ho unito le novità alle tue modifiche.', 5000), 1500);
    return true;
  } catch(e){ console.error('Salvataggio non applicato', e); return false; }
}
function readLocal(){
  let best = null;
  try { const raw = localStorage.getItem(storageKey()); if (raw) best = JSON.parse(raw); } catch(e){}
  /* nessun salvataggio nuovo: recupero il più recente fra quelli vecchi (erano legati a ogni aggiornamento del sito) */
  if (!best && !st.publishedTs) oldKeys().forEach(k => {
    try {
      const o = JSON.parse(localStorage.getItem(k));
      /* se era legato alla piantina pubblicata di oggi la base è nota, altrimenti no */
      if (o && o.json && (!best || (o.ts || 0) > (best.ts || 0))) best = { ts:o.ts || 0, json:o.json, base:k === OLD_PREFIX + '-' + st.planKey ? st.publishedJson : null };
    } catch(e){}
  });
  return best;
}
async function initStorage(){
  let localTs = 0;
  const lo = readLocal();
  if (lo && (lo.ts || 0) > st.publishedTs && applySaved(lo)){
    localTs = lo.ts || 0;
    if (!lo.key) saveLocal(saveRecord(localTs || Date.now()));   /* passo al formato nuovo */
  }
  try {
    if (!window.claude || !window.claude.use) return;
    const caps = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
    const db = caps[0], user = caps[1];
    if (!db || !user) return;
    const id = await user.id(); if (!id) return;
    dbDoc = db.doc('data/users/' + id + '/plan');
    const snap = await dbDoc.get();
    if (snap.exists){
      const d = snap.data();
      if (d && d.json && (d.ts || 0) > Math.max(localTs, st.publishedTs) && !userEdited && applySaved(d)) statusMsg('Piantina caricata dal tuo account.');
      else if (d && localTs > (d.ts || 0) && !userEdited) saveNow();
    } else if (localTs && !userEdited) saveNow();
  } catch(e){}
}
$('save').addEventListener('click', saveNow);

/* ---------- salvataggio dentro il file (versione condivisa) ---------- */
const HEAD_HTML = "<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n<title>Appartamento di Via Verona, piantina in 3D</title>\n<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">\n<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>\n<link href=\"https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;700&display=swap\" rel=\"stylesheet\">\n";
/* Un unico file HTML con stile, codice e piantina dentro (three.js arriva dalla CDN).
   Dal sito il codice è diviso in moduli: li scarico e li unisco (vedi bundleModules).
   Da un file già unito riuso il suo stesso codice. */
async function buildHtml(planObj, o){
  const json = JSON.stringify({ ts:Date.now(), plan:planObj, view:(o && o.view) ? 1 : undefined }).replace(/</g, '\\u003c');
  const cssEl = $('appcss'), appEl = $('app'), mapEl = document.querySelector('script[type="importmap"]');
  const css = cssEl.tagName === 'STYLE' ? cssEl.textContent : await fetchText(cssEl.href);
  const js = (appEl && appEl.textContent.trim()) ? appEl.textContent : await bundleModules(new URL('./main.js', import.meta.url).href);
  const markup = $('body-src').innerHTML;
  const end = '<' + '/script>';
  return '<!doctype html>\n<html lang="it">\n<head>\n' + HEAD_HTML + '<style id="appcss">' + css + '</style>\n' +
    '<script type="importmap">' + mapEl.textContent.trim() + end + '\n</head>\n<body>\n' +
    '<template id="body-src">' + markup + '</template>\n' +
    '<script id="plan-data" type="application/json">' + json + end + '\n' +
    '<script type="module" id="app">' + js.replace(/<\/script/gi, '<\\/script') + end + '\n</body>\n</html>\n';
}
async function fetchText(url){
  const r = await fetch(url, { cache:'no-cache' });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
  return r.text();
}
/* Unisce i moduli in un solo script, nell’ordine in cui il browser li eseguirebbe.
   Funziona perché i moduli seguono due regole: import ed export su una riga sola
   ("import { a, b } from './x.js';" ed "export { a, b };" in fondo) e nomi globali tutti diversi. */
async function bundleModules(entry){
  const seen = new Set(), parts = [], external = [];
  async function visit(url){
    if (seen.has(url)) return;
    seen.add(url);
    const code = await fetchText(url);
    const re = /^import\s.*?\sfrom\s+'([^']+)';[ \t]*$/gm;
    let m;
    while ((m = re.exec(code))){
      if (m[1].startsWith('.')) await visit(new URL(m[1], url).href);
      else if (external.indexOf(m[0]) < 0) external.push(m[0]);
    }
    const body = code.replace(/^import\s.*?\sfrom\s+'[^']+';[ \t]*$/gm, '').replace(/^export\s*\{[^}]*\};?[ \t]*$/gm, '');
    parts.push('/* ---- ' + url.split('/').pop() + ' ---- */\n' + body.trim() + '\n');
  }
  await visit(entry);
  return '\n' + external.join('\n') + '\n\n' + parts.join('\n');
}
async function saveToFile(){
  if (!st.artifactApi){ statusMsg('In questa vista non puoi salvare nel file condiviso.'); return; }
  const b = $('saveFile'); b.disabled = true;
  statusMsg('Salvataggio nel file condiviso…');
  try {
    await saveNow();
    await st.artifactApi.publish(await buildHtml(st.plan));
    statusMsg('Salvato nel file condiviso. La pagina si ricarica.');
  } catch(e){
    b.disabled = false;
    const c = e && e.code;
    statusMsg(c === 'conflict' ? 'Nel frattempo è stata pubblicata un’altra versione: la pagina si ricarica.'
      : (c === 'not_writer' || c === 'not_granted' || c === 'not_declared' || c === 'capability_disabled' || c === 'capability_removed' || c === 'consent_required')
        ? 'Da questa vista non puoi salvare nel file condiviso. Le modifiche restano su questo dispositivo: usa Esporta per conservarle.'
      : c === 'too_large' ? 'La piantina è troppo grande per essere salvata nel file.'
      : 'Salvataggio non riuscito. Riprova fra poco.');
  }
}
$('saveFile').addEventListener('click', saveToFile);

/* ---------- scarica un file HTML da inviare ---------- */
async function downloadHtml(){
  let html;
  try { html = await buildHtml(st.plan, { view:$('optViewOnly').checked }); }
  catch(e){ console.error(e); statusMsg('Non riesco a preparare il file: serve la connessione al sito.'); return; }
  const name = 'piantina-via-verona.html';
  try {
    const dl = (window.claude && window.claude.use) ? await window.claude.use('downloads') : null;
    if (dl){ await dl.save({ filename:name, data:html }); statusMsg('File pronto: allegalo a una mail.'); return; }
  } catch(e){ if (e && e.code === 'declined') return; }
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([html], { type:'text/html' })); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    statusMsg('File scaricato: allegalo a una mail.');
  } catch(e){ statusMsg('Non riesco a scaricare il file da qui.'); }
}
$('dlfile').addEventListener('click', downloadHtml);
/* Da chiamare dopo aver caricato la piantina: nel file "solo da guardare" niente strumenti */
function initFileUi(){ if (st.viewOnlyFile){ $('btnEdit').hidden = true; $('dlbox').hidden = true; } }
async function initArtifact(){
  try {
    if (!window.claude || !window.claude.use){ st.artifactApi = false; }
    else { const a = await window.claude.use('artifact'); st.artifactApi = a || false; }
  } catch(e){ st.artifactApi = false; }
  if (st.artifactApi === false) $('saveFile').disabled = true;
  updateFileNote();
}

function openDlg(text){ $('dlgtext').value = text; $('dlg').hidden = false; $('dlgtext').focus(); }
$('dlgclose').addEventListener('click', () => { $('dlg').hidden = true; });
$('dlgcopy').addEventListener('click', async () => {
  const ta = $('dlgtext'); ta.select();
  try { await navigator.clipboard.writeText(ta.value); statusMsg('Testo copiato.'); }
  catch(e){ try { document.execCommand('copy'); statusMsg('Testo copiato.'); } catch(_){} }
});
function importText(text){
  let n = null;
  try { n = normalize(JSON.parse(text)); } catch(e){}
  if (!n || !n.walls.length){ statusMsg('Il testo non è una piantina valida.'); return false; }
  const before = JSON.stringify(st.plan);
  st.plan = n; st.sel = null; pushUndo(before); rebuild(); st.overlayDirty = true; refreshProps();
  statusMsg('Piantina importata.'); return true;
}
$('dlgapply').addEventListener('click', () => { if (importText($('dlgtext').value)) $('dlg').hidden = true; });
$('text').addEventListener('click', () => openDlg(planToJson(st.plan)));
$('import').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', e => {
  const f = e.target.files && e.target.files[0]; if (!f) return;
  const r = new FileReader(); r.onload = () => importText(String(r.result)); r.readAsText(f); e.target.value = '';
});
$('export').addEventListener('click', async () => {
  const data = planToJson(st.plan);
  try {
    const dl = (window.claude && window.claude.use) ? await window.claude.use('downloads') : null;
    if (dl){ await dl.save({ filename:'piantina-via-verona.json', data:data }); statusMsg('Piantina esportata.'); return; }
  } catch(e){ if (e && e.code === 'declined') return; }
  openDlg(data);
});
let resetArmed = false;
$('reset').addEventListener('click', () => {
  const b = $('reset');
  if (!resetArmed){
    resetArmed = true; b.textContent = 'Confermi?';
    setTimeout(() => { resetArmed = false; b.textContent = 'Ripristina'; }, 3500); return;
  }
  resetArmed = false; b.textContent = 'Ripristina';
  const before = JSON.stringify(st.plan);
  st.plan = normalize(JSON.parse(st.publishedJson)); st.sel = null; pushUndo(before); rebuild(); st.overlayDirty = true; refreshProps();
  statusMsg('Piantina originale ripristinata. Puoi ancora annullare.');
});

export { flushSave, initArtifact, initFileUi, initStorage, scheduleSave };
