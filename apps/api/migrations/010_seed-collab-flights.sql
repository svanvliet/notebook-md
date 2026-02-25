-- Seed the collab feature rollout configuration for production.
-- Creates the Beta Testers group, Collab Features flight, assigns
-- the co-auth flags to it, and links the group to the flight.
-- User assignments to the Beta Testers group are done via the admin UI.

-- 1. Create Beta Testers group (if not exists)
INSERT INTO user_groups (name, description, allow_self_enroll, email_domain)
VALUES ('Beta Testers', 'Users who are beta testing features of Notebook.md', false, NULL)
ON CONFLICT (name) DO NOTHING;

-- 2. Create Collab Features flight at 100% rollout (delivers to assigned groups only)
INSERT INTO flights (name, description, enabled, rollout_percentage, show_badge, badge_label)
VALUES ('Collab Features', 'Cloud collaboration features for beta testers', true, 100, false, '')
ON CONFLICT (name) DO NOTHING;

-- 3. Assign co-auth flags to the Collab Features flight (only if flags exist)
INSERT INTO flight_flags (flight_id, flag_key)
SELECT f.id, ff.key
FROM flights f
CROSS JOIN feature_flags ff
WHERE f.name = 'Collab Features'
  AND ff.key IN ('cloud_notebooks', 'cloud_sharing', 'cloud_collab', 'cloud_public_links', 'soft_quota_banners')
ON CONFLICT DO NOTHING;

-- 4. Remove co-auth flags from GA flight (they graduate back to GA when ready)
DELETE FROM flight_flags
WHERE flight_id = (SELECT id FROM flights WHERE name = 'General Availability')
  AND flag_key IN ('cloud_notebooks', 'cloud_sharing', 'cloud_collab', 'cloud_public_links', 'soft_quota_banners');

-- 5. Assign Beta Testers group to the Collab Features flight
INSERT INTO flight_assignments (flight_id, group_id)
SELECT f.id, g.id
FROM flights f, user_groups g
WHERE f.name = 'Collab Features' AND g.name = 'Beta Testers'
ON CONFLICT DO NOTHING;
