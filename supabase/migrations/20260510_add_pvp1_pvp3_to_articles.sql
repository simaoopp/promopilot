-- Adds the new price fields without touching existing archived article data.
-- Run this once in Supabase SQL Editor before running the migration script.

alter table public.articles
  add column if not exists pvp1 text not null default '',
  add column if not exists pvp3 text not null default '';

-- Keep this search helper in sync for rows that may be inserted directly.
update public.articles
set search_terms = trim(
  lower(
    concat_ws(
      ' ',
      coalesce(artigo, ''),
      coalesce(codigo_barras, ''),
      coalesce(descricao, ''),
      coalesce(titulo_oficial, ''),
      coalesce(descricao_oficial, ''),
      coalesce(marca, ''),
      coalesce(modelo, ''),
      coalesce(brand, ''),
      coalesce(categoria, ''),
      coalesce(subcategory, '')
    )
  )
)
where coalesce(search_terms, '') = '';
