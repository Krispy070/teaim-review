CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS memory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  source_type text NOT NULL,
  source_id text,
  text text NOT NULL,
  embedding vector(1536),
  created_at timestamptz DEFAULT now(),
  pii_tags jsonb DEFAULT '[]'::jsonb,
  lineage jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  kind text NOT NULL,
  severity text,
  owner text,
  event_ts timestamptz NOT NULL,
  features jsonb DEFAULT '{}'::jsonb,
  outcome jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS lessons_learned (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical text NOT NULL,
  pattern jsonb NOT NULL,
  recommendation text NOT NULL,
  support jsonb DEFAULT '{}'::jsonb,
  confidence real DEFAULT 0.0,
  updated_at timestamptz DEFAULT now()
);
