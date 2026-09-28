---
table_description: Una fattura per ordine
col_id: '{"type":"int","pk":true,"increment":true}'
col_ordine_id: '{"type":"int","notNull":true,"unique":true,"ref":"ordini.id","rel":"-"}'
col_cliente_fatturazione_id: '{"type":"int","ref":"clienti.id","rel":"<"}'
col_totale: '{"type":"decimal(12,2)","notNull":true}'
---

## ordine_id
Relazione uno-a-uno con `ordini`.
