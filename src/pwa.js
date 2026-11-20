import { $ } from './core.js';
import { flash } from './editor.js';

/* App installabile (PWA): registra il service worker (sw.js) che tiene una copia dei file
   per aprire la piantina anche senza connessione, e mostra nel menu Opzioni come installarla.
   Nel file HTML scaricato (tutto in uno, con la piantina dentro) non fa nulla. */

let installEvt = null;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function showInstall(){
  const box = $('pwabox');
  if (!box || isStandalone()) { if (box) box.hidden = true; return; }
  if (installEvt){
    $('pwaInstall').hidden = false;
    $('pwaNote').textContent = 'Come un’app: icona sul telefono o sul computer, a tutto schermo, e si apre anche senza internet.';
    box.hidden = false;
  } else if (isIos()){
    $('pwaInstall').hidden = true;
    $('pwaNote').textContent = 'Per averla come app su iPhone o iPad: in Safari tocca Condividi e poi «Aggiungi alla schermata Home».';
    box.hidden = false;
  } else box.hidden = true;
}

/* indirizzi caricati dalla pagina (moduli, three.js, font): il service worker li salva per l’uso offline */
function sendLoadedUrls(sw){
  const urls = performance.getEntriesByType('resource').map(r => r.name).concat([location.href]);
  sw.postMessage({ type:'cache-urls', urls:urls });
}

function initPwa(){
  if (document.getElementById('plan-data') || !/^https?:$/.test(location.protocol)) return;
  window.addEventListener('beforeinstallprompt', e => { installEvt = e; showInstall(); });
  window.addEventListener('appinstalled', () => { installEvt = null; showInstall(); flash('App installata: la trovi fra le tue app.', 3500); });
  $('pwaInstall').addEventListener('click', async () => {
    if (!installEvt) return;
    const e = installEvt; installEvt = null;
    e.prompt();
    try { await e.userChoice; } catch(err){}
    showInstall();
  });
  showInstall();
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js', { scope:'./' }).catch(err => console.warn('Service worker non registrato', err));
  navigator.serviceWorker.ready.then(reg => {
    /* aspetto che la piantina abbia finito di caricare quello che le serve */
    setTimeout(() => { if (reg.active) sendLoadedUrls(reg.active); }, 4000);
  });
}

export { initPwa };
