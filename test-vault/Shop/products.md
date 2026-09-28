---
table_color: "#1565C0"
table_description: Sellable items
col_id: '{"type":"int","pk":true,"increment":true}'
col_sku: '{"type":"varchar(32)","notNull":true,"unique":true}'
col_name: '{"type":"varchar(160)","notNull":true}'
col_category_id: '{"type":"int","notNull":true,"ref":"categories.id"}'
col_brand_id: '{"type":"int","ref":"brands.id"}'
col_price: '{"type":"decimal(10,2)","notNull":true}'
col_active: '{"type":"boolean","notNull":true,"default":true}'
---

# products

## sku
Stock keeping unit, printed on labels. Never reuse a SKU.
