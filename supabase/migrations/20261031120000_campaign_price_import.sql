-- Additive migration. Does not write articles or change existing RLS/auth.
begin;
set local lock_timeout = '5s';
do $$
begin
 if to_regprocedure('public.platform_row_access(uuid,text,text)') is null
 or to_regclass('public.articles') is null or to_regclass('public.campaigns') is null
 or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='campaigns' and column_name='dados')
 or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='articles' and column_name='pvp2') then
  raise exception 'Campaign price import requires the existing platform permissions, articles.pvp2 and campaigns.dados.';
 end if;
end $$;

create table if not exists public.campaign_price_import_models (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 name text not null check(length(name) between 1 and 120),
 mapping jsonb not null check(jsonb_typeof(mapping)='object'),
 created_by uuid not null, updated_at timestamptz not null default now(),
 unique(organization_id,name)
);
create table if not exists public.campaign_price_imports (
 id uuid primary key,
 organization_id uuid not null references public.organizations(id),
 store_id uuid not null references public.stores(id), store_name text not null,
 created_by uuid not null, mode text not null check(mode in ('manual','excel')),
 source jsonb not null, request_hash text not null,
 status text not null default 'prepared' check(status in ('prepared','confirmed')),
 confirmation_hash text, created_at timestamptz not null default now(), confirmed_at timestamptz
);
create index if not exists campaign_price_imports_org_actor_idx on public.campaign_price_imports(organization_id,created_by,created_at desc);
create table if not exists public.campaign_price_import_rows (
 id uuid primary key default gen_random_uuid(), import_id uuid not null references public.campaign_price_imports(id),
 line integer not null, code text not null, raw_code text not null, raw_price text not null,
 article_id text, catalog_snapshot jsonb, before_cents bigint,
 imported_cents bigint, current_cents bigint,
 problem text, warning text not null default '', selected boolean not null default false,
 unique(import_id,line),
 check(before_cents is null or before_cents between 1 and 999999999),
 check(imported_cents is null or imported_cents between 1 and 999999999),
 check(current_cents is null or current_cents between 1 and 999999999)
);
create table if not exists public.campaign_price_import_applications (
 campaign_id text not null, row_id uuid not null references public.campaign_price_import_rows(id),
 organization_id uuid not null references public.organizations(id), store_name text not null,
 applied_by uuid, applied_at timestamptz not null default now(), item jsonb not null,
 primary key(campaign_id,row_id)
 -- Deliberately retained when short-lived campaign history is cleaned up.
);

alter table public.campaign_price_import_models enable row level security;
alter table public.campaign_price_imports enable row level security;
alter table public.campaign_price_import_rows enable row level security;
alter table public.campaign_price_import_applications enable row level security;
revoke all on public.campaign_price_import_models,public.campaign_price_imports,public.campaign_price_import_rows,public.campaign_price_import_applications from public,anon,authenticated;
grant select on public.campaign_price_import_models,public.campaign_price_imports,public.campaign_price_import_rows,public.campaign_price_import_applications to authenticated;
drop policy if exists price_import_model_read on public.campaign_price_import_models;
create policy price_import_model_read on public.campaign_price_import_models for select to authenticated
 using(public.platform_permission(organization_id,'campaigns.write'));
drop policy if exists price_import_read on public.campaign_price_imports;
create policy price_import_read on public.campaign_price_imports for select to authenticated
 using(created_by=auth.uid() and public.platform_row_access(organization_id,store_name,'campaigns.write'));
drop policy if exists price_import_row_read on public.campaign_price_import_rows;
create policy price_import_row_read on public.campaign_price_import_rows for select to authenticated
 using(exists(select 1 from public.campaign_price_imports b where b.id=import_id));
drop policy if exists price_import_application_read on public.campaign_price_import_applications;
create policy price_import_application_read on public.campaign_price_import_applications for select to authenticated
 using(public.platform_row_access(organization_id,store_name,'campaigns.read'));

-- Private helpers have no client EXECUTE grant. All identifiers are qualified.
create or replace function public.campaign_price_import_item(p_row uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select r.catalog_snapshot || jsonb_build_object(
  'id',r.id::text,'codigo',r.code,'antes',r.before_cents::numeric/100,'atual',r.current_cents::numeric/100,
  'pvp2Antes',r.before_cents::numeric/100,'pvp2Atual',r.current_cents::numeric/100,
  'pv3',null,'tipo_registo','campanha','selecionado',r.current_cents<r.before_cents,
  'campaignPriceImport',jsonb_build_object('kind','catalog-pvp2-v1','rowId',r.id,'importId',b.id,
   'beforeCents',r.before_cents,'afterCents',r.current_cents,'capturedAt',b.created_at,
   'state',case when r.current_cents<r.before_cents then 'Promoção' when r.current_cents=r.before_cents then 'Sem alteração' else 'Aumento' end,
   'source',b.source,'line',r.line))
 from public.campaign_price_import_rows r join public.campaign_price_imports b on b.id=r.import_id
 where r.id=p_row and r.selected and b.status='confirmed';
$$;
create or replace function public.campaign_price_import_result(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',b.id,'status',b.status,'store',b.store_name,'organizationId',b.organization_id,
  'capturedAt',b.created_at,'source',b.source,
  'rows',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'line',r.line,'code',r.code,
    'description',r.catalog_snapshot->>'descricao','beforeCents',r.before_cents,
    'importedCents',r.imported_cents,'currentCents',r.current_cents,'problem',r.problem,
    'warning',r.warning,'rawCode',r.raw_code,'rawPrice',r.raw_price) order by r.line)
    from public.campaign_price_import_rows r where r.import_id=b.id),'[]'::jsonb),
  'items',coalesce((select jsonb_agg(public.campaign_price_import_item(r.id) order by r.line)
    from public.campaign_price_import_rows r where r.import_id=b.id and r.selected),'[]'::jsonb))
 from public.campaign_price_imports b where b.id=p_id;
$$;

create or replace function public.campaign_price_import(
 p_organization_id uuid,p_store text,p_action text,p_payload jsonb default '{}'
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 sid uuid; store_name text; matches integer; batch public.campaign_price_imports%rowtype;
 bid uuid; v jsonb; article jsonb; n integer; prior bigint; next_price bigint; problem text;
 req_hash text; selection jsonb; row_record public.campaign_price_import_rows%rowtype;
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
    or length(coalesce(v->>'rawPrice',''))>1000 or length(coalesce(v->>'warning',''))>1000 then
    raise exception 'Invalid row' using errcode='22023';
   end if;
   prior:=null; next_price:=null; problem:=null; article:=null;
   if coalesce(trim(v->>'code'),'')='' then problem:='missing_code';
   elsif (v->>'_duplicates')::integer>1 then problem:='duplicate';
   else
    select count(*),(jsonb_agg(to_jsonb(a)))->0 into n,article
    from public.articles a where a.organization_id=p_organization_id and a.artigo=trim(v->>'code');
    if n=0 then problem:='not_found'; elsif n<>1 then problem:='ambiguous';
    elsif (article->>'pvp2')::numeric is null or (article->>'pvp2')::numeric<=0
      or (article->>'pvp2')::numeric*100<>trunc((article->>'pvp2')::numeric*100)
      or (article->>'pvp2')::numeric*100>999999999 then problem:='invalid_catalog_price';
    else prior:=((article->>'pvp2')::numeric*100)::bigint;
    end if;
   end if;
   if coalesce(v->>'cents','') ~ '^[0-9]{1,9}$' and (v->>'cents')::bigint between 1 and 999999999 then next_price:=(v->>'cents')::bigint; end if;
   insert into public.campaign_price_import_rows(import_id,line,code,raw_code,raw_price,article_id,catalog_snapshot,before_cents,imported_cents,current_cents,problem,warning)
   values(bid,(v->>'line')::integer,trim(coalesce(v->>'code','')),coalesce(v->>'rawCode',''),coalesce(v->>'rawPrice',''),article->>'id',
    case when prior is not null then jsonb_build_object('article_id',article->'id','organization_id',p_organization_id,
     'codigo',article->>'artigo','descricao',article->>'descricao','ean',coalesce(article->>'codigo_barras',''),
     'pn',coalesce(article->>'referencia','')) else null end,
    prior,next_price,next_price,problem,coalesce(v->>'warning',''));
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

-- Guard the existing campaign save path as well as direct Supabase requests.
-- Imported prices cannot be replaced by the PVP3 selector or a forged payload.
create or replace function public.campaign_price_import_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare item jsonb; canonical jsonb; result jsonb:='[]'; import_row_id uuid; batch public.campaign_price_imports%rowtype;
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
drop trigger if exists campaign_price_import_guard on public.campaigns;
create trigger campaign_price_import_guard before insert or update of dados,organization_id,store on public.campaigns
 for each row execute function public.campaign_price_import_guard();

revoke all on function public.campaign_price_import_item(uuid),public.campaign_price_import_result(uuid),public.campaign_price_import_guard() from public,anon,authenticated;
revoke all on function public.campaign_price_import(uuid,text,text,jsonb) from public,anon;
grant execute on function public.campaign_price_import(uuid,text,text,jsonb) to authenticated;
comment on function public.campaign_price_import(uuid,text,text,jsonb) is 'Tenant-scoped campaign-only PVP2 snapshots. Never writes public.articles.';
notify pgrst,'reload schema';
commit;
