-- Inventário para o SQL Editor administrativo. Não altera dados nem objetos
-- permanentes: esta função existe apenas na sessão atual (pg_temp).
-- Executar o ficheiro completo. Guardar o resultado em privado.
create or replace function pg_temp.phase_zero_inventory() returns jsonb
language plpgsql set search_path='' as $$
declare result jsonb := '{}'::jsonb; spec record; rows_json jsonb;
 missing_core jsonb := '[]'::jsonb; missing_admin jsonb := '[]'::jsonb;
begin
 for spec in select * from (values
  ('organizations','organizations',true),('stores','stores',true),
  ('organization_members','memberships',true),('profiles','profiles',true),
  ('plans','plans',false),('subscriptions','subscriptions',false)
 ) v(table_name,report_key,required) loop
  if to_regclass('public.'||spec.table_name) is null then
   rows_json := null;
   if spec.required then missing_core := missing_core || to_jsonb(spec.table_name);
   else missing_admin := missing_admin || to_jsonb(spec.table_name); end if;
  elsif spec.table_name='profiles' then
   select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'role',p.role,'store',p.store,'default_organization_id',p.default_organization_id)),'[]') into rows_json from public.profiles p;
  else
   execute format('select coalesce(jsonb_agg(to_jsonb(x)),''[]'') from public.%I x',spec.table_name) into rows_json;
  end if;
  result := result || jsonb_build_object(spec.report_key,rows_json);
 end loop;
 if to_regclass('public.audit_logs') is null then missing_admin := missing_admin || '"audit_logs"'::jsonb; end if;
 return result || jsonb_build_object(
  'expert',(select coalesce(jsonb_agg(x),'[]') from jsonb_array_elements(coalesce(nullif(result->'organizations','null'::jsonb),'[]')) x where lower(trim(x->>'name'))='expert'),
  'missing_required_tables',missing_core,
  'administrative_tables_to_create',missing_admin,
  'audit_logs_exists',to_regclass('public.audit_logs') is not null,
  'policies',(select coalesce(jsonb_agg(to_jsonb(p)),'[]') from pg_policies p where schemaname in ('public','storage'))
 );
end $$;
select pg_temp.phase_zero_inventory() as phase_zero_inventory;
