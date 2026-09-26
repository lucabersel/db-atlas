# DB Atlas — Specifica di progetto

Plugin Obsidian (`id: db-atlas`) per documentare schemi di database con **una nota per tabella** e visualizzarli come **diagramma ER interattivo** in una vista dedicata.

Obiettivo: ogni tabella ha una nota con la definizione dei campi (nelle properties) e appunti liberi sull'uso di ciascun campo (nel corpo). La vista diagramma legge tutte le note di una cartella-DB, disegna tabelle e relazioni, e permette di aprire la nota (o il paragrafo del campo) con un click.

---

## 1. Concetti

- **Cartella-DB**: cartella del vault che rappresenta un database. Dichiarata esplicitamente nelle impostazioni del plugin (lista). Struttura **piatta**: le sottocartelle vengono ignorate.
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
| `table_color` | stringa colore CSS | Colore header tabella nel diagramma |
| `table_description` | stringa | Mostrata sotto il nome tabella nel diagramma |

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

Chiavi sconosciute: ignorate (nessun errore).

**Robustezza**: se il valore YAML di un `col_*` è già un oggetto (apici dimenticati), accettarlo comunque ma segnalare un warning sul campo.

### 2.3 Ordine campi

Ordine di visualizzazione = ordine delle properties `col_*` nel frontmatter.

### 2.4 Altre properties

Qualsiasi property senza prefisso `col_` e diversa da `table_color` / `table_description` viene ignorata dal plugin.

---

## 3. Regole di validazione

| Caso | Comportamento |
|---|---|
| JSON non valido | Campo mostrato in **rosso** col nome, resto della tabella renderizzato normalmente |
| `type` mancante | Come JSON non valido |
| `ref` verso tabella/campo inesistente | Nessuna linea; campo marcato con ⚠️ |
| `ref` verso tabella di un'altra cartella-DB | Trattato come ref rotto |
| `ref` malformato (non esattamente un `.`) | Trattato come ref rotto |
| Nota senza alcun `col_*` | Tabella vuota con ⚠️ ("nessun campo") |
| Nome nota contenente `.` | Tabella mostrata con ⚠️, non referenziabile |
| `rel` non valido | Usare `">"` e marcare ⚠️ |

- Nomi tabelle e campi **case-sensitive**.
- FK composte **non supportate**.
- Un errore in una nota non deve mai impedire il rendering delle altre.

---

## 4. Vista diagramma

### 4.1 Apertura
- View type: `db-atlas-view`.
- Posizione predefinita da impostazioni: **tab principale**, **sidebar destra**, **sidebar sinistra**.
- Comandi dedicati per forzare ciascuna posizione.
- Icona ribbon che apre la vista nella posizione predefinita.

### 4.2 Toolbar
- **Dropdown cartelle-DB** (solo quelle in impostazioni). Ricorda l'ultima selezionata.
- **Zoom +**, **Zoom −**, **Fit** (adatta tutto il diagramma alla vista).
- Nessun altro controllo in v1.

### 4.3 Rendering tabella
- Rettangolo con **header** (nome tabella, sfondo `table_color` o colore tema) e, se presente, **descrizione** sotto il nome in testo secondario.
- Una **riga per campo**: icona (🔑 PK, 🔗 FK), nome, tipo allineato a destra.
- Larghezza calcolata sul testo più lungo; altezza riga costante.
- Stati: campo errore (rosso), campo/tabella warning (⚠️).
- Colori da **variabili CSS di Obsidian** → light/dark automatico. Classi CSS prefisso `.dba-`.

### 4.4 Layout
- Tabelle **senza posizione salvata**: posizionate con `elkjs` (`layered`), usato **solo per il posizionamento dei nodi**.
- **Drag** della tabella (dall'header) → nuova posizione salvata in `data.json`.
- Unica modifica consentita dal diagramma: posizione tabelle. Nessuna scrittura nelle note dal diagramma (eccetto creazione heading, vedi 4.6).

### 4.5 Relazioni
- Una linea per ogni campo con `ref` valido: **da riga FK a riga referenziata**.
- Routing **ortogonale** con `libavoid-js` (evita le tabelle, separa linee parallele), sempre, sia al primo render sia durante/dopo il drag.
- Ogni riga ha **due pin** (sinistro e destro) con lo stesso `classId` → il router sceglie il lato.
- Self-reference: supportata (loop sullo stesso lato).
- Angoli arrotondati sul path SVG.

**Cardinalità (crow's foot)**, lato FK / lato referenziato:

| `rel` | Lato FK | Lato referenziato |
|---|---|---|
| `>` | molti (zampa di gallina) | uno |
| `<` | uno | molti |
| `-` | uno | uno |
| `<>` | molti | molti |

**Opzionalità** sul lato referenziato quando è "uno": `notNull: true` del campo FK → barra `│`; altrimenti cerchio `○`. Lato FK "uno" → sempre barra.

### 4.6 Interazioni

| Azione desktop | Azione mobile | Effetto |
|---|---|---|
| Hover su campo | Long-press (~500 ms) su campo | Tooltip: `int · PK · NOT NULL · UNIQUE · AI · default: x · → agenti.id` |
| Click su header | Tap su header | Apre la nota-tabella |
| Click su campo | Tap su campo | Apre la nota all'heading `## nome_campo`; se l'heading non esiste lo **appende in fondo** alla nota e poi apre lì |
| Drag su header | Drag su header | Sposta tabella |
| Drag su sfondo | Drag un dito su sfondo | Pan |
| Rotella / pinch | Pinch | Zoom |

Distinzione click/drag con soglia di movimento (es. 4 px).

### 4.7 Aggiornamento live
La vista si aggiorna automaticamente su creazione, modifica, eliminazione e rinomina di note nella cartella-DB visualizzata (debounce ~200 ms). Posizioni e viewport correnti preservati.

---

## 5. Comandi

| ID | Nome | Comportamento |
|---|---|---|
| `open` | Apri diagramma | Posizione predefinita |
| `open-tab` / `open-right` / `open-left` | Apri diagramma in ... | Posizione forzata |
| `new-table` | Nuova tabella | Chiede il nome (vietati `.` e duplicati), crea la nota dal template nella cartella-DB attiva e la apre |

**Cartella-DB attiva** per `new-table`: quella selezionata nella vista se aperta; altrimenti modal di scelta tra le cartelle-DB configurate.

---

## 6. Impostazioni

| Impostazione | Tipo | Default |
|---|---|---|
| Cartelle-DB | lista di percorsi (con autocompletamento cartelle) | vuota |
| Posizione apertura vista | `tab` \| `right` \| `left` | `tab` |
| Template nuova tabella | textarea, placeholder `{{name}}` | vedi sotto |

Template di default:

```markdown
---
table_description: ""
col_id: '{"type":"int","pk":true,"increment":true}'
---

# {{name}}

## id
Chiave primaria.
```

Prefisso `col_` **non configurabile**.

---

## 7. Persistenza (`data.json`)

```ts
interface DbAtlasData {
  settings: {
    dbFolders: string[];
    viewLocation: 'tab' | 'right' | 'left';
    newTableTemplate: string;
  };
  lastFolder?: string;
  layouts: {
    [folderPath: string]: {
      tables: { [tableName: string]: { x: number; y: number } };
    };
  };
}
```

- **Pulizia automatica**: al caricamento di una cartella, rimuovere le posizioni di tabelle non più esistenti.
- Salvataggio posizioni con debounce (non a ogni pointermove).

---

## 8. Rinomina e sincronizzazione

- **Rinomina nota-tabella** (dentro la stessa cartella-DB): aggiornare automaticamente tutti i `ref` che puntano alla vecchia tabella nelle altre note della cartella (via `fileManager.processFrontMatter`, re-serializzando il JSON) e la chiave in `layouts`.
- **Spostamento nota fuori dalla cartella-DB**: la tabella sparisce dal diagramma; i ref verso di essa diventano rotti (nessuna modifica automatica).
- **Rinomina/spostamento cartella-DB**: aggiornare `settings.dbFolders`, `layouts` e `lastFolder`.
- **Rinomina campo**: non rilevabile in modo affidabile → nessuna propagazione automatica in v1.

---

## 9. Stack e vincoli tecnici

- **TypeScript**, bundle **esbuild**, template `obsidian-sample-plugin`.
- Rendering **SVG vanilla**, nessun framework UI.
- `elkjs` (build bundled, senza web worker) per il posizionamento iniziale.
- `libavoid-js` per il routing. Il file `.wasm` va **incorporato nel bundle** (esbuild loader `binary`) e caricato da Blob URL: Obsidian distribuisce solo `main.js`, `manifest.json`, `styles.css`.
- **Desktop e mobile** (`isDesktopOnly: false`): vietate API Node/Electron (`fs`, `path`, `require` di moduli Node). Usare solo API Obsidian.
- Lettura frontmatter via `metadataCache` (non parsing manuale del file).
- Distruggere il router libavoid al cambio cartella e alla chiusura della vista.
- Test unitari con **vitest** per parser e logica pura (nessuna dipendenza da Obsidian in quei moduli).

### 9.1 Struttura sorgenti suggerita

```
src/
  main.ts                 // Plugin: load/unload, comandi, ribbon, eventi vault
  settings.ts             // SettingTab + default
  types.ts                // Modello dati (Table, Column, Relation, Issue)
  model/
    parseColumn.ts        // stringa/oggetto JSON → Column | errore  (puro)
    parseTable.ts         // frontmatter + nome file → Table         (puro)
    buildSchema.ts        // Table[] → Schema con relazioni risolte  (puro)
    schemaLoader.ts       // cartella → Table[] via metadataCache
  view/
    DbAtlasView.ts        // ItemView, toolbar, ciclo di vita
    renderTable.ts        // SVG tabella
    renderEdges.ts        // SVG linee + marker cardinalità
    measure.ts            // misura testo
    viewport.ts           // pan/zoom/fit
    interactions.ts       // click/drag/long-press/tooltip
  layout/
    elkLayout.ts          // posizionamento iniziale
    avoidRouter.ts        // wrapper libavoid-js
  sync/
    renameHandler.ts      // propagazione rinomina
    headingNav.ts         // apertura/creazione heading campo
  modals/
    NewTableModal.ts
    FolderPickerModal.ts
styles.css
```

---

## 10. Fuori scope v1

Export SVG/PNG, ricerca tabelle, TableGroup, indici, enum, FK composte, editing campi dal diagramma, modal guidato per la creazione dei campi, evidenziazione relazioni in hover, sottocartelle, ref tra cartelle-DB diverse, propagazione rinomina campi.
