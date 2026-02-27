-- Seed AI demo mode feature flag
INSERT INTO feature_flags (key, enabled, description)
VALUES
  ('ai_demo_mode', false, 'Allow unauthenticated demo users to use AI generation with limited quota')
ON CONFLICT (key) DO NOTHING;
