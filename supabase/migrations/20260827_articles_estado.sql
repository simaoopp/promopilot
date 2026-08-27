alter table if exists public.articles
  add column if not exists estado text not null default '';

select pg_notify('pgrst', 'reload schema');
