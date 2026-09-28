---
col_id: '{"type":"int","pk":true}'
col_tabella_inesistente_id: '{"type":"int","ref":"fantasma.id"}'
col_campo_inesistente_id: '{"type":"int","ref":"base.fantasma"}'
col_altra_cartella_id: '{"type":"int","ref":"clienti.id"}'
col_case_sbagliato_id: '{"type":"int","ref":"Base.id"}'
col_ok_id: '{"type":"int","ref":"base.id"}'
---

Tutti i ref tranne `ok_id` sono rotti (⚠️, nessuna linea). `clienti` esiste solo in un'altra cartella-DB.
