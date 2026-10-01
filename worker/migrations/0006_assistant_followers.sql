-- People already using the owner's assistant with the same key are the owner's followers, so they
-- get address changes and can be cut off by the owner.
UPDATE users SET assistant_from = CAST((SELECT value FROM app_settings WHERE key = 'assistant_owner') AS INTEGER)
WHERE assistant IS NOT NULL
  AND assistant_from IS NULL
  AND id <> CAST(COALESCE((SELECT value FROM app_settings WHERE key = 'assistant_owner'), '0') AS INTEGER)
  AND json_extract(assistant, '$.k') = (
    SELECT json_extract(o.assistant, '$.k') FROM users o
    WHERE o.id = CAST((SELECT value FROM app_settings WHERE key = 'assistant_owner') AS INTEGER)
  );
