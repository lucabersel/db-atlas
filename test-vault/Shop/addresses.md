---
table_color: "#2E7D32"
table_description: Shipping and billing addresses
col_id: '{"type":"int","pk":true,"increment":true}'
col_customer_id: '{"type":"int","notNull":true,"ref":"customers.id"}'
col_line1: '{"type":"varchar(160)","notNull":true}'
col_city: '{"type":"varchar(80)","notNull":true}'
col_country: '{"type":"char(2)","notNull":true}'
col_is_default: '{"type":"boolean","notNull":true,"default":false}'
---

# addresses
