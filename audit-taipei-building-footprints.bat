@echo off
setlocal
cd /d "%~dp0"

echo Taipei-Maps Issue #31 - z16 footprint identity audit
echo This does NOT re-download the Taipei WFS and does NOT replace the production PMTiles.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found.
  pause
  exit /b 1
)

if not exist public\generated\taipei_building_height_citywide.geojson (
  echo [ERROR] Existing citywide GeoJSON was not found.
  echo Run build-taipei-building-height-pmtiles-citywide.bat first.
  pause
  exit /b 1
)

if not exist .cache\temurin21\java-path.txt (
  echo [ERROR] Portable Java 21 cache was not found.
  echo Run build-taipei-building-height-pmtiles-citywide.bat once to prepare the tool cache.
  pause
  exit /b 1
)

if not exist .cache\planetiler\planetiler.jar (
  echo [ERROR] Planetiler cache was not found.
  echo Run build-taipei-building-height-pmtiles-citywide.bat once to prepare the tool cache.
  pause
  exit /b 1
)

set "JAVA_CMD="
set /p JAVA_CMD=<.cache\temurin21\java-path.txt
if not defined JAVA_CMD (
  echo [ERROR] Portable Java path cache is empty.
  pause
  exit /b 1
)
if not exist "%JAVA_CMD%" (
  echo [ERROR] Portable Java executable is missing: %JAVA_CMD%
  pause
  exit /b 1
)

echo [1/3] Preparing source-ID audit GeoJSON from the existing 130 MiB citywide source...
node --max-old-space-size=2048 tools\data\prepare_taipei_building_height_footprint_audit.mjs
if errorlevel 1 (
  echo.
  echo [ERROR] Audit source preparation failed.
  pause
  exit /b 1
)

echo.
echo [2/3] Building a z16-only source-ID audit PMTiles archive...
"%JAVA_CMD%" -Xmx2g -jar .cache\planetiler\planetiler.jar generate-custom --schema=tools\data\taipei_building_height_footprint_audit_pmtiles.yml --output=public\generated\taipei_building_height_footprint_audit.pmtiles --minzoom=16 --maxzoom=16 --render_maxzoom=16 --min_feature_size=0 --min_feature_size_at_max_zoom=0 --simplify_tolerance=0 --simplify_tolerance_at_max_zoom=0 --force
if errorlevel 1 (
  echo.
  echo [ERROR] Audit PMTiles build failed.
  pause
  exit /b 1
)

echo.
echo [3/3] Launching browser identity audit on port 5174...
echo The page will scan every candidate z16 tile and report unique source-ID retention.
echo Keep this window open until the browser audit finishes.
echo.
node tools\dev\serve_single_engine_core.mjs 5174 /taipei-building-footprint-audit.html

if errorlevel 1 (
  echo.
  echo [ERROR] Audit server stopped with an error.
  pause
  exit /b 1
)

endlocal
