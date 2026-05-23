-- Instant article search index for large catalogs.
-- Apply after the SaaS/organization hotfix or after 20260523_saas_tenant_backfill_activation.sql.
-- Goal: make article search bounded and index-only for users, with no exact counts over ~250k rows.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- Minimal compatibility for production environments that received code before the full SaaS migrations.
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'active',
  billing_email text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.organizations (name, slug, status)
values ('Expert', 'expert', 'active')
on conflict (slug) do update set
  name = excluded.name,
  status = 'active',
  updated_at = now();

alter table if exists public.articles
add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

update public.articles
set organization_id = (select id from public.organizations where slug = 'expert' limit 1)
where organization_id is null;

-- Numeric parser for Portuguese price formats: 3699,99 / 3.699,99 / € 3.699,99.
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

-- Stable normalizer used to persist normalized searchable text into the search index.
create or replace function public.article_search_normalize(p_value text)
returns text
language sql
stable
as $$
  select trim(
    regexp_replace(
      translate(
        lower(coalesce(p_value, '')),
        'áàâãäåéèêëíìîïóòôõöúùûüçñýÿ',
        'aaaaaaeeeeiiiiooooouuuucnyy'
      ),
      '[^a-z0-9]+',
      ' ',
      'g'
    )
  );
$$;

-- Resolve the organization used by article search.
-- In full SaaS mode, memberships are enforced when organization_members exists and has data.
-- In current single-tenant production, the Expert organization is used as fallback.
create or replace function public.resolve_article_rpc_organization(p_organization_id uuid default null)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_has_memberships boolean := false;
  v_is_member boolean := false;
  v_is_platform_admin boolean := false;
begin
  v_org := p_organization_id;

  if v_org is null and auth.uid() is not null and to_regclass('public.profiles') is not null then
    begin
      select p.default_organization_id into v_org
      from public.profiles p
      where p.id = auth.uid()
      limit 1;
    exception
      when undefined_column then
        v_org := null;
    end;
  end if;

  if v_org is null and auth.uid() is not null and to_regclass('public.organization_members') is not null then
    select om.organization_id into v_org
    from public.organization_members om
    where om.user_id = auth.uid()
      and om.status = 'active'
    order by om.created_at asc
    limit 1;
  end if;

  if v_org is null then
    select id into v_org
    from public.organizations
    where slug = 'expert'
    limit 1;
  end if;

  if v_org is null then
    raise exception 'Organization required';
  end if;

  if auth.role() = 'service_role' then
    return v_org;
  end if;

  if to_regclass('public.organization_members') is not null then
    select exists(select 1 from public.organization_members) into v_has_memberships;

    if v_has_memberships then
      if to_regprocedure('public.is_platform_admin()') is not null then
        execute 'select public.is_platform_admin()' into v_is_platform_admin;
      end if;

      select exists(
        select 1
        from public.organization_members om
        where om.organization_id = v_org
          and om.user_id = auth.uid()
          and om.status = 'active'
      ) into v_is_member;

      if not coalesce(v_is_platform_admin, false) and not coalesce(v_is_member, false) then
        raise exception 'Forbidden organization';
      end if;
    end if;
  end if;

  return v_org;
end;
$$;

create table if not exists public.article_search_index (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  artigo text not null,
  codigo_barras text,
  descricao text,
  pvp1 text,
  pvp2 numeric,
  pvp3 text,
  titulo_oficial text,
  descricao_oficial text,
  marca text,
  modelo text,
  brand text,
  categoria text,
  subcategory text,
  artigo_norm text not null default '',
  codigo_barras_norm text not null default '',
  descricao_norm text not null default '',
  marca_norm text not null default '',
  modelo_norm text not null default '',
  brand_norm text not null default '',
  search_text text not null default '',
  search_compact text not null default '',
  search_vector tsvector not null default to_tsvector('simple', ''),
  source_updated_at timestamptz,
  indexed_at timestamptz not null default now(),
  primary key (organization_id, artigo)
);

alter table public.article_search_index enable row level security;
revoke all on public.article_search_index from anon, authenticated;

create index if not exists article_search_index_org_artigo_pattern_idx
on public.article_search_index (organization_id, artigo_norm text_pattern_ops);

create index if not exists article_search_index_org_barcode_pattern_idx
on public.article_search_index (organization_id, codigo_barras_norm text_pattern_ops);

create index if not exists article_search_index_org_descricao_pattern_idx
on public.article_search_index (organization_id, descricao_norm text_pattern_ops);

create index if not exists article_search_index_vector_idx
on public.article_search_index using gin (search_vector);

create index if not exists article_search_index_search_text_trgm_idx
on public.article_search_index using gin (search_text gin_trgm_ops);

create index if not exists article_search_index_compact_trgm_idx
on public.article_search_index using gin (search_compact gin_trgm_ops);

create or replace function public.article_search_index_row(
  p_organization_id uuid,
  p_artigo text,
  p_codigo_barras text,
  p_descricao text,
  p_pvp1 text,
  p_pvp2 text,
  p_pvp3 text,
  p_titulo_oficial text,
  p_descricao_oficial text,
  p_marca text,
  p_modelo text,
  p_brand text,
  p_categoria text,
  p_subcategory text,
  p_search_terms text,
  p_updated_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_artigo_norm text;
  v_codigo_norm text;
  v_descricao_norm text;
  v_marca_norm text;
  v_modelo_norm text;
  v_brand_norm text;
  v_search_text text;
  v_search_compact text;
begin
  if p_organization_id is null or nullif(trim(coalesce(p_artigo, '')), '') is null then
    return;
  end if;

  v_artigo_norm := public.article_search_normalize(p_artigo);
  v_codigo_norm := public.article_search_normalize(p_codigo_barras);
  v_descricao_norm := public.article_search_normalize(coalesce(p_descricao, p_titulo_oficial, ''));
  v_marca_norm := public.article_search_normalize(p_marca);
  v_modelo_norm := public.article_search_normalize(p_modelo);
  v_brand_norm := public.article_search_normalize(p_brand);
  v_search_text := regexp_replace(
    concat_ws(' ',
      v_artigo_norm,
      v_codigo_norm,
      v_descricao_norm,
      public.article_search_normalize(p_titulo_oficial),
      public.article_search_normalize(p_descricao_oficial),
      v_marca_norm,
      v_modelo_norm,
      v_brand_norm,
      public.article_search_normalize(p_categoria),
      public.article_search_normalize(p_subcategory),
      public.article_search_normalize(p_search_terms)
    ),
    '\s+',
    ' ',
    'g'
  );
  v_search_compact := regexp_replace(v_search_text, '[^a-z0-9]+', '', 'g');

  insert into public.article_search_index (
    organization_id,
    artigo,
    codigo_barras,
    descricao,
    pvp1,
    pvp2,
    pvp3,
    titulo_oficial,
    descricao_oficial,
    marca,
    modelo,
    brand,
    categoria,
    subcategory,
    artigo_norm,
    codigo_barras_norm,
    descricao_norm,
    marca_norm,
    modelo_norm,
    brand_norm,
    search_text,
    search_compact,
    search_vector,
    source_updated_at,
    indexed_at
  ) values (
    p_organization_id,
    p_artigo,
    p_codigo_barras,
    p_descricao,
    p_pvp1,
    public.safe_pt_numeric(p_pvp2),
    p_pvp3,
    p_titulo_oficial,
    p_descricao_oficial,
    p_marca,
    p_modelo,
    p_brand,
    p_categoria,
    p_subcategory,
    v_artigo_norm,
    v_codigo_norm,
    v_descricao_norm,
    v_marca_norm,
    v_modelo_norm,
    v_brand_norm,
    v_search_text,
    v_search_compact,
    to_tsvector('simple', v_search_text),
    p_updated_at,
    now()
  )
  on conflict (organization_id, artigo) do update set
    codigo_barras = excluded.codigo_barras,
    descricao = excluded.descricao,
    pvp1 = excluded.pvp1,
    pvp2 = excluded.pvp2,
    pvp3 = excluded.pvp3,
    titulo_oficial = excluded.titulo_oficial,
    descricao_oficial = excluded.descricao_oficial,
    marca = excluded.marca,
    modelo = excluded.modelo,
    brand = excluded.brand,
    categoria = excluded.categoria,
    subcategory = excluded.subcategory,
    artigo_norm = excluded.artigo_norm,
    codigo_barras_norm = excluded.codigo_barras_norm,
    descricao_norm = excluded.descricao_norm,
    marca_norm = excluded.marca_norm,
    modelo_norm = excluded.modelo_norm,
    brand_norm = excluded.brand_norm,
    search_text = excluded.search_text,
    search_compact = excluded.search_compact,
    search_vector = excluded.search_vector,
    source_updated_at = excluded.source_updated_at,
    indexed_at = now();
end;
$$;

create or replace function public.rebuild_article_search_index(p_organization_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_org uuid;
begin
  if to_regclass('public.articles') is null then
    return 0;
  end if;

  v_org := p_organization_id;

  if v_org is null then
    delete from public.article_search_index;
  else
    delete from public.article_search_index where organization_id = v_org;
  end if;

  insert into public.article_search_index (
    organization_id,
    artigo,
    codigo_barras,
    descricao,
    pvp1,
    pvp2,
    pvp3,
    titulo_oficial,
    descricao_oficial,
    marca,
    modelo,
    brand,
    categoria,
    subcategory,
    artigo_norm,
    codigo_barras_norm,
    descricao_norm,
    marca_norm,
    modelo_norm,
    brand_norm,
    search_text,
    search_compact,
    search_vector,
    source_updated_at,
    indexed_at
  )
  select
    a.organization_id,
    a.artigo::text,
    a.codigo_barras::text,
    a.descricao::text,
    a.pvp1::text,
    public.safe_pt_numeric(a.pvp2::text),
    a.pvp3::text,
    a.titulo_oficial::text,
    a.descricao_oficial::text,
    a.marca::text,
    a.modelo::text,
    a.brand::text,
    a.categoria::text,
    a.subcategory::text,
    public.article_search_normalize(a.artigo::text),
    public.article_search_normalize(a.codigo_barras::text),
    public.article_search_normalize(coalesce(a.descricao::text, a.titulo_oficial::text, '')),
    public.article_search_normalize(a.marca::text),
    public.article_search_normalize(a.modelo::text),
    public.article_search_normalize(a.brand::text),
    regexp_replace(concat_ws(' ',
      public.article_search_normalize(a.artigo::text),
      public.article_search_normalize(a.codigo_barras::text),
      public.article_search_normalize(a.descricao::text),
      public.article_search_normalize(a.titulo_oficial::text),
      public.article_search_normalize(a.descricao_oficial::text),
      public.article_search_normalize(a.marca::text),
      public.article_search_normalize(a.modelo::text),
      public.article_search_normalize(a.brand::text),
      public.article_search_normalize(a.categoria::text),
      public.article_search_normalize(a.subcategory::text),
      public.article_search_normalize(a.search_terms::text)
    ), '\s+', ' ', 'g') as search_text,
    regexp_replace(regexp_replace(concat_ws(' ',
      public.article_search_normalize(a.artigo::text),
      public.article_search_normalize(a.codigo_barras::text),
      public.article_search_normalize(a.descricao::text),
      public.article_search_normalize(a.titulo_oficial::text),
      public.article_search_normalize(a.descricao_oficial::text),
      public.article_search_normalize(a.marca::text),
      public.article_search_normalize(a.modelo::text),
      public.article_search_normalize(a.brand::text),
      public.article_search_normalize(a.categoria::text),
      public.article_search_normalize(a.subcategory::text),
      public.article_search_normalize(a.search_terms::text)
    ), '\s+', ' ', 'g'), '[^a-z0-9]+', '', 'g') as search_compact,
    to_tsvector('simple', regexp_replace(concat_ws(' ',
      public.article_search_normalize(a.artigo::text),
      public.article_search_normalize(a.codigo_barras::text),
      public.article_search_normalize(a.descricao::text),
      public.article_search_normalize(a.titulo_oficial::text),
      public.article_search_normalize(a.descricao_oficial::text),
      public.article_search_normalize(a.marca::text),
      public.article_search_normalize(a.modelo::text),
      public.article_search_normalize(a.brand::text),
      public.article_search_normalize(a.categoria::text),
      public.article_search_normalize(a.subcategory::text),
      public.article_search_normalize(a.search_terms::text)
    ), '\s+', ' ', 'g')) as search_vector,
    a.updated_at,
    now()
  from public.articles a
  where a.organization_id is not null
    and (v_org is null or a.organization_id = v_org)
    and nullif(trim(coalesce(a.artigo::text, '')), '') is not null
  on conflict (organization_id, artigo) do update set
    codigo_barras = excluded.codigo_barras,
    descricao = excluded.descricao,
    pvp1 = excluded.pvp1,
    pvp2 = excluded.pvp2,
    pvp3 = excluded.pvp3,
    titulo_oficial = excluded.titulo_oficial,
    descricao_oficial = excluded.descricao_oficial,
    marca = excluded.marca,
    modelo = excluded.modelo,
    brand = excluded.brand,
    categoria = excluded.categoria,
    subcategory = excluded.subcategory,
    artigo_norm = excluded.artigo_norm,
    codigo_barras_norm = excluded.codigo_barras_norm,
    descricao_norm = excluded.descricao_norm,
    marca_norm = excluded.marca_norm,
    modelo_norm = excluded.modelo_norm,
    brand_norm = excluded.brand_norm,
    search_text = excluded.search_text,
    search_compact = excluded.search_compact,
    search_vector = excluded.search_vector,
    source_updated_at = excluded.source_updated_at,
    indexed_at = now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.article_search_index_articles_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  if tg_op = 'DELETE' then
    delete from public.article_search_index
    where organization_id = old.organization_id
      and artigo = old.artigo::text;
    return old;
  end if;

  v_org := new.organization_id;

  if v_org is null then
    select id into v_org from public.organizations where slug = 'expert' limit 1;
  end if;

  perform public.article_search_index_row(
    v_org,
    new.artigo::text,
    new.codigo_barras::text,
    new.descricao::text,
    new.pvp1::text,
    new.pvp2::text,
    new.pvp3::text,
    new.titulo_oficial::text,
    new.descricao_oficial::text,
    new.marca::text,
    new.modelo::text,
    new.brand::text,
    new.categoria::text,
    new.subcategory::text,
    new.search_terms::text,
    new.updated_at
  );

  return new;
end;
$$;

drop trigger if exists articles_article_search_index_sync on public.articles;
create trigger articles_article_search_index_sync
after insert or update of organization_id, artigo, codigo_barras, descricao, pvp1, pvp2, pvp3, titulo_oficial, descricao_oficial, marca, modelo, brand, categoria, subcategory, search_terms, updated_at
on public.articles
for each row
execute function public.article_search_index_articles_trigger();

select public.rebuild_article_search_index(null);

-- Replace the old RPC with an index-first bounded search.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as func_signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('search_articles_for_labels', 'get_article_for_label')
  loop
    execute format('drop function if exists %s cascade', r.func_signature);
  end loop;
end $$;

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
security definer
set search_path = public
as $$
declare
  v_query_raw text := trim(coalesce(p_query, ''));
  v_query text;
  v_compact text;
  v_ts tsquery;
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_window integer := least(v_limit + v_offset + 5, 80);
  v_org uuid;
begin
  perform set_config('statement_timeout', '2500ms', true);

  v_org := public.resolve_article_rpc_organization(p_organization_id);
  v_query := public.article_search_normalize(v_query_raw);
  v_compact := regexp_replace(v_query, '[^a-z0-9]+', '', 'g');

  if length(v_query) < 2 then
    return;
  end if;

  begin
    v_ts := plainto_tsquery('simple', v_query);
  exception
    when others then
      v_ts := null;
  end;

  return query
  with ranked as (
    (
      select si.*, 1 as rank_order, 1.0::real as score
      from public.article_search_index si
      where si.organization_id = v_org
        and (si.artigo_norm = v_query or si.codigo_barras_norm = v_query)
      order by si.artigo_norm
      limit v_window
    )
    union all
    (
      select si.*, 2 as rank_order, 0.98::real as score
      from public.article_search_index si
      where si.organization_id = v_org
        and (si.artigo_norm like v_query || '%' or si.codigo_barras_norm like v_query || '%')
      order by si.artigo_norm
      limit v_window
    )
    union all
    (
      select si.*, 3 as rank_order, 0.92::real as score
      from public.article_search_index si
      where si.organization_id = v_org
        and (
          si.descricao_norm like v_query || '%'
          or si.marca_norm like v_query || '%'
          or si.modelo_norm like v_query || '%'
          or si.brand_norm like v_query || '%'
        )
      order by si.descricao_norm nulls last, si.artigo_norm
      limit v_window
    )
    union all
    (
      select si.*, 4 as rank_order, ts_rank_cd(si.search_vector, v_ts)::real as score
      from public.article_search_index si
      where si.organization_id = v_org
        and v_ts is not null
        and si.search_vector @@ v_ts
      order by ts_rank_cd(si.search_vector, v_ts) desc, si.descricao_norm nulls last
      limit v_window
    )
    union all
    (
      select si.*, 5 as rank_order, greatest(similarity(si.search_text, v_query), similarity(si.search_compact, v_compact))::real as score
      from public.article_search_index si
      where si.organization_id = v_org
        and (
          si.search_text ilike '%' || v_query || '%'
          or (length(v_compact) >= 3 and si.search_compact ilike '%' || v_compact || '%')
        )
      order by greatest(similarity(si.search_text, v_query), similarity(si.search_compact, v_compact)) desc, si.descricao_norm nulls last
      limit v_window
    )
  ), deduped as (
    select distinct on (r.artigo)
      r.*
    from ranked r
    order by r.artigo, r.rank_order, r.score desc
  ), bounded as (
    select *
    from deduped
    order by rank_order, score desc, descricao_norm nulls last, artigo_norm
    limit v_window
  )
  select
    b.artigo,
    b.descricao,
    b.pvp1,
    b.pvp2,
    b.pvp3,
    b.codigo_barras,
    b.titulo_oficial,
    b.descricao_oficial,
    b.marca,
    b.modelo,
    b.brand,
    b.categoria,
    b.subcategory,
    count(*) over()::bigint as total_count
  from bounded b
  order by b.rank_order, b.score desc, b.descricao_norm nulls last, b.artigo_norm
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
security definer
set search_path = public
as $$
declare
  v_code text := public.article_search_normalize(p_code);
  v_org uuid;
begin
  perform set_config('statement_timeout', '800ms', true);

  v_org := public.resolve_article_rpc_organization(p_organization_id);

  if length(v_code) < 3 then
    return;
  end if;

  return query
  select
    si.artigo,
    si.descricao,
    si.pvp1,
    si.pvp2,
    si.pvp3,
    si.codigo_barras,
    si.titulo_oficial,
    si.descricao_oficial,
    si.marca,
    si.modelo,
    si.brand,
    si.categoria,
    si.subcategory
  from public.article_search_index si
  where si.organization_id = v_org
    and (si.artigo_norm = v_code or si.codigo_barras_norm = v_code)
  order by
    case
      when si.artigo_norm = v_code then 1
      when si.codigo_barras_norm = v_code then 2
      else 9
    end,
    si.artigo_norm
  limit 1;
end;
$$;

revoke all on function public.article_search_normalize(text) from public;
revoke all on function public.article_search_index_row(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, timestamptz) from public;
revoke all on function public.rebuild_article_search_index(uuid) from public;
revoke all on function public.search_articles_for_labels(text, integer, integer, uuid) from public;
revoke all on function public.get_article_for_label(text, uuid) from public;

revoke all on function public.article_search_normalize(text) from anon;
revoke all on function public.article_search_index_row(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, timestamptz) from anon;
revoke all on function public.rebuild_article_search_index(uuid) from anon;
revoke all on function public.search_articles_for_labels(text, integer, integer, uuid) from anon;
revoke all on function public.get_article_for_label(text, uuid) from anon;

grant execute on function public.search_articles_for_labels(text, integer, integer, uuid) to authenticated;
grant execute on function public.get_article_for_label(text, uuid) to authenticated;
grant execute on function public.rebuild_article_search_index(uuid) to service_role;

-- Read access stays through SECURITY DEFINER RPC. Direct table access is not granted to users.
select pg_notify('pgrst', 'reload schema');
