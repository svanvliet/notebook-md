#!/usr/bin/env bash
#
# Manual rollback script — revert container apps to a previous image tag.
#
# Usage:
#   ./scripts/manual-rollback.sh <tag> [service...]
#
# Examples:
#   ./scripts/manual-rollback.sh latest                    # Rollback ALL to :latest
#   ./scripts/manual-rollback.sh latest api web            # Rollback only api and web
#   ./scripts/manual-rollback.sh 0.1.14-f8e3865 api        # Rollback api to specific tag
#
# To find what's currently deployed:
#   az containerapp show --name ca-notebookmd-api -g rg-notebookmd-prod \
#     --query "properties.template.containers[0].image" -o tsv
#
set -euo pipefail

# Ensure Docker Desktop CLI is on PATH (macOS)
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"

# Run from repo root
cd "$(dirname "$0")/.."

TAG="${1:?Usage: $0 <tag> [api|web|admin|collab...]}"
shift
SERVICES=("${@:-api web admin collab}")
if [ ${#SERVICES[@]} -eq 0 ]; then
  SERVICES=(api web admin collab)
fi

ACR="crnotebookmdprod.azurecr.io"
RG="rg-notebookmd-prod"

echo "=== Rolling back to :$TAG ==="
echo "   Services: ${SERVICES[*]}"
echo ""

# Show current state first
echo "📋 Current images:"
for svc in "${SERVICES[@]}"; do
  current=$(az containerapp show --name "ca-notebookmd-$svc" -g "$RG" \
    --query "properties.template.containers[0].image" -o tsv 2>/dev/null || echo "unknown")
  echo "   $svc: $current"
done
echo ""

read -p "Proceed with rollback? (y/N) " confirm
if [[ "$confirm" != [yY] ]]; then
  echo "Aborted."
  exit 0
fi

for svc in "${SERVICES[@]}"; do
  echo "⏪ Rolling back $svc → $ACR/$svc:$TAG"
  az containerapp update \
    --name "ca-notebookmd-$svc" \
    --resource-group "$RG" \
    --image "$ACR/$svc:$TAG"
done

echo ""
echo "🏥 Checking API health..."
for i in $(seq 1 20); do
  status=$(curl -s -o /dev/null -w "%{http_code}" https://api.notebookmd.io/api/health 2>/dev/null || true)
  if [ "$status" = "200" ]; then
    echo "✅ API is healthy"
    break
  fi
  echo "   Attempt $i — status: $status"
  sleep 10
done

echo ""
echo "=== Rollback complete ==="
