@echo off
setlocal
cd /d "%~dp0"

echo =========================================================
echo   Taipei-Maps - City Dashboard building source forensics
echo =========================================================
echo.
echo This probe reads only public Taipei City Dashboard pages/services.
echo It redacts Mapbox tokens and does not reuse City Dashboard credentials.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found.
  echo Install Node.js first, then run this file again.
  pause
  exit /b 1
)

if not exist "data\derived" mkdir "data\derived"

echo Scanning live production bundles and public GeoServer capabilities...
echo.
node tools\data\probe_citydashboard_building_source.mjs
if errorlevel 1 (
  echo.
  echo [ERROR] Probe failed. See the error above.
  pause
  exit /b 1
)

echo.
echo ---------------------------------------------------------
echo Report saved to:
echo   data\derived\citydashboard_building_source_probe.txt
echo ---------------------------------------------------------
pause
endlocal
