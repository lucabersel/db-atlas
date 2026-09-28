---
table_color: "#6A1B9A"
table_description: Parcels sent to customers
col_id: '{"type":"int","pk":true,"increment":true}'
col_order_id: '{"type":"int","notNull":true,"ref":"orders.id"}'
col_warehouse_id: '{"type":"int","notNull":true,"ref":"warehouses.id"}'
col_carrier: '{"type":"varchar(40)","notNull":true}'
col_tracking_code: '{"type":"varchar(60)","unique":true}'
col_shipped_at: '{"type":"datetime"}'
---

# shipments
