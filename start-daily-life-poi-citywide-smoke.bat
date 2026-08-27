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
echo   Buju / Taipei-Maps - Citywide Canonical POI v0.1
echo   Issue #57 - fixed Taipei dataset smoke
echo ==========================================================
echo.
echo This page reads public/data/daily-life-poi/taipei-canonical-v01.geojson.
echo Panning and zooming must NOT change the citywide canonical count.
echo.
echo Keep this window open. Press Ctrl+C to stop the local server.
echo.
"%NODE_CMD%" tools\dev\serve_single_engine_core.mjs 5173 "/daily-life-poi-citywide-v01.html"
exit /b %errorlevel%
