@echo off
setlocal
cd /d "%~dp0"

echo ==============================================
echo   Taipei-Maps lightweight NLSC I3S probe
echo ==============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found.
  echo Please install Node.js first.
  pause
  exit /b 1
)

echo Starting lightweight browser probe...
echo No Vite, npm install, or dependency bundling is used.
echo.
node tools\data\serve_nlsc_probe.mjs

if errorlevel 1 (
  echo.
  echo [ERROR] Lightweight probe failed to start.
  pause
)

endlocal
