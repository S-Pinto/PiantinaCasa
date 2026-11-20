/* Piccoli aiuti per l’interfaccia: lettura variabili CSS e creazione di campi, pulsanti e note. */

function cssVar(n){ return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function typing(t){ return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT'); }
function el(tag, cls, txt){ const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; }
function note(t){ return el('p','note',t); }
function section(t){ return el('p','sl',t); }
function fld(label, node){ const d = el('label','fld'); d.append(el('span', null, label), node); return d; }
function numIn(val, step, min, fn){
  const i = document.createElement('input'); i.type = 'number'; i.step = step; i.min = min; i.inputMode = 'decimal'; i.value = (+val).toFixed(2);
  i.addEventListener('change', () => { const v = parseFloat(i.value); if (isFinite(v)) fn(v); });
  return i;
}
function selIn(options, val, fn){
  const s = document.createElement('select');
  options.forEach(o => { const op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; if (o[0] === val) op.selected = true; s.appendChild(op); });
  s.addEventListener('change', () => fn(s.value)); return s;
}
function txtIn(val, fn){
  const i = document.createElement('input'); i.type = 'text'; i.value = val; i.maxLength = 40;
  i.addEventListener('change', () => fn(i.value.trim())); return i;
}
function btn(text, fn, cls){ const b = el('button','btn' + (cls ? ' ' + cls : ''), text); b.type = 'button'; b.addEventListener('click', fn); return b; }

export { btn, cssVar, el, fld, note, numIn, section, selIn, txtIn, typing };
