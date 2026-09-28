---
table_color: "#6A1B9A"
table_description: Customer orders
col_id: '{"type":"int","pk":true,"increment":true}'
col_customer_id: '{"type":"int","notNull":true,"ref":"customers.id"}'
col_shipping_address_id: '{"type":"int","notNull":true,"ref":"addresses.id"}'
col_status: '{"type":"varchar(20)","notNull":true,"default":"pending"}'
col_placed_at: '{"type":"datetime","notNull":true}'
col_total: '{"type":"decimal(12,2)","notNull":true}'
---

# orders

## status
pending → paid → shipped → delivered, or cancelled.
