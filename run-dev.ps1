# run-dev.ps1 - runs the extension in VS Code WITHOUT installing it (Extension Development Host).
# Installs dependencies (if missing) -> builds -> opens VS Code loading the extension from source.
#
# Usage:
#   ./run-dev.ps1                          # opens a window on Docs/samples
#   ./run-dev.ps1 -OpenPath "C:\my\docs"   # opens the extension inside a folder
#   ./run-dev.ps1 -Watch                   # keeps the build in watch mode
#   ./run-dev.ps1 -Code code-insiders      # uses VS Code Insiders
param(
    [string]$OpenPath = "",
    [switch]$Watch,
    [string]$Code = "code"
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot

Write-Host "==> Tootega AsciiDoc - development mode" -ForegroundColor Cyan

$codeCmd = Get-Command $Code -ErrorAction SilentlyContinue
if (-not $codeCmd) {
    Write-Error "Command '$Code' not found in PATH. In VS Code run 'Shell Command: Install ''code'' command in PATH' or pass -Code."
    exit 1
}

if (-not (Test-Path (Join-Path $Root "TootegaWebUI\src"))) {
    Write-Error "Editor engine missing: clone https://github.com/Tootega/TootegaWebUI.git into $Root\TootegaWebUI"
    exit 1
}

if (-not (Test-Path (Join-Path $Root "node_modules"))) {
    Write-Host "==> Installing dependencies (npm install)..." -ForegroundColor Yellow
    Push-Location $Root
    npm install
    if ($LASTEXITCODE -ne 0) { Pop-Location; exit 1 }
    Pop-Location
}

Push-Location $Root
if ($Watch) {
    Write-Host "==> Build in watch mode (keep this window open)..." -ForegroundColor Yellow
    Start-Process -FilePath "npm" -ArgumentList "run", "watch" -WorkingDirectory $Root
    Start-Sleep -Seconds 4
} else {
    Write-Host "==> Building (npm run build)..." -ForegroundColor Yellow
    npm run build
    if ($LASTEXITCODE -ne 0) { Pop-Location; exit 1 }
}
Pop-Location

if ($OpenPath -eq "") { $OpenPath = Join-Path $Root "Docs\samples" }
$args = @("--extensionDevelopmentPath=$Root", "--new-window", $OpenPath)

Write-Host "==> Opening VS Code with the extension loaded..." -ForegroundColor Green
& $Code @args

Write-Host "Done. Open any .adoc file: it opens in the Tootega editor." -ForegroundColor Cyan
