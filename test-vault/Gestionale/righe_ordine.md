---
table_color: "#6A1B9A"
table_description: Dettaglio ordini (PK composta)
col_ordine_id: '{"type":"int","pk":true,"notNull":true,"ref":"ordini.id","rel":">"}'
col_riga_num: '{"type":"smallint","pk":true,"notNull":true}'
col_prodotto_id: '{"type":"int","notNull":true,"ref":"prodotti.id"}'
col_quantita: '{"type":"decimal(10,3)","notNull":true,"default":1}'
---

La chiave primaria è composta da `ordine_id` + `riga_num`.

## riga_num
Progressivo per ordine, parte da 1.
