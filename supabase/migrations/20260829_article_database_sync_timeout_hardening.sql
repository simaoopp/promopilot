-- PromoPilot article database sync: timeout hardening.
-- The article code is already the primary key in the canonical schema, but this
-- keeps legacy databases safe if that index was removed/recreated manually.

create index if not exists articles_artigo_idx
on public.articles (artigo);

analyze public.articles;
