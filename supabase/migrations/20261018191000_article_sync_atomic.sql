-- Apply after the platform permission and article_sync_logs migrations.
-- No existing rows, identifiers or prices are changed by installing this RPC.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$ begin
 if to_regclass('public.article_sync_logs') is null or
    to_regprocedure('public.platform_permission(uuid,text,uuid)') is null then
  raise exception 'Instalar primeiro article_sync_logs e as permissões da plataforma.';
 end if;
end $$;

create or replace function public.platform_article_sync_batch(
 p_org uuid,p_sync uuid,p_batch integer,p_rows jsonb,p_received integer,p_store uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 job public.article_sync_logs%rowtype;
 current_row public.articles%rowtype;
 next_row public.articles%rowtype;
 item jsonb; changes jsonb; totals jsonb;
 updated_count integer:=0; inserted_count integer:=0; unchanged_count integer:=0;
 c1 integer:=0; c2 integer:=0; c3 integer:=0; ce integer:=0;
 size integer; code text;
begin
 if auth.uid() is null or not public.platform_permission(p_org,'products.manage',p_store) then
  raise exception 'Permission required' using errcode='42501';
 end if;
 if p_batch is null or p_batch<0 or jsonb_typeof(p_rows) is distinct from 'array' then
  raise exception 'Invalid batch' using errcode='22023';
 end if;
 size:=jsonb_array_length(p_rows);
 if size<1 or size>300 or p_received is null or p_received<size or p_received>300 or length(p_rows::text)>1048576 then
  raise exception 'Invalid batch size' using errcode='22023';
 end if;
 if exists(select 1 from jsonb_array_elements(p_rows) r where jsonb_typeof(r)<>'object'
    or coalesce(btrim(r->>'artigo'),'')='' or length(r->>'artigo')>160
    or jsonb_typeof(r->'pvp2') is distinct from 'number')
    or (select count(distinct r->>'artigo') from jsonb_array_elements(p_rows) r)<>size then
  raise exception 'Invalid or duplicate article' using errcode='22023';
 end if;
 -- Serialize imports for this organization and lock the progress row. Retries
 -- see committed progress; a failure rolls back both articles and counters.
 perform pg_advisory_xact_lock(hashtextextended('article-sync:'||p_org::text,0));
 select * into job from public.article_sync_logs where id=p_sync and organization_id=p_org and user_id=auth.uid() for update;
 if not found then raise exception 'Sync not found' using errcode='42501'; end if;
 if job.status<>'processing' then raise exception 'Sync already finished' using errcode='22023'; end if;
 totals:=to_jsonb(job)-array['user_email','file_name','columns','error_message'];
 if p_batch<=job.last_batch_index then
  return jsonb_build_object('duplicate',true,'processed',0,'duplicateRowsInBatch',0,'updated',0,'inserted',0,'unchanged',0,
   'changedFields',jsonb_build_object('pvp1',0,'pvp2',0,'pvp3',0,'estado',0),'totals',totals);
 end if;
 if p_batch<>job.last_batch_index+1 then raise exception 'Batch out of order' using errcode='40001'; end if;
 for item in select value from jsonb_array_elements(p_rows) loop
  code:=item->>'artigo';
  select * into current_row from public.articles where organization_id=p_org and artigo=code for update;
  if found then
   -- Explicit allowlist: imported data cannot change ownership or rich fields.
   changes:=jsonb_build_object('pvp2',item->'pvp2');
   if item?'pvp1' then changes:=changes||jsonb_build_object('pvp1',coalesce(btrim(item->>'pvp1'),'')); end if;
   if item?'pvp3' then changes:=changes||jsonb_build_object('pvp3',coalesce(btrim(item->>'pvp3'),'')); end if;
   if item?'estado' then changes:=changes||jsonb_build_object('estado',coalesce(btrim(item->>'estado'),'')); end if;
   next_row:=jsonb_populate_record(current_row,changes);
   if (next_row.pvp1,next_row.pvp2,next_row.pvp3,next_row.estado) is not distinct from
      (current_row.pvp1,current_row.pvp2,current_row.pvp3,current_row.estado) then
    unchanged_count:=unchanged_count+1;
   else
    c1:=c1+(next_row.pvp1 is distinct from current_row.pvp1)::integer;
    c2:=c2+(next_row.pvp2 is distinct from current_row.pvp2)::integer;
    c3:=c3+(next_row.pvp3 is distinct from current_row.pvp3)::integer;
    ce:=ce+(next_row.estado is distinct from current_row.estado)::integer;
    update public.articles set pvp1=next_row.pvp1,pvp2=next_row.pvp2,pvp3=next_row.pvp3,estado=next_row.estado
      where organization_id=p_org and artigo=code;
    updated_count:=updated_count+1;
   end if;
  else
   -- A globally unique legacy code owned by another tenant must fail the whole
   -- batch. Never upsert/reassign it to the requesting organization.
   insert into public.articles(artigo,organization_id,descricao,pvp1,pvp2,pvp3,estado,codigo_barras,search_terms)
   values(code,p_org,coalesce(item->>'descricao',''),coalesce(item->>'pvp1',''),(item->>'pvp2')::numeric,
    coalesce(item->>'pvp3',''),coalesce(item->>'estado',''),coalesce(item->>'codigoBarras',''),
    lower(concat_ws(' ',code,nullif(item->>'descricao',''),nullif(item->>'codigoBarras',''))));
   inserted_count:=inserted_count+1;
  end if;
 end loop;
 update public.article_sync_logs set
  processed_rows=processed_rows+p_received,updated_rows=updated_rows+updated_count,
  inserted_rows=inserted_rows+inserted_count,unchanged_rows=unchanged_rows+unchanged_count,
  pvp1_changes=pvp1_changes+c1,pvp2_changes=pvp2_changes+c2,pvp3_changes=pvp3_changes+c3,estado_changes=estado_changes+ce,
  last_batch_index=p_batch,last_batch_at=now()
 where id=p_sync returning * into job;
 totals:=jsonb_build_object('processed_rows',job.processed_rows,'updated_rows',job.updated_rows,'inserted_rows',job.inserted_rows,
  'unchanged_rows',job.unchanged_rows,'pvp1_changes',job.pvp1_changes,'pvp2_changes',job.pvp2_changes,'pvp3_changes',job.pvp3_changes,
  'estado_changes',job.estado_changes,'last_batch_index',job.last_batch_index);
 return jsonb_build_object('duplicate',false,'processed',p_received,'duplicateRowsInBatch',p_received-size,'uniqueRowsInBatch',size,
  'updated',updated_count,'inserted',inserted_count,'unchanged',unchanged_count,
  'changedFields',jsonb_build_object('pvp1',c1,'pvp2',c2,'pvp3',c3,'estado',ce),'totals',totals);
end $$;
revoke all on function public.platform_article_sync_batch(uuid,uuid,integer,jsonb,integer,uuid) from public,anon;
grant execute on function public.platform_article_sync_batch(uuid,uuid,integer,jsonb,integer,uuid) to authenticated;
select pg_notify('pgrst','reload schema');
commit;
