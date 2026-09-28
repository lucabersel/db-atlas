---
table_color: "#6A1B9A"
table_description: Order lines (composite key)
col_order_id: '{"type":"int","pk":true,"notNull":true,"ref":"orders.id"}'
col_line_no: '{"type":"smallint","pk":true,"notNull":true}'
col_product_id: '{"type":"int","notNull":true,"ref":"products.id"}'
col_quantity: '{"type":"int","notNull":true,"default":1}'
col_unit_price: '{"type":"decimal(10,2)","notNull":true}'
---

# order_items
