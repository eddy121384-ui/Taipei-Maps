@echo off
setlocal
cd /d "%~dp0"

echo ==========================================================
echo   Taipei-Maps - MapLibre single-engine core checkpoint
echo ==========================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found.
  pause
  exit /b 1
)

if not exist public\generated\citydashboard_tp_building_height_xinyi.geojson (
  echo Downloading the verified public Xinyi building-height sample...
  echo.
  node tools\data\download_xinyi_building_height.mjs
  if errorlevel 1 (
    echo.
    echo [ERROR] Xinyi building-height download failed.
    pause
    exit /b 1
  )
)

if not exist node_modules (
  echo First launch detected. Installing existing project dependencies...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

echo.
echo Starting the verified core architecture:
echo   ONE MapLibre canvas
echo   OSM basemap
echo   Overture global buildings baseline
echo   Xinyi official building-height overlay
echo   No ArcGIS handoff. No Cesium. No private token.
echo.
call npm run dev -- --open /maplibre-single-engine-core.html

if errorlevel 1 (
  echo [ERROR] single-engine core failed to start.
  pause
)

endlocal
