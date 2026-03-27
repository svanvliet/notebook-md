#!/usr/bin/env bash
#
# build-desktop.sh — Build a signed + notarized Notebook.md desktop app
#
# Usage:
#   ./scripts/build-desktop.sh           Build signed + notarized .app and .dmg
#   ./scripts/build-desktop.sh --skip-notarize  Build signed only (faster, no Apple upload)
#
# Prerequisites:
#   - Apple Developer ID certificate imported in Keychain
#   - Certificate files in ~/certs/apple-developer/
#   - Rust toolchain installed
#   - npm dependencies installed
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CERT_DIR="$HOME/certs/apple-developer"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

# ── Validate prerequisites ──────────────────────────────────────────

if [[ ! -d "$CERT_DIR" ]]; then
  echo -e "${RED}Certificate directory not found: $CERT_DIR${NC}"
  echo "Expected files: app-specific-password.txt, p12-password.txt"
  exit 1
fi

if [[ ! -f "$CERT_DIR/app-specific-password.txt" ]]; then
  echo -e "${RED}Missing: $CERT_DIR/app-specific-password.txt${NC}"
  exit 1
fi

# Check that the signing identity is in the Keychain
IDENTITY="Developer ID Application: Scott Van Vliet (97379Y67S5)"
if ! security find-identity -v -p codesigning 2>/dev/null | grep -q "97379Y67S5"; then
  echo -e "${YELLOW}Signing identity not found in Keychain. Importing certificate...${NC}"
  if [[ ! -f "$CERT_DIR/dev_id.p12" ]]; then
    echo -e "${RED}Missing: $CERT_DIR/dev_id.p12${NC}"
    exit 1
  fi
  P12_PASS="$(cat "$CERT_DIR/p12-password.txt")"
  security import "$CERT_DIR/dev_id.p12" \
    -k ~/Library/Keychains/login.keychain-db \
    -P "$P12_PASS" \
    -T /usr/bin/codesign \
    -T /usr/bin/productbuild
  # Install Apple WWDR intermediate certificate if needed
  curl -sL "https://www.apple.com/certificateauthority/DeveloperIDG2CA.cer" -o /tmp/DeveloperIDG2CA.cer
  security import /tmp/DeveloperIDG2CA.cer -k ~/Library/Keychains/login.keychain-db 2>/dev/null || true
  rm -f /tmp/DeveloperIDG2CA.cer
  echo -e "${GREEN}Certificate imported.${NC}"
fi

# ── Set signing environment variables ────────────────────────────────

export APPLE_SIGNING_IDENTITY="$IDENTITY"
export APPLE_TEAM_ID="97379Y67S5"
export APPLE_ID="svanvliet@gmail.com"
export APPLE_PASSWORD="$(cat "$CERT_DIR/app-specific-password.txt")"

# Tauri updater signing key (signs .tar.gz for auto-updates)
TAURI_KEY_DIR="$HOME/certs/tauri"
if [[ -f "$TAURI_KEY_DIR/notebook-md.key" ]]; then
  export TAURI_SIGNING_PRIVATE_KEY_PATH="$TAURI_KEY_DIR/notebook-md.key"
  export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
else
  echo -e "${YELLOW}Warning: Tauri updater signing key not found at $TAURI_KEY_DIR/notebook-md.key${NC}"
  echo -e "${YELLOW}Update artifacts will not be signed.${NC}"
fi

# ── Parse arguments ──────────────────────────────────────────────────

TAURI_ARGS=""
if [[ "${1:-}" == "--skip-notarize" ]]; then
  echo -e "${YELLOW}Skipping notarization (--skip-notarize)${NC}"
  unset APPLE_ID
  unset APPLE_PASSWORD
fi

# ── Build ────────────────────────────────────────────────────────────

cd "$ROOT_DIR"

echo -e "${BOLD}Building web frontend...${NC}"
cd apps/web && npx vite build && cd "$ROOT_DIR"

echo ""
echo -e "${BOLD}Building Tauri desktop app (signed)...${NC}"
npm -w apps/desktop run build $TAURI_ARGS

# ── Output summary ───────────────────────────────────────────────────

VERSION=$(grep '"version"' apps/desktop/src-tauri/tauri.conf.json | head -1 | sed 's/.*"\([0-9.]*\)".*/\1/')
BUNDLE_DIR="apps/desktop/src-tauri/target/release/bundle"

echo ""
echo -e "${GREEN}${BOLD}✅ Build complete!${NC}"
echo ""
echo "  App:     $BUNDLE_DIR/macos/Notebook.md.app"
echo "  DMG:     $BUNDLE_DIR/dmg/Notebook.md_${VERSION}_aarch64.dmg"
if [[ -f "$BUNDLE_DIR/macos/Notebook.md.app.tar.gz" ]]; then
  echo "  Update:  $BUNDLE_DIR/macos/Notebook.md.app.tar.gz"
  echo "  Sig:     $BUNDLE_DIR/macos/Notebook.md.app.tar.gz.sig"
fi
echo ""
