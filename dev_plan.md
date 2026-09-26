# DB Atlas — Piano di sviluppo

Riferimento funzionale: **`PROJECT.md`** (fonte di verità; in caso di dubbio prevale).

## Regole di esecuzione

- Eseguire **una fase alla volta**, nell'ordine.
- A fine fase: `npm run build` senza errori, `npm test` verde, **criteri di completamento** tutti soddisfatti.
- Poi **fermarsi**, riassumere cosa è stato fatto e cosa verificare a mano, e attendere conferma prima della fase successiva.
- Spuntare i task `[x]` in questo file man mano.
- Non implementare nulla elencato in "Fuori scope v1" di `PROJECT.md`.
- Moduli in `src/model/` devono restare **puri** (nessun import da `obsidian`) e coperti da test.
- Nessuna API Node/Electron (target anche mobile).
- Se un'API di libreria esterna (`libavoid-js`, `elkjs`) non corrisponde a quanto previsto, verificare sulla versione installata (tipi in `node_modules`) invece di indovinare.

---

## Fase 0 — Scaffolding

**Obiettivo**: progetto compilabile e caricabile in Obsidian, con vault di test.

- [ ] Inizializzare da struttura `obsidian-sample-plugin` (TypeScript, esbuild, `manifest.json`, `styles.css`)
- [ ] `manifest.json`: `id: db-atlas`, `name: DB Atlas`, `isDesktopOnly: false`, `minAppVersion` ragionevole
- [ ] Configurare vitest (`npm test`) ed ESLint
- [ ] Script `npm run dev` (watch) e `npm run build` (produzione)
- [ ] Creare `test-vault/` con `.obsidian/plugins/db-atlas` collegato all'output di build (symlink o copia via script)
- [ ] In `test-vault/Gestionale/` creare 5–6 note-tabella di esempio che coprano: PK composta, FK `>`, `<`, `-`, `<>`, self-reference, `notNull` sì/no, `table_color`, `table_description`, heading campo presenti e mancanti
- [ ] In `test-vault/Casi_errore/` note con: JSON invalido, `type` mancante, ref rotto, ref malformato, nota senza campi, nome con `.`, `rel` invalido, valore `col_*` senza apici (oggetto YAML)
- [ ] `Plugin.onload` vuoto con log di avvio

**Completamento**: il plugin compare e si attiva in Obsidian sul vault di test senza errori in console.

---

## Fase 1 — Tipi e impostazioni

**Obiettivo**: modello dati e pannello impostazioni funzionanti.

- [ ] `src/types.ts`: `Column`, `Table`, `Relation`, `Issue` (livello `error` | `warning`, messaggio, riferimento a tabella/campo), `Schema`, `DbAtlasData`
- [ ] `src/settings.ts`: default + `SettingTab` con:
  - lista cartelle-DB (aggiungi con autocompletamento cartelle del vault, rimuovi)
  - dropdown posizione vista (`tab` / `right` / `left`)
  - textarea template nuova tabella (default da `PROJECT.md` §6)
- [ ] Load/save di `data.json` con merge dei default (`settings`, `layouts`, `lastFolder`)

**Completamento**: impostazioni modificabili e persistenti dopo riavvio di Obsidian.

---

## Fase 2 — Parser (logica pura)

**Obiettivo**: da frontmatter a modello validato, con test completi.

- [ ] `parseColumn(key, rawValue)`: gestisce stringa JSON, oggetto YAML (warning), JSON invalido, `type` mancante, `rel` invalido, default di `rel`, chiavi sconosciute ignorate
- [ ] `parseTable(fileBasename, frontmatter)`: estrae `col_*` in ordine, `table_color`, `table_description`; warning per nessun campo e per nome con `.`
- [ ] `buildSchema(tables)`: risolve i `ref` (split su un solo `.`, case-sensitive), crea `Relation` valide, marca ref rotti/malformati come warning sul campo
- [ ] Test vitest per **ogni riga** della tabella di validazione in `PROJECT.md` §3 e per ogni valore di `rel`

**Completamento**: `npm test` verde; copertura di tutti i casi di §3.

---

## Fase 3 — Caricamento cartella e aggiornamento live

**Obiettivo**: ottenere lo `Schema` di una cartella-DB e sapere quando cambia.

- [ ] `schemaLoader.load(folderPath)`: solo figli diretti `.md`, frontmatter da `metadataCache.getFileCache`
- [ ] Sottoscrizione a `metadataCache.on('changed')`, `vault.on('create' | 'delete' | 'rename')` filtrata sulla cartella attiva, con debounce ~200 ms
- [ ] Emettere evento/callback "schema aggiornato"
- [ ] Gestire il caso in cui la cache metadati non sia ancora pronta all'avvio (`metadataCache.on('resolved')` / `onLayoutReady`)

**Completamento**: da comando di debug temporaneo, lo schema della cartella di test viene stampato in console e ristampato a ogni modifica di una nota.

---

## Fase 4 — Vista vuota, toolbar e comandi di apertura

**Obiettivo**: la vista esiste, si apre dove previsto, sceglie la cartella.

- [ ] `DbAtlasView` (`ItemView`, type `db-atlas-view`, icona, titolo "DB Atlas")
- [ ] Toolbar: dropdown cartelle-DB (da impostazioni, ricorda `lastFolder`), pulsanti zoom +, zoom −, fit (per ora inattivi)
- [ ] Stato vuoto: messaggio se nessuna cartella configurata, con pulsante che apre le impostazioni
- [ ] Comandi `open`, `open-tab`, `open-right`, `open-left` + icona ribbon
- [ ] Se la vista è già aperta, riattivarla invece di duplicarla
- [ ] Aggiornare la dropdown quando cambiano le impostazioni

**Completamento**: la vista si apre nelle tre posizioni; cambiare cartella nella dropdown carica lo schema (log) e viene ricordata al riavvio.

---

## Fase 5 — Rendering tabelle e viewport

**Obiettivo**: tabelle disegnate in SVG, navigabili con pan e zoom.

- [ ] `measure.ts`: misura testo coerente col font del tema
- [ ] `renderTable.ts`: header (colore/descrizione), righe con 🔑/🔗, nome, tipo; stati errore/warning; classi `.dba-*`
- [ ] `styles.css` basato su variabili CSS di Obsidian (light/dark)
- [ ] Posizionamento provvisorio a griglia (sostituito in Fase 6)
- [ ] `viewport.ts`: pan (drag sfondo), zoom (rotella, pinch), zoom +/−, fit
- [ ] Re-render su "schema aggiornato" preservando viewport

**Completamento**: tutte le tabelle del vault di test visibili e corrette, casi di errore visivamente riconoscibili, pan/zoom/fit funzionanti anche su mobile.

---

## Fase 6 — Layout ELK e posizioni persistenti

**Obiettivo**: posizionamento iniziale automatico e drag salvato.

- [ ] `elkLayout.ts`: `elkjs` bundled (niente worker), algoritmo `layered`, archi dalle relazioni, usato solo per nodi senza posizione salvata
- [ ] Tabelle nuove aggiunte a uno schema già posizionato: collocarle senza spostare quelle esistenti
- [ ] Drag dall'header con soglia di movimento (click vs drag)
- [ ] Salvataggio posizioni in `layouts[folder].tables` con debounce
- [ ] Pulizia posizioni di tabelle non più esistenti al caricamento

**Completamento**: primo avvio → layout ordinato; spostamenti mantenuti dopo riavvio; eliminando una nota la sua posizione sparisce da `data.json`.

---

## Fase 7 — Routing libavoid e relazioni

**Obiettivo**: linee ortogonali corrette con notazione crow's foot.

- [ ] Configurare esbuild loader `binary` per `.wasm`; caricare `libavoid-js` da Blob URL; verificare funzionamento su mobile
- [ ] `avoidRouter.ts`: router ortogonale, una `ShapeRef` per tabella, due pin (sx/dx) per riga con stesso `classId`, una `ConnRef` per relazione, parametri di distanza/nudging
- [ ] Self-reference gestita
- [ ] `renderEdges.ts`: polyline → path SVG con angoli arrotondati
- [ ] Marker: molti (zampa di gallina), uno obbligatorio (barra), uno opzionale (cerchio), orientati sul segmento finale; logica da `PROJECT.md` §4.5
- [ ] Durante il drag: `moveShape` + `processTransaction` e ridisegno linee in tempo reale
- [ ] Distruzione router al cambio cartella e alla chiusura vista

**Completamento**: tutte le relazioni del vault di test corrette per lato, cardinalità e opzionalità; le linee non attraversano tabelle; drag fluido.

---

## Fase 8 — Interazioni e navigazione

**Obiettivo**: dal diagramma alle note.

- [ ] Tooltip su hover (desktop) e long-press ~500 ms (mobile), formato da `PROJECT.md` §4.6
- [ ] Click/tap header → apre nota
- [ ] Click/tap campo → `headingNav`: se `## nome_campo` esiste apre lì, altrimenti lo appende in fondo (`vault.process`) e poi apre
- [ ] Rispettare modificatori standard (Ctrl/Cmd+click → nuova tab)

**Completamento**: navigazione verso nota e heading funzionante su desktop e mobile; heading mancanti creati una sola volta.

---

## Fase 9 — Nuova tabella e sincronizzazione rinomine

**Obiettivo**: authoring e coerenza dei riferimenti.

- [ ] `NewTableModal`: input nome, validazione (niente `.`, niente duplicati nella cartella)
- [ ] `FolderPickerModal` se nessuna vista aperta
- [ ] Comando `new-table`: crea nota da template (`{{name}}`), apre la nota
- [ ] `renameHandler`: rinomina nota nella stessa cartella → aggiorna `ref` nelle altre note (`fileManager.processFrontMatter`, JSON ri-serializzato come stringa) e chiave in `layouts`
- [ ] Nota spostata fuori dalla cartella → nessuna modifica automatica
- [ ] Rinomina/spostamento cartella-DB → aggiorna `dbFolders`, `layouts`, `lastFolder`
- [ ] Test unitari per la funzione pura di riscrittura dei `ref`

**Completamento**: rinominando `clienti` in `anagrafica_clienti` tutte le FK si aggiornano e il diagramma resta invariato nella disposizione.

---

## Fase 10 — Rifinitura e robustezza

- [ ] Verifica completa dei casi errore di `PROJECT.md` §3 nel diagramma
- [ ] Performance: prova con cartella di ~80 tabelle generate (script), nessun blocco percepibile
- [ ] Nessun listener/risorsa lasciato attivo dopo `onunload` o chiusura vista
- [ ] Controllo tema light/dark e mobile (dimensioni touch target)
- [ ] Rimuovere log e comandi di debug

**Completamento**: nessun errore in console nell'uso normale; plugin disattivabile/riattivabile senza riavvio.

---

## Fase 11 — Documentazione e rilascio

- [ ] `README.md` (EN): scopo, formato nota con esempio, chiavi JSON, impostazioni, comandi, screenshot
- [ ] `LICENSE` (es. MIT) e licenze di `elkjs` / `libavoid-js` rispettate
- [ ] `versions.json`, workflow GitHub Actions per release (`main.js`, `manifest.json`, `styles.css`)
- [ ] Checklist delle linee guida plugin Obsidian (niente `innerHTML` con dati utente, niente stili inline dove evitabile, ecc.)

**Completamento**: release installabile via BRAT.
