#!/usr/bin/env bash
# Bump the version number across the entire monorepo.
# Usage: ./bump-version.sh <version>
# Example: ./bump-version.sh 0.3.0
set -euo pipefail

VERSION="${1:-}"
if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version>"
  echo "Example: $0 0.3.0"
  exit 1
fi

# Validate semver format (loose)
if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+'; then
  echo "Error: Version must be semver (e.g., 0.3.0)"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
echo "Bumping to v${VERSION}..."

# 1. Web package.json
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"${VERSION}\"/" "$ROOT/apps/web/package.json"
echo "  ✓ apps/web/package.json"

# 2. API package.json
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"${VERSION}\"/" "$ROOT/apps/api/package.json"
echo "  ✓ apps/api/package.json"

# 3. Desktop package.json
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"${VERSION}\"/" "$ROOT/apps/desktop/package.json"
echo "  ✓ apps/desktop/package.json"

# 4. Tauri config
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"${VERSION}\"/" "$ROOT/apps/desktop/src-tauri/tauri.conf.json"
echo "  ✓ apps/desktop/src-tauri/tauri.conf.json"

# 5. Cargo.toml
sed -i '' "s/^version = \"[^\"]*\"/version = \"${VERSION}\"/" "$ROOT/apps/desktop/src-tauri/Cargo.toml"
echo "  ✓ apps/desktop/src-tauri/Cargo.toml"

# 6. Update Cargo.lock
(cd "$ROOT/apps/desktop/src-tauri" && cargo update -p notebookmd-desktop 2>/dev/null || true)
echo "  ✓ Cargo.lock updated"

echo ""
echo "Done! All files bumped to v${VERSION}."
echo ""
echo "Next steps:"
echo "  git add -A && git commit -m 'Bump version to v${VERSION}'"
echo "  git tag v${VERSION}"
