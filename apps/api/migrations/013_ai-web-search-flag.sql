-- Seed AI web search feature flag
INSERT INTO feature_flags (key, enabled, description)
VALUES
  ('ai_web_search', false, 'Enables the web search grounding option for AI content generation')
ON CONFLICT (key) DO NOTHING;
