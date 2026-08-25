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
echo [3/5] Preparing route-specific North Taiwan urban rail cache...
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
echo   - Taipei MRT still uses official line colors and station names
echo   - Danhai LRT (V), Ankeng LRT (K), Sanying Line (LB), and Airport MRT (A) are no longer faint generic blue lines
echo   - New Taipei / Taoyuan station dots appear at the same neighborhood zoom as Taipei MRT
echo   - Chinese station labels use the same size, halo, and collision behavior as Taipei MRT
echo   - Hongshulin / Shisizhang / Yingge / Taoyuan HSR areas make the nearest station visually obvious
echo   - generic Overture metro remains only a subdued fallback in North Taiwan when local route datasets are ready
echo   - Kaohsiung / other Taiwan cities keep normal generic metro contrast; they must NOT be faded by Taipei readiness
echo   - green = TRA, orange = THSR
echo   - top-right subway icon toggles all rail lines, station dots, and station names
echo   - top-right N button returns bearing to north-up while preserving 3D pitch
echo   - Shanghai / Tokyo preserve global generic rail and hide North Taiwan station overlays
echo   - existing school / terrain / aerial / 3D behavior remains normal
echo.
call start-desktop-full-stack-smoke.bat
exit /b %errorlevel%

:fail
echo.
echo [ERROR] Rail transit smoke preparation/validation failed.
pause
exit /b 1
