-- GitHub App installations
-- Tracks which GitHub App installations a user has authorized,
-- enabling the app to generate installation tokens for repo access.

CREATE TABLE github_installations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  installation_id BIGINT NOT NULL UNIQUE,
  account_login VARCHAR(255) NOT NULL,
  account_type VARCHAR(50) NOT NULL DEFAULT 'User', -- 'User' or 'Organization'
  repos_selection VARCHAR(50) NOT NULL DEFAULT 'all', -- 'all' or 'selected'
  suspended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_github_installations_user_id ON github_installations(user_id);
CREATE INDEX idx_github_installations_installation_id ON github_installations(installation_id);
