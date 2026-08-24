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
echo   Official MRT colors + TRA + THSR + North-up
echo ==========================================================
echo.
echo [1/3] Preparing local Taipei City official MRT GIS...
"%NODE_CMD%" tools\data\build_taipei_mrt_official.mjs --if-missing
if errorlevel 1 goto :fail

echo.
echo [2/3] Validating shared rail overlay contract...
"%NODE_CMD%" tools\data\validate_transit_layer.mjs
if errorlevel 1 goto :fail

echo.
echo [3/3] Starting the existing desktop full-stack smoke page...
echo.
echo Visual checklist:
echo   - Taipei MRT uses official line colors: brown / red / green / orange / blue / yellow
echo   - MRT must NOT be all gray
echo   - green = TRA, orange = THSR
echo   - top-right subway icon toggles all rail lines
echo   - top-right N button returns bearing to north-up while preserving 3D pitch
echo   - Banqiao still shows Taiwan rail lines
echo   - Shanghai / Tokyo hide this Taiwan-specific overlay
echo   - existing school / terrain / aerial / 3D behavior remains normal
echo.
call start-desktop-full-stack-smoke.bat
exit /b %errorlevel%

:fail
echo.
echo [ERROR] Rail transit smoke preparation/validation failed.
pause
exit /b 1
