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

Write-Host "==> Packaging $Out" -ForegroundColor Cyan
$prev = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
npx --yes @vscode/vsce package --out $Out
$code = $LASTEXITCODE
$ErrorActionPreference = $prev
if ($code -ne 0) { throw "vsce package failed (exit $code)." }

$full = Join-Path (Get-Location) $Out
Write-Host "OK -> $full" -ForegroundColor Green
