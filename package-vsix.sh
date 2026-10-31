#!/usr/bin/env bash
# Builds the .vsix package of the Tootega AsciiDoc extension (Linux/macOS).
# Usage: ./package-vsix.sh [out.vsix]
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

echo "==> Typecheck"
npm run typecheck

echo "==> Bump version (patch)"
npm version patch --no-git-tag-version

NAME=$(node -p "require('./package.json').name")
VERSION=$(node -p "require('./package.json').version")
OUT="${1:-$NAME-$VERSION.vsix}"

rm -rf dist
echo "==> Packaging $OUT"
npx --yes @vscode/vsce package --out "$OUT"
echo "OK -> $(pwd)/$OUT"
