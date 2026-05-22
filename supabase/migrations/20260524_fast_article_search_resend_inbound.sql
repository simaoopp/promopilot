-- Fast article search + Resend inbound preparation.
-- Apply after 20260523_saas_tenant_backfill_activation.sql.
-- Goal: keep normal users on controlled RPC, make search bounded/fast, and avoid exact total counts over large catalogs.

create extension if not exists pg_trgm;

create index if not exists articles_org_artigo_pattern_idx
on public.articles (organization_id, artigo text_pattern_ops);

create index if not exists articles_org_codigo_barras_pattern_idx
on public.articles (organization_id, codigo_barras text_pattern_ops);

create index if not exists articles_org_descricao_trgm_idx
on public.articles using gin (descricao gin_trgm_ops);

create index if not exists articles_org_search_terms_trgm_idx
on public.articles using gin (search_terms gin_trgm_ops);

-- Drop only the article RPCs that need a faster implementation.
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
  v_query text := trim(coalesce(p_query, ''));
  v_query_safe text;
  v_compact text;
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_org uuid;
begin
  -- Bound runaway searches. UX expects "search, found", not exact analytics.
  perform set_config('statement_timeout', '3500ms', true);

  v_org := public.resolve_article_rpc_organization(p_organization_id);

  v_query_safe := regexp_replace(v_query, '[%_]+', ' ', 'g');
  v_query_safe := regexp_replace(v_query_safe, '\s+', ' ', 'g');
  v_query_safe := trim(v_query_safe);
  v_compact := regexp_replace(lower(v_query_safe), '[^a-z0-9]+', '', 'g');

  if length(v_query_safe) < 2 then
    return;
  end if;

  return query
  with ranked as (
    (
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
        a.subcategory::text,
        1 as rank_order
      from public.articles a
      where a.organization_id = v_org
        and (a.artigo::text = v_query_safe or a.codigo_barras::text = v_query_safe)
      order by a.artigo
      limit v_limit
    )
    union all
    (
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
        a.subcategory::text,
        2 as rank_order
      from public.articles a
      where a.organization_id = v_org
        and (a.artigo::text ilike v_query_safe || '%' or a.codigo_barras::text ilike v_query_safe || '%')
      order by a.artigo
      limit v_limit
    )
    union all
    (
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
        a.subcategory::text,
        3 as rank_order
      from public.articles a
      where a.organization_id = v_org
        and a.descricao::text ilike v_query_safe || '%'
      order by a.descricao nulls last, a.artigo
      limit v_limit
    )
    union all
    (
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
        a.subcategory::text,
        5 as rank_order
      from public.articles a
      where a.organization_id = v_org
        and (
          a.descricao::text ilike '%' || v_query_safe || '%'
          or coalesce(a.marca::text, '') ilike '%' || v_query_safe || '%'
          or coalesce(a.modelo::text, '') ilike '%' || v_query_safe || '%'
          or coalesce(a.brand::text, '') ilike '%' || v_query_safe || '%'
          or coalesce(a.search_terms::text, '') ilike '%' || lower(v_query_safe) || '%'
          or (length(v_compact) >= 2 and coalesce(a.search_terms::text, '') ilike '%' || v_compact || '%')
        )
      order by a.descricao nulls last, a.artigo
      limit (v_limit * 2)
    )
  ), deduped as (
    select distinct on (r.artigo)
      r.*
    from ranked r
    order by r.artigo, r.rank_order
  ), bounded as (
    select * from deduped
    order by rank_order, descricao nulls last, artigo
    limit (v_limit + v_offset)
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
  order by b.rank_order, b.descricao nulls last, b.artigo
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
  v_code text := trim(coalesce(p_code, ''));
  v_org uuid;
begin
  perform set_config('statement_timeout', '1500ms', true);
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

revoke all on function public.search_articles_for_labels(text, integer, integer, uuid) from public;
revoke all on function public.search_articles_for_labels(text, integer, integer, uuid) from anon;
revoke all on function public.get_article_for_label(text, uuid) from public;
revoke all on function public.get_article_for_label(text, uuid) from anon;

grant execute on function public.search_articles_for_labels(text, integer, integer, uuid) to authenticated;
grant execute on function public.get_article_for_label(text, uuid) to authenticated;

select pg_notify('pgrst', 'reload schema');
