// Prova automatica della piantina (uso: npm install && npx playwright install chromium && npm run prova).
// Apre il sito in un browser senza finestra, su computer e su telefono, e prova le cose principali:
// le tre viste, la pagina Casa, la scheda di una stanza, la mappa del sole, le misure, la modifica con il catalogo,
// e infine scarica il file HTML tutto-in-uno e controlla che si apra. Se qualcosa dà errore esce con codice 1.
// Le foto di ogni passo finiscono in prova-risultati/.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'prova-risultati');
const THREE_DIR = path.join(ROOT, 'node_modules', 'three');
fs.mkdirSync(OUT, { recursive:true });

const TYPES = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json',
  '.png':'image/png', '.svg':'image/svg+xml', '.webmanifest':'application/manifest+json', '.ico':'image/x-icon' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let f = path.join(ROOT, u === '/' ? 'index.html' : u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()){ res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type':TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port + '/';

const problems = [];
const browser = await chromium.launch({ args:['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function newPage(opts, label){
  const ctx = await browser.newContext({ ...opts, acceptDownloads:true, serviceWorkers:'block' });
  /* three.js dalla cartella node_modules invece che dalla CDN: la prova funziona anche senza internet */
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/three@[^/]+\/(.*)$/, r => {
    const m = r.request().url().match(/three@[^/]+\/(.*)$/), f = path.join(THREE_DIR, m[1]);
    if (fs.existsSync(f)) r.fulfill({ path:f, contentType:'text/javascript' }); else r.abort();
  });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  /* grafica leggera: senza scheda video la prova è lenta */
  await ctx.addInitScript(() => { try { localStorage.setItem('piantina-ambiente', JSON.stringify({ quality:'bassa', v:2 })); } catch(e){} });
  const page = await ctx.newPage();
  page.on('pageerror', e => problems.push(label + ': errore nella pagina: ' + e.message + ' (' + (e.stack || '').split('\n').slice(1, 3).map(x => x.trim()).join(' ') + ')'));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(label + ': ' + m.text()); });
  return { ctx, page };
}
/* la piantina è caricata e la scena è partita */
const ready = page => page.waitForFunction(() => import('./src/core.js').then(m => !!(m.st.plan && m.st.rev > 0)), null, { timeout:60000, polling:500 }).then(() => page.waitForTimeout(2500));
const click = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); if (!e) throw new Error('manca ' + s); e.click(); }, sel);
const settle = (page, ms = 1500) => page.evaluate(() => import('./src/core.js').then(m => { if (m.st.tween) m.st.tween.t = 1; m.st.redraw = 30; })).then(() => page.waitForTimeout(ms));

async function walkthrough(label, opts){
  const { ctx, page } = await newPage(opts, label);
  const shot = n => page.screenshot({ path:path.join(OUT, label + '-' + n + '.png') });
  const step = async (name, fn) => { try { await fn(); await shot(name); } catch(e){ problems.push(label + ' › ' + name + ': ' + e.message.split('\n')[0]); } };
  await page.goto(BASE, { waitUntil:'load' }); await ready(page);
  await step('1-prospettiva', async () => {});
  await step('2-pianta', async () => { await click(page, '[data-mode=plan]'); await settle(page); });
  await step('3-passeggiata', async () => { await click(page, '[data-mode=walk]'); await settle(page); });
  await step('4-casa', async () => { await click(page, '[data-mode=orbit]'); await settle(page, 500); await click(page, '#btnHome'); await page.waitForTimeout(800);
    const n = await page.locator('#hrooms .hroom').count(); if (n < 5) throw new Error('nella pagina Casa ci sono solo ' + n + ' stanze'); });
  await step('5-scheda-stanza', async () => { await click(page, '#hrooms .hroom'); await settle(page);
    if (await page.locator('#rcard').isHidden()) throw new Error('la scheda della stanza non si apre'); await click(page, '#rcclose'); });
  await step('6-mappa-sole', async () => { await click(page, '#btnAmb'); await page.waitForTimeout(300); await click(page, '#sunbtn');
    await page.waitForFunction(() => document.querySelectorAll('#sunres li').length > 3, null, { timeout:60000 }); await click(page, '#sunbtn'); await click(page, '#btnAmb'); });
  await step('7-misure', async () => { await click(page, '#btnMis'); await page.waitForTimeout(800);
    if (!(await page.locator('#mlist li').count())) throw new Error('le misure non elencano le stanze'); await click(page, '#btnMis'); });
  await step('8-modifica', async () => { await click(page, '#btnEdit'); await settle(page);
    await page.evaluate(() => [...document.querySelectorAll('#dock button')].find(b => /Aggiungi/.test(b.textContent)).click()); await page.waitForTimeout(800);
    if ((await page.locator('#props button').count()) < 20) throw new Error('il catalogo degli arredi è vuoto'); await click(page, '#btnEdit'); });
  await ctx.close();
}

async function bundleCheck(){
  const { ctx, page } = await newPage({ viewport:{ width:800, height:600 } }, 'file-html');
  await page.goto(BASE, { waitUntil:'load' }); await ready(page);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout:120000 }), click(page, '#dlfile')]);
  const html = fs.readFileSync(await dl.path(), 'utf8');
  fs.writeFileSync(path.join(OUT, 'piantina-via-verona.html'), html);
  const p2 = await ctx.newPage(); const errs = [];
  p2.on('pageerror', e => errs.push(e.message));
  /* come un file aperto dal disco: c'è solo la pagina, ogni altro indirizzo locale non esiste */
  await ctx.route(/^http:\/\/file\.test\//, r => new URL(r.request().url()).pathname === '/' ? r.fulfill({ body:html, contentType:'text/html' }) : r.fulfill({ status:404, body:'' }));
  /* il file costruisce tutta la scena prima dell'evento «load»: su una macchina lenta senza scheda video ci vuole tempo */
  await p2.goto('http://file.test/', { waitUntil:'domcontentloaded', timeout:120000 });
  await p2.waitForLoadState('load', { timeout:120000 });
  await p2.waitForTimeout(6000);
  await p2.screenshot({ path:path.join(OUT, 'file-html.png') });
  errs.forEach(e => problems.push('file HTML scaricato: ' + e));
  await ctx.close();
}

try {
  const solo = process.argv[2];         /* «npm run prova -- file» prova solo il file scaricabile */
  if (!solo || solo === 'computer') await walkthrough('computer', { viewport:{ width:1280, height:800 } });
  if (!solo || solo === 'telefono') await walkthrough('telefono', { ...devices['iPhone 13'] });
  if (!solo || solo === 'file')
    await bundleCheck().catch(e => problems.push('file HTML scaricato: ' + e.message.split('\n')[0]));
} catch(e){ problems.push('prova interrotta: ' + e.message); }
await browser.close(); server.close();
if (problems.length){ console.error('PROBLEMI TROVATI:\n- ' + problems.join('\n- ')); process.exit(1); }
console.log('Tutto a posto. Foto in ' + path.relative(process.cwd(), OUT) + '/');
