-- 002_search.sql — SPEC-P03-Resident-Agent.md §10.4: ham bo dau bat bien +
-- cot kb_sections.tsv sinh tu heading||body qua CUNG ham (dong bo voi truy
-- van tsquery). Chi THEM (OPERATIONS.md §7) — KHONG sua 001_init.sql.
--
-- `immutable_unaccent` port tu `D:\build phase\db\migrations\003_knowledge.sql`
-- (chu ky/gia tri giu nguyen): boc `unaccent()` (khong IMMUTABLE mac dinh vi
-- phu thuoc dictionary) thanh mot ham SQL IMMUTABLE de dung duoc trong cot
-- GENERATED va trong index bieu thuc. Extension `unaccent` da duoc tao o
-- 001_init.sql (`create extension if not exists unaccent`), cai vao schema
-- `public` (khong chi dinh SCHEMA khac) nen search_path o day chi can
-- `public, pg_catalog`.
create or replace function public.immutable_unaccent(text)
  returns text
  language sql
  immutable strict parallel safe
  set search_path = public, pg_catalog
as $$ select unaccent('unaccent', $1) $$;

-- kb_sections.tsv (001_init.sql) la cot thuong (nullable) — doi thanh GENERATED
-- de luon dong bo voi heading/body, tranh quen UPDATE tsv khi seed/sua noi
-- dung. Trong so 'A' cho heading (khop tieu de duoc xep hang cao hon), 'D'
-- (mac dinh) cho body.
alter table kb_sections drop column if exists tsv;
alter table kb_sections add column tsv tsvector generated always as (
  setweight(to_tsvector('simple', public.immutable_unaccent(coalesce(heading, ''))), 'A')
  || to_tsvector('simple', public.immutable_unaccent(body))
) stored;

create index if not exists kb_sections_tsv_idx on kb_sections using gin(tsv);
