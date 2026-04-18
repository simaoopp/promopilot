create extension if not exists pg_trgm;

create table if not exists public.articles (
  artigo text primary key,
  descricao text not null default '',
  pvp2 numeric,
  codigo_barras text not null default '',
  fonte_oficial text not null default '',
  raw_hash text not null default '',
  ultima_atualizacao timestamptz,
  titulo_oficial text not null default '',
  descricao_oficial text not null default '',
  caracteristicas_tecnicas jsonb not null default '{}'::jsonb,
  documentos_oficiais jsonb not null default '[]'::jsonb,
  resumo_vendedor text not null default '',
  observacoes_ia text not null default '',
  marca text not null default '',
  modelo text not null default '',
  brand text not null default '',
  categoria text not null default '',
  subcategory text not null default '',
  texto_grounding text not null default '',
  search_terms text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists articles_codigo_barras_idx on public.articles (codigo_barras);
create index if not exists articles_artigo_trgm_idx on public.articles using gin (artigo gin_trgm_ops);
create index if not exists articles_search_terms_trgm_idx on public.articles using gin (search_terms gin_trgm_ops);

create or replace function public.set_articles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_articles_updated_at on public.articles;
create trigger set_articles_updated_at
before update on public.articles
for each row
execute function public.set_articles_updated_at();

alter table public.articles enable row level security;
revoke all on public.articles from anon, authenticated;
