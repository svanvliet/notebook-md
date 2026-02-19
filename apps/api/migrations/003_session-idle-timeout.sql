-- Add last_active_at to sessions for idle timeout tracking
ALTER TABLE sessions ADD COLUMN last_active_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Add idle_timeout_minutes to user_settings
-- NULL means disabled (default). Values like 15, 30, 60, 120 minutes.
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS idle_timeout_minutes INTEGER;
