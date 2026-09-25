-- 003_kb_building.sql — SPEC-P03-Resident-Agent.md §11.4: quy che (kb_documents)
-- phai gan voi DUNG MOT toa nha (building_id). Chi THEM (OPERATIONS.md §7)
-- — KHONG sua 001_init.sql/002_search.sql.
--
-- Tren DB da co du lieu (vd dev): dien building_id cho cac kb_documents cu
-- bang toa DAU TIEN (dev/pilot 1 toa, an toan) truoc khi set NOT NULL; DB
-- rong (fresh install/test) khong co dong nao de cap nhat.

alter table kb_documents add column building_id uuid references buildings;

update kb_documents
   set building_id = (select id from buildings order by id asc limit 1)
 where building_id is null;

alter table kb_documents alter column building_id set not null;

create index if not exists kb_documents_building_idx on kb_documents(building_id);
