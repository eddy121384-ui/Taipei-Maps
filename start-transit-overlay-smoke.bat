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
echo   Official MRT colors + stations + TRA + THSR + North-up
echo ==========================================================
echo.
echo [1/4] Preparing local Taipei City official MRT line GIS...
"%NODE_CMD%" tools\data\build_taipei_mrt_official.mjs --if-missing
if errorlevel 1 goto :fail

echo.
echo [2/4] Preparing local Taipei City official MRT station GIS...
"%NODE_CMD%" tools\data\build_taipei_mrt_stations_official.mjs --if-missing
if errorlevel 1 goto :fail

echo.
echo [3/4] Validating shared rail overlay contract...
"%NODE_CMD%" tools\data\validate_transit_layer.mjs
if errorlevel 1 goto :fail

echo.
echo [4/4] Starting the existing desktop full-stack smoke page...
echo.
echo Visual checklist:
echo   - Taipei MRT uses official line colors: brown / red / green / orange / blue / yellow
echo   - MRT must NOT be all gray
echo   - MRT station dots appear when zooming into Taipei / New Taipei
echo   - MRT Chinese station names appear at neighborhood zoom; labels should avoid obvious collisions
echo   - interchange stations such as Nanjing Fuxing render as one station point, not duplicate platform dots
echo   - green = TRA, orange = THSR
echo   - top-right subway icon toggles all rail lines, MRT station dots, and station names
echo   - top-right N button returns bearing to north-up while preserving 3D pitch
echo   - Banqiao still shows Taiwan rail lines and MRT stations
echo   - Shanghai / Tokyo hide the Taiwan-specific station overlay but preserve global rail
echo   - existing school / terrain / aerial / 3D behavior remains normal
echo.
call start-desktop-full-stack-smoke.bat
exit /b %errorlevel%

:fail
echo.
echo [ERROR] Rail transit smoke preparation/validation failed.
pause
exit /b 1
