@echo off
setlocal
cd /d "%~dp0"

echo ==========================================================
echo   Taipei-Maps - TOKENLESS Cesium I3S smoke test
echo ==========================================================
echo.
echo No Cesium ion account, access token, World Imagery, or World Terrain is used.
echo The page loads CesiumJS 1.144 from the official Cesium CDN,
echo OpenStreetMap raster directly, and Taipei/New Taipei public I3S directly.
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

echo Starting tokenless Cesium spike...
echo Acceptance path: Taipei ^> Banqiao ^> Shanghai ^> Beijing ^> Amsterdam.
echo Watch the on-screen OSM / I3S / WebGL status fields.
echo.
call npm run dev -- --open /cesium-tokenless-spike.html

if errorlevel 1 (
  echo [ERROR] Cesium spike page failed to start.
  pause
)

endlocal
