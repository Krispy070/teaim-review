CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Core tables: embedding -> vector(3072)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['mem_entries','artifact_chunks','doc_chunks','mem_chunks','memory_items'] LOOP
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name=t AND column_name='embedding') THEN
        EXECUTE format('ALTER TABLE public.%I ALTER COLUMN embedding DROP DEFAULT;', t);
        BEGIN
          EXECUTE format('ALTER TABLE public.%I ALTER COLUMN embedding TYPE vector(3072) USING embedding::vector(3072);', t);
        EXCEPTION WHEN others THEN
          EXECUTE format('UPDATE public.%I SET embedding = NULL;', t);
          EXECUTE format('ALTER TABLE public.%I ALTER COLUMN embedding TYPE vector(3072) USING NULL;', t);
        END;
      END IF;
    EXCEPTION WHEN undefined_table THEN NULL;
    END;
  END LOOP;
END$$;

-- Staging/test tables: embedding -> jsonb (skip core)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT table_name, udt_name
    FROM information_schema.columns
    WHERE table_schema='public' AND column_name='embedding'
  LOOP
    IF r.table_name IN ('mem_entries','artifact_chunks','doc_chunks','mem_chunks','memory_items') THEN CONTINUE; END IF;
    IF r.table_name ~ '^(staging_|test_|tests_)' AND r.udt_name <> 'jsonb' THEN
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN embedding DROP DEFAULT;', r.table_name);
      BEGIN
        EXECUTE format(
          'ALTER TABLE public.%I ALTER COLUMN embedding TYPE jsonb
             USING CASE
               WHEN embedding IS NULL THEN NULL
               WHEN embedding::text LIKE ''{%%'' OR embedding::text LIKE ''[%%'' THEN (embedding::text)::jsonb
               WHEN pg_typeof(embedding)::text LIKE ''_%%'' THEN to_jsonb(embedding)
               WHEN pg_typeof(embedding)::text LIKE ''vector%%'' THEN NULL
               ELSE to_jsonb(embedding)
             END;', r.table_name
        );
      EXCEPTION WHEN others THEN
        EXECUTE format('ALTER TABLE public.%I ALTER COLUMN embedding TYPE jsonb USING NULL;', r.table_name);
      END;
    END IF;
  END LOOP;
END$$;

-- steps/tags/trace -> jsonb
DO $$
DECLARE r record; is_array boolean; col text;
BEGIN
  FOREACH col IN ARRAY ARRAY['steps','tags','trace'] LOOP
    FOR r IN
      SELECT table_name, udt_name
      FROM information_schema.columns
      WHERE table_schema='public' AND column_name=col AND udt_name <> 'jsonb'
    LOOP
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I DROP DEFAULT;', r.table_name, col);
      is_array := left(r.udt_name,1) = '_';
      IF is_array THEN
        EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I TYPE jsonb USING to_jsonb(%I);', r.table_name, col, col);
      ELSE
        EXECUTE format(
          'ALTER TABLE public.%I ALTER COLUMN %I TYPE jsonb
             USING CASE
               WHEN %I IS NULL THEN NULL
               WHEN %I::text LIKE ''{%%'' OR %I::text LIKE ''[%%'' THEN (%I::text)::jsonb
               ELSE to_jsonb(%I)
             END;', r.table_name, col, col, col, col, col, col
        );
      END IF;
    END LOOP;
  END LOOP;
END$$;

-- Deduplicate for uniques (keep highest id)
WITH r AS (
  SELECT id, domain, row_number() over (partition by domain order by id desc) rn
  FROM public.sso_settings
) DELETE FROM public.sso_settings s USING r WHERE s.id=r.id AND r.rn>1;

WITH r AS (
  SELECT id, key, row_number() over (partition by key order by id desc) rn
  FROM public.onboarding_steps
) DELETE FROM public.onboarding_steps s USING r WHERE s.id=r.id AND r.rn>1;
