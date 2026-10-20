-- Apply EACH statement via psql with autocommit on; not inside BEGIN/COMMIT.
-- CONCURRENTLY keeps read/write service available while preparing indexes.
-- If a concurrent build is interrupted, inspect pg_index.indisvalid and drop
-- the INVALID index CONCURRENTLY before retrying (not during a transaction).
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS articles_article_id_uidx
  ON public.articles(article_id);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS articles_organization_artigo_uidx
  ON public.articles(organization_id, artigo);
