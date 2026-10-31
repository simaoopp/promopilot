-- Read-only. Run on a staging copy first, then review before applying the new migration.
select 'article UUID primary key' as check_name, exists(
 select 1 from pg_constraint where conrelid=to_regclass('public.articles') and contype='p' and pg_get_constraintdef(oid)='PRIMARY KEY (article_id)'
) as passed
union all select 'organization + commercial code unique', exists(
 select 1 from pg_constraint where conrelid=to_regclass('public.articles') and contype='u' and pg_get_constraintdef(oid)='UNIQUE (organization_id, artigo)'
)
union all select 'platform permissions available', to_regprocedure('public.platform_permission(uuid,text,uuid)') is not null
union all select 'audit table available', to_regclass('public.audit_logs') is not null
union all select 'catalogue RLS enabled', coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.articles')),false)
union all select 'EAN lookup index available', exists(
 select 1 from pg_index i join pg_class c on c.oid=i.indexrelid where i.indrelid=to_regclass('public.articles') and i.indisvalid and pg_get_indexdef(c.oid) like '%codigo_barras%'
);
-- Review definitions and validity; do not create duplicate indexes automatically.
select indexname,indexdef from pg_indexes where schemaname='public' and tablename='articles' and (indexdef like '%artigo%' or indexdef like '%codigo_barras%');
