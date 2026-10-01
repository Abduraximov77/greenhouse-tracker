-- Another account asks to use the AI assistant; the person whose computer runs it allows it in Telegram.
CREATE TABLE IF NOT EXISTS assistant_requests (
  user_id INTEGER PRIMARY KEY,
  status TEXT NOT NULL,            -- pending | approved | rejected
  requested_at TEXT NOT NULL,
  decided_by INTEGER,
  decided_at TEXT
);
