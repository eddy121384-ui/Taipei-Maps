@echo off
setlocal
cd /d "%~dp0"

echo ==========================================================
echo   Taipei-Maps - Desktop full-stack smoke test
echo   Flat 2D + full overlays + Location Summary + Inventory UX
echo ==========================================================
echo.

set "NODE_CMD="
for /f "delims=" %%I in ('where node 2^>nul') do if not defined NODE_CMD set "NODE_CMD=%%I"
if not defined NODE_CMD if exist .cache\node22\node-path.txt set /p NODE_CMD=<.cache\node22\node-path.txt

if not defined NODE_CMD (
  echo [ERROR] Node.js runtime was not found.
  echo Run build-taipei-building-height-pmtiles-citywide.bat first.
  echo.
  pause
  exit /b 1
)
if not exist "%NODE_CMD%" (
  echo [ERROR] Cached Node.js executable is missing: %NODE_CMD%
  echo Run build-taipei-building-height-pmtiles-citywide.bat again.
  echo.
  pause
  exit /b 1
)

if not exist public\generated\taipei_building_height_citywide.pmtiles (
  echo [ERROR] Citywide Taipei PMTiles is missing.
  echo Run build-taipei-building-height-pmtiles-citywide.bat first.
  echo.
  pause
  exit /b 1
)

echo [1/15] Preparing Taipei healthcare cache...
"%NODE_CMD%" tools\data\build_taipei_healthcare.mjs --if-missing
if errorlevel 1 goto :fail

echo.
echo [2/15] Preparing Taipei official MRT line cache...
"%NODE_CMD%" tools\data\build_taipei_mrt_official.mjs --if-missing
if errorlevel 1 goto :fail

echo.
echo [3/15] Preparing Taipei official MRT station cache...
"%NODE_CMD%" tools\data\build_taipei_mrt_stations_official.mjs --if-missing
if errorlevel 1 goto :fail

echo.
echo [4/15] Preparing North Taiwan urban rail cache...
"%NODE_CMD%" tools\data\build_north_taiwan_urban_rail.mjs --if-missing
if errorlevel 1 goto :fail

echo.
echo [5/15] Preparing Taiwan intercity rail cache...
"%NODE_CMD%" tools\data\build_taiwan_intercity_rail.mjs --if-missing
if errorlevel 1 goto :fail

echo.
echo [6/15] Validating healthcare + shared-core integration...
"%NODE_CMD%" tools\data\validate_healthcare_layer.mjs
if errorlevel 1 goto :fail

echo.
echo [7/15] Validating transit data + rendering contract...
"%NODE_CMD%" tools\data\validate_transit_layer.mjs
if errorlevel 1 goto :fail

echo.
echo [8/15] Validating committed Taipei 115 school-district runtime...
"%NODE_CMD%" tools\data\validate_taipei_school_districts.mjs
if errorlevel 1 goto :fail

echo.
echo [9/15] Validating school-layer pagination and viewport caches...
"%NODE_CMD%" tools\data\validate_school_layer_performance.mjs
if errorlevel 1 goto :fail

echo.
echo [10/15] Running Location Summary synthetic regression...
"%NODE_CMD%" tools\dev\test_buju_location_summary_v01.mjs
if errorlevel 1 goto :fail

echo.
echo [11/15] Running school point-resolver regression...
"%NODE_CMD%" tools\dev\test_buju_school_district_resolver_v01.mjs
if errorlevel 1 goto :fail

echo.
echo [12/15] Validating accepted POI baseline + Location Summary sources...
"%NODE_CMD%" tools\data\validate_place_metrics_v01.mjs
if errorlevel 1 goto :fail
"%NODE_CMD%" tools\data\validate_location_summary_sources_v01.mjs
if errorlevel 1 goto :fail

echo.
echo [13/15] Validating desktop Location Summary integration contract...
"%NODE_CMD%" tools\dev\test_location_summary_desktop_integration_v01.mjs
if errorlevel 1 goto :fail

echo.
echo [14/15] Validating School District Inventory prototype semantics...
"%NODE_CMD%" tools\dev\test_school_inventory_prototype_v01.mjs
if errorlevel 1 goto :fail

echo.
echo [15/15] Opening desktop full-stack validation page...
echo.
echo Smoke checklist:
echo   - initial view: OSM map, top-down north-up, 3D OFF, Terrain OFF
echo   - Local PMTiles remains ON and renders flat building footprints
echo   - turn 3D ON and Terrain ON/OFF: existing map controls still work
echo   - school: switch Elementary / Junior and click catchment popup
echo   - healthcare + transit overlays remain visible and usable
echo   - map / aerial toggle and north-up N control remain normal
echo   - Location Summary: initial button reads OFF and right panel is hidden
echo   - Location Summary: turn ON, click a Taipei point, right panel shows daily-life / MRT / healthcare / school
echo   - Inventory: initial button reads OFF; turn ON and verify the right-side inventory panel appears
echo   - Inventory / 金華: verified count is 3; 大安MONEY is clearly labelled as a shared/common catchment
echo   - Inventory / 中正: verified count is 1; 中正名門 is NOT counted by default
echo   - Inventory debug: enable mismatch and confirm 中正名門 appears as mismatch with official 弘道
echo   - Inventory pin/card: asking price, area/layout, official school truth and source handoff are visible
echo   - Location Summary and Inventory panels are mutually exclusive
echo   - Location Summary: click outside Taipei and verify explicit unsupported message, never fake Taipei nearest results
echo   - Banqiao: Taipei healthcare disappears while base map / transit remain normal
echo   - Shanghai / Tokyo: NEVER black-screen; no Taipei-only healthcare leaks overseas
echo.
echo Keep this window open. Press Ctrl+C to stop the local server.
echo.
"%NODE_CMD%" tools\dev\serve_single_engine_core.mjs 5173 "/maplibre-pmtiles-provider-spike.html?mode=citywide"

if errorlevel 1 goto :fail
endlocal
exit /b 0

:fail
echo.
echo [ERROR] Desktop full-stack smoke preparation/validation failed.
pause
exit /b 1
