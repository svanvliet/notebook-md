-- Cloud collaboration feature flags

INSERT INTO feature_flags (key, enabled, description) VALUES
  ('cloud_notebooks', false, 'Enable Cloud as a notebook source type'),
  ('cloud_collab', false, 'Enable real-time collaboration features'),
  ('cloud_sharing', false, 'Enable sharing (invites + links)'),
  ('cloud_public_links', false, 'Enable anonymous public link viewing'),
  ('soft_quota_banners', false, 'Show quota warning/exceeded banners'),
  ('hard_quota_enforcement', false, 'Block writes at quota limits (future)')
ON CONFLICT (key) DO NOTHING;
