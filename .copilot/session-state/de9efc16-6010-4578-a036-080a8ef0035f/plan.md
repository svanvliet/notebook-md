# Production Deployment Plan — Collab Server + CI Updates

## Problem
The collab server (HocusPocus WebSocket) exists locally but has no production infrastructure. We need to:
1. Add Terraform resources for the collab Container App
2. Add Front Door routing for `/collab*` path through `api.notebookmd.io`
3. Update `deploy.yml` to build/push/deploy the collab image
4. Update `rollback.yml` to support collab rollback

## Architecture Decisions
- **Routing:** `wss://api.notebookmd.io/collab` → Front Door → collab Container App (no new subdomain)
- **Container:** Separate Container App (`ca-notebookmd-collab`), not a sidecar
- **Transport:** Collab container uses `auto` transport for WebSocket upgrade support

## Todos

### 1. Terraform: Collab Container App
Add `azurerm_container_app.collab` to `container_apps.tf`:
- Name: `ca-notebookmd-collab`
- Port: 3002, transport: `auto` (WebSocket support)
- CPU: 0.5, Memory: 1Gi, replicas: 1-5
- Env vars: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD (secrets), REDIS_HOST, REDIS_PORT, ENCRYPTION_KEY (secret), COLLAB_PORT=3002
- Revision mode: Multiple (for rollback)
- User-assigned identity (same as API for ACR pull)

### 2. Terraform: Front Door collab route
Add to `frontdoor.tf`:
- New origin group: `og-collab` → collab Container App FQDN
- New route on **API endpoint**: `/collab*` → `og-collab` (higher priority than catch-all API route)
- No new endpoint or custom domain needed

### 3. Terraform: Outputs
Add `container_app_collab_fqdn` output

### 4. deploy.yml: Add collab to change detection
In preflight job:
- Add `collab` filter: `apps/collab/**`, `docker/Dockerfile.collab`, `packages/shared/**`
- Add `collab-changed` output

### 5. deploy.yml: Add build-collab job
Mirror `build-api` pattern:
- Condition: `collab-changed == 'true'`
- Build `docker/Dockerfile.collab`, push to `crnotebookmdprod.azurecr.io/collab`
- Tag with version + latest
- Trivy scan

### 6. deploy.yml: Add deploy-collab job
Mirror `deploy-api` pattern:
- Deploy to `ca-notebookmd-collab`
- No health check (HocusPocus doesn't expose one) — or add a basic TCP check

### 7. deploy.yml: Update summary job
Add collab to the deploy summary markdown table

### 8. rollback.yml: Add collab option
- Add `collab` to the `app` input choices
- Add conditional rollback block for `ca-notebookmd-collab`
- No health check (same as web/admin)

## Notes
- Collab server uses individual DB vars (DB_HOST, DB_PORT, etc.) not a single DATABASE_URL
- ENCRYPTION_KEY secret already exists in Key Vault (shared with API)
- Web app derives WS URL from VITE_API_URL automatically — no web-side changes needed
- Consider adding a health endpoint to collab server in the future
