@echo off
setlocal
cd /d "%~dp0"

echo ==========================================================
echo   Taipei-Maps - Desktop full-stack smoke test
echo   Map + 3D + schools + transit + healthcare
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

echo [1/10] Preparing Taipei healthcare cache...
"%NODE_CMD%" tools\data\build_taipei_healthcare.mjs --if-missing
if errorlevel 1 goto :fail

echo.
echo [2/10] Preparing Taipei official MRT line cache...
"%NODE_CMD%" tools\data\build_taipei_mrt_official.mjs --if-missing
if errorlevel 1 goto :fail

echo.
echo [3/10] Preparing Taipei official MRT station cache...
"%NODE_CMD%" tools\data\build_taipei_mrt_stations_official.mjs --if-missing
if errorlevel 1 goto :fail

echo.
echo [4/10] Preparing North Taiwan urban rail cache...
"%NODE_CMD%" tools\data\build_north_taiwan_urban_rail.mjs --if-missing
if errorlevel 1 goto :fail

echo.
echo [5/10] Preparing Taiwan intercity rail cache...
"%NODE_CMD%" tools\data\build_taiwan_intercity_rail.mjs --if-missing
if errorlevel 1 goto :fail

echo.
echo [6/10] Validating healthcare + shared-core integration...
"%NODE_CMD%" tools\data\validate_healthcare_layer.mjs
if errorlevel 1 goto :fail

echo.
echo [7/10] Validating transit data + rendering contract...
"%NODE_CMD%" tools\data\validate_transit_layer.mjs
if errorlevel 1 goto :fail

echo.
echo [8/10] Validating committed Taipei 115 school-district runtime...
"%NODE_CMD%" tools\data\validate_taipei_school_districts.mjs
if errorlevel 1 goto :fail

echo.
echo [9/10] Validating school-layer pagination and viewport caches...
"%NODE_CMD%" tools\data\validate_school_layer_performance.mjs
if errorlevel 1 goto :fail

echo.
echo [10/10] Opening desktop full-stack validation page...
echo.
echo Smoke checklist:
echo   - Daan / Xinyi: Local PMTiles + 3D + Terrain + school ON
echo   - school: switch Elementary / Junior and click catchment popup
echo   - school: pan around same district; status should show cache hits
echo   - healthcare: red hospital-campus points + teal clinic points appear in Taipei
echo   - healthcare: red + control toggles all hospital/clinic points and labels
echo   - healthcare: Heping/Fuyou and Tri-Service physical-campus splits remain present
echo   - transit: Taipei MRT official colors + station names remain correct
echo   - transit: V/K/LB/A route colors + station names remain correct
echo   - transit: TRA blue short dashes / THSR orange longer dashes remain distinct
echo   - map / aerial toggle and north-up N control remain normal
echo   - Neihu / Beitou / Yangmingshan / Wenshan remain normal
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
