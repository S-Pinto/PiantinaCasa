# PiantinaCasa

Piantina 3D dell’appartamento di Via Verona: vista in prospettiva, pianta dall’alto, passeggiata in prima persona, editor di muri, aperture, pavimenti e arredi, versioni di arredo da confrontare affiancate. Luce del giorno, del tramonto e della notte con il sole nella posizione vera, misure delle stanze, metro, e un Panorama 3D a tutto schermo con il palazzo e il quartiere attorno.

## Come aprirla

Il sito è statico: basta un qualsiasi server web nella cartella del progetto.

```sh
python3 -m http.server 8000     # oppure: npm start
```

e poi apri <http://localhost:8000>. Aprire `index.html` con doppio clic non funziona: i moduli JavaScript e `data/plan.json` vanno caricati da un server.

### Pubblicazione su GitHub Pages

Una volta sola: nel repository vai su **Settings → Pages**, in *Build and deployment* scegli **Deploy from a branch**, branch `main`, cartella `/ (root)`, e salva. Dopo un minuto la piantina è su `https://s-pinto.github.io/PiantinaCasa/` e si aggiorna da sola a ogni modifica di `main`.

## Com’è fatta

```
index.html          la pagina: interfaccia (dentro un <template>) e mappa degli import di three.js
css/style.css       lo stile
data/plan.json      il modello della casa (muri, aperture, pavimenti, parapetti, nomi, arredi, versioni)
src/                il codice, in moduli ES senza passaggi di build
tools/              strumenti per chi sviluppa
```

| Modulo | Cosa fa |
| --- | --- |
| `main.js` | avvio: carica la piantina, collega il puntatore, ciclo di render, confronto affiancato |
| `core.js` | misure (1 px della piantina = 4 cm), stato condiviso `st`, geometria 2D |
| `dom.js` | piccoli aiuti per costruire l’interfaccia |
| `scene.js` | renderer, scena, camera, luci, gruppi di oggetti |
| `textures.js` | texture disegnate al volo (parquet, gres, pietra, marmo, mattoni…) |
| `materials.js` | materiali di muri e pavimenti |
| `furniture.js` | catalogo degli arredi e loro forma 3D |
| `model.js` | il modello dati: normalizzazione, versioni di arredo, formato di `plan.json` |
| `build.js` | costruzione della scena 3D dal modello, collisioni |
| `views.js` | tema, camera, modalità Prospettiva / Pianta / Passeggiata |
| `walk.js` | passeggiata: movimento, joystick, minimappa |
| `editor.js` | editor: strumenti, selezione, trascinamento, annulla/ripeti |
| `overlay.js` | evidenziazioni 3D dell’editor |
| `props.js` | scheda delle proprietà dell’elemento selezionato |
| `variants.js` | menu opzioni e pannello delle versioni di arredo |
| `storage.js` | salvataggi, import/export, file HTML da inviare |
| `ambiente.js` | ora del giorno (sole, cielo, stelle, luci di casa), qualità grafica, post-produzione |
| `contesto.js` | il palazzo sotto l’attico, le unità vicine, strade, alberi e palazzine del quartiere |
| `misure.js` | quote interne delle stanze, superfici, ingombro totale, metro a due punti |
| `panorama.js` | Panorama 3D: vista cinematografica a tutto schermo, foto in PNG |

three.js (r187) arriva dalla CDN jsDelivr tramite la *import map* in `index.html`.

### Luce e qualità

Il pulsante **Luce** (a destra) sceglie giorno, tramonto o notte, oppure un’ora precisa con il cursore, e la stagione. Il sole segue il percorso vero per la latitudine di Brindisi. Il nord è a +25° rispetto all’alto della piantina, come indica la freccia della planimetria catastale (il balcone su Via Verona guarda a sud-sud-ovest); si può correggere con **Orientamento del nord**. Di notte si accendono le luci delle stanze e le finestre del quartiere.

Colori e luci sono fisicamente corretti (gestione del colore attiva, tone mapping *Khronos PBR Neutral*, che non altera i colori di pavimenti e finiture). La **qualità grafica** ha tre livelli: *Alta* aggiunge occlusione ambientale (GTAO), bagliore delle luci e ombre delle lampade; *Media* (predefinita sul telefono) tiene le ombre del sole; *Leggera* abbassa la risoluzione. Le ombre si ricalcolano solo quando la scena cambia, quindi da ferma la piantina non consuma batteria per le ombre.

### Il modello della casa

`data/plan.json` è quello che vede chi apre il sito. Le modifiche fatte nell’editor restano salvate nel browser; per renderle definitive usa **Opzioni → Esporta file** (in modalità Modifica) e sostituisci `data/plan.json` con il file esportato. Il formato è lo stesso, con un elemento per riga, così le differenze in git sono leggibili.

Coordinate in pixel della piantina originale: x verso destra (est), y verso il basso (sud), 1 px = 4 cm.

### Il file HTML da inviare

**Opzioni → Scarica il file HTML** crea un unico file con stile, codice e piantina dentro, da allegare a una mail: chi lo riceve lo apre col browser (serve internet per three.js). Per crearlo il browser scarica i moduli di `src/` e li unisce in un solo script, quindi i moduli seguono tre regole:

1. gli `import` sono su una riga sola, in cima;
2. gli `export` sono una sola riga `export { … };` in fondo;
3. i nomi globali (funzioni, costanti) sono diversi in tutti i moduli.

Non serve scrivere a mano import ed export: dopo aver modificato il codice esegui

```sh
npm install
npm run imports
```

che li rigenera e segnala i nomi duplicati.
