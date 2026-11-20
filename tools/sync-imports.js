// Rigenera le righe import/export dei moduli in src/ (uso: npm install && npm run imports).
// Ogni modulo dichiara i suoi nomi globali senza "export"; questo script trova chi usa cosa
// (analisi dello scope con eslint-scope), scrive gli import in cima e un "export { ... };" in fondo.
// Segnala nomi globali duplicati fra moduli: devono essere tutti diversi perché il file HTML
// scaricabile unisce i moduli in un solo script (vedi bundleModules in src/storage.js).
const fs = require('fs'), path = require('path');
const acorn = require('acorn'), escope = require('eslint-scope');
const dir = process.argv[2] || path.join(__dirname, '..', 'src');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
const strip = s => s.replace(/^import\s.*?\sfrom\s+'[^']+';[ \t]*\n/gm, '').replace(/^export\s*\{[^}]*\};?[ \t]*\n?/gm, '').replace(/^\n+/, '').replace(/\n+$/, '\n');
/* moduli aggiuntivi di three.js (three/addons/...) */
const ADDONS = { OrbitControls:'controls/OrbitControls.js', Sky:'objects/Sky.js', EffectComposer:'postprocessing/EffectComposer.js',
  RenderPass:'postprocessing/RenderPass.js', GTAOPass:'postprocessing/GTAOPass.js', UnrealBloomPass:'postprocessing/UnrealBloomPass.js',
  OutputPass:'postprocessing/OutputPass.js', mergeGeometries:'utils/BufferGeometryUtils.js' };
const mods = {};
const BROWSER = new Set(Object.getOwnPropertyNames(globalThis).concat(['document','window','navigator','localStorage','requestAnimationFrame','getComputedStyle','matchMedia','ResizeObserver','MutationObserver','FileReader','Blob','URL','fetch','console','setTimeout','clearTimeout','Promise','location','devicePixelRatio','HTMLElement','performance']));
for (const f of files){
  const code = strip(fs.readFileSync(path.join(dir, f), 'utf8'));
  const ast = acorn.parse(code, { ecmaVersion:'latest', sourceType:'module', ranges:true });
  const sm = escope.analyze(ast, { ecmaVersion:2022, sourceType:'module' });
  const ms = sm.acquire(ast, true) || sm.globalScope;
  const decl = new Set(ms.variables.map(v => v.name));
  const through = new Set(ms.through.map(r => r.identifier.name));
  mods[f] = { code, decl, through };
}
const owner = {};
for (const f in mods) for (const n of mods[f].decl){
  if (owner[n]) console.error('DUPLICATE top-level name', n, owner[n], f);
  owner[n] = f;
}
const exportsOf = {}; for (const f in mods) exportsOf[f] = new Set();
const unknown = {};
for (const f in mods){
  const m = mods[f], imp = {};
  for (const n of m.through){
    if (owner[n] && owner[n] !== f){ (imp[owner[n]] = imp[owner[n]] || []).push(n); exportsOf[owner[n]].add(n); }
    else if (n !== 'THREE' && !ADDONS[n] && !BROWSER.has(n)) (unknown[f] = unknown[f] || []).push(n);
  }
  m.imp = imp;
}
const ORDER = ['core.js','dom.js','scene.js','textures.js','materials.js','furniture.js','model.js','build.js','views.js','walk.js','editor.js','overlay.js','props.js','variants.js','storage.js','prestazioni.js','ambiente.js','contesto.js','tetto.js','misure.js','panorama.js','main.js','impianti.js'];
const rank = f => { const i = ORDER.indexOf(f); return i < 0 ? 99 : i; };
for (const f in mods){
  const m = mods[f], head = [];
  if (m.through.has('THREE')) head.push("import * as THREE from 'three';");
  Object.keys(ADDONS).forEach(a => { if (m.through.has(a)) head.push('import { ' + a + " } from 'three/addons/" + ADDONS[a] + "';"); });
  Object.keys(m.imp).sort((a,b) => rank(a) - rank(b)).forEach(o => head.push('import { ' + m.imp[o].sort().join(', ') + " } from './" + o + "';"));
  const ex = [...exportsOf[f]].sort();
  let out = (head.length ? head.join('\n') + '\n\n' : '') + m.code;
  if (ex.length) out += '\nexport { ' + ex.join(', ') + ' };\n';
  fs.writeFileSync(path.join(dir, f), out);
}
if (Object.keys(unknown).length) console.error('UNRESOLVED', JSON.stringify(unknown));
