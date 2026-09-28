---
table_color: "#1565C0"
table_description: Catalog tree
col_id: '{"type":"int","pk":true,"increment":true}'
col_parent_id: '{"type":"int","ref":"categories.id"}'
col_name: '{"type":"varchar(80)","notNull":true}'
col_slug: '{"type":"varchar(80)","notNull":true,"unique":true}'
---

# categories

## parent_id
Null for top-level categories.
