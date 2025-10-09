CREATE UNIQUE INDEX IF NOT EXISTS idx_user_alerts_project_user
  ON user_alerts (project_id, user_email)
  WHERE project_id IS NOT NULL AND user_email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_alerts_global_user
  ON user_alerts (user_email)
  WHERE project_id IS NULL AND user_email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_prefs_project_user_key
  ON user_prefs (project_id, user_email, key)
  WHERE project_id IS NOT NULL AND user_email IS NOT NULL AND key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_channels_project_category
  ON project_channels (project_id, category)
  WHERE project_id IS NOT NULL AND category IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_secrets_project_scope_key_null_ref
  ON secrets (project_id, scope, key_name)
  WHERE ref_id IS NULL AND project_id IS NOT NULL AND scope IS NOT NULL AND key_name IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_secrets_project_scope_ref_key
  ON secrets (project_id, scope, ref_id, key_name)
  WHERE ref_id IS NOT NULL AND project_id IS NOT NULL AND scope IS NOT NULL AND key_name IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_alert_state_project_key
  ON alert_state (project_id, key)
  WHERE project_id IS NOT NULL AND key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_alert_state_global_key
  ON alert_state (key)
  WHERE project_id IS NULL AND key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_embed_jobs_doc
  ON embed_jobs (doc_id)
  WHERE doc_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_parse_jobs_doc
  ON parse_jobs (doc_id)
  WHERE doc_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_suppressions_email
  ON email_suppressions (email)
  WHERE email IS NOT NULL;
