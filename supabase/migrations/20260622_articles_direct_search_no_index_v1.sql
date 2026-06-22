-- Resolve pesquisa de artigos sem tabela pesada article_search_index.
-- Objetivo:
-- - NÃO recriar public.article_search_index.
-- - Pesquisar diretamente em public.articles.
-- - Corrigir artigos novos sem organization_id.
-- - Manter a RPC usada pelo backend: public.search_articles_for_labels(...).

set statement_timeout = '0';

create extension if not exists pg_trgm;

create or replace function public.safe_pt_numeric(p_value text)
returns numeric
language plpgsql
immutable
as $$
declare
  v text;
begin
  v := trim(coalesce(value, ''));

  if v = '' then
    return null;
  end if;

  v := replace(replace(v, ' ', ''), ',', '.');

  begin
    return v::numeric;
  exception
    when others then
      return null;
  end;
end;
$$;

create or replace function public.article_search_normalize(value text)
returns text
language sql
immutable
as $$
  select trim(
    regexp_replace(
      translate(
        lower(coalesce(value, '')),
        'áàâãäåéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
        'aaaaaaeeeeiiiiooooouuuucnaaaaaaeeeeiiiiooooouuuucn'
      ),
      '\s+',
      ' ',
      'g'
    )
  );
$$;

do $$
declare
  v_org uuid;
  v_updated integer := 0;
begin
  if to_regclass('public.organizations') is null then
    raise exception 'Tabela public.organizations não encontrada.';
  end if;

  select id
  into v_org
  from public.organizations
  where slug = 'expert'
  order by created_at asc nulls last
  limit 1;

  if v_org is null then
    select id
    into v_org
    from public.organizations
    order by created_at asc nulls last
    limit 1;
  end if;

  if v_org is null then
    raise exception 'Nenhuma organização encontrada.';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'articles'
      and column_name = 'organization_id'
  ) then
    update public.articles
    set organization_id = v_org
    where organization_id is null;

    get diagnostics v_updated = row_count;
    raise notice 'Artigos sem organização corrigidos: %', v_updated;
  end if;
end $$;

create index if not exists articles_organization_artigo_idx
on public.articles (organization_id, artigo);

create index if not exists articles_organization_codigo_barras_idx
on public.articles (organization_id, codigo_barras);

create index if not exists articles_artigo_trgm_idx
on public.articles using gin ((artigo::text) gin_trgm_ops);

create index if not exists articles_codigo_barras_trgm_idx
on public.articles using gin ((codigo_barras::text) gin_trgm_ops);

create index if not exists articles_descricao_trgm_idx
on public.articles using gin ((descricao::text) gin_trgm_ops);

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
  v_query text := public.article_search_normalize(p_query);
  v_compact text := regexp_replace(public.article_search_normalize(p_query), '[^a-z0-9]+', '', 'g');
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_window integer := least(greatest(coalesce(p_limit, 30), 1) + greatest(coalesce(p_offset, 0), 0) + 25, 120);
  v_org uuid := p_organization_id;
begin
  perform set_config('statement_timeout', '2500ms', true);

  if length(v_query) < 2 then
    return;
  end if;

  if v_org is null then
    select id
    into v_org
    from public.organizations
    where slug = 'expert'
    order by created_at asc nulls last
    limit 1;
  end if;

  if v_org is null then
    select id
    into v_org
    from public.organizations
    order by created_at asc nulls last
    limit 1;
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
      where (v_org is null or a.organization_id = v_org)
        and (
          public.article_search_normalize(a.artigo::text) = v_query
          or public.article_search_normalize(a.codigo_barras::text) = v_query
          or regexp_replace(public.article_search_normalize(a.artigo::text), '[^a-z0-9]+', '', 'g') = v_compact
          or regexp_replace(public.article_search_normalize(a.codigo_barras::text), '[^a-z0-9]+', '', 'g') = v_compact
        )
      order by a.artigo
      limit v_window
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
      where (v_org is null or a.organization_id = v_org)
        and (
          public.article_search_normalize(a.artigo::text) like v_query || '%'
          or public.article_search_normalize(a.codigo_barras::text) like v_query || '%'
          or regexp_replace(public.article_search_normalize(a.artigo::text), '[^a-z0-9]+', '', 'g') like v_compact || '%'
          or regexp_replace(public.article_search_normalize(a.codigo_barras::text), '[^a-z0-9]+', '', 'g') like v_compact || '%'
        )
      order by a.artigo
      limit v_window
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
      where (v_org is null or a.organization_id = v_org)
        and (
          public.article_search_normalize(coalesce(a.descricao::text, '')) like v_query || '%'
          or public.article_search_normalize(coalesce(a.marca::text, '')) like v_query || '%'
          or public.article_search_normalize(coalesce(a.modelo::text, '')) like v_query || '%'
          or public.article_search_normalize(coalesce(a.brand::text, '')) like v_query || '%'
        )
      order by a.descricao nulls last, a.artigo
      limit v_window
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
      where length(v_query) >= 3
        and (v_org is null or a.organization_id = v_org)
        and (
          public.article_search_normalize(coalesce(a.descricao::text, '')) ilike '%' || v_query || '%'
          or public.article_search_normalize(coalesce(a.titulo_oficial::text, '')) ilike '%' || v_query || '%'
          or public.article_search_normalize(coalesce(a.descricao_oficial::text, '')) ilike '%' || v_query || '%'
          or public.article_search_normalize(coalesce(a.marca::text, '')) ilike '%' || v_query || '%'
          or public.article_search_normalize(coalesce(a.modelo::text, '')) ilike '%' || v_query || '%'
          or public.article_search_normalize(coalesce(a.brand::text, '')) ilike '%' || v_query || '%'
          or public.article_search_normalize(coalesce(a.search_terms::text, '')) ilike '%' || v_query || '%'
          or (
            length(v_compact) >= 3
            and regexp_replace(public.article_search_normalize(concat_ws(' ', a.artigo, a.codigo_barras, a.descricao, a.search_terms)), '[^a-z0-9]+', '', 'g') ilike '%' || v_compact || '%'
          )
        )
      order by a.descricao nulls last, a.artigo
      limit v_window
    )
  ), deduped as (
    select distinct on (r.artigo)
      r.*
    from ranked r
    order by r.artigo, r.rank_order
  ), bounded as (
    select *
    from deduped
    order by rank_order, descricao nulls last, artigo
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
  order by b.rank_order, b.descricao nulls last, b.artigo
  limit v_limit
  offset v_offset;
end;
$$;

grant execute on function public.search_articles_for_labels(text, integer, integer, uuid) to authenticated;
grant execute on function public.search_articles_for_labels(text, integer, integer, uuid) to service_role;

-- Validação rápida:
select *
from public.search_articles_for_labels('01.673.002.00350', 10, 0, null);
