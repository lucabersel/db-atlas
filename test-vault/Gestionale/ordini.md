---
table_description: Testata ordini
col_id: '{"type":"int","pk":true,"increment":true}'
col_cliente_id: '{"type":"int","notNull":true,"ref":"clienti.id","rel":">"}'
col_data: '{"type":"date","notNull":true}'
col_stato: '{"type":"varchar(20)","notNull":true,"default":"bozza"}'
---

## cliente_id
Obbligatorio: un ordine appartiene sempre a un cliente.
