#!/usr/bin/env bash
# Swap desktop icons between production and dev sets.
# Usage: ./swap-icons.sh dev   — copies icons-dev/* → icons/
#        ./swap-icons.sh prod  — copies icons-prod/* → icons/  (restores originals)
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ICONS_DIR="$SCRIPT_DIR/../apps/desktop/src-tauri/icons"
DEV_DIR="$SCRIPT_DIR/../apps/desktop/src-tauri/icons-dev"

case "${1:-}" in
  dev)
    echo "Swapping to DEV icons…"
    cp "$DEV_DIR"/32x32.png "$DEV_DIR"/64x64.png "$DEV_DIR"/128x128.png \
       "$DEV_DIR"/128x128@2x.png "$DEV_DIR"/icon.png \
       "$DEV_DIR"/icon.icns "$DEV_DIR"/icon.ico \
       "$ICONS_DIR/"
    echo "Done — dev icons active."
    ;;
  prod)
    echo "Restoring PRODUCTION icons…"
    echo "Run: git checkout apps/desktop/src-tauri/icons/"
    git -C "$SCRIPT_DIR/.." checkout -- apps/desktop/src-tauri/icons/
    echo "Done — production icons restored."
    ;;
  *)
    echo "Usage: $0 {dev|prod}"
    exit 1
    ;;
esac
