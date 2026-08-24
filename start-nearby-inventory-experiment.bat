@echo off
setlocal
cd /d "%~dp0"

echo ==========================================================
echo   Taipei-Maps - Nearby Inventory Research Prototype
echo   School / POI -> N meters -> 591 listings on OUR map
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

for %%F in (public\nearby-inventory-experiment.html tools\dev\serve_nearby_inventory_experiment.mjs tools\data\validate_nearby_inventory_experiment.mjs) do (
  if not exist %%F (
    echo [ERROR] Missing %%F
    echo Pull the latest feat/nearby-listing-links-experiment branch first.
    pause
    exit /b 1
  )
)

echo [1/3] Syntax-checking local research server...
"%NODE_CMD%" --check tools\dev\serve_nearby_inventory_experiment.mjs
if errorlevel 1 (
  echo.
  echo [ERROR] Server syntax validation failed.
  pause
  exit /b 1
)

echo.
echo [2/3] Validating product/research contracts...
"%NODE_CMD%" tools\data\validate_nearby_inventory_experiment.mjs
if errorlevel 1 (
  echo.
  echo [ERROR] Nearby inventory experiment validation failed.
  pause
  exit /b 1
)

echo.
echo [3/3] Opening nearby inventory research prototype...
echo.
echo Test flow:
echo   1. Click a school point or any Taipei map location.
echo   2. Wait for orange 591 listing pins/cards to appear on THIS map.
echo   3. Try 250m / 500m / 1km / 1.5km.
echo   4. Click an orange listing pin/card; only then open original 591 detail.
echo   5. Watch this window for lines like:
echo        [591] candidates=60 geolocated=... within=... cache=...
echo.
echo IMPORTANT: local research sample only - max 60 district candidates.
echo No CAPTCHA / Cloudflare bypass is implemented.
echo Keep this window open. Press Ctrl+C to stop.
echo.
"%NODE_CMD%" tools\dev\serve_nearby_inventory_experiment.mjs 5173

if errorlevel 1 (
  echo.
  echo [ERROR] local research server stopped with an error.
  pause
  exit /b 1
)

endlocal
