@echo off
setlocal
cd /d "%~dp0"

echo ======================================================
echo   Taipei-Maps - City Dashboard building-age probe
echo ======================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found.
  pause
  exit /b 1
)

if not exist "data\derived" mkdir "data\derived"
set "OUT=data\derived\citydashboard_building_age.geojson"

echo Downloading Taipei City Dashboard spatial layer:
echo   taipei_vioc:building_age
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; $u='https://citydashboard.taipei/geo_server/taipei_vioc/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=taipei_vioc%%3Abuilding_age&maxFeatures=1000000&outputFormat=application%%2Fjson'; Invoke-WebRequest -UseBasicParsing -Uri $u -OutFile '%OUT%'"
if errorlevel 1 (
  echo.
  echo [ERROR] City Dashboard WFS download failed.
  echo This does NOT prove the layer is unavailable; the endpoint may have changed,
  echo require a different route, or block this client. Send me this screen.
  pause
  exit /b 1
)

echo.
echo Download complete. Auditing actual payload...
echo.
node tools\data\probe_citydashboard_building_age.mjs "%OUT%" "data\derived\citydashboard_building_age_report.txt"
if errorlevel 1 (
  echo.
  echo [ERROR] GeoJSON audit failed. Send me this screen.
  pause
  exit /b 1
)

echo.
echo ======================================================
echo   DONE
echo ======================================================
echo Report:
echo   data\derived\citydashboard_building_age_report.txt
echo Raw GeoJSON:
echo   data\derived\citydashboard_building_age.geojson
echo.
pause
endlocal
