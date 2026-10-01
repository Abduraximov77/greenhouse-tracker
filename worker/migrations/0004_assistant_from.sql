-- Who allowed this person's AI assistant (NULL = they linked their own helper, so they own it).
-- Requests from any account go to the owners only.
ALTER TABLE users ADD COLUMN assistant_from INTEGER;

-- people already allowed by someone before this change: mark who allowed them
UPDATE users SET assistant_from = (
  SELECT r.decided_by FROM assistant_requests r WHERE r.user_id = users.id AND r.status = 'approved'
)
WHERE assistant IS NOT NULL AND id IN (SELECT user_id FROM assistant_requests WHERE status = 'approved');
