#!/usr/bin/env bash
#
# release-desktop.sh — Build, sign, and publish a desktop release to GitHub
#
# Usage:
#   ./scripts/release-desktop.sh <version>
#
# Example:
#   ./scripts/release-desktop.sh 0.2.0
#
# This script:
#   1. Bumps version in tauri.conf.json, package.json, Cargo.toml
#   2. Commits the version bump
#   3. Runs build-desktop.sh (signed + notarized)
#   4. Generates latest.json from build artifacts
#   5. Tags, pushes, and creates a GitHub Release with all artifacts
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

if [[ $# -lt 1 ]]; then
  echo "Usage: ./scripts/release-desktop.sh <version>"
  echo "Example: ./scripts/release-desktop.sh 0.2.0"
  exit 1
fi

VERSION="$1"
TAG="desktop-v${VERSION}"
BUNDLE_DIR="$ROOT_DIR/apps/desktop/src-tauri/target/release/bundle"

echo -e "${BOLD}🚀 Releasing Notebook.md Desktop v${VERSION}${NC}"
echo ""

# ── 1. Bump version ──────────────────────────────────────────────────

echo -e "${YELLOW}Bumping version to ${VERSION}...${NC}"

cd "$ROOT_DIR"

# tauri.conf.json
sed -i '' "s/\"version\": \"[0-9.]*\"/\"version\": \"${VERSION}\"/" apps/desktop/src-tauri/tauri.conf.json

# package.json
sed -i '' "s/\"version\": \"[0-9.]*\"/\"version\": \"${VERSION}\"/" apps/desktop/package.json

# Cargo.toml
sed -i '' "s/^version = \"[0-9.]*\"/version = \"${VERSION}\"/" apps/desktop/src-tauri/Cargo.toml

git add -A
git commit -m "Bump desktop version to ${VERSION}

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"

# ── 2. Build ─────────────────────────────────────────────────────────

echo ""
"$SCRIPT_DIR/build-desktop.sh"

# ── 3. Generate latest.json ──────────────────────────────────────────

echo -e "${YELLOW}Generating latest.json...${NC}"

TAR_GZ="$BUNDLE_DIR/macos/Notebook.md.app.tar.gz"
SIG_FILE="$BUNDLE_DIR/macos/Notebook.md.app.tar.gz.sig"

if [[ ! -f "$TAR_GZ" ]] || [[ ! -f "$SIG_FILE" ]]; then
  echo -e "${RED}Update artifacts not found. Is TAURI_SIGNING_PRIVATE_KEY_PATH set?${NC}"
  echo "  Expected: $TAR_GZ"
  echo "  Expected: $SIG_FILE"
  exit 1
fi

SIGNATURE=$(cat "$SIG_FILE")
PUB_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

cat > "$BUNDLE_DIR/latest.json" << ENDJSON
{
  "version": "${VERSION}",
  "notes": "Notebook.md Desktop v${VERSION}",
  "pub_date": "${PUB_DATE}",
  "platforms": {
    "darwin-aarch64": {
      "signature": "${SIGNATURE}",
      "url": "https://github.com/svanvliet/notebook-md/releases/download/${TAG}/Notebook.md.app.tar.gz"
    }
  }
}
ENDJSON

echo -e "${GREEN}Generated latest.json${NC}"

# ── 4. Tag and push ──────────────────────────────────────────────────

echo -e "${YELLOW}Pushing to origin...${NC}"
git push origin main

git tag "$TAG" -m "Desktop v${VERSION}"
git push origin "$TAG"

# ── 5. Create GitHub Release ─────────────────────────────────────────

echo -e "${YELLOW}Creating GitHub Release...${NC}"

DMG=$(find "$BUNDLE_DIR/dmg" -name "*.dmg" | head -1)

gh auth switch --user svanvliet 2>/dev/null || true

gh release create "$TAG" \
  "$DMG" \
  "$TAR_GZ" \
  "$SIG_FILE" \
  "$BUNDLE_DIR/latest.json" \
  --title "Notebook.md Desktop v${VERSION}" \
  --generate-release-notes \
  --latest

gh auth switch --user svanvliet_green 2>/dev/null || true

echo ""
echo -e "${GREEN}${BOLD}✅ Released Notebook.md Desktop v${VERSION}${NC}"
echo "   https://github.com/svanvliet/notebook-md/releases/tag/${TAG}"
echo ""
