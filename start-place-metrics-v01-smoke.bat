@echo off
setlocal
cd /d "%~dp0"

set "NODE_CMD="
for /f "delims=" %%I in ('where node 2^>nul') do if not defined NODE_CMD set "NODE_CMD=%%I"
if not defined NODE_CMD if exist .cache\node22\node-path.txt set /p NODE_CMD=<.cache\node22\node-path.txt

if not defined NODE_CMD (
  echo [ERROR] Node.js runtime was not found.
  pause
  exit /b 1
)

echo ==========================================================
echo   Buju / Taipei-Maps - Place Metrics v0.1
echo   Issue #63 - Daily-life accessibility

echo ==========================================================
echo.
echo Click any location on the Taipei map to calculate:
echo   - nearest convenience store

echo   - convenience stores within 500m

echo   - nearest supermarket

echo   - supermarkets within 800m

echo.
echo Distances are great-circle geographic distances, not walking routes.
echo Keep this window open. Press Ctrl+C to stop the local server.
echo.
"%NODE_CMD%" tools\dev\serve_single_engine_core.mjs 5173 "/place-metrics-v01.html"
exit /b %errorlevel%
