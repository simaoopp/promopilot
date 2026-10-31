-- Optional warehouse values on imported campaign items (NOT public.articles).
-- Depends on 20261031120000_campaign_price_import.sql already installed.
-- Review carefully and apply separately in Supabase SQL Editor after lab tests.
begin;
create or replace function public.campaign_price_import_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare item jsonb; canonical jsonb; result jsonb:='[]'; import_row_id uuid; batch public.campaign_price_imports%rowtype; warehouse_code text;
begin
 if jsonb_typeof(new.dados)<>'array' then return new; end if;
 for item in select value from jsonb_array_elements(new.dados) loop
  if item ? 'campaignPriceImport' then
   if item->'campaignPriceImport'->>'kind' is distinct from 'catalog-pvp2-v1' then raise exception 'Unknown price import version' using errcode='22023'; end if;
   import_row_id:=(item->'campaignPriceImport'->>'rowId')::uuid;
   select b.* into batch from public.campaign_price_imports b join public.campaign_price_import_rows r on r.import_id=b.id where r.id=import_row_id;
   if batch.id is null or batch.organization_id is distinct from new.organization_id or batch.store_name is distinct from new.store
    or (auth.uid() is not null and not public.platform_row_access(new.organization_id,new.store,'campaigns.write'))
    or (auth.uid() is not null and batch.created_by<>auth.uid() and not exists(
     select 1 from public.campaign_price_import_applications a where a.campaign_id=new.id and a.row_id=import_row_id)) then
    raise exception 'Campaign import scope mismatch' using errcode='42501';
   end if;
   canonical:=public.campaign_price_import_item(import_row_id);
   if canonical is null or item->>'codigo' is distinct from canonical->>'codigo'
    or (item->>'antes')::numeric is distinct from (canonical->>'antes')::numeric
    or (item->>'atual')::numeric is distinct from (canonical->>'atual')::numeric then
    raise exception 'Imported PVP2 snapshot and confirmed price are immutable' using errcode='22023';
   end if;
   -- Allow only campaign presentation fields alongside the immutable item.
   canonical:=canonical || jsonb_strip_nulls(jsonb_build_object('dataInicio',item->'dataInicio','dataFim',item->'dataFim',
    'selecionado',item->'selecionado','formato',item->'formato'));
   -- Only fill missing campaign description/EAN from the supplier; never replace catalogue values.
   if btrim(coalesce(canonical->>'descricao','')) = '' and item ? 'descricao' then
     if jsonb_typeof(item->'descricao') <> 'string' or length(item->>'descricao') > 200 then
       raise exception 'Invalid campaign description' using errcode='22023';
     end if;
     canonical:=canonical || jsonb_build_object('descricao',item->>'descricao');
   end if;
   if btrim(coalesce(canonical->>'ean','')) = '' and item ? 'ean' then
     if jsonb_typeof(item->'ean') <> 'string' or (item->>'ean') !~ '^([0-9]{8}|[0-9]{12,14})$' then
       raise exception 'Invalid campaign EAN' using errcode='22023';
     end if;
     canonical:=canonical || jsonb_build_object('ean',item->>'ean');
   end if;
   -- Optional stock information on campaigns only: never update articles or warehouse inventory.
   -- Validate every supplied value; absence is distinct from numeric zero.
   foreach warehouse_code in array array['af','a1','a1e','ae','aea','a10','aev'] loop
     if item ? warehouse_code then
       if jsonb_typeof(item->warehouse_code) <> 'number'
          or (item->>warehouse_code)::numeric < 0
          or (item->>warehouse_code)::numeric > 1000000 then
         raise exception 'Invalid campaign warehouse quantity' using errcode='22023';
       end if;
       canonical:=canonical || jsonb_build_object(warehouse_code,item->warehouse_code);
     end if;
   end loop;
   insert into public.campaign_price_import_applications(campaign_id,row_id,organization_id,store_name,applied_by,item)
   values(new.id,import_row_id,new.organization_id,new.store,auth.uid(),canonical) on conflict(campaign_id,row_id) do nothing;
   result:=result||jsonb_build_array(canonical);
  else
   if tg_op='UPDATE' and exists(select 1 from jsonb_array_elements(old.dados) old_item
      where old_item ? 'campaignPriceImport' and old_item->>'codigo'=item->>'codigo') then
    raise exception 'Cannot remove imported price provenance' using errcode='22023';
   end if;
   result:=result||jsonb_build_array(item);
  end if;
 end loop;
 new.dados:=result;
 return new;
end $$;

notify pgrst, 'reload schema';
commit;
