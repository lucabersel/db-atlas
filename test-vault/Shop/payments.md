---
table_color: "#6A1B9A"
table_description: Card and wallet payments
col_id: '{"type":"int","pk":true,"increment":true}'
col_order_id: '{"type":"int","notNull":true,"ref":"orders.id"}'
col_provider: '{"type":"varchar(30)","notNull":true}'
col_amount: '{"type":"decimal(12,2)","notNull":true}'
col_paid_at: '{"type":"datetime"}'
---

# payments
