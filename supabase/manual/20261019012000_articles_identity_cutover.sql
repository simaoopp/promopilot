-- CONTRACT / IRREVERSIBLE COMPATIBILITY BOUNDARY.
-- DO NOT APPLY until every active backend/worker/maintenance script is using
-- organization-scoped keys, new version is deployed, and the maintenance
-- window is approved. Back up and rehearse restore first.
-- No existing article, ownership, price or campaign row is modified here.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '45s';
LOCK TABLE public.articles IN ACCESS EXCLUSIVE MODE NOWAIT;

DO $$
DECLARE
  v_pk text;
  v_bad bigint;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_pk FROM pg_constraint
  WHERE conrelid='public.articles'::regclass AND contype='p';
  IF v_pk = 'PRIMARY KEY (article_id)' THEN
    RAISE NOTICE 'Article primary key already migrated';
    RETURN;
  END IF;
  IF v_pk IS DISTINCT FROM 'PRIMARY KEY (artigo)' THEN
    RAISE EXCEPTION 'Unexpected article primary key: %',v_pk;
  END IF;
  SELECT count(*) INTO v_bad FROM public.articles
    WHERE organization_id IS NULL OR article_id IS NULL OR btrim(artigo)='';
  IF v_bad > 0 THEN
    RAISE EXCEPTION '% articles without organization, article ID, or commercial code; stop and reconcile explicitly',v_bad;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE contype='f' AND confrelid='public.articles'::regclass
  ) THEN
    RAISE EXCEPTION 'Foreign keys reference old article primary key; migrate them first';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
    WHERE i.indrelid='public.articles'::regclass AND c.relname='articles_article_id_uidx'
      AND i.indisunique AND i.indisvalid AND i.indisready
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
    WHERE i.indrelid='public.articles'::regclass AND c.relname='articles_organization_artigo_uidx'
      AND i.indisunique AND i.indisvalid AND i.indisready
  ) THEN
    RAISE EXCEPTION 'Missing/invalid new unique indexes; apply the index phase first';
  END IF;
END $$;

-- We intentionally require organization_id on EVERY row. No guessing or
-- special treatment of any organization is allowed.
ALTER TABLE public.articles ALTER COLUMN article_id SET NOT NULL;
ALTER TABLE public.articles ALTER COLUMN organization_id SET NOT NULL;

DO $$
DECLARE v_pk text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_pk FROM pg_constraint
    WHERE conrelid='public.articles'::regclass AND contype='p';
  IF v_pk = 'PRIMARY KEY (artigo)' THEN
    ALTER TABLE public.articles DROP CONSTRAINT articles_pkey;
    ALTER TABLE public.articles ADD CONSTRAINT articles_pkey
      PRIMARY KEY USING INDEX articles_article_id_uidx;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.articles'::regclass
      AND conname='articles_organization_artigo_key'
  ) THEN
    ALTER TABLE public.articles ADD CONSTRAINT articles_organization_artigo_key
      UNIQUE USING INDEX articles_organization_artigo_uidx;
  END IF;
END $$;

-- A legitimate article may change its commercial description or price, but
-- neither internal identity nor tenant ownership can be silently reassigned.
CREATE OR REPLACE FUNCTION public.protect_article_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.article_id IS DISTINCT FROM OLD.article_id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Article ID and organization are immutable'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_article_identity ON public.articles;
CREATE TRIGGER protect_article_identity BEFORE UPDATE OF article_id,organization_id
  ON public.articles FOR EACH ROW EXECUTE FUNCTION public.protect_article_identity();

DROP TRIGGER IF EXISTS zzzz_article_identity_backfill_timestamp ON public.articles;
DROP FUNCTION IF EXISTS public.preserve_article_identity_backfill_timestamp();

-- Preserve all existing RLS grants/policies; no new permissive policy.
SELECT pg_notify('pgrst','reload schema');
COMMIT;
