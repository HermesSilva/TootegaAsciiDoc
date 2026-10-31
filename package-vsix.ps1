# Builds the .vsix package of the Tootega AsciiDoc extension.
# Usage: ./package-vsix.ps1 [-Out path.vsix]
#   1) typecheck (esbuild does not check types)
#   2) vsce package -> runs `vscode:prepublish` (production build) and packs
param(
  [string]$Out
)

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

Write-Host '==> Typecheck' -ForegroundColor Cyan
npm run typecheck
if ($LASTEXITCODE -ne 0) { throw 'Typecheck failed - aborting.' }

Write-Host '==> Bump version (patch)' -ForegroundColor Cyan
npm version patch --no-git-tag-version
if ($LASTEXITCODE -ne 0) { throw 'Version bump failed - aborting.' }

$pkg = Get-Content package.json -Raw | ConvertFrom-Json
if (-not $Out) { $Out = "$($pkg.name)-$($pkg.version).vsix" }

if (Test-Path dist) { Remove-Item dist -Recurse -Force }

# The Marketplace shows README images only from an HTTPS URL. They are pushed to the `assets` branch (never deleted,
# independent of any pull request) and the README inside the package points there.
Write-Host '==> Publish README media to the assets branch' -ForegroundColor Cyan
$imagesUrl = (node scripts/publish-readme-media.mjs | Select-Object -Last 1)
if ($LASTEXITCODE -ne 0 -or -not $imagesUrl) { throw 'Publishing the README media failed (network or git) - aborting: the package would ship broken images.' }

Write-Host "==> Packaging $Out" -ForegroundColor Cyan
$prev = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
npx --yes @vscode/vsce package --out $Out --baseImagesUrl $imagesUrl --baseContentUrl https://github.com/HermesSilva/TootegaAsciiDoc/blob/master
$code = $LASTEXITCODE
$ErrorActionPreference = $prev
if ($code -ne 0) { throw "vsce package failed (exit $code)." }

$full = Join-Path (Get-Location) $Out
Write-Host "OK -> $full" -ForegroundColor Green
