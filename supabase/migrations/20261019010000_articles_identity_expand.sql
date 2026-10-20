-- EXPAND (compatibility phase). Can precede the new API: the legacy
-- articles_pkey(artigo) deliberately remains in place and continues to prevent
-- equal codes across organizations until the coordinated cutover.
-- This migration never attributes legacy NULL organization_id to a tenant.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$
BEGIN
  IF to_regclass('public.articles') IS NULL
     OR to_regclass('public.organizations') IS NULL
     OR to_regprocedure('public.platform_permission(uuid,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Expected platform permissions and articles schema must be installed first';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.articles'::regclass AND conname='articles_pkey'
      AND pg_get_constraintdef(oid) = 'PRIMARY KEY (artigo)'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.articles'::regclass AND conname='articles_pkey'
      AND pg_get_constraintdef(oid) = 'PRIMARY KEY (article_id)'
  ) THEN
    RAISE EXCEPTION 'Unexpected articles primary key; inspect manually';
  END IF;
END $$;

-- Nullable addition avoids a volatile DEFAULT forcing a rewrite/backfill of
-- ~300k existing rows while holding an ACCESS EXCLUSIVE lock.
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS article_id uuid;
ALTER TABLE public.articles ALTER COLUMN article_id SET DEFAULT gen_random_uuid();

-- This trigger runs AFTER trg_articles_updated_at alphabetically, restoring
-- original timestamps on the identity-only one-time backfill. The existing
-- price/description update trigger remains unchanged for normal edits.
CREATE OR REPLACE FUNCTION public.preserve_article_identity_backfill_timestamp()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF OLD.article_id IS NULL AND NEW.article_id IS NOT NULL
    AND (to_jsonb(NEW) - 'article_id' - 'updated_at')
        IS NOT DISTINCT FROM (to_jsonb(OLD) - 'article_id' - 'updated_at') THEN
    NEW.updated_at := OLD.updated_at;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS zzzz_article_identity_backfill_timestamp ON public.articles;
CREATE TRIGGER zzzz_article_identity_backfill_timestamp
  BEFORE UPDATE OF article_id ON public.articles FOR EACH ROW
  EXECUTE FUNCTION public.preserve_article_identity_backfill_timestamp();

COMMENT ON COLUMN public.articles.article_id IS
  'Stable internal ID; legacy rows must be backfilled in bounded transactions before cutover.';
COMMIT;
