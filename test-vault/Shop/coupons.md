---
table_color: "#00838F"
table_description: Discount codes
col_id: '{"type":"int","pk":true,"increment":true}'
col_code: '{"type":"varchar(20)","notNull":true,"unique":true}'
col_percent_off: '{"type":"decimal(5,2)","notNull":true}'
col_product_id: '{"type":"int","ref":"products.id","rel":"<>"}'
col_valid_until: '{"type":"date"}'
---

# coupons

## product_id
Coupons can target many products and a product many coupons (many-to-many).
