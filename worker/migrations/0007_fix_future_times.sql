-- Records saved with a time in the future (a phone with a wrong clock) would win every later edit:
-- set them to now. New saves can no longer carry a future time.
UPDATE records SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE updated_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
