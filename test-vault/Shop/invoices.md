---
table_color: "#6A1B9A"
table_description: One invoice per order
col_id: '{"type":"int","pk":true,"increment":true}'
col_order_id: '{"type":"int","notNull":true,"unique":true,"ref":"orders.id","rel":"-"}'
col_number: '{"type":"varchar(20)","notNull":true,"unique":true}'
col_issued_at: '{"type":"date","notNull":true}'
---

# invoices
