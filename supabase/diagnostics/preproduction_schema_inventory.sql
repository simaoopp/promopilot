-- PromoPilot: metadados de auditoria SQL. NÃO é uma migração.
-- Executar apenas numa base descartável/autorizada. Não altera dados nem privilégios.
-- Revisão 2026-10-19. Verificar permissões do operador antes de executar.

-- PK/FK/UNIQUE de articles e referências para a chave comercial.
select n.nspname as schema_name, c.relname as table_name, con.conname,
       con.contype, pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where (n.nspname = 'public' and c.relname = 'articles')
   or (con.confrelid = to_regclass('public.articles'))
order by 1, 2, 3;

-- Colunas existentes: não assumir que article_id existe só pelo nome da migration.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'articles'
order by ordinal_position;

-- Índices inválidos/provisórios e unicidade real.
select ci.relname as index_name, ix.indisvalid, ix.indisready, ix.indisunique,
       pg_get_indexdef(ix.indexrelid) as index_definition
from pg_index ix
join pg_class c on c.oid = ix.indrelid
join pg_class ci on ci.oid = ix.indexrelid
where c.oid = to_regclass('public.articles')
order by index_name;

-- Policies RLS e atributo permissiva/restritiva de tabelas public e storage.
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname in ('public','storage')
order by schemaname, tablename, policyname;

-- Estado RLS e FORCE RLS.
select n.nspname as schema_name, c.relname, c.relrowsecurity, c.relforcerowsecurity,
       pg_get_userbyid(c.relowner) as owner
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public','storage') and c.relkind in ('r','p')
order by 1,2;

-- SECURITY DEFINER, configuração search_path, grants EXECUTE efetivos.
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as signature,
       p.prosecdef as security_definer, p.proconfig,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute,
       has_function_privilege('service_role',p.oid,'EXECUTE') as service_can_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by 1,2,3;

-- Grants em public. Não é a prova completa de segurança (avaliar em conjunto com RLS).
select table_schema, table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon','authenticated','service_role')
order by table_schema, table_name, grantee, privilege_type;

-- Metadados dos buckets (não consultar storage.objects de clientes).
select id, name, public, file_size_limit
from storage.buckets
order by id;

-- Não executar DDL, backfill nem cutover a partir deste diagnóstico.
