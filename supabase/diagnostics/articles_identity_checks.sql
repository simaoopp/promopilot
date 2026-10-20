-- READ-ONLY diagnostics; run with a privileged database connection in staging.
-- Capture outputs before/after each phase, never assign missing tenants here.
SELECT count(*) AS articles_total,
 count(*) FILTER (WHERE organization_id IS NULL) AS ownership_missing,
 count(*) FILTER (WHERE article_id IS NULL) AS ids_missing,
 count(DISTINCT article_id) AS distinct_internal_ids
FROM public.articles;

SELECT organization_id, artigo, count(*) AS duplicates
FROM public.articles GROUP BY 1,2 HAVING count(*)>1 LIMIT 25;

SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint WHERE conrelid='public.articles'::regclass
 OR confrelid='public.articles'::regclass ORDER BY conname;

SELECT i.relname, x.indisunique, x.indisvalid, x.indisready,
 pg_get_indexdef(i.oid) AS definition
FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid
WHERE x.indrelid='public.articles'::regclass ORDER BY i.relname;

SELECT routine_schema, routine_name FROM information_schema.routines
WHERE routine_definition ILIKE '%articles%' AND routine_schema IN ('public','promopilot_private')
ORDER BY routine_schema,routine_name;

SELECT conname,pg_get_constraintdef(oid) FROM pg_constraint
WHERE contype='f' AND confrelid='public.articles'::regclass;

-- Explicit tenant isolation crosscheck under authenticated JWT in staging:
-- SELECT artigo, organization_id FROM public.articles WHERE artigo = 'same-code';
-- Must return only the tenant authorized by RLS; service_role BYPASSES RLS.
