-- Additive importer only. Never writes articles, campaigns or email tables.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.articles'::regclass and contype='p' and pg_get_constraintdef(oid)='PRIMARY KEY (article_id)') then
    raise exception 'Apply and verify the supplied article UUID identity cutover first.';
  end if;
  if to_regprocedure('public.platform_permission(uuid,text,uuid)') is null then raise exception 'Platform permissions required.'; end if;
end $$;
create table if not exists public.campaign_import_templates (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 supplier text not null check(length(supplier) between 1 and 120), name text not null check(length(name) between 1 and 120),
 config jsonb not null, version integer not null default 1, created_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(), unique(organization_id,supplier,name)
);
create table if not exists public.campaign_import_sessions (
 id uuid primary key, organization_id uuid not null references public.organizations(id), store_id uuid not null references public.stores(id),
 user_id uuid not null references auth.users(id), source jsonb not null, config jsonb not null,
 total_rows integer not null check(total_rows between 1 and 10000), processed integer not null default 0,
 state text not null default 'processing' check(state in ('processing','ready','completed')),
 version integer not null default 1, batches jsonb not null default '{}', created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), unique(organization_id,id)
);
create index if not exists campaign_import_sessions_owner_idx on public.campaign_import_sessions(organization_id,user_id,created_at desc);
create table if not exists public.campaign_import_rows (
 session_id uuid not null, organization_id uuid not null, row_index integer not null check(row_index between 0 and 9999),
 source_index integer not null, raw jsonb not null, code text not null default '', barcode text not null default '',
 description text not null default '', source_info text not null default '', article_id uuid, match_state text not null, before_cents bigint,
 promo_input text not null default '', promo_cents bigint, previous_cents bigint, captured_at timestamptz,
 start_date date, end_date date, excluded boolean not null default false, review boolean not null default false,
 flags jsonb not null default '[]', primary key(session_id,row_index),
 foreign key(organization_id,session_id) references public.campaign_import_sessions(organization_id,id)
);
-- article_id is historical provenance, not a cascading FK: authorized catalogue
-- maintenance cannot erase or rewrite prepared price snapshots.
create index if not exists campaign_import_rows_article_idx on public.campaign_import_rows(session_id,article_id,row_index) where not excluded;

create or replace function public.ci_allowed(p_org uuid,p_store uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and p_store is not null
 and exists(select 1 from public.stores where id=p_store and organization_id=p_org and status='active')
 and public.platform_permission(p_org,'campaigns.write',p_store)
 and public.platform_permission(p_org,'products.read',p_store)
$$;
create or replace function public.ci_money(p_value text,p_locale text default 'auto') returns bigint
language plpgsql immutable set search_path='' as $$
declare v text; d text; g text; a text[]; i text; n numeric;
begin
 v:=btrim(regexp_replace(btrim(coalesce(p_value,'')),'^(EUR|€)\s*|\s*(EUR|€)$','','gi'));
 if v='' or v ~ '[^0-9.,[:space:]  ]' then return null; end if;
 v:=regexp_replace(v,'[[:space:]  ]','','g');
 d:=case p_locale when 'pt' then ',' when 'en' then '.' else '' end;
 if d='' then
  if strpos(v,',')>0 and strpos(v,'.')>0 then d:=case when strpos(reverse(v),',')<strpos(reverse(v),'.') then ',' else '.' end;
  elsif v ~ '[.,]' then
   if v !~ '^\d+[.,]\d{1,2}$' then return null; end if;
   d:=case when strpos(v,',')>0 then ',' else '.' end;
  end if;
 end if;
 g:=case when d=',' then '.' else ',' end;
 a:=case when d='' then array[v] else string_to_array(v,d) end;
 if cardinality(a)>2 or (cardinality(a)=2 and a[2] !~ '^\d{1,2}$') then return null; end if;
 i:=a[1];
 if strpos(i,g)>0 and i !~ ('^\d{1,3}(\' || g || '\d{3})+$') then return null; end if;
 i:=replace(i,g,''); if i !~ '^\d{1,8}$' then return null; end if;
 n:=i::numeric*100+coalesce(nullif(rpad(a[2],2,'0'),''),'0')::numeric;
 return case when n>0 and n<=999999999 then n::bigint else null end;
end $$;
create or replace function public.ci_date(p_value text,p_year text) returns date
language plpgsql immutable set search_path='' as $$
declare a text[]; v date;
begin
 if p_value ~ '^\d{4}-\d{2}-\d{2}$' then
  v:=p_value::date; return case when extract(year from v) between 2000 and 2200 then v else null end;
 end if;
 a:=regexp_match(p_value,'^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?$');
 if a is null then return null; end if;
 v:=make_date(coalesce(a[3],p_year)::integer,a[2]::integer,a[1]::integer); return case when extract(year from v) between 2000 and 2200 then v else null end;
exception when datetime_field_overflow or invalid_datetime_format or invalid_text_representation then return null;
end $$;
create or replace function public.ci_check_config(c jsonb) returns void
language plpgsql set search_path='' as $$
declare k text; v jsonb; cols integer[]:='{}';
begin
 if c is null or jsonb_typeof(c)<>'object' or pg_column_size(c)>16000 or c->>'priceConfirmed' is distinct from 'true'
 or coalesce(c->>'locale','') not in ('auto','pt','en')
 or coalesce(c->>'headerStart','') !~ '^\d{1,5}$' or coalesce(c->>'headerCount','') !~ '^[0-5]$'
 or coalesce(c->>'dataStart','') !~ '^\d{1,4}$'
 or ((c->>'headerCount')::int>0 and (c->>'dataStart')::int < (c->>'headerStart')::int+(c->>'headerCount')::int)
 or coalesce(c->>'startDate','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(c->>'endDate','') !~ '^\d{4}-\d{2}-\d{2}$'
 or public.ci_date(c->>'startDate','') is null or public.ci_date(c->>'endDate','') is null
 or c->>'startDate'>c->>'endDate' or jsonb_typeof(c->'mapping') is distinct from 'object'
 then raise exception 'Invalid mapping/dates' using errcode='22023'; end if;
 for k,v in select * from jsonb_each(c->'mapping') loop
  if k not in ('code','barcode','description','promo','previous','start','end','information') or jsonb_typeof(v)<>'number'
  or v::text !~ '^\d{1,2}$' or v::text::int>=80 then raise exception 'Invalid column' using errcode='22023'; end if;
  cols:=array_append(cols,v::text::int);
 end loop;
 if cardinality(cols)<>(select count(distinct x) from unnest(cols) x)
 or (not c->'mapping'?'code' and not c->'mapping'?'barcode')
 or (not c->'mapping'?'promo' and c->>'manualPrice' is distinct from 'true') then
  raise exception 'Mapping requires code and explicit promo field' using errcode='22023';
 end if;
end $$;
create or replace function public.ci_maintenance(p_text text) returns boolean
language sql immutable set search_path='' as $$
 select regexp_replace(regexp_replace(upper(translate(coalesce(p_text,''),'áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ','aaaaeeioooucAAAAEEIOOOUC')),'[^A-Z0-9]+',' ','g'),'P *V *P','PVP','g')
 ~ '(ACTUALIZ|ATUALIZ|ACTULIZ|ATULIZ|REPOSI|REPOR|REPOS)[A-Z ]*PVP|PVP[123S ]*(ACTUALIZ|ATUALIZ|REPOSI|REPOR)'
$$;
create or replace function public.ci_match(p_org uuid,p_code text,p_barcode text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare a public.articles%rowtype; count_matches integer; cents bigint;
begin
 select * into a from public.articles where organization_id=p_org and artigo=p_code;
 if not found and coalesce(p_barcode,'')<>'' then
  select count(*) into count_matches from (select 1 from public.articles where organization_id=p_org and codigo_barras=p_barcode limit 2) m;
  if count_matches>1 then return jsonb_build_object('match_state','ambiguous'); end if;
  select * into a from public.articles where organization_id=p_org and codigo_barras=p_barcode;
 end if;
 if a.article_id is null then return jsonb_build_object('match_state','missing'); end if;
 cents:=public.ci_money(a.pvp2::text,'en');
 return jsonb_build_object('match_state','identified','article_id',a.article_id,'code',a.artigo,'barcode',a.codigo_barras,'description',a.descricao,'before_cents',cents,'captured_at',clock_timestamp());
end $$;

alter table public.campaign_import_templates enable row level security;
alter table public.campaign_import_sessions enable row level security;
alter table public.campaign_import_rows enable row level security;
drop policy if exists ci_templates_read on public.campaign_import_templates;
create policy ci_templates_read on public.campaign_import_templates for select to authenticated using (
 exists(select 1 from public.stores s where s.organization_id=campaign_import_templates.organization_id and public.ci_allowed(s.organization_id,s.id))
);
drop policy if exists ci_sessions_read on public.campaign_import_sessions;
create policy ci_sessions_read on public.campaign_import_sessions for select to authenticated using(user_id=auth.uid() and public.ci_allowed(organization_id,store_id));
drop policy if exists ci_rows_read on public.campaign_import_rows;
create policy ci_rows_read on public.campaign_import_rows for select to authenticated using(exists(select 1 from public.campaign_import_sessions s where s.id=session_id and s.organization_id=campaign_import_rows.organization_id));
revoke all on public.campaign_import_templates,public.campaign_import_sessions,public.campaign_import_rows from public,anon,authenticated;
grant select on public.campaign_import_templates,public.campaign_import_sessions,public.campaign_import_rows to authenticated;
create or replace view public.campaign_import_review with(security_invoker=true) as
 select r.*, case when excluded then 'ignored' when match_state<>'identified' then match_state
 when review or start_date is null or end_date is null or end_date<start_date then 'review'
 when before_cents is null or promo_cents is null then 'price'
 when promo_cents>=before_cents then 'no_discount'
 when exists(select 1 from public.campaign_import_rows d where d.session_id=r.session_id and d.article_id=r.article_id and not d.excluded and d.row_index<r.row_index) then 'duplicate'
 else 'valid' end as state,
 case when promo_cents<before_cents then before_cents-promo_cents end as saving_cents,
 case when promo_cents<before_cents then round((before_cents-promo_cents)::numeric*10000/before_cents)::integer end as discount_bps,
 (previous_cents is not null and previous_cents is distinct from before_cents) as previous_mismatch
 from public.campaign_import_rows r;
revoke all on public.campaign_import_review from public,anon,authenticated;
grant select on public.campaign_import_review to authenticated;

create or replace function public.campaign_import_action(p_org uuid,p_store uuid,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' set statement_timeout='15s' set lock_timeout='3s' as $$
#variable_conflict use_variable
declare s public.campaign_import_sessions%rowtype; t public.campaign_import_templates%rowtype; r public.campaign_import_rows%rowtype;
 id uuid; c jsonb; old_row jsonb; row_data jsonb; raw jsonb; m jsonb; result jsonb; n integer; idx integer; digest text; batch_key text;
 code text; barcode text; promo text; information text; start_d date; end_d date; is_blank boolean; row_review boolean; changed integer;
begin
 if not coalesce(public.ci_allowed(p_org,p_store),false) then raise exception 'Forbidden' using errcode='42501'; end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>1200000 then raise exception 'Invalid request' using errcode='22023'; end if;
 if p_action='templates' then
  select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(x)),'[]')) into result from (
   select * from public.campaign_import_templates where organization_id=p_org order by supplier,name limit 100 offset greatest(0,(coalesce(p_data->>'offset','0'))::int)
  ) x; return result;
 elsif p_action='template_save' then
  perform public.ci_check_config(p_data->'config');
  if coalesce(length(btrim(p_data->>'supplier')),0) not between 1 and 120 or coalesce(length(btrim(p_data->>'name')),0) not between 1 and 120 then raise exception 'Invalid template name' using errcode='22023'; end if;
  id:=coalesce((p_data->>'id')::uuid,gen_random_uuid());
  select * into t from public.campaign_import_templates where campaign_import_templates.id=id for update;
  if found then
   if t.organization_id<>p_org then raise exception 'Forbidden' using errcode='42501'; end if;
   if t.version is distinct from (p_data->>'version')::int then raise exception 'Version changed' using errcode='40001'; end if;
   update public.campaign_import_templates set supplier=btrim(p_data->>'supplier'),name=btrim(p_data->>'name'),config=p_data->'config',version=version+1,updated_at=now() where campaign_import_templates.id=id returning * into t;
  else
   insert into public.campaign_import_templates(id,organization_id,supplier,name,config,created_by) values(id,p_org,btrim(p_data->>'supplier'),btrim(p_data->>'name'),p_data->'config',auth.uid()) returning * into t;
  end if;
  insert into public.audit_logs(organization_id,user_id,action,entity_type,entity_id,metadata) values(p_org,auth.uid(),'campaign-import.template','campaign_import_templates',id,jsonb_build_object('version',t.version));
  return to_jsonb(t);
 elsif p_action='sessions' then
  select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(x)-'batches'),'[]')) into result from (
   select * from public.campaign_import_sessions where organization_id=p_org and store_id=p_store and user_id=auth.uid() order by created_at desc limit 20
  ) x; return result;
 end if;
 id:=(p_data->>'id')::uuid;
 if id is null then raise exception 'Session required' using errcode='22023'; end if;
 if p_action='start' then
  c:=p_data->'config'; perform public.ci_check_config(c);
  if jsonb_typeof(p_data->'source') is distinct from 'object' or pg_column_size(p_data->'source')>2048
   or coalesce(p_data->'source'->>'hash','') !~ '^[a-f0-9]{64}$' then raise exception 'Source hash required' using errcode='22023'; end if;
  insert into public.campaign_import_sessions(id,organization_id,store_id,user_id,source,config,total_rows)
   values(id,p_org,p_store,auth.uid(),p_data->'source',c,(p_data->>'totalRows')::int) on conflict do nothing;
 end if;
 select * into s from public.campaign_import_sessions where campaign_import_sessions.id=id for update;
 if not found or s.organization_id<>p_org or s.store_id<>p_store or s.user_id<>auth.uid() then raise exception 'Forbidden' using errcode='42501'; end if;
 c:=s.config;
 if p_action='start' then
  if s.config is distinct from p_data->'config' or s.source is distinct from p_data->'source' or s.total_rows is distinct from (p_data->>'totalRows')::int then raise exception 'Different request with same ID' using errcode='40001'; end if;
  return to_jsonb(s)-'batches';
 elsif p_action='read' then
  select jsonb_build_object('session',to_jsonb(s)-'batches','counts',(select coalesce(jsonb_object_agg(counts.state,counts.n),'{}') from (select state,count(*) n from public.campaign_import_review where session_id=id group by state) counts),
   'rows',coalesce(jsonb_agg(to_jsonb(x)),'[]')) into result from (
    select * from public.campaign_import_review where session_id=id
    and (coalesce(p_data->>'state','')='' or state=p_data->>'state')
    and (coalesce(p_data->>'query','')='' or strpos(lower(code||' '||description),lower(left(p_data->>'query',100)))>0)
    order by row_index limit 100 offset greatest(0,least(10000,coalesce(p_data->>'offset','0')::int))
   ) x; return result;
 elsif p_action='batch' then
  if jsonb_typeof(p_data->'rows') is distinct from 'array' or jsonb_array_length(p_data->'rows') not between 1 and 200 then raise exception 'Batch size' using errcode='22023'; end if;
  batch_key:=p_data->>'offset'; digest:=encode(sha256(convert_to((p_data->'rows')::text,'UTF8')),'hex');
  if s.batches ? batch_key then
   if s.batches->>batch_key <> digest then raise exception 'Changed retry' using errcode='40001'; end if;
   return to_jsonb(s)-'batches';
  end if;
  if s.state<>'processing' or (p_data->>'offset')::int is distinct from s.processed then raise exception 'Out of order' using errcode='40001'; end if;
  n:=jsonb_array_length(p_data->'rows'); if s.processed+n>s.total_rows then raise exception 'Too many rows' using errcode='22023'; end if;
  idx:=s.processed;
  for row_data in select * from jsonb_array_elements(p_data->'rows') loop
   raw:=row_data->'raw';
   if jsonb_typeof(raw) is distinct from 'array' or jsonb_array_length(raw)>80
    or exists(select 1 from jsonb_array_elements(raw) cell where jsonb_typeof(cell)<>'string' or length(cell#>>'{}')>1000)
    or jsonb_typeof(coalesce(row_data->'flags','[]'))<>'array' or pg_column_size(coalesce(row_data->'flags','[]'))>12000 then raise exception 'Invalid cells' using errcode='22023'; end if;
   code:=btrim(coalesce(raw->>((c->'mapping'->>'code')::int),'')); barcode:=btrim(coalesce(raw->>((c->'mapping'->>'barcode')::int),''));
   if length(code)>120 or length(barcode)>120 then raise exception 'Identifier too long' using errcode='22023'; end if;
   promo:=case when c->>'manualPrice'='true' then '' else coalesce(raw->>((c->'mapping'->>'promo')::int),'') end;
   m:=public.ci_match(p_org,code,barcode);
   information:=coalesce(raw->>((c->'mapping'->>'information')::int),'');
   if public.ci_maintenance(information) then m:=m||jsonb_build_object('match_state','blocked'); end if;
   start_d:=public.ci_date(case when c->'mapping'?'start' then raw->>((c->'mapping'->>'start')::int) else c->>'startDate' end,left(c->>'startDate',4));
   end_d:=public.ci_date(case when c->'mapping'?'end' then raw->>((c->'mapping'->>'end')::int) else c->>'endDate' end,left(c->>'endDate',4));
   select not exists(select 1 from jsonb_array_elements_text(raw) cell where btrim(cell)<>'') into is_blank;
   row_review:=jsonb_array_length(coalesce(row_data->'flags','[]'))>0 or (code='' and barcode='');
   insert into public.campaign_import_rows(session_id,organization_id,row_index,source_index,raw,code,barcode,description,source_info,article_id,match_state,before_cents,promo_input,promo_cents,previous_cents,captured_at,start_date,end_date,excluded,review,flags)
   values(id,p_org,idx,idx+(c->>'dataStart')::int,raw,coalesce(m->>'code',code),coalesce(m->>'barcode',barcode),coalesce(m->>'description',raw->>((c->'mapping'->>'description')::int),''),
    information,(m->>'article_id')::uuid,m->>'match_state',(m->>'before_cents')::bigint,promo,public.ci_money(promo,c->>'locale'),public.ci_money(raw->>((c->'mapping'->>'previous')::int),c->>'locale'),
    (m->>'captured_at')::timestamptz,start_d,end_d,is_blank,row_review,coalesce(row_data->'flags','[]'));
   idx:=idx+1;
  end loop;
  update public.campaign_import_sessions set processed=idx,state=case when idx=total_rows then 'ready' else 'processing' end,batches=batches||jsonb_build_object(batch_key,digest),version=version+1,updated_at=now() where campaign_import_sessions.id=id returning * into s;
 elsif p_action in ('edit','exclude_invalid','finalize') then
  if s.state='completed' and p_action='finalize' then return to_jsonb(s)-'batches'; end if;
  if s.state<>'ready' or s.version is distinct from (p_data->>'version')::int then raise exception 'Session changed; reload review' using errcode='40001'; end if;
  if p_action='edit' then
   select * into r from public.campaign_import_rows where session_id=id and row_index=(p_data->>'rowIndex')::int;
   if not found then raise exception 'Row missing' using errcode='22023'; end if;
   old_row:=jsonb_build_object('articleId',r.article_id,'beforeCents',r.before_cents,'promoCents',r.promo_cents,'excluded',r.excluded,'review',r.review);
   if p_data?'code' and btrim(p_data->>'code') is distinct from r.code then
    code:=btrim(p_data->>'code'); if length(code)>120 then raise exception 'Code too long' using errcode='22023'; end if;
    -- A corrected code intentionally gets a NEW snapshot. Editing only promo or
    -- exclusion never re-reads the catalogue, even after catalogue updates.
    m:=public.ci_match(p_org,code,'');
    r.code:=coalesce(m->>'code',code); r.barcode:=coalesce(m->>'barcode',''); r.article_id:=(m->>'article_id')::uuid;
    r.description:=coalesce(m->>'description',''); r.match_state:=case when public.ci_maintenance(r.source_info) then 'blocked' else m->>'match_state' end; r.before_cents:=(m->>'before_cents')::bigint; r.captured_at:=(m->>'captured_at')::timestamptz;
   end if;
   if p_data?'promoInput' then
    if length(p_data->>'promoInput')>1000 then raise exception 'Price too long' using errcode='22023'; end if;
    r.promo_input:=p_data->>'promoInput'; r.promo_cents:=public.ci_money(r.promo_input,c->>'locale');
   end if;
   if p_data?'startDate' then r.start_date:=public.ci_date(p_data->>'startDate',left(c->>'startDate',4)); end if;
   if p_data?'endDate' then r.end_date:=public.ci_date(p_data->>'endDate',left(c->>'endDate',4)); end if;
   if p_data?'excluded' then r.excluded:=(p_data->>'excluded')::boolean; end if;
   if p_data->>'reviewConfirmed'='true' then r.review:=false; end if;
   update public.campaign_import_rows set code=r.code,barcode=r.barcode,article_id=r.article_id,description=r.description,match_state=r.match_state,before_cents=r.before_cents,captured_at=r.captured_at,promo_input=r.promo_input,promo_cents=r.promo_cents,excluded=r.excluded,review=r.review,start_date=r.start_date,end_date=r.end_date where session_id=id and row_index=r.row_index;
  elsif p_action='exclude_invalid' then
   update public.campaign_import_rows set excluded=true where session_id=id and row_index in(select row_index from public.campaign_import_review where session_id=id and state not in ('valid','ignored'));
  else
   if exists(select 1 from public.campaign_import_review where session_id=id and state not in ('valid','ignored')) or not exists(select 1 from public.campaign_import_review where session_id=id and state='valid') then raise exception 'Resolve or exclude invalid rows first' using errcode='22023'; end if;
   s.state:='completed';
  end if;
  update public.campaign_import_sessions set state=s.state,version=version+1,updated_at=now() where campaign_import_sessions.id=id returning * into s;
 else raise exception 'Unknown action' using errcode='22023';
 end if;
 insert into public.audit_logs(organization_id,user_id,action,entity_type,entity_id,before,metadata)
 values(p_org,auth.uid(),'campaign-import.'||p_action,'campaign_import_sessions',id,old_row,jsonb_build_object('version',s.version,'processed',s.processed,'row',p_data->'rowIndex','promoCents',r.promo_cents,'beforeCents',r.before_cents,'articleId',r.article_id,'excluded',r.excluded,'review',r.review));
 return to_jsonb(s)-'batches';
end $$;
revoke all on function public.ci_allowed(uuid,uuid), public.ci_money(text,text), public.ci_date(text,text), public.ci_check_config(jsonb), public.ci_maintenance(text), public.ci_match(uuid,text,text), public.campaign_import_action(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.ci_allowed(uuid,uuid),public.campaign_import_action(uuid,uuid,text,jsonb) to authenticated;
commit;
