-- Cloud collaboration tables

-- Document content storage for Cloud notebooks
CREATE TABLE cloud_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notebook_id UUID NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    content_enc TEXT,
    ydoc_state BYTEA,
    content_hash TEXT,
    size_bytes INTEGER DEFAULT 0,
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(notebook_id, path)
);

-- Sharing & ACLs
CREATE TABLE notebook_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notebook_id UUID NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
    owner_user_id UUID NOT NULL REFERENCES users(id),
    shared_with_user_id UUID REFERENCES users(id),
    shared_with_email TEXT,
    permission TEXT NOT NULL CHECK (permission IN ('viewer', 'editor')),
    invite_token TEXT UNIQUE,
    invite_expires_at TIMESTAMPTZ,
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    revoked_at TIMESTAMPTZ
);

-- Public share links
CREATE TABLE notebook_public_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notebook_id UUID NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
    link_token TEXT UNIQUE NOT NULL,
    permission TEXT NOT NULL DEFAULT 'viewer' CHECK (permission IN ('viewer')),
    visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public')),
    is_active BOOLEAN DEFAULT true,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    revoked_at TIMESTAMPTZ
);

-- Collaboration sessions (active editing)
CREATE TABLE collab_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES cloud_documents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    connected_at TIMESTAMPTZ DEFAULT now(),
    disconnected_at TIMESTAMPTZ,
    client_info JSONB
);

-- Document version history
CREATE TABLE document_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES cloud_documents(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    content_enc TEXT NOT NULL,
    ydoc_state BYTEA,
    size_bytes INTEGER DEFAULT 0,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    change_summary TEXT,
    UNIQUE(document_id, version_number)
);

-- Indexes
CREATE INDEX idx_cloud_docs_notebook ON cloud_documents(notebook_id);
CREATE INDEX idx_cloud_docs_path ON cloud_documents(notebook_id, path);
CREATE INDEX idx_shares_notebook ON notebook_shares(notebook_id);
CREATE INDEX idx_shares_user ON notebook_shares(shared_with_user_id);
CREATE INDEX idx_shares_email ON notebook_shares(shared_with_email);
CREATE INDEX idx_shares_token ON notebook_shares(invite_token);
CREATE INDEX idx_public_links_token ON notebook_public_links(link_token);
CREATE INDEX idx_public_links_notebook ON notebook_public_links(notebook_id);
CREATE INDEX idx_collab_sessions_doc ON collab_sessions(document_id);
CREATE INDEX idx_doc_versions ON document_versions(document_id, version_number);
