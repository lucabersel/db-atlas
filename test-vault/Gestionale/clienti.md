---
table_color: "#2E7D32"
table_description: Anagrafica clienti
col_id: '{"type":"int","pk":true,"increment":true}'
col_ragione_sociale: '{"type":"varchar(120)","notNull":true}'
col_partita_iva: '{"type":"varchar(11)","unique":true}'
col_agente_id: '{"type":"int","ref":"agenti.id","rel":">"}'
col_attivo: '{"type":"boolean","notNull":true,"default":true}'
tags:
  - db
---

Anagrafica di tutti i clienti, attivi e cessati.

## id
Chiave primaria.

## agente_id
Valorizzato solo per clienti gestiti da rete vendita. Mai modificare a mano, viene assegnato dal job notturno.
