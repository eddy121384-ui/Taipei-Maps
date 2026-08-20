@echo off
setlocal
cd /d "%~dp0"

echo Taipei-Maps Issue #31 - z16 footprint identity scale sweep
echo Memory-safe mode: centroid / 1x / 2x / 4x are built as four separate archives with 4 Planetiler threads.
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

echo [1/6] Preparing source-ID audit GeoJSONs plus footprint-size metrics...
node --max-old-space-size=2048 tools\data\prepare_taipei_building_height_footprint_audit.mjs
if errorlevel 1 goto :audit_error

echo.
echo [2/6] Building centroid-only z16 control archive...
"%JAVA_CMD%" -Xmx2g -jar .cache\planetiler\planetiler.jar generate-custom --schema=tools\data\taipei_building_height_footprint_audit_centroid_pmtiles.yml --output=public\generated\taipei_building_height_footprint_audit_centroid.pmtiles --minzoom=16 --maxzoom=16 --render_maxzoom=16 --threads=4 --force
if errorlevel 1 goto :audit_error

echo.
echo [3/6] Building original 1x polygon z16 archive...
"%JAVA_CMD%" -Xmx2g -jar .cache\planetiler\planetiler.jar generate-custom --schema=tools\data\taipei_building_height_footprint_audit_pmtiles.yml --taipei_buildings_audit_path=public\generated\taipei_building_height_footprint_audit.geojson --output=public\generated\taipei_building_height_footprint_audit_1x.pmtiles --minzoom=16 --maxzoom=16 --render_maxzoom=16 --threads=4 --min_feature_size=0 --min_feature_size_at_max_zoom=0 --simplify_tolerance=0 --simplify_tolerance_at_max_zoom=0 --force
if errorlevel 1 goto :audit_error

echo.
echo [4/6] Building 2x polygon z16 archive...
"%JAVA_CMD%" -Xmx2g -jar .cache\planetiler\planetiler.jar generate-custom --schema=tools\data\taipei_building_height_footprint_audit_pmtiles.yml --taipei_buildings_audit_path=public\generated\taipei_building_height_footprint_audit_x2.geojson --output=public\generated\taipei_building_height_footprint_audit_2x.pmtiles --minzoom=16 --maxzoom=16 --render_maxzoom=16 --threads=4 --min_feature_size=0 --min_feature_size_at_max_zoom=0 --simplify_tolerance=0 --simplify_tolerance_at_max_zoom=0 --force
if errorlevel 1 goto :audit_error

echo.
echo [5/6] Building 4x polygon z16 archive...
"%JAVA_CMD%" -Xmx2g -jar .cache\planetiler\planetiler.jar generate-custom --schema=tools\data\taipei_building_height_footprint_audit_pmtiles.yml --taipei_buildings_audit_path=public\generated\taipei_building_height_footprint_audit_x4.geojson --output=public\generated\taipei_building_height_footprint_audit_4x.pmtiles --minzoom=16 --maxzoom=16 --render_maxzoom=16 --threads=4 --min_feature_size=0 --min_feature_size_at_max_zoom=0 --simplify_tolerance=0 --simplify_tolerance_at_max_zoom=0 --force
if errorlevel 1 goto :audit_error

echo.
echo [6/6] Launching browser identity audit on port 5174...
echo The page scans four separate z16 archives and compares source-ID retention.
echo Keep this window open until the browser audit finishes.
echo.
node tools\dev\serve_single_engine_core.mjs 5174 /taipei-building-footprint-audit.html
if errorlevel 1 goto :server_error

endlocal
exit /b 0

:audit_error
echo.
echo [ERROR] Audit preparation/build failed.
echo The audit intentionally stays at -Xmx2g; separate archives and 4 threads should avoid the previous combined-build heap spike.
pause
endlocal
exit /b 1

:server_error
echo.
echo [ERROR] Audit server stopped with an error.
pause
endlocal
exit /b 1
