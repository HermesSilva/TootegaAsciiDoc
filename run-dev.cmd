@echo off
REM run-dev.cmd - runs the extension in VS Code WITHOUT installing it (wrapper of run-dev.ps1).
REM Usage: run-dev.cmd [optional folder to open]
if "%~1"=="" (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-dev.ps1"
) else (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-dev.ps1" -OpenPath "%~1"
)
