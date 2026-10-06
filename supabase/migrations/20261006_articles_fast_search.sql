-- Apply before deploying the API. Index creation briefly blocks article writes.
-- Run during a quiet period. Does not change article data or existing RPCs.
begin;
set local statement_timeout = '0';
set local lock_timeout = '5s';
create extension if not exists pg_trgm;

do $$ begin
  if to_regprocedure('public.resolve_article_rpc_organization(uuid)') is null then
    raise exception 'Missing resolve_article_rpc_organization(uuid); tenant authorization must be installed first.';
  end if;
end $$;

create or replace function public.article_fast_normalize(v text)
returns text language sql immutable parallel safe set search_path = '' as $$
 select trim(regexp_replace(translate(lower(coalesce(v,'')),
 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'), '[^a-z0-9]+', ' ', 'g'));
$$;
create or replace function public.article_fast_code(v text)
returns text language sql immutable parallel safe set search_path = '' as $$
 select replace(public.article_fast_normalize(v), ' ', '');
$$;
create or replace function public.article_fast_document(
 code text, barcode text, description text, brand_pt text, model text, brand_en text
) returns text language sql immutable parallel safe set search_path = '' as $$
 select public.article_fast_normalize(coalesce(code,'') || ' ' || coalesce(barcode,'') || ' ' ||
 coalesce(description,'') || ' ' || coalesce(brand_pt,'') || ' ' || coalesce(model,'') || ' ' || coalesce(brand_en,''));
$$;

create index if not exists articles_fast_code_idx on public.articles
 (organization_id, public.article_fast_code(artigo) text_pattern_ops);
create index if not exists articles_fast_barcode_idx on public.articles
 (organization_id, public.article_fast_code(codigo_barras) text_pattern_ops);
create index if not exists articles_fast_description_idx on public.articles
 (organization_id, public.article_fast_normalize(descricao) text_pattern_ops);
-- Qualify gin_trgm_ops through the installed extension schema (public/extensions).
do $$ declare ns text; begin
 select n.nspname into ns from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pg_trgm';
 execute format('create index if not exists articles_fast_document_idx on public.articles using gin
 (public.article_fast_document(artigo,codigo_barras,descricao,marca,modelo,brand) %I.gin_trgm_ops)', ns);
end $$;
analyze public.articles;

create or replace function public.search_articles_fast(
 p_query text, p_limit integer default 30, p_offset integer default 0,
 p_organization_id uuid default null
) returns table (
 artigo text, descricao text, pvp1 text, pvp2 text, pvp3 text, estado text,
 codigo_barras text, titulo_oficial text, descricao_oficial text,
 marca text, modelo text, brand text, categoria text, subcategory text, total_count bigint
) language plpgsql security definer set search_path = ''
set plan_cache_mode = 'force_custom_plan'
as $$
declare
 v_org uuid;
 v_q text := public.article_fast_normalize(p_query);
 v_code text := public.article_fast_code(p_query);
 v_limit integer := least(greatest(coalesce(p_limit,30),1),50);
 v_offset integer := greatest(coalesce(p_offset,0),0);
 v_window integer;
 v_ids text[];
 v_token text;
 v_filter text := '';
begin
 if auth.uid() is null and coalesce(auth.role(),'') <> 'service_role' then
   raise exception 'Authentication required' using errcode='42501';
 end if;
 v_org := public.resolve_article_rpc_organization(p_organization_id);
 if v_org is null then raise exception 'Organization required' using errcode='42501'; end if;
 if length(v_q) < 2 then return; end if;
 if length(v_q) > 160 or v_offset > 2000 then
   raise exception 'Refine the search (maximum 160 characters and offset 2000)' using errcode='22023';
 end if;
 v_window := v_offset + v_limit + 1;

 -- Exact code/EAN avoids running the description search at all.
 select array_agg(x.artigo order by x.artigo) into v_ids from (
   select a.artigo from public.articles a where a.organization_id=v_org
   and (public.article_fast_code(a.artigo)=v_code or public.article_fast_code(a.codigo_barras)=v_code)
   order by a.artigo limit v_window
 ) x;

 if coalesce(cardinality(v_ids),0)=0 then
   if not exists (select 1 from unnest(regexp_split_to_array(v_q, ' +')) t(token) where length(t.token) >= 3) then
     -- Two-character contains searches cannot use useful trigrams; use prefixes.
     select array_agg(x.artigo order by x.artigo) into v_ids from (
       select a.artigo from public.articles a where a.organization_id=v_org
       and (public.article_fast_code(a.artigo) like v_code || '%'
         or public.article_fast_code(a.codigo_barras) like v_code || '%'
         or public.article_fast_normalize(a.descricao) like v_q || '%')
       order by a.artigo limit v_window
     ) x;
   else
     -- AND between words supports "bosch maquina" regardless of word order.
     -- Only normalized literals are interpolated; tenant/limits are parameters.
     foreach v_token in array regexp_split_to_array(v_q, ' +') loop
       v_filter := v_filter || case when v_filter='' then '' else ' and ' end ||
         format('public.article_fast_document(a.artigo,a.codigo_barras,a.descricao,a.marca,a.modelo,a.brand) like %L', '%' || v_token || '%');
     end loop;
     execute 'with candidates as (
       (select a.artigo, 0 as priority from public.articles a
        where a.organization_id=$1 and public.article_fast_code(a.artigo) like $2 || ''%''
        order by a.artigo limit $3)
       union all
       (select a.artigo, 0 as priority from public.articles a
        where a.organization_id=$1 and public.article_fast_code(a.codigo_barras) like $2 || ''%''
        order by a.artigo limit $3)
       union all
       (select a.artigo, 1 as priority from public.articles a
        where a.organization_id=$1 and (' || v_filter || ')
        order by a.artigo limit $3)
     ), best as (
       select c.artigo, min(c.priority) as priority from candidates c group by c.artigo
     ) select array_agg(x.artigo order by x.priority,x.artigo) from (
       select b.artigo,b.priority from best b order by b.priority,b.artigo limit $3
     ) x'
     into v_ids using v_org, v_code, v_window;
   end if;
 end if;

 -- Fetch rich fields only for the requested page. The extra row signals hasMore;
 -- total_count is a lower bound while another page exists, not a full COUNT(*).
 return query select a.artigo::text,a.descricao::text,a.pvp1::text,a.pvp2::text,a.pvp3::text,a.estado::text,
 a.codigo_barras::text,a.titulo_oficial::text,a.descricao_oficial::text,
 a.marca::text,a.modelo::text,a.brand::text,a.categoria::text,a.subcategory::text,
 cardinality(v_ids)::bigint
 from unnest(v_ids) with ordinality ids(code,pos)
 join public.articles a on a.artigo=ids.code and a.organization_id=v_org
 where ids.pos > v_offset and ids.pos <= v_offset+v_limit order by ids.pos;
end $$;
revoke all on function public.search_articles_fast(text,integer,integer,uuid) from public, anon;
grant execute on function public.search_articles_fast(text,integer,integer,uuid) to authenticated, service_role;
select pg_notify('pgrst','reload schema');
commit;
