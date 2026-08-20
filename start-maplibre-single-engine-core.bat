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
  echo Please install Node.js and run this file again.
  echo.
  pause
  exit /b 1
)

if not exist public\maplibre-single-engine-core.html (
  echo [ERROR] Core HTML is missing from this checkout.
  echo Please update the main branch and try again.
  echo.
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

echo.
echo Starting the verified core architecture:
echo   ONE MapLibre canvas
echo   OSM basemap
echo   Overture global buildings baseline
echo   Xinyi official building-height overlay
echo   No ArcGIS handoff. No Cesium. No private token.
echo   No npm / Vite dependency.
echo.
echo The browser will open automatically.
echo Keep this window open while using the map.
echo Press Ctrl+C to stop the local server.
echo.

node tools\dev\serve_single_engine_core.mjs 5173

if errorlevel 1 (
  echo.
  echo [ERROR] single-engine core local server stopped with an error.
  pause
  exit /b 1
)

endlocal
