-- Dev guardrails: ensure worker heartbeat tracking table exists for local development.
CREATE TABLE IF NOT EXISTS worker_heartbeats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker text NOT NULL,
  last_beat timestamptz NOT NULL DEFAULT now()
);

-- Dev guardrails: align worker heartbeats uniqueness with ON CONFLICT usage.
CREATE UNIQUE INDEX IF NOT EXISTS worker_heartbeat_worker_unique ON worker_heartbeats(worker);

-- Dev guardrails: ensure minimal planning tables exist so plan workers can operate locally.
CREATE TABLE IF NOT EXISTS project_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  code text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plan_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL,
  title text NOT NULL,
  due_date date,
  status text DEFAULT 'open'
);

-- Dev guardrails: partial unique indexes to support ON CONFLICT paths without blocking on legacy NULLs.
CREATE UNIQUE INDEX IF NOT EXISTS orgs_slug_unique ON orgs(slug) WHERE slug IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS projects_code_unique ON projects(code) WHERE code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS sso_settings_domain_unique ON sso_settings(domain) WHERE domain IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS onboarding_steps_key_unique ON onboarding_steps(key) WHERE key IS NOT NULL;
