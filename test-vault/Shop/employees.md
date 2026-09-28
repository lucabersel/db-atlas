---
table_color: "#6D4C41"
table_description: Back-office staff
col_id: '{"type":"int","pk":true,"increment":true}'
col_name: '{"type":"varchar(120)","notNull":true}'
col_role: '{"type":"varchar(40)","notNull":true}'
col_manager_id: '{"type":"int","ref":"employees.id"}'
---

# employees

## manager_id
Reporting line. Self-reference.
