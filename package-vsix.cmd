@echo off
REM package-vsix.cmd - builds the .vsix (wrapper of package-vsix.ps1).
pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0package-vsix.ps1" %*
