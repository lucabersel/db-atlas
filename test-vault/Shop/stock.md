---
table_color: "#EF6C00"
table_description: Quantity per product and warehouse
col_product_id: '{"type":"int","pk":true,"notNull":true,"ref":"products.id"}'
col_warehouse_id: '{"type":"int","pk":true,"notNull":true,"ref":"warehouses.id"}'
col_on_hand: '{"type":"int","notNull":true,"default":0}'
col_reserved: '{"type":"int","notNull":true,"default":0}'
---

# stock

## reserved
Units held by paid orders not yet shipped.
