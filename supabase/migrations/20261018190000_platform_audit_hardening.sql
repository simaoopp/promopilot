-- Incremental hardening after 20261015_platform_permissions.sql.
-- No tenant, membership, entitlement, price or campaign data is reassigned.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$ begin
 if to_regprocedure('public.platform_permission(uuid,text,uuid)') is null
  or to_regprocedure('public.resolve_article_rpc_organization(uuid)') is null then
  raise exception 'Aplicar primeiro a migração de permissões da plataforma.';
 end if;
end $$;

-- Keep the legacy return type and implementation, but make the ONLY public
-- entry point resolve an authorised tenant. Historical versions used a caller
-- supplied UUID or the first organization and bypassed RLS as SECURITY DEFINER.
create schema if not exists promopilot_private;
revoke all on schema promopilot_private from public, anon, authenticated;
do $install$
declare signature regprocedure; result_type text; args text[];
begin
 signature:=to_regprocedure('promopilot_private.search_articles_for_labels(text,integer,integer,uuid)');
 if signature is null then
  signature:=to_regprocedure('public.search_articles_for_labels(text,integer,integer,uuid)');
  if signature is null then return; end if;
  select proargnames[1:4] into args from pg_proc where oid=signature;
  if args is distinct from array['p_query','p_limit','p_offset','p_organization_id'] then
   raise exception 'Assinatura de pesquisa legada inesperada; rever antes de migrar.';
  end if;
  alter function public.search_articles_for_labels(text,integer,integer,uuid) set schema promopilot_private;
 end if;
 signature:=to_regprocedure('promopilot_private.search_articles_for_labels(text,integer,integer,uuid)');
 select pg_get_function_result(signature) into result_type;
 revoke all on function promopilot_private.search_articles_for_labels(text,integer,integer,uuid) from public,anon,authenticated;
 execute format($definition$
  create or replace function public.search_articles_for_labels(
   p_query text,p_limit integer default 30,p_offset integer default 0,p_organization_id uuid default null
  ) returns %s language plpgsql security definer set search_path='' as $body$
  declare org uuid;
  begin
   if auth.uid() is null and coalesce(auth.role(),'')<>'service_role' then
    raise exception 'Authentication required' using errcode='42501';
   end if;
   org:=public.resolve_article_rpc_organization(p_organization_id);
   if org is null then raise exception 'Organization required' using errcode='42501'; end if;
   if length(coalesce(p_query,''))>160 or coalesce(p_offset,0)>2000 then
    raise exception 'Refine the search' using errcode='22023';
   end if;
   return query select * from promopilot_private.search_articles_for_labels(
    p_query,least(greatest(coalesce(p_limit,30),1),50),greatest(coalesce(p_offset,0),0),org);
  end $body$;
 $definition$,result_type);
 revoke all on function public.search_articles_for_labels(text,integer,integer,uuid) from public,anon;
 grant execute on function public.search_articles_for_labels(text,integer,integer,uuid) to authenticated,service_role;
end $install$;

-- The June definition referenced an undefined variable named "value".
-- Preserve the existing argument name for installations with earlier versions.
do $numeric$
declare argument_name text;
begin
 if to_regprocedure('public.safe_pt_numeric(text)') is null then return; end if;
 select coalesce(proargnames[1],'p_value') into argument_name from pg_proc
  where oid='public.safe_pt_numeric(text)'::regprocedure;
 execute format($definition$
  create or replace function public.safe_pt_numeric(%I text) returns numeric
  language plpgsql immutable set search_path='' as $body$
  declare v text:=btrim(replace(replace($1,chr(160),''),' ',''));
  begin
   if v is null or v='' then return null; end if;
   if position(',' in v)>0 then v:=replace(replace(v,'.',''),',','.'); end if;
   return v::numeric;
  exception when invalid_text_representation or numeric_value_out_of_range then return null;
  end $body$;
 $definition$,argument_name);
end $numeric$;

-- Invitation authorisation is checked for the target store, not only the
-- currently selected store. Store-bound administrators cannot create an
-- organization-wide administrator through the legacy invitation API.
create or replace function public.platform_can_invite_member(p_org uuid,p_store uuid,p_role text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare actor public.organization_members%rowtype;
begin
 if p_store is null or p_role not in ('store_user','manager','admin') or p_role is null then return false; end if;
 if not public.platform_permission(p_org,'stores.manage',p_store) then return false; end if;
 select * into actor from public.organization_members
  where user_id=auth.uid() and organization_id=p_org and status='active';
 if not found then return false; end if;
 if p_role<>'store_user' and (actor.role not in ('owner','admin') or actor.store_id is not null) then return false; end if;
 return true;
end $$;
revoke all on function public.platform_can_invite_member(uuid,uuid,text) from public,anon;
grant execute on function public.platform_can_invite_member(uuid,uuid,text) to authenticated,service_role;

create or replace function public.platform_member_email(p_org uuid,p_email text) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare target public.organization_members%rowtype; actor public.organization_members%rowtype;
begin
 select m.* into target from public.organization_members m join auth.users u on u.id=m.user_id
  where m.organization_id=p_org and m.status='active' and lower(u.email)=lower(btrim(p_email));
 if not found then return null; end if;
 if not public.platform_permission(p_org,'stores.manage',target.store_id) then return null; end if;
 select * into actor from public.organization_members where organization_id=p_org and user_id=auth.uid() and status='active';
 if not found then return null; end if;
 if target.role in ('owner','admin','manager') or target.store_id is null then
  if actor.role not in ('owner','admin') or actor.store_id is not null then return null; end if;
 end if;
 return target.user_id;
end $$;
revoke all on function public.platform_member_email(uuid,text) from public,anon;
grant execute on function public.platform_member_email(uuid,text) to authenticated,service_role;

-- A restrictive policy is only effective when RLS is enabled. Do not create
-- business tables or replace existing permissive policies/entitlements.
do $$ declare t text; privilege text; client_role text; begin
 foreach t in array array['articles','campaigns','automatic_campaigns','campaign_items','templates'] loop
  if to_regclass('public.'||t) is not null then
   if not exists(select 1 from pg_policies where schemaname='public' and tablename=t and policyname='phase_zero_select') then
    raise exception 'Políticas de permissões em falta em %; rever a migração anterior.',t;
   end if;
   execute format('alter table public.%I enable row level security',t);
   -- Older installations may inherit table privileges from PUBLIC. Preserve
   -- the already-effective CRUD rights of authenticated/service clients before
   -- revoking PUBLIC, otherwise an anonymous role can still inherit them.
   foreach client_role in array array['authenticated','service_role'] loop
    foreach privilege in array array['SELECT','INSERT','UPDATE','DELETE'] loop
     if has_table_privilege(client_role,format('public.%I',t),privilege) then
      execute format('grant %s on public.%I to %I',privilege,t,client_role);
     end if;
    end loop;
   end loop;
   execute format('revoke all on public.%I from public,anon',t);
   execute format('revoke truncate,references,trigger on public.%I from public,authenticated',t);
  end if;
 end loop;
end $$;
select pg_notify('pgrst','reload schema');
commit;
