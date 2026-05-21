-- SaaS tenant activation: staging-first backfill + org-aware article RPC.
-- Safe by design:
-- - Creates a single default organization for the existing production data.
-- - Backfills organization_id where it is still NULL.
-- - Creates org-aware RPCs used by the Render API without SUPABASE_SERVICE_ROLE_KEY.
-- - Does NOT force NOT NULL constraints; enforcement lives in a separate staging-only strict script.
--
-- Apply order:
-- 1) Apply in STAGING.
-- 2) Run supabase/tests/rls_multitenant_permissions.executable.sql.
-- 3) Only after a backup and successful staging validation, apply in production.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- 1) Existing-app organization bootstrap.
do $$
declare
  v_org_id uuid;
  v_store record;
  v_store_id uuid;
  v_member record;
  v_member_role text;
begin
  insert into public.organizations (name, slug, status, billing_email, settings)
  values (
    coalesce(nullif(current_setting('app.default_organization_name', true), ''), 'Etiquetas Promo'),
    coalesce(nullif(current_setting('app.default_organization_slug', true), ''), 'etiquetas-prom'),
    'active',
    nullif(current_setting('app.default_billing_email', true), ''),
    jsonb_build_object('bootstrap', true, 'created_by_migration', '20260523_saas_tenant_backfill_activation')
  )
  on conflict (slug) do update set
    name = excluded.name,
    status = excluded.status,
    updated_at = now()
  returning id into v_org_id;

  if v_org_id is null then
    select id into v_org_id
    from public.organizations
    where slug = coalesce(nullif(current_setting('app.default_organization_slug', true), ''), 'etiquetas-prom')
    limit 1;
  end if;

  if v_org_id is null then
    raise exception 'Default organization could not be created.';
  end if;

  update public.profiles
  set default_organization_id = coalesce(default_organization_id, v_org_id)
  where default_organization_id is null;

  -- Create stores from existing profile.store values.
  for v_store in
    select distinct nullif(trim(store), '') as store_code
    from public.profiles
    where nullif(trim(store), '') is not null
  loop
    insert into public.stores (organization_id, code, name, status)
    values (
      v_org_id,
      lower(regexp_replace(v_store.store_code, '[^a-zA-Z0-9_-]+', '-', 'g')),
      v_store.store_code,
      'active'
    )
    on conflict (organization_id, code) do update set
      name = excluded.name,
      status = 'active',
      updated_at = now();
  end loop;

  -- Ensure expected default stores exist for current campaign automation.
  insert into public.stores (organization_id, code, name, status)
  values
    (v_org_id, 'praia', 'Loja da Praia', 'active'),
    (v_org_id, 'angra', 'Loja de Angra', 'active'),
    (v_org_id, 'valados', 'Loja de Valados', 'active')
  on conflict (organization_id, code) do nothing;

  -- Convert existing profiles into organization_members.
  for v_member in
    select
      p.id as user_id,
      coalesce(nullif(trim(p.role), ''), 'user') as profile_role,
      nullif(trim(p.store), '') as profile_store
    from public.profiles p
  loop
    v_store_id := null;

    if v_member.profile_store is not null then
      select s.id into v_store_id
      from public.stores s
      where s.organization_id = v_org_id
        and (
          lower(s.code) = lower(regexp_replace(v_member.profile_store, '[^a-zA-Z0-9_-]+', '-', 'g'))
          or lower(s.name) = lower(v_member.profile_store)
        )
      limit 1;
    end if;

    v_member_role := case
      when v_member.profile_role in ('admin', 'super_admin', 'superadmin') then 'owner'
      when v_store_id is not null then 'store_user'
      else 'viewer'
    end;

    insert into public.organization_members (organization_id, user_id, role, store_id, status)
    values (v_org_id, v_member.user_id, v_member_role, v_store_id, 'active')
    on conflict (organization_id, user_id) do update set
      role = excluded.role,
      store_id = coalesce(excluded.store_id, public.organization_members.store_id),
      status = 'active',
      updated_at = now();
  end loop;

  -- Backfill existing business data.
  if to_regclass('public.articles') is not null then
    update public.articles set organization_id = v_org_id where organization_id is null;
  end if;

  if to_regclass('public.campaigns') is not null then
    update public.campaigns set organization_id = v_org_id where organization_id is null;
  end if;

  if to_regclass('public.automatic_campaigns') is not null then
    update public.automatic_campaigns set organization_id = v_org_id where organization_id is null;
  end if;

  if to_regclass('public.templates') is not null then
    update public.templates set organization_id = v_org_id where organization_id is null;
  end if;

  update public.campaign_items set organization_id = v_org_id where organization_id is null;

  insert into public.subscriptions (organization_id, plan_id, status, provider, trial_ends_at)
  values (v_org_id, 'pro', 'manual', 'manual', now() + interval '30 days')
  on conflict (organization_id) do nothing;
end $$;

-- 2) Safe PT numeric parser used by article RPC.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as func_signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('search_articles_for_labels', 'get_article_for_label', 'safe_pt_numeric')
  loop
    execute format('drop function if exists %s cascade', r.func_signature);
  end loop;
end $$;

create or replace function public.safe_pt_numeric(p_value text)
returns numeric
language plpgsql
immutable
as $$
declare
  v text;
begin
  v := trim(coalesce(p_value, ''));

  if v = '' then
    return null;
  end if;

  v := regexp_replace(v, '[^0-9,.\-]', '', 'g');

  if v = '' or v = '-' then
    return null;
  end if;

  if position(',' in v) > 0 then
    v := replace(v, '.', '');
    v := replace(v, ',', '.');
  end if;

  return v::numeric;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    return null;
end;
$$;

-- Resolve tenant for RPC. Platform admin may pass any organization_id. Regular users must be members.
create or replace function public.resolve_article_rpc_organization(p_organization_id uuid default null)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_org := p_organization_id;

  if v_org is null then
    select p.default_organization_id into v_org
    from public.profiles p
    where p.id = auth.uid()
    limit 1;
  end if;

  if v_org is null then
    select om.organization_id into v_org
    from public.organization_members om
    where om.user_id = auth.uid()
      and om.status = 'active'
    order by om.created_at asc
    limit 1;
  end if;

  if v_org is null then
    raise exception 'Organization required';
  end if;

  if not public.is_org_member(v_org) then
    raise exception 'Forbidden organization';
  end if;

  return v_org;
end;
$$;

create or replace function public.search_articles_for_labels(
  p_query text,
  p_limit integer default 30,
  p_offset integer default 0,
  p_organization_id uuid default null
)
returns table (
  artigo text,
  descricao text,
  pvp1 text,
  pvp2 numeric,
  pvp3 text,
  codigo_barras text,
  titulo_oficial text,
  descricao_oficial text,
  marca text,
  modelo text,
  brand text,
  categoria text,
  subcategory text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_query text := trim(coalesce(p_query, ''));
  v_query_safe text;
  v_compact text;
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_org uuid;
begin
  v_org := public.resolve_article_rpc_organization(p_organization_id);

  v_query_safe := regexp_replace(v_query, '[%_]+', ' ', 'g');
  v_query_safe := regexp_replace(v_query_safe, '\s+', ' ', 'g');
  v_query_safe := trim(v_query_safe);
  v_compact := regexp_replace(lower(v_query_safe), '[^a-z0-9]+', '', 'g');

  if length(v_query_safe) < 2 then
    return;
  end if;

  return query
  with matches as (
    select
      a.artigo::text as artigo,
      a.descricao::text as descricao,
      a.pvp1::text as pvp1,
      public.safe_pt_numeric(a.pvp2::text) as pvp2,
      a.pvp3::text as pvp3,
      a.codigo_barras::text as codigo_barras,
      a.titulo_oficial::text as titulo_oficial,
      a.descricao_oficial::text as descricao_oficial,
      a.marca::text as marca,
      a.modelo::text as modelo,
      a.brand::text as brand,
      a.categoria::text as categoria,
      a.subcategory::text as subcategory,
      case
        when a.artigo::text = v_query_safe then 1
        when a.codigo_barras::text = v_query_safe then 2
        when a.artigo::text ilike v_query_safe || '%' then 3
        when a.codigo_barras::text ilike v_query_safe || '%' then 4
        when a.descricao::text ilike v_query_safe || '%' then 5
        else 9
      end as rank_order
    from public.articles a
    where a.organization_id = v_org
      and (
        a.artigo::text ilike '%' || v_query_safe || '%'
        or a.codigo_barras::text ilike '%' || v_query_safe || '%'
        or a.descricao::text ilike '%' || v_query_safe || '%'
        or coalesce(a.marca::text, '') ilike '%' || v_query_safe || '%'
        or coalesce(a.modelo::text, '') ilike '%' || v_query_safe || '%'
        or coalesce(a.brand::text, '') ilike '%' || v_query_safe || '%'
        or coalesce(a.search_terms::text, '') ilike '%' || lower(v_query_safe) || '%'
        or (length(v_compact) >= 2 and coalesce(a.search_terms::text, '') ilike '%' || v_compact || '%')
      )
  )
  select
    m.artigo,
    m.descricao,
    m.pvp1,
    m.pvp2,
    m.pvp3,
    m.codigo_barras,
    m.titulo_oficial,
    m.descricao_oficial,
    m.marca,
    m.modelo,
    m.brand,
    m.categoria,
    m.subcategory,
    count(*) over() as total_count
  from matches m
  order by m.rank_order, m.descricao nulls last, m.artigo
  limit v_limit
  offset v_offset;
end;
$$;

create or replace function public.get_article_for_label(
  p_code text,
  p_organization_id uuid default null
)
returns table (
  artigo text,
  descricao text,
  pvp1 text,
  pvp2 numeric,
  pvp3 text,
  codigo_barras text,
  titulo_oficial text,
  descricao_oficial text,
  marca text,
  modelo text,
  brand text,
  categoria text,
  subcategory text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_code text := trim(coalesce(p_code, ''));
  v_org uuid;
begin
  v_org := public.resolve_article_rpc_organization(p_organization_id);

  if length(v_code) < 3 then
    return;
  end if;

  return query
  select
    a.artigo::text,
    a.descricao::text,
    a.pvp1::text,
    public.safe_pt_numeric(a.pvp2::text) as pvp2,
    a.pvp3::text,
    a.codigo_barras::text,
    a.titulo_oficial::text,
    a.descricao_oficial::text,
    a.marca::text,
    a.modelo::text,
    a.brand::text,
    a.categoria::text,
    a.subcategory::text
  from public.articles a
  where a.organization_id = v_org
    and (a.artigo::text = v_code or a.codigo_barras::text = v_code)
  order by
    case
      when a.artigo::text = v_code then 1
      when a.codigo_barras::text = v_code then 2
      else 9
    end
  limit 1;
end;
$$;

-- 3) Locked-down grants.
revoke all on function public.safe_pt_numeric(text) from public;
revoke all on function public.safe_pt_numeric(text) from anon;
revoke all on function public.resolve_article_rpc_organization(uuid) from public;
revoke all on function public.resolve_article_rpc_organization(uuid) from anon;
revoke all on function public.search_articles_for_labels(text, integer, integer, uuid) from public;
revoke all on function public.search_articles_for_labels(text, integer, integer, uuid) from anon;
revoke all on function public.get_article_for_label(text, uuid) from public;
revoke all on function public.get_article_for_label(text, uuid) from anon;

grant execute on function public.safe_pt_numeric(text) to authenticated;
grant execute on function public.resolve_article_rpc_organization(uuid) to authenticated;
grant execute on function public.search_articles_for_labels(text, integer, integer, uuid) to authenticated;
grant execute on function public.get_article_for_label(text, uuid) to authenticated;

-- Keep table direct access closed for normal users; article reads go through RPC.
alter table public.articles enable row level security;
drop policy if exists articles_admin_all on public.articles;
drop policy if exists articles_authenticated_read on public.articles;
drop policy if exists articles_select_authenticated on public.articles;
drop policy if exists articles_select_admin on public.articles;
drop policy if exists articles_org_admin_all on public.articles;
create policy articles_org_admin_all
on public.articles
for all
to authenticated
using (public.has_org_role(organization_id, array['owner','admin','manager']))
with check (public.has_org_role(organization_id, array['owner','admin','manager']));

create index if not exists articles_org_artigo_idx on public.articles(organization_id, artigo);
create index if not exists articles_org_codigo_barras_idx on public.articles(organization_id, codigo_barras);
create index if not exists automatic_campaigns_org_store_created_idx on public.automatic_campaigns(organization_id, store, created_at desc);

select pg_notify('pgrst', 'reload schema');
