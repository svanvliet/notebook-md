-- Plans & Entitlements

CREATE TABLE plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE plan_entitlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id TEXT NOT NULL REFERENCES plans(id),
    entitlement_key TEXT NOT NULL,
    entitlement_value TEXT NOT NULL,
    UNIQUE(plan_id, entitlement_key)
);

CREATE TABLE user_plan_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id TEXT NOT NULL REFERENCES plans(id),
    started_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    UNIQUE(user_id)
);

CREATE TABLE user_usage_counters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    counter_key TEXT NOT NULL,
    counter_value BIGINT DEFAULT 0,
    last_reconciled_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, counter_key)
);

CREATE INDEX idx_user_usage ON user_usage_counters(user_id, counter_key);

-- Seed free plan
INSERT INTO plans (id, name, is_default) VALUES ('free', 'Free', true);

INSERT INTO plan_entitlements (plan_id, entitlement_key, entitlement_value) VALUES
  ('free', 'max_cloud_notebooks', '3'),
  ('free', 'max_storage_bytes', '524288000'),
  ('free', 'max_doc_size_bytes', '5242880');

-- Backfill: assign free plan to all existing users
INSERT INTO user_plan_subscriptions (user_id, plan_id, is_active)
SELECT id, 'free', true FROM users
ON CONFLICT DO NOTHING;
