-- Run ONCE PER CALL as a separate committed transaction, as a DB admin.
-- Repeat until updated_rows = 0. Never run inside a long BEGIN/COMMIT loop.
-- SKIP LOCKED permits concurrent writes and limits locked rows to 2000.
WITH batch AS MATERIALIZED (
 SELECT ctid FROM public.articles
 WHERE article_id IS NULL
 LIMIT 2000 FOR UPDATE SKIP LOCKED
), applied AS (
 UPDATE public.articles a SET article_id=gen_random_uuid()
 FROM batch WHERE a.ctid=batch.ctid RETURNING a.article_id
)
SELECT count(*) AS updated_rows FROM applied;
