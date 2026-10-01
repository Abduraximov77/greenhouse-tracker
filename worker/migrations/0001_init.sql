-- People who signed in with Telegram
CREATE TABLE users (
  id INTEGER PRIMARY KEY,               -- Telegram user id
  name TEXT NOT NULL,
  username TEXT,
  photo TEXT,
  lang TEXT NOT NULL DEFAULT 'uz',
  tz_offset INTEGER NOT NULL DEFAULT 300, -- minutes east of UTC (Uzbekistan = 300)
  alerts_on INTEGER NOT NULL DEFAULT 1,
  alert_hour INTEGER NOT NULL DEFAULT 19, -- evening message, local hour
  can_message INTEGER NOT NULL DEFAULT 0, -- the bot may write to this person
  created_at TEXT NOT NULL,
  last_seen TEXT
);

-- Signed-in devices; only a hash of the token is stored
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  device TEXT,
  created_at TEXT NOT NULL,
  last_used TEXT
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE farms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,            -- e.g. AL-4827
  pass_salt TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  seq INTEGER NOT NULL DEFAULT 0        -- last change number
);

CREATE TABLE members (
  farm_id TEXT NOT NULL REFERENCES farms(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'member',  -- owner | member
  status TEXT NOT NULL DEFAULT 'pending', -- pending | active | rejected | removed
  requested_at TEXT NOT NULL,
  decided_by INTEGER,
  decided_at TEXT,
  PRIMARY KEY (farm_id, user_id)
);
CREATE INDEX members_user ON members(user_id);

-- Wrong farm passwords: 5 tries, then 15 minutes wait
CREATE TABLE attempts (
  user_id INTEGER NOT NULL,
  code TEXT NOT NULL,
  fails INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  PRIMARY KEY (user_id, code)
);

-- Every record of the farm (seasons, crops, expenses, …). Deleted ones stay as tombstones for the trash.
CREATE TABLE records (
  farm_id TEXT NOT NULL,
  coll TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT,                            -- JSON of the record (kept for deleted ones too)
  deleted INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,             -- when it was changed on the device
  updated_by INTEGER,
  seq INTEGER NOT NULL,                 -- change number within the farm
  PRIMARY KEY (farm_id, coll, id)
);
CREATE INDEX records_seq ON records(farm_id, seq);

-- Weather alerts already sent, so nobody gets the same one twice
CREATE TABLE sent_alerts (
  user_id INTEGER NOT NULL,
  farm_id TEXT NOT NULL,
  key TEXT NOT NULL,                    -- place|date|rule
  sent_at TEXT NOT NULL,
  PRIMARY KEY (user_id, farm_id, key)
);
CREATE TABLE digests (
  user_id INTEGER NOT NULL,
  day TEXT NOT NULL,                    -- local date of the evening message
  PRIMARY KEY (user_id, day)
);
