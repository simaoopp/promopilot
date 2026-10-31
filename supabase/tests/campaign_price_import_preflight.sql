-- Read-only. Run in staging before the migration. No data or credentials exported.
select to_regclass('public.articles') as articles,
       to_regclass('public.campaigns') as campaigns,
       to_regclass('public.stores') as stores,
       to_regprocedure('public.platform_row_access(uuid,text,text)') as permission_guard;
select table_name,column_name,data_type from information_schema.columns
where table_schema='public' and
 ((table_name='articles' and column_name in ('id','organization_id','artigo','descricao','pvp2')) or
  (table_name='campaigns' and column_name in ('id','organization_id','store','dados')))
order by table_name,column_name;
select tablename,indexname,indexdef from pg_indexes
where schemaname='public' and tablename='articles';
-- The existing article identity/index must support exact code lookups.
-- This feature never changes the PK, UUIDs or UNIQUE(organization_id,artigo).
