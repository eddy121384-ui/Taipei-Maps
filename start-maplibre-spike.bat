@echo off
setlocal
cd /d "%~dp0"

echo ======================================================
echo   Taipei-Maps - MapLibre performance spike
echo ======================================================
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found.
  echo Please install Node.js first, then run this file again.
  pause
  exit /b 1
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

set "AGE_GEOJSON=public\generated\building_age_2001plus.geojson"
if not exist "%AGE_GEOJSON%" (
  echo Building footprint + height sample is missing.
  echo Bootstrapping the existing Taipei age-overlay dataset...
  echo.
  call download-building-overlay.bat --no-pause
  if errorlevel 1 (
    echo.
    echo [ERROR] Could not build the sample GeoJSON required by this spike.
    pause
    exit /b 1
  )
)

echo.
echo Starting Vite and opening the isolated MapLibre benchmark...
echo This does NOT replace the normal ArcGIS app.
echo Close this window to stop the local server.
echo.

call npm run dev -- --open /maplibre-spike.html

if errorlevel 1 (
  echo.
  echo [ERROR] MapLibre spike failed to start.
  pause
)

endlocal
