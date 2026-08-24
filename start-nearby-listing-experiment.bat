@echo off
setlocal
cd /d "%~dp0"

echo ==========================================================
echo   Taipei-Maps - Nearby listing links experiment
echo   Click map -> adjustable radius -> external listing links
echo ==========================================================
echo.

set "NODE_CMD="
for /f "delims=" %%I in ('where node 2^>nul') do if not defined NODE_CMD set "NODE_CMD=%%I"
if not defined NODE_CMD if exist .cache\node22\node-path.txt set /p NODE_CMD=<.cache\node22\node-path.txt

if not defined NODE_CMD (
  echo [ERROR] Node.js runtime was not found.
  echo Run build-taipei-building-height-pmtiles-citywide.bat once, or install Node.js.
  echo.
  pause
  exit /b 1
)
if not exist "%NODE_CMD%" (
  echo [ERROR] Node.js executable is missing: %NODE_CMD%
  pause
  exit /b 1
)

if not exist public\nearby-listing-experiment.html (
  echo [ERROR] Experiment page is missing from this checkout.
  echo Make sure you are on feat/nearby-listing-links-experiment and pull latest.
  echo.
  pause
  exit /b 1
)

echo [1/2] Validating experiment page and handoff contracts...
"%NODE_CMD%" tools\data\validate_nearby_listing_experiment.mjs
if errorlevel 1 (
  echo.
  echo [ERROR] Nearby-listing experiment validation failed.
  pause
  exit /b 1
)

echo.
echo [2/2] Opening product experiment...
echo.
echo Test flow:
echo   1. pick elementary or junior school catchment
echo   2. click any map point
echo   3. adjust radius 100-2000m
echo   4. open Sinyi handoff and confirm same center
echo   5. 591 is intentionally marked approximate/manual in v0
echo.
echo Keep this window open. Press Ctrl+C to stop the local server.
echo.
"%NODE_CMD%" tools\dev\serve_single_engine_core.mjs 5173 "/nearby-listing-experiment.html"

if errorlevel 1 (
  echo.
  echo [ERROR] local server stopped with an error.
  pause
  exit /b 1
)

endlocal
