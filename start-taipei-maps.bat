@echo off
setlocal
cd /d "%~dp0"

echo ========================================
echo   Taipei-Maps launcher
echo ========================================
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found.
  echo Please install Node.js first, then run this file again.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo First launch detected. Installing dependencies...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
) else if not exist node_modules\maplibre-gl (
  echo New global-map dependencies detected. Updating dependencies...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
) else if not exist node_modules\pmtiles (
  echo New global-map dependencies detected. Updating dependencies...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

set "AGE_GEOJSON=public\generated\building_age_2001plus.geojson"
if not exist "%AGE_GEOJSON%" (
  echo Building-age 3D data is missing.
  echo Bootstrapping official Taipei data automatically...
  echo This first run may take a few minutes because it downloads and processes public GIS data.
  echo.
  call download-building-overlay.bat --no-pause
  if errorlevel 1 (
    echo.
    echo [WARN] Building-age data bootstrap failed.
    echo Taipei-Maps will still open with the base 3D city layer, but the age layer will stay unavailable.
    echo.
  ) else (
    echo.
    echo Building-age 3D data is ready.
    echo.
  )
)

echo Starting Taipei-Maps...
echo Your browser will open automatically.
echo Close this window when you want to stop the local server.
echo.

call npm run dev -- --open

if errorlevel 1 (
  echo.
  echo [ERROR] Taipei-Maps failed to start.
  pause
)

endlocal
