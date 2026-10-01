-- One person owns the AI assistant (the one whose computer runs it). Only they get and answer access
-- requests. It is the first account that linked its own helper.
CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT OR IGNORE INTO app_settings (key, value)
  SELECT 'assistant_owner', CAST(id AS TEXT) FROM users
  WHERE assistant IS NOT NULL AND assistant_from IS NULL
  ORDER BY created_at, id LIMIT 1;
