-- Read-only. Expected: all four tables have RLS; anonymous EXECUTE = false;
-- authenticated direct table writes = false; authenticated RPC = true.
select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('campaign_price_import_models','campaign_price_imports','campaign_price_import_rows','campaign_price_import_applications');
select has_function_privilege('anon','public.campaign_price_import(uuid,text,text,jsonb)','execute') as anonymous_rpc,
       has_function_privilege('authenticated','public.campaign_price_import(uuid,text,text,jsonb)','execute') as authenticated_rpc,
       has_function_privilege('authenticated','public.campaign_price_import_result(uuid)','execute') as private_helper;
select name,has_table_privilege('authenticated','public.'||name,'INSERT,UPDATE,DELETE') as direct_write
from unnest(array['campaign_price_import_models','campaign_price_imports','campaign_price_import_rows','campaign_price_import_applications']) name;
select tgname,tgenabled from pg_trigger where tgrelid='public.campaigns'::regclass and tgname='campaign_price_import_guard';
