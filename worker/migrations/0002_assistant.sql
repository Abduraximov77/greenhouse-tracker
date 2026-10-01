-- The owner's own AI-assistant link (helper address + key), kept with his account so every device
-- he signs in on gets it. Only ever sent back to that same user.
ALTER TABLE users ADD COLUMN assistant TEXT;
