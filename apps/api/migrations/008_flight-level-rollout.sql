-- Move rollout_percentage from feature_flags to flights
-- Flights are the sole delivery mechanism; flags are OFF unless delivered through a flight.

-- Add rollout_percentage to flights (0 = group-assigned only, 100 = GA)
ALTER TABLE flights
  ADD COLUMN IF NOT EXISTS rollout_percentage INTEGER NOT NULL DEFAULT 0
    CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100);

-- Create a "General Availability" flight for graduated features
-- Existing co-auth flags were globally enabled at 100%; this flight preserves that behavior.
INSERT INTO flights (name, description, enabled, rollout_percentage, show_badge, badge_label)
VALUES ('General Availability', 'Graduated features available to all users', true, 100, false, 'GA')
ON CONFLICT (name) DO NOTHING;

-- Move all existing flags that were at rollout_percentage=100 into the GA flight
INSERT INTO flight_flags (flight_id, flag_key)
SELECT f.id, ff.key
FROM flights f, feature_flags ff
WHERE f.name = 'General Availability'
  AND ff.rollout_percentage = 100
  AND ff.enabled = true
ON CONFLICT DO NOTHING;

-- Drop the rollout_percentage column from feature_flags (no longer used in resolution)
ALTER TABLE feature_flags DROP COLUMN IF EXISTS rollout_percentage;
