@echo off
setlocal
cd /d "%~dp0"

echo ==============================================================
echo   Taipei-Maps - MapLibre local-over-global single-engine spike
echo ==============================================================
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
  echo Local official Xinyi building-height sample is missing.
  echo Downloading the already-verified public WFS inputs...
  echo.
  node tools\data\download_xinyi_official_join_inputs.mjs
  if errorlevel 1 (
    echo.
    echo [ERROR] Xinyi official building-height download failed.
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
echo Starting ONE MapLibre engine:
echo   OSM basemap + Overture global buildings + Xinyi official local buildings
echo No ArcGIS handoff. No Cesium. No private token.
echo.
call npm run dev -- --open /maplibre-local-global-stack.html

if errorlevel 1 (
  echo [ERROR] local-over-global spike failed to start.
  pause
)

endlocal
