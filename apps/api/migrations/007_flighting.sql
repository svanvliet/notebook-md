-- Flighting: per-user flag resolution, groups, flights, overrides
-- Extends the existing feature_flags table and adds supporting tables

-- Extend feature_flags with rollout, variants, and staleness
ALTER TABLE feature_flags
  ADD COLUMN IF NOT EXISTS rollout_percentage INTEGER DEFAULT 100
    CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
  ADD COLUMN IF NOT EXISTS variants JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS stale_at TIMESTAMPTZ DEFAULT NULL;

-- Per-user flag overrides (highest priority after kill switch)
CREATE TABLE IF NOT EXISTS flag_overrides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flag_key VARCHAR(100) NOT NULL REFERENCES feature_flags(key) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL,
  variant VARCHAR(100) DEFAULT NULL,
  reason TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT NULL,
  UNIQUE (flag_key, user_id)
);

-- User groups for targeting
CREATE TABLE IF NOT EXISTS user_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  allow_self_enroll BOOLEAN NOT NULL DEFAULT false,
  email_domain VARCHAR(255) DEFAULT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_group_members (
  group_id UUID NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_by UUID REFERENCES users(id),
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

-- Flights: named bundles of flags
CREATE TABLE IF NOT EXISTS flights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  show_badge BOOLEAN NOT NULL DEFAULT false,
  badge_label VARCHAR(50) DEFAULT 'Beta',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS flight_flags (
  flight_id UUID NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
  flag_key VARCHAR(100) NOT NULL REFERENCES feature_flags(key) ON DELETE CASCADE,
  PRIMARY KEY (flight_id, flag_key)
);

CREATE TABLE IF NOT EXISTS flight_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flight_id UUID NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
  group_id UUID REFERENCES user_groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES users(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT flight_target CHECK (
    (group_id IS NOT NULL AND user_id IS NULL) OR
    (group_id IS NULL AND user_id IS NOT NULL)
  ),
  UNIQUE (flight_id, group_id, user_id)
);

-- Performance indexes for flag resolution queries
CREATE INDEX IF NOT EXISTS idx_flag_overrides_user ON flag_overrides(user_id);
CREATE INDEX IF NOT EXISTS idx_flag_overrides_key ON flag_overrides(flag_key);
CREATE INDEX IF NOT EXISTS idx_user_group_members_user ON user_group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_flight_assignments_flight ON flight_assignments(flight_id);
CREATE INDEX IF NOT EXISTS idx_flight_assignments_group ON flight_assignments(group_id);
CREATE INDEX IF NOT EXISTS idx_flight_assignments_user ON flight_assignments(user_id);
