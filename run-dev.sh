#!/usr/bin/env bash
# run-dev.sh - runs the extension in VS Code WITHOUT installing it (Extension Development Host).
# Installs dependencies (if missing) -> builds -> opens VS Code loading the extension from source.
#
# Usage:
#   ./run-dev.sh                       # opens a window on Docs/samples
#   ./run-dev.sh /my/docs              # opens the extension inside a folder
#   ./run-dev.sh --watch               # keeps the build in watch mode
#   ./run-dev.sh --code code-insiders  # uses VS Code Insiders
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPEN_PATH=""
WATCH=0
CODE="code"

while [ $# -gt 0 ]; do
  case "$1" in
    --watch) WATCH=1 ;;
    --code) shift; CODE="$1" ;;
    *) OPEN_PATH="$1" ;;
  esac
  shift
done

echo "==> Tootega AsciiDoc - development mode"
command -v "$CODE" >/dev/null 2>&1 || { echo "Command '$CODE' not found in PATH." >&2; exit 1; }
[ -d "$ROOT/TootegaWebUI/src" ] || { echo "Editor engine missing: clone https://github.com/Tootega/TootegaWebUI.git into $ROOT/TootegaWebUI" >&2; exit 1; }

if [ ! -d "$ROOT/node_modules" ]; then
  echo "==> Installing dependencies (npm install)..."
  (cd "$ROOT" && npm install)
fi

if [ "$WATCH" = "1" ]; then
  echo "==> Build in watch mode (background)..."
  (cd "$ROOT" && npm run watch &)
  sleep 4
else
  echo "==> Building (npm run build)..."
  (cd "$ROOT" && npm run build)
fi

[ -n "$OPEN_PATH" ] || OPEN_PATH="$ROOT/Docs/samples"
echo "==> Opening VS Code with the extension loaded..."
"$CODE" --extensionDevelopmentPath="$ROOT" --new-window "$OPEN_PATH"
echo "Done. Open any .adoc file: it opens in the Tootega editor."
