---
table_color: "#2E7D32"
table_description: Registered customers
col_id: '{"type":"int","pk":true,"increment":true}'
col_email: '{"type":"varchar(160)","notNull":true,"unique":true}'
col_full_name: '{"type":"varchar(120)","notNull":true}'
col_group_id: '{"type":"int","ref":"customer_groups.id"}'
col_referred_by_id: '{"type":"int","ref":"customers.id"}'
col_created_at: '{"type":"datetime","notNull":true,"default":"now()"}'
---

# customers

## referred_by_id
Customer who brought this one in (referral programme). Self-reference.
