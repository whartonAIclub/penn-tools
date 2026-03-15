#!/usr/bin/env bash
# scripts/testAndRun.sh — run test.sh setup, then start the dev server
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Run setup/test first
bash "$SCRIPT_DIR/test.sh"

# Start the dev server
echo ""
echo -e "\033[0;36m▶ Starting dev server...\033[0m"
cd "$SCRIPT_DIR/.."
pnpm --filter @penntools/web dev
