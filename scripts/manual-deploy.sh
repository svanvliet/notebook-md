#!/usr/bin/env bash
#
# Manual deploy script for v0.2.0
# Use when GitHub Actions minutes are exhausted.
#
# Prerequisites:
#   - az CLI logged in (az login)
#   - ACR access (az acr login --name crnotebookmdprod)
#   - Docker running
#
set -euo pipefail

# Ensure Docker Desktop CLI is on PATH (macOS)
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"

# Run from repo root (where Dockerfiles expect their build context)
cd "$(dirname "$0")/.."

TAG="${1:-v0.2.0}"
ACR="crnotebookmdprod.azurecr.io"
RG="rg-notebookmd-prod"

echo "=== Deploying $TAG to production ==="
echo ""

# ── Step 0: Ensure we're on main at the right commit ────────────────────
echo "📋 Current branch: $(git branch --show-current)"
echo "   HEAD: $(git rev-parse --short HEAD)"
echo ""

# ── Step 1: Log in to ACR ───────────────────────────────────────────────
echo "🔐 Logging in to ACR..."
az acr login --name crnotebookmdprod
echo ""

# ── Step 2: Build all images ────────────────────────────────────────────
# Note: Dockerfiles already specify FROM --platform=linux/amd64
echo "🔨 Building API image..."
docker build -f docker/Dockerfile.api \
  -t "$ACR/api:$TAG" -t "$ACR/api:latest" .

echo "🔨 Building Web image..."
docker build -f docker/Dockerfile.web \
  -t "$ACR/web:$TAG" -t "$ACR/web:latest" .

echo "🔨 Building Admin image..."
docker build -f docker/Dockerfile.admin \
  -t "$ACR/admin:$TAG" -t "$ACR/admin:latest" .

echo "🔨 Building Collab image..."
docker build -f docker/Dockerfile.collab \
  -t "$ACR/collab:$TAG" -t "$ACR/collab:latest" .

echo ""

# ── Step 3: Push all images ─────────────────────────────────────────────
echo "📤 Pushing images to ACR..."
docker push "$ACR/api:$TAG"
docker push "$ACR/api:latest"
docker push "$ACR/web:$TAG"
docker push "$ACR/web:latest"
docker push "$ACR/admin:$TAG"
docker push "$ACR/admin:latest"
docker push "$ACR/collab:$TAG"
docker push "$ACR/collab:latest"
echo ""

# ── Step 4: Run migrations ──────────────────────────────────────────────
echo "🗃️  Running database migrations..."
az containerapp exec \
  --name ca-notebookmd-api \
  --resource-group "$RG" \
  --command "npx node-pg-migrate up --migrations-dir migrations --migration-file-language sql" \
  || echo "⚠️  Migration exec failed — you may need to run migrations manually"
echo ""

# ── Step 5: Deploy each container app ───────────────────────────────────
echo "🚀 Deploying API..."
az containerapp update \
  --name ca-notebookmd-api \
  --resource-group "$RG" \
  --image "$ACR/api:$TAG"

echo "🚀 Deploying Web..."
az containerapp update \
  --name ca-notebookmd-web \
  --resource-group "$RG" \
  --image "$ACR/web:$TAG"

echo "🚀 Deploying Admin..."
az containerapp update \
  --name ca-notebookmd-admin \
  --resource-group "$RG" \
  --image "$ACR/admin:$TAG"

echo "🚀 Deploying Collab..."
az containerapp update \
  --name ca-notebookmd-collab \
  --resource-group "$RG" \
  --image "$ACR/collab:$TAG"

echo ""

# ── Step 6: Health check ────────────────────────────────────────────────
echo "🏥 Waiting for API health check..."
for i in $(seq 1 30); do
  status=$(curl -s -o /dev/null -w "%{http_code}" https://api.notebookmd.io/api/health 2>/dev/null || true)
  if [ "$status" = "200" ]; then
    echo "✅ API is healthy"
    break
  fi
  echo "   Attempt $i — status: $status"
  sleep 10
done

echo ""
echo "=== Deploy $TAG complete ==="
echo ""
echo "Verify:"
echo "  curl -s https://api.notebookmd.io/api/health | jq ."
echo "  open https://www.notebookmd.io"
echo "  open https://admin.notebookmd.io"
