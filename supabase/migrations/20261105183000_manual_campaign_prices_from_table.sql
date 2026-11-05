-- Manual campaign imports: both PVP2 Antes and PVP2 Atual come ONLY from the table.
-- Excel campaign imports retain the existing catalogue baseline.
-- This replaces only the RPC implementation; it does not rewrite historical
-- campaign/import rows, touch public.articles or modify the campaign guard.
-- Requires 20261031120000_campaign_price_import.sql and its warehouse migration.
-- Validate in staging before applying in production.
BEGIN;
create or replace function public.campaign_price_import(
 p_organization_id uuid,p_store text,p_action text,p_payload jsonb default '{}'
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 sid uuid; store_name text; matches integer; batch public.campaign_price_imports%rowtype;
 bid uuid; v jsonb; article jsonb; n integer; prior bigint; next_price bigint; problem text;
 req_hash text; selection jsonb; row_record public.campaign_price_import_rows%rowtype; v_warning text;
 v_catalog_price numeric; v_catalog_text text;
begin
 if auth.uid() is null or p_organization_id is null or coalesce(trim(p_store),'')=''
 or not public.platform_row_access(p_organization_id,p_store,'campaigns.write')
 or not public.platform_row_access(p_organization_id,p_store,'products.read') then
  raise exception 'Campaign import access denied' using errcode='42501';
 end if;
 select count(*),(array_agg(s.id))[1],(array_agg(s.name))[1] into matches,sid,store_name
 from public.stores s where s.organization_id=p_organization_id and s.status='active'
 and (lower(trim(s.name))=lower(trim(p_store)) or lower(trim(s.code))=lower(trim(p_store)) or s.id::text=p_store);
 if matches<>1 then raise exception 'Select an explicit active store' using errcode='42501'; end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>1500000 then
  raise exception 'Invalid import payload' using errcode='22023';
 end if;

 if p_action='models' then
  return jsonb_build_object('models',coalesce((select jsonb_agg(to_jsonb(t)) from (
    select id,name,mapping,updated_at from public.campaign_price_import_models
    where organization_id=p_organization_id and (coalesce(p_payload->>'search','')='' or name ilike '%'||(p_payload->>'search')||'%')
    order by name,id limit 100 offset greatest(0,least(100000,coalesce((p_payload->>'offset')::integer,0)))
  ) t),'[]'::jsonb));
 elsif p_action='save_model' then
  v:=p_payload->'mapping';
  if coalesce(length(trim(p_payload->>'name')),0) not between 1 and 120
   or v is null or jsonb_typeof(v)<>'object' or v->>'version' is distinct from '1'
   or coalesce(jsonb_typeof(v->'headers'),'')<>'array' or jsonb_array_length(v->'headers') not between 2 and 200
   or coalesce(v->>'headerRow','') !~ '^-?[0-9]+$'
   or coalesce(v->>'codeColumn','') !~ '^[0-9]+$' or coalesce(v->>'priceColumn','') !~ '^[0-9]+$'
   or (v->>'codeColumn')::integer not between 0 and jsonb_array_length(v->'headers')-1
   or (v->>'priceColumn')::integer not between 0 and jsonb_array_length(v->'headers')-1
   or (v->>'headerRow')::integer not between -1 and 4999
   or v->>'codeColumn'=v->>'priceColumn' or octet_length(v::text)>64000 then
   raise exception 'Invalid supplier mapping' using errcode='22023';
  end if;
  if p_payload->>'id' is not null then
   update public.campaign_price_import_models set name=trim(p_payload->>'name'),mapping=v,updated_at=now()
   where id=(p_payload->>'id')::uuid and organization_id=p_organization_id returning id into bid;
   if bid is null then raise exception 'Model access denied' using errcode='42501'; end if;
  else
   insert into public.campaign_price_import_models(organization_id,name,mapping,created_by)
   values(p_organization_id,trim(p_payload->>'name'),v,auth.uid()) returning id into bid;
  end if;
  return jsonb_build_object('id',bid);
 elsif p_action='delete_model' then
  delete from public.campaign_price_import_models where id=(p_payload->>'id')::uuid and organization_id=p_organization_id;
  return jsonb_build_object('ok',true);
 end if;

 bid:=(p_payload->>'id')::uuid;
 if bid is null then raise exception 'Import id is required' using errcode='22023'; end if;
 -- Serialize retries for an id even before its first insert.
 perform pg_advisory_xact_lock(hashtextextended(bid::text,0));
 select * into batch from public.campaign_price_imports where id=bid for update;
 if found and (batch.organization_id<>p_organization_id or batch.store_id<>sid or batch.created_by<>auth.uid()) then
  raise exception 'Import access denied' using errcode='42501';
 end if;
 if p_action='prepare' then
  req_hash:=md5(p_payload::text);
  if batch.id is not null then
   if batch.request_hash<>req_hash then raise exception 'Import id reused with different content' using errcode='40001'; end if;
   return public.campaign_price_import_result(bid);
  end if;
  if coalesce(jsonb_typeof(p_payload->'rows'),'')<>'array' or jsonb_array_length(p_payload->'rows') not between 1 and 2000
   or coalesce(p_payload->>'mode','') not in ('manual','excel') or coalesce(jsonb_typeof(p_payload->'source'),'')<>'object'
   or octet_length((p_payload->'source')::text)>64000 then
   raise exception 'Invalid import size or source' using errcode='22023';
  end if;
  insert into public.campaign_price_imports(id,organization_id,store_id,store_name,created_by,mode,source,request_hash)
  values(bid,p_organization_id,sid,store_name,auth.uid(),p_payload->>'mode',p_payload->'source',req_hash);
  for v in select x.value || jsonb_build_object('_duplicates',count(*) over(partition by trim(x.value->>'code')))
    from jsonb_array_elements(p_payload->'rows') x loop
   if jsonb_typeof(v)<>'object' or coalesce(v->>'line','') !~ '^[0-9]+$' or (v->>'line')::integer not between 1 and 5000
    or length(coalesce(v->>'code',''))>200 or length(coalesce(v->>'rawCode',''))>1000
    or length(coalesce(v->>'rawPrice',''))>1000 or length(coalesce(v->>'warning',''))>1000
    or length(coalesce(v->>'sourceSheet',''))>120
    or (v ? 'sourceLine' and (coalesce(v->>'sourceLine','') !~ '^[0-9]+$' or (v->>'sourceLine')::integer not between 1 and 5000))
    or length(coalesce(v->>'originalRawPrice',''))>1000 then
    raise exception 'Invalid row' using errcode='22023';
   end if;
   prior:=null; next_price:=null; problem:=null; article:=null;
   if coalesce(trim(v->>'code'),'')='' then problem:='missing_code';
   elsif (v->>'_duplicates')::integer>1 then problem:='duplicate';
   else
    -- Manual campaigns only read identity and display metadata. Their PVP2
    -- price is never selected from public.articles.
    if p_payload->>'mode'='manual' then
     select count(*),(jsonb_agg(jsonb_build_object(
       'article_id',a.article_id,'artigo',a.artigo,'descricao',a.descricao,
       'codigo_barras',a.codigo_barras)))->0 into n,article
     from public.articles a where a.organization_id=p_organization_id and a.artigo=trim(v->>'code');
    else
     select count(*),(jsonb_agg(to_jsonb(a)))->0 into n,article
     from public.articles a where a.organization_id=p_organization_id and a.artigo=trim(v->>'code');
    end if;
    if n=0 then problem:='not_found'; elsif n<>1 then problem:='ambiguous';
    elsif p_payload->>'mode'='manual' then
     -- For manual campaigns the table is authoritative for BOTH prices.
     -- Never substitute a missing or invalid old price from the catalogue.
     if btrim(coalesce(v->>'originalRawPrice',''))='' then
      problem:='missing_table_before';
     elsif coalesce(v->>'originalCents','') !~ '^[0-9]{1,9}$' then
      problem:='invalid_table_before';
     elsif (v->>'originalCents')::bigint not between 1 and 999999999 then
      problem:='invalid_table_before';
     else
      prior:=(v->>'originalCents')::bigint;
     end if;
    else
     -- Excel campaigns retain their existing catalogue-based pricing.
     v_catalog_text:=btrim(coalesce(article->>'pvp2',''));
     v_catalog_price:=null;
     if v_catalog_text ~ '^[0-9]+([.,][0-9]{1,2})?$' then
      v_catalog_price:=replace(v_catalog_text,',','.')::numeric;
     elsif v_catalog_text ~ '^[0-9]{1,3}(\.[0-9]{3})+,[0-9]{1,2}$' then
      v_catalog_price:=replace(replace(v_catalog_text,'.',''),',','.')::numeric;
     elsif v_catalog_text ~ '^[0-9]{1,3}(,[0-9]{3})+\.[0-9]{1,2}$' then
      v_catalog_price:=replace(v_catalog_text,',','')::numeric;
     end if;
     if v_catalog_price is null or v_catalog_price<=0 or
        v_catalog_price*100>999999999 then
      problem:='invalid_catalog_price';
     else
      prior:=(v_catalog_price*100)::bigint;
     end if;
    end if;
   end if;
   if coalesce(v->>'cents','') ~ '^[0-9]{1,9}$' and (v->>'cents')::bigint between 1 and 999999999 then next_price:=(v->>'cents')::bigint; end if;
   v_warning:=coalesce(v->>'warning','');
   -- An imported regular PVP2 is evidence for comparison, never the baseline.
   -- A mismatch cannot be silently applied as a promotional discount.
   if p_payload->>'mode'='excel' and coalesce(v->>'originalRawPrice','')<>'' then
    if coalesce(v->>'originalCents','') !~ '^[0-9]{1,9}$' then
     v_warning:=concat_ws(' · ',nullif(v_warning,''),'PVP2 original da tabela inválido; verificação necessária');
    elsif prior is not null and (v->>'originalCents')::bigint<>prior then
     v_warning:=concat_ws(' · ',nullif(v_warning,''),'PVP2 da tabela diverge do catálogo: '||
       to_char((v->>'originalCents')::bigint::numeric/100,'FM99999990D00')||' / '||
       to_char(prior::numeric/100,'FM99999990D00'));
    end if;
   end if;
   insert into public.campaign_price_import_rows(import_id,line,source_sheet,source_line,code,raw_code,raw_price,article_id,catalog_snapshot,before_cents,imported_cents,current_cents,problem,warning)
   values(bid,(v->>'line')::integer,coalesce(v->>'sourceSheet',p_payload->'source'->>'sheet',''),
    coalesce((v->>'sourceLine')::integer,(v->>'line')::integer),
    trim(coalesce(v->>'code','')),coalesce(v->>'rawCode',''),coalesce(v->>'rawPrice',''),
    coalesce(article->>'article_id',article->>'id'),
    case when prior is not null or (p_payload->>'mode'='manual' and article is not null) then jsonb_build_object('article_id',coalesce(article->'article_id',article->'id'),'organization_id',p_organization_id,
     'codigo',article->>'artigo','descricao',article->>'descricao','ean',coalesce(article->>'codigo_barras',''),
     'pn',coalesce(article->>'referencia','')) else null end,
    prior,next_price,next_price,problem,v_warning);
  end loop;
 elsif p_action='confirm' then
  if batch.id is null then raise exception 'Import not found' using errcode='42501'; end if;
  selection:=p_payload->'selected';
  if coalesce(jsonb_typeof(selection),'')<>'array' or jsonb_array_length(selection) not between 1 and 2000 then
   raise exception 'Select valid rows explicitly' using errcode='22023';
  end if;
  req_hash:=md5(selection::text);
  if batch.status='confirmed' then
   if batch.confirmation_hash<>req_hash then raise exception 'Confirmed import is immutable' using errcode='40001'; end if;
   return public.campaign_price_import_result(bid);
  end if;
  if exists(select 1 from jsonb_array_elements(selection) x group by x->>'id' having count(*)>1) then
   raise exception 'Repeated selection' using errcode='22023';
  end if;
  for v in select value from jsonb_array_elements(selection) loop
   select * into row_record from public.campaign_price_import_rows where id=(v->>'id')::uuid and import_id=bid;
   if not found or row_record.problem is not null or row_record.before_cents is null
    or coalesce(v->>'cents','') !~ '^[0-9]{1,9}$' or (v->>'cents')::bigint not between 1 and 999999999
    or (row_record.warning<>'' and coalesce(v->>'reviewed','')<>'true') then
    raise exception 'Unresolved import row' using errcode='22023';
   end if;
   update public.campaign_price_import_rows set selected=true,current_cents=(v->>'cents')::bigint where id=row_record.id;
  end loop;
  update public.campaign_price_imports set status='confirmed',confirmation_hash=req_hash,confirmed_at=now() where id=bid;
 elsif p_action<>'get' or batch.id is null then
  raise exception 'Invalid import action or id' using errcode='22023';
 end if;
 return public.campaign_price_import_result(bid);
end $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
