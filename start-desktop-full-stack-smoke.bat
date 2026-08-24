@echo off
setlocal
cd /d "%~dp0"

echo ==========================================================
echo   Taipei-Maps - Desktop full-stack smoke test
echo   Map + aerial + Overture + Taipei PMTiles + terrain + school + rail
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

echo [1/4] Validating committed Taipei 115 school-district runtime...
"%NODE_CMD%" tools\data\validate_taipei_school_districts.mjs
if errorlevel 1 (
  echo.
  echo [ERROR] School-district runtime validation failed.
  pause
  exit /b 1
)

echo.
echo [2/4] Validating school-layer pagination and viewport caches...
"%NODE_CMD%" tools\data\validate_school_layer_performance.mjs
if errorlevel 1 (
  echo.
  echo [ERROR] School-layer performance regression validation failed.
  pause
  exit /b 1
)

echo.
echo [3/4] Validating shared MRT / TRA / THSR rail overlay contract...
"%NODE_CMD%" tools\data\validate_transit_layer.mjs
if errorlevel 1 (
  echo.
  echo [ERROR] Rail transit overlay validation failed.
  pause
  exit /b 1
)

echo.
echo [4/4] Opening desktop full-stack validation page...
echo.
echo Smoke checklist:
echo   - Daan / Xinyi: Local PMTiles + 3D + Terrain + school ON
echo   - rail overlay appears automatically in Taiwan; top-right subway button toggles it
 echo   - blue = MRT / metro, green = TRA, orange = THSR
 echo   - switch Elementary / Junior and click catchment popup
echo   - pan around the same district: school status should show cache hits
echo   - normal zoom should not show dense neighbor-grid lines; they appear only when zoomed close
echo   - Neihu / Beitou / Yangmingshan / Wenshan
echo   - map / aerial toggle
echo   - Banqiao should still show Taiwan rail overlay
echo   - Shanghai / Tokyo: Taiwan rail overlay hides automatically; NEVER black-screen
echo.
echo Keep this window open. Press Ctrl+C to stop the local server.
echo.
"%NODE_CMD%" tools\dev\serve_single_engine_core.mjs 5173 "/maplibre-pmtiles-provider-spike.html?mode=citywide"

if errorlevel 1 (
  echo.
  echo [ERROR] local server stopped with an error.
  pause
  exit /b 1
)

endlocal