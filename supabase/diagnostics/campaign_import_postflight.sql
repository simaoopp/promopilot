-- Read-only. All RLS values must be true and both anonymous access and direct
-- authenticated writes must be false. No customer rows or prices are emitted.
select c.relname, c.relrowsecurity as rls_enabled,
 has_table_privilege('anon',c.oid,'SELECT') as anonymous_read,
 has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE') as direct_write
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('campaign_import_templates','campaign_import_sessions','campaign_import_rows');
select has_function_privilege('authenticated','public.campaign_import_action(uuid,uuid,text,jsonb)','EXECUTE') as authenticated_rpc,
 has_function_privilege('anon','public.campaign_import_action(uuid,uuid,text,jsonb)','EXECUTE') as anonymous_rpc,
 has_function_privilege('authenticated','public.ci_match(uuid,text,text)','EXECUTE') as internal_lookup_exposed;
select count(*) as incomplete_sessions from public.campaign_import_sessions where state='processing';
