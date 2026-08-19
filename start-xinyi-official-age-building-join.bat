@echo off
setlocal
cd /d "%~dp0"

echo ==========================================================
echo   Taipei-Maps - Xinyi OFFICIAL age-to-building strict join
echo ==========================================================
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found.
  pause
  exit /b 1
)

if not exist "public\generated" mkdir "public\generated"

set "AGE=public\generated\citydashboard_building_age_xinyi.geojson"
set "BLD=public\generated\citydashboard_tp_building_height_xinyi.geojson"
set "AGEURL=https://citydashboard.taipei/geo_server/taipei_vioc/ows?service=WFS^&version=1.0.0^&request=GetFeature^&typeName=taipei_vioc%%3Abuilding_age^&outputFormat=application%%2Fjson^&srsName=EPSG%%3A4326^&bbox=121.5560,25.0275,121.5730,25.0415,EPSG%%3A4326"
set "BLDURL=https://citydashboard.taipei/geo_server/taipei_vioc/ows?service=WFS^&version=1.0.0^&request=GetFeature^&typeName=taipei_vioc%%3Atp_building_height^&outputFormat=application%%2Fjson^&srsName=EPSG%%3A4326^&bbox=121.5560,25.0275,121.5730,25.0415,EPSG%%3A4326"

echo Downloading City Dashboard age points for Xinyi...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri '%AGEURL%' -OutFile '%AGE%'"
if errorlevel 1 (
  echo [ERROR] building_age WFS download failed.
  pause
  exit /b 1
)

echo Downloading public Taipei tp_building_height polygons for Xinyi...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri '%BLDURL%' -OutFile '%BLD%'"
if errorlevel 1 (
  echo [ERROR] tp_building_height WFS download failed.
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

echo.
echo Starting official strict join comparison...
echo Same bbox, same age points, same strict point-in-polygon rule.
echo The only thing changed from the Overture pilot is the building polygon provider.
echo.
call npm run dev -- --open /xinyi-official-age-building-join.html

if errorlevel 1 (
  echo [ERROR] official Xinyi join page failed to start.
  pause
)

endlocal
