---
table_color: "#EF6C00"
table_description: Stock locations
col_id: '{"type":"int","pk":true,"increment":true}'
col_code: '{"type":"varchar(10)","notNull":true,"unique":true}'
col_city: '{"type":"varchar(80)","notNull":true}'
col_manager_id: '{"type":"int","ref":"employees.id","rel":"-"}'
---

# warehouses
