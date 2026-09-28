---
table_color: "#EF6C00"
col_id: '{"type":"int","pk":true,"increment":true}'
col_codice: '{"type":"varchar(30)","notNull":true,"unique":true}'
col_prezzo: '{"type":"decimal(12,2)","default":0}'
col_agente_referente_id: '{"type":"int","ref":"agenti.id","rel":"<>"}'
---

Catalogo. Nessuna descrizione tabella (caso senza `table_description`).
