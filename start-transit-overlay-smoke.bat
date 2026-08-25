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
echo   MRT/LRT + TRA stations + explicit THSR + station names
echo ==========================================================
echo.
echo [1/6] Preparing local Taipei City official MRT line GIS...
"%NODE_CMD%" tools\data\build_taipei_mrt_official.mjs --if-missing
if errorlevel 1 goto :fail

echo.
echo [2/6] Preparing local Taipei City official MRT station GIS...
"%NODE_CMD%" tools\data\build_taipei_mrt_stations_official.mjs --if-missing
if errorlevel 1 goto :fail

echo.
echo [3/6] Preparing route-specific North Taiwan urban rail cache via OSM core API...
"%NODE_CMD%" tools\data\build_north_taiwan_urban_rail.mjs --if-missing
if errorlevel 1 goto :fail

echo.
echo [4/6] Preparing Taiwan intercity rail cache: TRA stations + explicit THSR geometry/stations...
"%NODE_CMD%" tools\data\build_taiwan_intercity_rail.mjs --if-missing
if errorlevel 1 goto :fail

echo.
echo [5/6] Validating shared rail overlay contract...
"%NODE_CMD%" tools\data\validate_transit_layer.mjs
if errorlevel 1 goto :fail

echo.
echo [6/6] Starting the existing desktop full-stack smoke page...
echo.
echo Visual checklist:
echo   - Taipei MRT uses official line colors and station names
echo   - Danhai V / Ankeng K / Sanying LB / Airport MRT A retain route colors + station names
echo   - TRA/conventional rail is BLUE with SHORT dashes; standard_gauge must NOT automatically mean THSR
echo   - THSR is ORANGE with LONGER dashes and remains visually distinct from TRA
echo   - white casing remains visible through the dash gaps instead of another rail color bleeding through
echo   - TRA station dots appear at local zoom and Chinese station names appear when closer
echo   - THSR station dots appear earlier; names such as 高鐵台北站 / 高鐵板橋站 / 高鐵桃園站 are visible
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
