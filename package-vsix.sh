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
echo "==> Publish README media to the assets branch"
IMAGES_URL=$(node scripts/publish-readme-media.mjs | tail -n 1)
[ -n "$IMAGES_URL" ] || { echo 'Publishing the README media failed - aborting'; exit 1; }
echo "==> Packaging $OUT"
npx --yes @vscode/vsce package --out "$OUT" --baseImagesUrl "$IMAGES_URL" --baseContentUrl https://github.com/HermesSilva/TootegaAsciiDoc/blob/master
echo "OK -> $(pwd)/$OUT"
