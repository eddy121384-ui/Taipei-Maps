@echo off
setlocal
cd /d "%~dp0"

echo Taipei-Maps Issue #31 - build Taipei official building-height PMTiles sample
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found.
  pause
  exit /b 1
)

where java >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Java was not found.
  echo Planetiler currently requires a modern Java runtime ^(Java 21+ recommended^).
  echo Install Java, then run this file again.
  pause
  exit /b 1
)

echo [1/3] Downloading paged WFS sample and slimming properties...
node tools\data\download_taipei_building_height_sample.mjs
if errorlevel 1 (
  echo.
  echo [ERROR] WFS sample download failed.
  pause
  exit /b 1
)

if not exist .cache\planetiler mkdir .cache\planetiler
if not exist .cache\planetiler\planetiler.jar (
  echo.
  echo [2/3] Downloading official Planetiler release jar...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/onthegomap/planetiler/releases/latest/download/planetiler.jar' -OutFile '.cache\planetiler\planetiler.jar'"
  if errorlevel 1 (
    echo.
    echo [ERROR] Planetiler download failed.
    pause
    exit /b 1
  )
) else (
  echo.
  echo [2/3] Planetiler jar already cached.
)

echo.
echo [3/3] Building PMTiles with Planetiler custom YAML schema...
java -Xmx2g -jar .cache\planetiler\planetiler.jar generate-custom --schema=tools\data\taipei_building_height_pmtiles.yml --output=public\generated\taipei_building_height_sample.pmtiles --force
if errorlevel 1 (
  echo.
  echo [ERROR] Planetiler failed. If you see UnsupportedClassVersionError, update Java.
  pause
  exit /b 1
)

echo.
echo Build complete:
echo   public\generated\taipei_building_height_sample.pmtiles
echo.
echo Launching the PMTiles browser spike...
echo Keep this window open. Press Ctrl+C to stop the local server.
echo.
node tools\dev\serve_single_engine_core.mjs 5173 /maplibre-pmtiles-provider-spike.html

if errorlevel 1 (
  echo.
  echo [ERROR] local server stopped with an error.
  pause
  exit /b 1
)

endlocal
