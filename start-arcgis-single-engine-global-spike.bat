@echo off
setlocal
cd /d "%~dp0"

echo ==========================================================
echo   Taipei-Maps - ArcGIS single-engine global spike
echo ==========================================================
echo.
echo No MapLibre handoff. No private token. OSM + Taipei/New Taipei public I3S only.
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

if not exist node_modules (
  echo First launch detected. Installing existing project dependencies...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

call npm run dev -- --open /arcgis-single-engine-global-spike.html

if errorlevel 1 (
  echo [ERROR] ArcGIS global spike failed to start.
  pause
)

endlocal
