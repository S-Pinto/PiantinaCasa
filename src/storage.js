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
  const gh = !st.artifactApi && ghAvailable();
  $('fileNote').textContent = st.artifactApi === false && !gh
    ? 'Le modifiche si salvano da sole su questo dispositivo. Da qui non si può aggiornare la piantina del sito: usa Esporta per portarle altrove.'
    : same ? 'La piantina del sito è aggiornata: telefono, computer e chi apre il link vedono questa versione.'
           : gh ? 'Le modifiche sono salvate solo su questo dispositivo. Premi il pulsante per metterle sul sito e ritrovarle anche sugli altri.'
                : 'Ci sono modifiche non ancora nel file condiviso. Premi il pulsante per farle vedere a chi apre il link.';
  $('saveFile').disabled = st.artifactApi === false && !gh;
  $('ghForget').hidden = !(gh && ghToken());
}
function scheduleSave(){
  updateFileNote();
  userEdited = true; dirty = true; statusMsg('Modifiche non ancora salvate…');
  clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 400);
}
/* prev: la piantina che il sito mostrava prima di un salvataggio su GitHub. Finché il sito non si aggiorna
   (un minuto circa) continua a mostrare quella: non va presa per una novità da unire, o annullerebbe le modifiche. */
let prevPublished = null;
function saveRecord(ts){ return { ts:ts, json:JSON.stringify(st.plan), base:st.publishedJson, key:st.planKey, prev:prevPublished || undefined }; }
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
    if (o.prev && o.prev === st.publishedJson && o.base){
      /* salvato sul sito, ma il sito mostra ancora la versione di prima: tengo la mia e ricordo da dove viene */
      st.publishedJson = o.base; prevPublished = o.prev;
    } else if (o.base !== st.publishedJson){
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
  if (!st.artifactApi){
    if (!ghAvailable()){ statusMsg('Da qui non si può aggiornare la piantina del sito: usa Esporta per conservarla.'); return; }
    if (!ghToken()){ showGhBox(true); return; }
    return saveToGitHub();
  }
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

/* ---------- salvataggio sul sito (GitHub) ----------
   Il sito pubblicato su GitHub Pages legge data/plan.json dal progetto su GitHub. Con una chiave personale
   (creata da chi possiede il progetto, solo per questo progetto, permesso Contents: Read and write) la pagina
   scrive lì la piantina: dopo un minuto circa il sito si aggiorna e telefono e computer vedono le stesse modifiche.
   Se nel frattempo la piantina sul sito è cambiata, unisco le due versioni (mergePlans) prima di scrivere. */
const GH_KEY = 'piantina-github';
const GH_REPO = (() => {
  const h = location.hostname, seg = location.pathname.split('/').filter(Boolean)[0];
  if (/\.github\.io$/.test(h) && seg) return { owner:h.split('.')[0], repo:seg };
  return { owner:'S-Pinto', repo:'PiantinaCasa' };
})();
const GH_PATH = 'data/plan.json', GH_BRANCH = 'main';
/* nel file HTML scaricato la piantina è dentro il file: lì GitHub non c'entra */
function ghAvailable(){ return !document.getElementById('plan-data') && /^https?:$/.test(location.protocol); }
function ghToken(){ try { return localStorage.getItem(GH_KEY) || ''; } catch(e){ return ''; } }
function showGhBox(on){
  $('ghbox').hidden = !on;
  if (on){ $('ghToken').value = ''; $('ghToken').focus(); statusMsg('Serve la chiave di GitHub, una volta sola su questo dispositivo.'); }
}
function b64encode(text){
  const bytes = new TextEncoder().encode(text); let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function b64decode(b64){
  const bin = atob(b64.replace(/\s/g, '')), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
async function ghFetch(method, body){
  const url = 'https://api.github.com/repos/' + GH_REPO.owner + '/' + GH_REPO.repo + '/contents/' + GH_PATH + (method === 'GET' ? '?ref=' + GH_BRANCH + '&t=' + Date.now() : '');
  const r = await fetch(url, { method, cache:'no-store', headers:{ 'Accept':'application/vnd.github+json', 'Authorization':'Bearer ' + ghToken(), 'X-GitHub-Api-Version':'2022-11-28' },
    body:body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok){ const e = new Error(data.message || ('HTTP ' + r.status)); e.status = r.status; throw e; }
  return data;
}
let ghBusy = false;
async function saveToGitHub(){
  if (ghBusy) return;
  ghBusy = true; const b = $('saveFile'); b.disabled = true;
  statusMsg('Salvataggio sul sito…');
  try {
    for (let attempt = 0; attempt < 2; attempt++){
      const cur = await ghFetch('GET');
      const remoteText = b64decode(cur.content || '');
      const remote = normalize(JSON.parse(remoteText));
      const remoteJson = JSON.stringify(remote);
      let mine = st.plan, merged = false;
      /* qualcuno (un altro dispositivo, o un aggiornamento del sito) ha cambiato la piantina da quando l'hai aperta */
      if (remoteJson !== st.publishedJson && remoteJson !== JSON.stringify(st.plan)){
        mine = mergePlans(normalize(JSON.parse(st.publishedJson)), st.plan, remote); merged = true;
      }
      const text = planToJson(mine);
      if (JSON.stringify(normalize(JSON.parse(text))) === remoteJson){ finishGh(mine, remoteJson, merged, false); return; }
      try {
        await ghFetch('PUT', { message:'Piantina: modifiche salvate dall\u2019app', content:b64encode(text), sha:cur.sha, branch:GH_BRANCH });
      } catch(e){ if (e.status === 409 && attempt === 0) continue; throw e; }   /* scritta da un altro proprio ora: riprovo */
      finishGh(mine, JSON.stringify(normalize(JSON.parse(text))), merged, true);
      return;
    }
  } catch(e){
    const s = e && e.status;
    if (s === 401){ try { localStorage.removeItem(GH_KEY); } catch(_){} showGhBox(true);
      statusMsg('GitHub non accetta la chiave (scaduta o sbagliata). Creane una nuova e incollala qui.'); }
    else if (s === 403 || s === 404) statusMsg('La chiave non ha il permesso di scrivere in ' + GH_REPO.repo + ': in GitHub dalle «Contents: Read and write» su questo progetto.');
    else statusMsg('Salvataggio sul sito non riuscito (' + (navigator.onLine === false ? 'manca la connessione' : (e && e.message) || 'errore') + '). Le modifiche restano su questo dispositivo: riprova fra poco.');
  } finally { ghBusy = false; updateFileNote(); }
}
function finishGh(plan, newPublished, merged, wrote){
  if (plan !== st.plan){ st.plan = plan; rebuild(); validateSel(); st.overlayDirty = true; refreshProps(); }
  if (st.publishedJson !== newPublished) prevPublished = st.publishedJson;
  st.publishedJson = newPublished;
  saveLocal(saveRecord(Date.now())); dirty = false;
  const t = new Date().toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' });
  statusMsg(!wrote ? 'Il sito aveva già questa piantina.'
    : (merged ? 'Unite le modifiche arrivate da un altro dispositivo e salvato' : 'Salvato') + ' sul sito alle ' + t + '. Fra un minuto circa la trovi uguale su telefono e computer.');
  updateFileNote();
}
$('ghLink').addEventListener('click', () => {
  const v = $('ghToken').value.trim();
  if (!/^(github_pat_|ghp_|gho_)[A-Za-z0-9_]{20,}$/.test(v)){ statusMsg('Questa non sembra una chiave di GitHub: inizia con github_pat_.'); return; }
  try { localStorage.setItem(GH_KEY, v); } catch(e){ statusMsg('Non riesco a ricordare la chiave su questo dispositivo.'); return; }
  showGhBox(false); saveToGitHub();
});
$('ghCancel').addEventListener('click', () => showGhBox(false));
$('ghForget').addEventListener('click', () => { try { localStorage.removeItem(GH_KEY); } catch(e){} statusMsg('GitHub scollegato da questo dispositivo.'); updateFileNote(); });

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
