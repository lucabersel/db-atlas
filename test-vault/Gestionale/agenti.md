---
table_color: "#1565C0"
table_description: Rete vendita
col_id: '{"type":"int","pk":true,"increment":true}'
col_nome: '{"type":"varchar(80)","notNull":true}'
col_email: '{"type":"varchar(120)","unique":true}'
col_responsabile_id: '{"type":"int","ref":"agenti.id"}'
---

Agenti e capi area. `responsabile_id` è una self-reference (gerarchia).
