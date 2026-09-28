# DB Atlas — Documento di progetto

Plugin Obsidian (`id: db-atlas`) per documentare schemi di database con **una nota per tabella** e visualizzarli come **diagramma ER interattivo** in una vista dedicata.

Ogni tabella ha una nota con la definizione dei campi (nelle properties) e appunti liberi sull'uso di ciascun campo (nel corpo). La vista diagramma legge tutte le note di una cartella-DB, disegna tabelle e relazioni, e permette di aprire la nota (o il paragrafo del campo) con un click.

Questo documento descrive il comportamento e la struttura del plugin (versione 0.1.x) ed è il riferimento per ogni modifica. La guida per gli utenti è il [README](README.md).

---

## 1. Concetti

- **Cartella-DB**: cartella del vault che rappresenta un database. Dichiarata esplicitamente nelle impostazioni del plugin (lista ordinata). Struttura **piatta**: le sottocartelle vengono ignorate.
- **Nota-tabella**: ogni file `.md` figlio diretto di una cartella-DB. **Nome tabella = nome file** (senza `.md`).
- **Campo**: property del frontmatter con prefisso `col_`. Nome campo = chiave senza prefisso.
- **Appunti campo**: sezione `## nome_campo` nel corpo della nota.

---

## 2. Formato della nota-tabella

```yaml
---
table_color: "#2E7D32"
table_description: Anagrafica clienti
col_id: '{"type":"int","pk":true,"increment":true}'
col_ragione_sociale: '{"type":"varchar(120)","notNull":true}'
col_agente_id: '{"type":"int","ref":"agenti.id","rel":">"}'
tags: [db]
---

Appunti generali sulla tabella...

## agente_id
Valorizzato solo per clienti gestiti da rete vendita. Mai modificare a mano, viene assegnato dal job notturno.
```

### 2.1 Metadati tabella (opzionali)

| Property | Tipo | Uso |
|---|---|---|
| `table_color` | stringa colore CSS | Colore header tabella nel diagramma (testo bianco o nero scelto per contrasto; colore non valido → ignorato) |
| `table_description` | stringa | Mostrata sotto il nome tabella (troncata con "…" oltre 320 px) |

### 2.2 Campi (`col_*`)

Valore = **stringa JSON** racchiusa tra apici singoli in YAML (senza apici YAML la interpreterebbe come oggetto e il pannello Properties di Obsidian non la gestirebbe).

| Chiave JSON | Tipo | Obbligatoria | Default | Significato |
|---|---|---|---|---|
| `type` | string | sì | — | Tipo SQL, stringa libera (`int`, `varchar(20)`, ...) |
| `pk` | boolean | no | `false` | Primary key. Più campi `pk` = PK composta (ammessa) |
| `notNull` | boolean | no | `false` | NOT NULL |
| `unique` | boolean | no | `false` | UNIQUE |
| `increment` | boolean | no | `false` | Auto-increment |
| `default` | string \| number \| boolean | no | — | Valore di default |
| `ref` | string `tabella.campo` | no | — | Foreign key verso altra tabella della **stessa** cartella-DB |
| `rel` | `">"` \| `"<"` \| `"-"` \| `"<>"` | no | `">"` se `ref` presente | Cardinalità, letta dal lato FK |

- Chiavi sconosciute: ignorate (nessun errore).
- I flag valgono solo se `true` booleano (`"true"` stringa è ignorato); `default` di tipo oggetto/array è ignorato; `rel` senza `ref` è ignorato.
- **Robustezza**: se il valore YAML di un `col_*` è già un oggetto (apici dimenticati), viene accettato con un warning sul campo.

### 2.3 Ordine campi

Ordine di visualizzazione = ordine delle properties `col_*` nel frontmatter.

### 2.4 Altre properties

Qualsiasi property senza prefisso `col_` e diversa da `table_color` / `table_description` viene ignorata dal plugin.

---

## 3. Regole di validazione

| Caso | Comportamento |
|---|---|
| JSON non valido | Campo mostrato in **rosso** col nome (tipo "—"), resto della tabella renderizzato normalmente |
| `type` mancante | Come JSON non valido |
| `ref` verso tabella/campo inesistente | Nessuna linea; campo marcato con ⚠️ |
| `ref` verso tabella di un'altra cartella-DB | Trattato come ref rotto |
| `ref` malformato (non esattamente un `.`) | Trattato come ref rotto |
| Nota senza alcun `col_*` | Tabella vuota ("nessun campo") con ⚠️ nel titolo |
| Nome nota contenente `.` | Tabella con ⚠️, non referenziabile |
| `rel` non valido | Usato `">"`, campo marcato ⚠️ |

- Nomi tabelle e campi **case-sensitive**.
- FK composte **non supportate**.
- Un errore in una nota non impedisce mai il rendering delle altre.
- Il motivo di ogni errore/warning è mostrato nel tooltip del campo (o dell'header per i warning di tabella).

---

## 4. Vista diagramma

### 4.1 Apertura
- View type: `db-atlas-view`, icona `database`.
- Posizione predefinita da impostazioni: **tab principale**, **sidebar destra**, **sidebar sinistra**.
- Comandi dedicati per forzare ciascuna posizione; icona ribbon per la posizione predefinita.
- Mai due viste: se è già aperta viene riattivata; con una posizione forzata diversa viene spostata.

### 4.2 Toolbar
Sovrapposta al diagramma, che occupa tutta la vista (la barra lascia passare i click, solo i controlli li ricevono).
- **Menu cartelle-DB** (a sinistra): pulsante con il nome della cartella attiva che apre un menu Obsidian con le cartelle nell'**ordine delle impostazioni**, spunta sulla cartella attiva e voce "Gestisci cartelle…" (apre le impostazioni). Ricorda l'ultima cartella selezionata (`lastFolder`).
- **Zoom +**, **Zoom −**, **Adatta alla vista** (a destra; "adatta" non ingrandisce oltre il 100%).
- Stato vuoto: se non ci sono cartelle configurate, messaggio con pulsante "Apri impostazioni".

### 4.3 Rendering
- Tabella: rettangolo con **header** (nome, sfondo `table_color` o colore d'accento del tema) e, se presente, **descrizione**; una **riga per campo**: icone (🔑 PK, 🔗 FK), nome, tipo monospace allineato a destra.
- Larghezza calcolata sul testo più lungo con i font reali del tema; altezza riga costante.
- Stati: campo errore (riga rossa), campo warning (⚠️ dopo il nome), tabella warning (⚠️ nel titolo, bordo arancione).
- **Livelli di dettaglio** in base allo zoom: completo (righe, click sui campi, tooltip) ≥ 45%; compatto (solo header con nome) ≥ 12%; minimo (riquadri colorati). Sotto il 30% lo sfondo a puntini è nascosto. Linee e bordi hanno spessore costante a qualsiasi zoom.
- Colori da **variabili CSS di Obsidian** → light/dark automatico; ridisegno al cambio tema. Classi CSS prefisso `.dba-`.

### 4.4 Layout
- Tabelle **senza posizione salvata**: posizionate con `elkjs` (`layered`, opzioni veloci), usato **solo per il posizionamento dei nodi**, in un **Web Worker**. Le tabelle referenziate stanno a sinistra di quelle che le puntano.
- Se esistono già posizioni salvate, le tabelle nuove vengono disposte tra loro e collocate in blocco a destra del diagramma, senza spostare le altre.
- Con 30 o più tabelle da posizionare compare l'indicatore "Disposizione delle tabelle…". Se il worker non è disponibile: posizionamento semplice a colonne.
- **Drag** della tabella (dall'header) → nuova posizione salvata in `data.json`.
- Unica modifica consentita dal diagramma: posizione tabelle. Nessuna scrittura nelle note dal diagramma (eccetto creazione heading, vedi 4.6).

### 4.5 Relazioni
- Una linea per ogni campo con `ref` valido: **da riga FK a riga referenziata**.
- Routing **ortogonale** con router proprio (`orthoRouter.ts`), che evita le tabelle e separa le linee parallele:
  - ogni riga può uscire a **sinistra o a destra**: lati affacciati se le tabelle sono distanti in orizzontale, stesso lato (percorso a C) se sovrapposte;
  - tratto orizzontale fisso ("stub", 20 px) a ogni estremo per i marker; distanza minima dalle tabelle 14 px;
  - percorso diretto a Z/C quando è libero; altrimenti ricerca A* su una griglia sparsa costruita dai bordi delle tabelle vicine (indice spaziale), con limite di espansioni;
  - linee parallele sovrapposte distanziate di 6 px (ricalcolo solo dei "canali" coinvolti).
- Aggiornamento incrementale (`routingModel.ts`): al primo render percorsi rapidi, poi rifinitura completa a blocchi di 8 ms per frame; durante il drag percorsi rapidi solo per le linee della tabella trascinata; al rilascio percorsi completi per quelle e per le linee che la tabella ora copre.
- Self-reference: anello sul lato destro della tabella (più anelli distanziati).
- Angoli arrotondati sul path SVG.

**Cardinalità (crow's foot)**, lato FK / lato referenziato:

| `rel` | Lato FK | Lato referenziato |
|---|---|---|
| `>` | molti (zampa di gallina) | uno |
| `<` | uno | molti |
| `-` | uno | uno |
| `<>` | molti | molti |

**Opzionalità** sul lato referenziato quando è "uno": `notNull: true` del campo FK → barra `│`; altrimenti cerchio `○`. Lato FK "uno" → sempre barra. Con livello di dettaglio ridotto i marker non vengono disegnati.

### 4.6 Interazioni

| Azione desktop | Azione mobile | Effetto |
|---|---|---|
| Hover su campo (~350 ms) | Long-press (500 ms) su campo | Tooltip: `int · PK · NOT NULL · UNIQUE · AI · default: x · → agenti.id` + una riga per ogni errore/warning |
| Hover su header | — | Tooltip con i warning della tabella (se presenti) |
| Click su header | Tap su header | Apre la nota-tabella |
| Click su campo | Tap su campo | Apre la nota all'heading `## nome_campo`; se non esiste lo **appende in fondo** (una sola volta anche con click ripetuti) e apre lì |
| Drag su header | Drag su header | Sposta tabella |
| Drag su sfondo o corpo tabella | Drag un dito | Pan |
| Rotella / pinch trackpad | Pinch | Zoom attorno al puntatore |

- Distinzione click/drag e avvio del pan con soglia di 4 px.
- Modificatori standard di Obsidian (Ctrl/Cmd+click → nuova tab). Un click semplice non sostituisce mai la vista del diagramma.
- Il menu contestuale di sistema è disattivato sul diagramma (il long-press mostra il tooltip).

### 4.7 Aggiornamento live
La vista si aggiorna automaticamente su creazione, modifica, eliminazione e rinomina di note nella cartella-DB visualizzata (debounce 200 ms). Posizioni e viewport correnti preservati; vengono ridisegnate solo le tabelle cambiate.

---

## 5. Comandi

| ID | Nome | Comportamento |
|---|---|---|
| `open` | Apri diagramma | Posizione predefinita |
| `open-tab` / `open-right` / `open-left` | Apri diagramma in una tab / nella sidebar destra / nella sidebar sinistra | Posizione forzata |
| `new-table` | Nuova tabella | Chiede il nome, crea la nota dal template nella cartella-DB attiva e la apre |

- **Cartella-DB attiva** per `new-table`: quella selezionata nella vista se aperta; altrimenti modal di scelta tra le cartelle-DB esistenti.
- **Nome nuova tabella**: non vuoto, senza `.`, senza `\ / : * ? " < > | # ^ [ ]`, non duplicato nella cartella (controllo senza distinzione maiuscole/minuscole).
- Nessuna hotkey predefinita.

---

## 6. Impostazioni

**Gestione cartelle**
- Campo di ricerca con autocompletamento delle cartelle del vault e pulsante "Aggiungi" (controlla esistenza e duplicati).
- Lista delle cartelle-DB: maniglia di trascinamento per riordinare (mouse e touch; l'ordine è quello del menu del diagramma), numero di tabelle, indicazione "non trovata" se la cartella non esiste, pulsante di rimozione.

**Altre opzioni** (un unico gruppo con divisori su Obsidian ≥ 1.11)

| Impostazione | Tipo | Default |
|---|---|---|
| Lingua | `auto` \| codice lingua (vedi §6.1) | `auto` |
| Posizione apertura vista | `tab` \| `right` \| `left` | `tab` |
| Template nuova tabella | textarea, placeholder `{{name}}`, pulsante "Ripristina default" | template predefinito nella lingua corrente |

Template predefinito (in inglese; la riga sotto `## id` è tradotta nella lingua dell'interfaccia). Finché l'utente non lo modifica non viene salvato (`newTableTemplate: ""`), così segue la lingua scelta:

```markdown
---
table_description: ""
col_id: '{"type":"int","pk":true,"increment":true}'
---

# {{name}}

## id
Primary key.
```

Prefisso `col_` **non configurabile**.

### 6.1 Lingue

- Interfaccia tradotta in: inglese (riferimento), cinese semplificato, hindi, spagnolo, francese, arabo, bengalese, portoghese, russo, giapponese, tedesco, indonesiano, italiano.
- `auto` segue la lingua di Obsidian (`getLanguage()` da 1.8.7, altrimenti `moment.locale()`); varianti regionali ricondotte alla lingua base (`pt-BR` → `pt`); lingua non supportata → inglese.
- Il cambio si applica subito a impostazioni, vista e icona ribbon; i nomi dei comandi dopo il riavvio di Obsidian.
- Traduzioni in `src/i18n/locales/`: segnaposto `{nome}`, plurali con le categorie di `Intl.PluralRules`. I messaggi di validazione sono codici (`issue.*`) tradotti al momento della visualizzazione. I test verificano che ogni lingua abbia tutte le chiavi e gli stessi segnaposto dell'inglese.
- Il template predefinito salvato dalle versioni precedenti (italiano) viene riconosciuto e trattato come predefinito.

---

## 7. Persistenza (`data.json`)

```ts
interface DbAtlasData {
  settings: {
    dbFolders: string[];            // ordinate
    language: string;               // 'auto' o codice lingua
    viewLocation: 'tab' | 'right' | 'left';
    newTableTemplate: string;       // '' = template predefinito nella lingua corrente
  };
  lastFolder?: string;
  layouts: {
    [folderPath: string]: {
      tables: { [tableName: string]: { x: number; y: number } };
    };
  };
}
```

- Al caricamento i dati vengono uniti ai default scartando i valori di tipo errato (un `data.json` corrotto non blocca il plugin).
- **Pulizia automatica**: a ogni aggiornamento della cartella vengono rimosse le posizioni di tabelle non più esistenti.
- Posizioni arrotondate al pixel, salvate con debounce di 1 s (completato anche alla disattivazione del plugin).

---

## 8. Rinomina e sincronizzazione

- **Rinomina nota-tabella** (dentro la stessa cartella-DB): tutti i `ref` che puntano alla vecchia tabella nelle note della cartella (inclusa la nota rinominata, per le self-reference) vengono aggiornati via `fileManager.processFrontMatter`, re-serializzando il JSON; la posizione salvata passa al nuovo nome. Se il nome vecchio o nuovo contiene `.` i ref non vengono toccati.
- **Spostamento nota fuori dalla cartella-DB**: la tabella sparisce dal diagramma; i ref verso di essa diventano rotti (nessuna modifica automatica).
- **Rinomina/spostamento cartella-DB** (anche di una cartella che la contiene): aggiornati `settings.dbFolders`, `layouts` e `lastFolder`.
- **Rinomina campo**: non rilevabile in modo affidabile → nessuna propagazione automatica.

---

## 9. Stack e vincoli tecnici

- **TypeScript**, bundle **esbuild** (target ES2018), struttura da `obsidian-sample-plugin`.
- Rendering **SVG vanilla**, nessun framework UI. Testo sempre via `textContent`, mai `innerHTML`.
- `elkjs` per il posizionamento iniziale, in un **Web Worker**: lo script del worker è incorporato in `main.js` come testo e avviato da Blob URL (Obsidian distribuisce solo `main.js`, `manifest.json`, `styles.css`). Nessun `eval`/`new Function`. Worker terminato alla disattivazione del plugin.
- Routing con router ortogonale proprio (nessuna dipendenza esterna, nessun wasm).
- **Desktop e mobile** (`isDesktopOnly: false`): vietate API Node/Electron (regola ESLint). Solo API Obsidian.
- Lettura frontmatter via `metadataCache` (non parsing manuale del file); scritture solo con `vault.process` / `fileManager.processFrontMatter`.
- Moduli di logica pura senza import da `obsidian` (regola ESLint), coperti da test **vitest**.
- `minAppVersion` 1.5.7; funzioni più recenti (es. `SettingGroup`) usate solo se disponibili.

### 9.1 Prestazioni (requisito)

- Il diagramma deve gestire **con facilità oltre 1000 tabelle**. Riferimento (`npm run bench`, schema generato da 1000 tabelle / ~1900 relazioni): layout ELK < 1 s (una tantum, in worker), primo disegno linee < 100 ms, frame di drag < 16 ms anche per la tabella più collegata, nessuna linea sopra le tabelle.
- **Culling** (nel DOM solo tabelle e linee visibili, tramite indici spaziali), **livelli di dettaglio** e **aggiornamenti incrementali**.
- Nessun lavoro proporzionale all'intero diagramma durante pointermove.

### 9.2 Struttura sorgenti

```
src/
  main.ts                 // Plugin: load/unload, comandi, ribbon, apertura vista, nuova tabella
  settings.ts             // SettingTab (cartelle con riordino, altre opzioni)
  data.ts                 // Default e normalizzazione di data.json            (puro)
  types.ts                // Modello dati (Table, Column, Relation, Issue, ...)
  elk-worker.d.ts         // Tipo del sorgente del worker ELK incorporato
  i18n/
    index.ts              // lingue supportate, t(), plurali                   (puro)
    locales/*.ts          // una traduzione per lingua (en = riferimento)
  model/
    parseColumn.ts        // valore col_* → Column                             (puro)
    parseTable.ts         // frontmatter + nome file → Table                   (puro)
    buildSchema.ts        // Table[] → Schema con relazioni risolte            (puro)
    tableName.ts          // validazione nome nuova tabella, template          (puro)
    schemaLoader.ts       // cartella → Schema via metadataCache + aggiornamento live
  view/
    DbAtlasView.ts        // ItemView, toolbar, menu cartelle, stati vuoti
    diagram.ts            // SVG, culling, livelli di dettaglio, drag tabelle
    viewport.ts           // pan/zoom/fit                                      (calcoli puri)
    interactions.ts       // click/tap su campi, tooltip, long-press
    tableGeometry.ts      // dimensioni tabella e righe                        (puro)
    renderTable.ts        // SVG tabella
    edgeGeometry.ts       // path arrotondati, self-loop, marker               (puro)
    renderEdges.ts        // SVG linee + marker cardinalità
    measure.ts            // misura testo con i font del tema
    color.ts              // colore header e contrasto testo
    tooltipText.ts        // testo dei tooltip                                 (puro)
  layout/
    elkLayout.ts          // posizionamento iniziale con ELK                   (puro, motore iniettato)
    elkWorker.ts          // ELK in Web Worker
    layoutStore.ts        // posizioni salvate in data.json                    (puro)
    orthoRouter.ts        // router ortogonale + separazione linee parallele   (puro)
    routingModel.ts       // percorsi di tutte le linee, incrementale          (puro)
    spatialGrid.ts        // indice spaziale (culling, ostacoli)               (puro)
  sync/
    renameHandler.ts      // propagazione rinomine tabelle e cartelle
    renameLogic.ts        // riscrittura ref e dati                            (puro)
    headingNav.ts         // apertura nota/heading
    markdownHeadings.ts   // ricerca e aggiunta di `## campo`                  (puro)
  modals/
    NewTableModal.ts
    FolderPickerModal.ts
tests/                    // vitest (setup.ts: ELK in-thread)
scripts/                  // benchmark e generatore di schemi di prova
styles.css
```

### 9.3 Sviluppo e rilascio

| Comando | Uso |
|---|---|
| `npm run dev` | Build in watch; copia `main.js`, `manifest.json`, `styles.css` in `test-vault/.obsidian/plugins/db-atlas/` |
| `npm run build` | Type-check + build di produzione |
| `npm test` / `npm run lint` | Test vitest / ESLint |
| `npm run bench` | Tempi di layout e routing su schemi generati (100–2000 tabelle) |
| `npm run gen:perf -- <n>` | Genera `test-vault/Perf<n>` con `n` tabelle |

- `test-vault/` è un vault locale per le prove, **non versionato**.
- Rilascio: `npm version <patch|minor|major>` (aggiorna `manifest.json` e `versions.json`), poi push del commit e del tag. Il workflow GitHub verifica che il tag coincida con la versione, esegue lint, test e build e crea una release in bozza con `main.js`, `manifest.json`, `styles.css`.
- Controlli per la pubblicazione: `docs/release-checklist.md`.

---

## 10. Fuori scope v1

Export SVG/PNG, ricerca tabelle, TableGroup, indici, enum, FK composte, editing campi dal diagramma, modal guidato per la creazione dei campi, evidenziazione relazioni in hover, sottocartelle, ref tra cartelle-DB diverse, propagazione rinomina campi.
