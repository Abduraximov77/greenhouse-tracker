-- The daily weather message now comes at 13:00 (each person's own time) instead of 19:00.
-- People who had the old default get the new one; anyone who picked another hour keeps it.
UPDATE users SET alert_hour = 13 WHERE alert_hour = 19;
