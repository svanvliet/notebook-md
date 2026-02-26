-- Migration 011: Admin upgrade schema changes
-- Adds last_active_at tracking, feature flag archival, and announcement group targeting

-- Track when a user was last active (updated on session creation/refresh)
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

-- Backfill from most recent session
UPDATE users SET last_active_at = sub.latest
FROM (SELECT user_id, MAX(created_at) AS latest FROM sessions GROUP BY user_id) sub
WHERE users.id = sub.user_id AND users.last_active_at IS NULL;

-- Allow archiving feature flags (hidden from default list, but kept in DB)
ALTER TABLE feature_flags ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT false;

-- Announcement group targeting (announcements can target specific groups)
CREATE TABLE IF NOT EXISTS announcement_groups (
    announcement_id UUID REFERENCES announcements(id) ON DELETE CASCADE,
    group_id UUID REFERENCES user_groups(id) ON DELETE CASCADE,
    PRIMARY KEY (announcement_id, group_id)
);
