-- Compatibility migration for article DB updates.
-- Safe to run more than once.

create extension if not exists pg_trgm;

alter table if exists public.articles
  add column if not exists pvp1 text not null default '',
  add column if not exists pvp3 text not null default '',
  add column if not exists search_terms text not null default '';

create index if not exists articles_codigo_barras_idx
  on public.articles (codigo_barras);

create index if not exists articles_descricao_trgm_idx
  on public.articles using gin (descricao gin_trgm_ops);

create index if not exists articles_search_terms_trgm_idx
  on public.articles using gin (search_terms gin_trgm_ops);

select pg_notify('pgrst', 'reload schema');
