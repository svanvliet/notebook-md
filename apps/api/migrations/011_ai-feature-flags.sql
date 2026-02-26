-- Seed AI feature flags
INSERT INTO feature_flags (key, enabled, description)
VALUES
  ('ai_content_generation', false, 'Master switch for AI content generation feature'),
  ('ai_unlimited_generations', false, 'Bypasses daily AI generation quota when enabled for a user/group via flight')
ON CONFLICT (key) DO NOTHING;
