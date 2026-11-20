import { $, st } from './core.js';
import { btn, el, fld, note, section, selIn, txtIn } from './dom.js';
import { CMPG, camera, resize } from './scene.js';
import { activeVar, loadVariant, storeActive, uid } from './model.js';
import { buildCmp, clearGroup } from './build.js';
import { controls, preset, setHint } from './views.js';
import { flash, mutate, setEditing } from './editor.js';
import { refreshProps } from './props.js';
import { toggleSysMenu } from './impianti.js';

/* ---------- menu opzioni ---------- */
const menuEl = $('menu'), btnMenu = $('btnMenu');
function toggleMenu(open){ menuEl.hidden = !open; btnMenu.setAttribute('aria-expanded', String(open)); if (open) toggleVar(false); }
btnMenu.addEventListener('click', () => { if (menuEl.hidden) toggleSysMenu(false); toggleMenu(menuEl.hidden); });
document.addEventListener('pointerdown', e => {
  if (!menuEl.hidden && !menuEl.contains(e.target) && !btnMenu.contains(e.target)) toggleMenu(false);
});
window.addEventListener('keydown', e => { if (e.key === 'Escape' && !menuEl.hidden) toggleMenu(false); });

/* ---------- versioni di arredo ---------- */
const vpanel = $('vpanel'), btnVar = $('btnVar');
function toggleVar(open){
  vpanel.hidden = !open; btnVar.setAttribute('aria-expanded', String(open));
  if (open){ toggleMenu(false); renderVarPanel(); }
}
btnVar.addEventListener('click', () => toggleVar(vpanel.hidden));
document.addEventListener('pointerdown', e => {
  if (!vpanel.hidden && !vpanel.contains(e.target) && !btnVar.contains(e.target)) toggleVar(false);
});
window.addEventListener('keydown', e => { if (e.key === 'Escape' && !vpanel.hidden) toggleVar(false); });

function switchVariant(id){
  if (id === st.plan.active || !st.plan.variants.some(v => v.id === id)) return;
  if (st.cmpId === id) st.cmpId = st.plan.active;      /* nel confronto le due metà si scambiano */
  mutate(() => { storeActive(st.plan); loadVariant(st.plan, id); });
  st.sel = null; st.overlayDirty = true; refreshProps();
  flash('Versione: ' + activeVar(st.plan).name);
}
function newVariant(empty){
  const cur = activeVar(st.plan), id = uid();
  const base = empty ? 'Nuova versione' : cur.name + ' (copia)';
  let name = base, n = 2;
  while (st.plan.variants.some(v => v.name === name)) name = base + ' ' + (n++);
  mutate(() => {
    storeActive(st.plan);
    st.plan.variants.splice(st.plan.variants.indexOf(cur) + 1, 0, { id:id, name:name.slice(0,40) });
    st.plan.active = id;
    if (empty) st.plan.furniture = [];
  });
  st.sel = null; st.overlayDirty = true; refreshProps();
  renderVarPanel(true);
}
let delArmed = false;
function deleteVariant(b){
  if (st.plan.variants.length < 2) return;
  if (!delArmed){
    delArmed = true; b.textContent = 'Confermi?';
    setTimeout(() => { if (delArmed){ delArmed = false; renderVarPanel(); } }, 3500); return;
  }
  delArmed = false;
  const cur = activeVar(st.plan), i = st.plan.variants.indexOf(cur), next = st.plan.variants[i ? i - 1 : 1];
  mutate(() => {
    st.plan.variants.splice(i, 1);
    loadVariant(st.plan, next.id);
  });
  st.sel = null; st.overlayDirty = true; refreshProps();
  flash('Versione eliminata. Puoi ancora annullare.');
}
function setCompare(id){
  st.cmpId = (id && id !== st.plan.active && st.plan.variants.some(v => v.id === id)) ? id : null;
  if (st.cmpId && st.editing) setEditing(false);
  syncVariants();
  if (!st.cmpId) resize();
  setHint();
  if (st.mode !== 'walk'){            /* reinquadro la casa per la nuova forma della vista */
    const p = preset(st.mode);
    st.tween = { t:0, dur:.7, fp:camera.position.clone(), ft:controls.target.clone(), tp:p.pos, tt:p.tgt };
  }
}
/* Chiamata a ogni ricostruzione: aggiorna etichetta, confronto e pannello */
function syncVariants(){
  const a = activeVar(st.plan);
  $('varLbl').textContent = a.name;
  btnVar.title = 'Versione di arredo: ' + a.name;
  if (st.cmpId && (st.cmpId === st.plan.active || !st.plan.variants.some(v => v.id === st.cmpId))) st.cmpId = null;
  if (st.cmpId) buildCmp(); else { clearGroup(CMPG.f); clearGroup(CMPG.w); clearGroup(CMPG.u); }
  $('cmpui').hidden = !st.cmpId;
  if (st.cmpId){ $('cmpA').textContent = a.name; $('cmpB').textContent = st.plan.variants.find(v => v.id === st.cmpId).name; }
  if (!vpanel.hidden) renderVarPanel();
}
function renderVarPanel(focusName){
  if (vpanel.hidden) return;
  const ro = st.viewOnlyFile;
  vpanel.textContent = '';
  const add = n => vpanel.appendChild(n);
  add(section('Versioni di arredo'));
  const list = el('div','vlist');
  st.plan.variants.forEach(v => {
    const b = el('button','vrow'); b.type = 'button';
    b.setAttribute('aria-pressed', String(v.id === st.plan.active));
    const n = v.id === st.plan.active ? st.plan.furniture.length : (v.furniture || []).length;
    b.append(el('span','vn', v.name), el('span','vc', n === 1 ? '1 arredo' : n + ' arredi'));
    b.addEventListener('click', () => switchVariant(v.id));
    list.appendChild(b);
  });
  add(list);
  if (!ro){
    const nm = txtIn(activeVar(st.plan).name, v => { if (v) mutate(() => { activeVar(st.plan).name = v; }); });
    add(fld('Nome', nm));
    const acts = el('div','acts');
    acts.append(btn('Duplica', () => newVariant(false)), btn('Nuova vuota', () => newVariant(true)));
    if (st.plan.variants.length > 1){
      const d = btn(delArmed ? 'Confermi?' : 'Elimina', () => deleteVariant(d), 'danger'); acts.append(d);
    }
    add(acts);
    if (focusName){ nm.focus(); nm.select(); }
  }
  if (st.plan.variants.length > 1){
    add(section('Confronto affiancato'));
    const others = st.plan.variants.filter(v => v.id !== st.plan.active);
    let pick = (st.cmpId && others.some(v => v.id === st.cmpId)) ? st.cmpId : others[0].id;
    add(fld('Accanto a', selIn(others.map(v => [v.id, v.name]), pick, v => { pick = v; if (st.cmpId) setCompare(v); })));
    const cb = btn(st.cmpId ? 'Chiudi il confronto' : 'Confronta affiancate', () => setCompare(st.cmpId ? null : pick), st.cmpId ? '' : 'primary');
    cb.style.width = '100%'; cb.style.marginTop = '6px';
    add(cb);
  }
  add(note('Muri, porte, finestre e forma delle stanze sono uguali in tutte le versioni. Cambiano arredi, pavimenti, colori e rivestimenti.' +
    (ro ? '' : ' Per modificare la versione attiva usa Modifica.')));
}

export { setCompare, syncVariants, toggleMenu, toggleVar };
