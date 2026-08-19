@echo off
setlocal
cd /d "%~dp0"

echo ======================================================
echo   Taipei-Maps - Xinyi age-to-building strict join
echo ======================================================
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

if not exist "public\generated" mkdir "public\generated"
set "FULL=data\derived\citydashboard_building_age.geojson"
set "PILOT=public\generated\citydashboard_building_age_xinyi.geojson"

if exist "%FULL%" (
  echo Existing full City Dashboard building-age file found.
  echo Creating a small Xinyi / Taipei 101 subset locally...
  echo.
  node tools\data\subset_citydashboard_age_xinyi.mjs "%FULL%" "%PILOT%"
  if errorlevel 1 (
    echo.
    echo [ERROR] Could not create the Xinyi age subset.
    pause
    exit /b 1
  )
) else (
  echo Full 139MB file not found in this ZIP.
  echo Downloading only the Xinyi / Taipei 101 WFS bbox instead...
  echo.
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; $u='https://citydashboard.taipei/geo_server/taipei_vioc/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=taipei_vioc%%3Abuilding_age&outputFormat=application%%2Fjson&srsName=EPSG%%3A4326&bbox=121.5560,25.0275,121.5730,25.0415,EPSG%%3A4326'; Invoke-WebRequest -UseBasicParsing -Uri $u -OutFile '%PILOT%'"
  if errorlevel 1 (
    echo.
    echo [ERROR] City Dashboard Xinyi WFS bbox download failed.
    echo If you already have the full building_age GeoJSON, copy it to:
    echo   data\derived\citydashboard_building_age.geojson
    echo and rerun this launcher.
    pause
    exit /b 1
  )
)

if not exist node_modules (
  echo.
  echo First launch detected. Installing existing project dependencies...
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

echo.
echo Starting strict point-in-polygon pilot...
echo Rules: no nearest-building fallback, no snapping, no dedupe guess.
echo Close this window when you want to stop the local server.
echo.
call npm run dev -- --open /xinyi-age-building-join.html

if errorlevel 1 (
  echo.
  echo [ERROR] Xinyi join pilot failed to start.
  pause
)

endlocal
