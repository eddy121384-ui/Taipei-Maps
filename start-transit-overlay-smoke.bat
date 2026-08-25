@echo off
setlocal
cd /d "%~dp0"

set "NODE_CMD="
for /f "delims=" %%I in ('where node 2^>nul') do if not defined NODE_CMD set "NODE_CMD=%%I"
if not defined NODE_CMD if exist .cache\node22\node-path.txt set /p NODE_CMD=<.cache\node22\node-path.txt

if not defined NODE_CMD (
  echo [ERROR] Node.js runtime was not found.
  pause
  exit /b 1
)

echo ==========================================================
echo   Taipei-Maps - Rail transit overlay smoke
echo   Taipei MRT + New Taipei LRT/MRT + Airport MRT + TRA/THSR
echo ==========================================================
echo.
echo [1/5] Preparing local Taipei City official MRT line GIS...
"%NODE_CMD%" tools\data\build_taipei_mrt_official.mjs --if-missing
if errorlevel 1 goto :fail

echo.
echo [2/5] Preparing local Taipei City official MRT station GIS...
"%NODE_CMD%" tools\data\build_taipei_mrt_stations_official.mjs --if-missing
if errorlevel 1 goto :fail

echo.
echo [3/5] Preparing route-specific North Taiwan urban rail cache via OSM core API...
"%NODE_CMD%" tools\data\build_north_taiwan_urban_rail.mjs --if-missing
if errorlevel 1 goto :fail

echo.
echo [4/5] Validating shared rail overlay contract...
"%NODE_CMD%" tools\data\validate_transit_layer.mjs
if errorlevel 1 goto :fail

echo.
echo [5/5] Starting the existing desktop full-stack smoke page...
echo.
echo Visual checklist:
echo   - Taipei MRT uses official line colors: brown / red / green / orange / blue / yellow
echo   - Taipei MRT station dots + Chinese station names remain present
echo   - Danhai LRT V uses red route color + station dots / names
echo   - Ankeng LRT K uses khaki route color + station dots / names
echo   - Sanying LB uses light-blue route color + station dots / names
echo   - Taoyuan Airport MRT A uses purple route color + station dots / names
echo   - interchange / duplicate platform station labels should avoid obvious collisions
echo   - green = TRA, orange = THSR
echo   - top-right subway icon toggles all rail lines, station dots, and station names
echo   - top-right N button returns bearing to north-up while preserving 3D pitch
echo   - Kaohsiung keeps generic metro contrast; Taipei readiness must not fade all Taiwan metro
echo   - Shanghai / Tokyo preserve generic global rail
echo   - existing school / terrain / aerial / 3D behavior remains normal
echo.
call start-desktop-full-stack-smoke.bat
exit /b %errorlevel%

:fail
echo.
echo [ERROR] Rail transit smoke preparation/validation failed.
pause
exit /b 1
