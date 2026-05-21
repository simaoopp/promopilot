-- Pesquisa controlada de artigos sem SUPABASE_SERVICE_ROLE_KEY no Render.
-- Objetivo:
-- 1) Manter RLS ativa na tabela articles.
-- 2) Impedir carregamento direto dos ~250k artigos por users normais.
-- 3) Permitir pesquisa limitada via RPC autenticada.
-- 4) Manter admins com acesso administrativo quando necessário.

alter table public.profiles
add column if not exists role text not null default 'user';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_role_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
    add constraint profiles_role_check
    check (role in ('admin', 'manager', 'user'));
  end if;
end $$;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p.role, 'user')
  from public.profiles p
  where p.id = auth.uid()
  limit 1;
$$;

create or replace function public.current_user_store()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(trim(coalesce(p.store, '')), '')
  from public.profiles p
  where p.id = auth.uid()
  limit 1;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'admin', false);
$$;

grant execute on function public.current_user_role() to authenticated;
grant execute on function public.current_user_store() to authenticated;
grant execute on function public.is_admin() to authenticated;

alter table public.articles enable row level security;

-- Authenticated precisa de grant para consultar via PostgREST, mas as policies é que controlam as linhas.
-- Users normais não têm policy direta de SELECT; pesquisam apenas através das RPCs abaixo.
grant select on public.articles to authenticated;

-- Recria policies diretas da tabela articles de forma conservadora.
drop policy if exists "articles_admin_all" on public.articles;
drop policy if exists "articles_authenticated_read" on public.articles;
drop policy if exists "articles_select_authenticated" on public.articles;
drop policy if exists "articles_select_admin" on public.articles;

create policy "articles_admin_all"
on public.articles
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Índices para pesquisa. Se algum já existir, não duplica.
create extension if not exists pg_trgm;

create index if not exists articles_artigo_idx
on public.articles (artigo);

create index if not exists articles_codigo_barras_idx
on public.articles (codigo_barras);

create index if not exists articles_search_terms_trgm_idx
on public.articles using gin (search_terms gin_trgm_ops);

create index if not exists articles_descricao_trgm_idx
on public.articles using gin (descricao gin_trgm_ops);

-- Pesquisa limitada e segura para etiquetas.
-- SECURITY DEFINER permite pesquisar articles sem abrir SELECT direto para users normais.
-- A função só devolve campos necessários para etiquetas/listagens e aplica limite rígido.
create or replace function public.search_articles_for_labels(
  p_query text,
  p_limit integer default 30,
  p_offset integer default 0
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
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

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
      a.pvp2::numeric as pvp2,
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
        when a.artigo::text = v_query then 1
        when a.codigo_barras::text = v_query then 2
        when a.artigo::text ilike v_query_safe || '%' then 3
        when a.codigo_barras::text ilike v_query_safe || '%' then 4
        when a.descricao::text ilike v_query_safe || '%' then 5
        else 9
      end as rank_order
    from public.articles a
    where
      a.artigo::text ilike '%' || v_query_safe || '%'
      or a.codigo_barras::text ilike '%' || v_query_safe || '%'
      or a.descricao::text ilike '%' || v_query_safe || '%'
      or coalesce(a.marca::text, '') ilike '%' || v_query_safe || '%'
      or coalesce(a.modelo::text, '') ilike '%' || v_query_safe || '%'
      or coalesce(a.brand::text, '') ilike '%' || v_query_safe || '%'
      or coalesce(a.search_terms::text, '') ilike '%' || lower(v_query_safe) || '%'
      or (length(v_compact) >= 2 and coalesce(a.search_terms::text, '') ilike '%' || v_compact || '%')
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
  p_code text
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
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if length(v_code) < 3 then
    return;
  end if;

  return query
  select
    a.artigo::text,
    a.descricao::text,
    a.pvp1::text,
    a.pvp2::numeric,
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
  where a.artigo::text = v_code
     or a.codigo_barras::text = v_code
  order by
    case
      when a.artigo::text = v_code then 1
      when a.codigo_barras::text = v_code then 2
      else 9
    end
  limit 1;
end;
$$;

revoke all on function public.search_articles_for_labels(text, integer, integer) from public;
revoke all on function public.search_articles_for_labels(text, integer, integer) from anon;
grant execute on function public.search_articles_for_labels(text, integer, integer) to authenticated;

revoke all on function public.get_article_for_label(text) from public;
revoke all on function public.get_article_for_label(text) from anon;
grant execute on function public.get_article_for_label(text) to authenticated;
