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
echo   Buju / Taipei-Maps - Healthcare POI smoke
echo   Taipei hospital campuses + clinics
echo ==========================================================
echo.
echo [1/3] Preparing Taipei healthcare local cache...
"%NODE_CMD%" tools\data\build_taipei_healthcare.mjs --if-missing
if errorlevel 1 goto :fail

echo.
echo [2/3] Validating healthcare data + physical-campus contract...
"%NODE_CMD%" tools\data\validate_healthcare_layer.mjs
if errorlevel 1 goto :fail

echo.
echo [3/3] Opening healthcare smoke page...
echo.
echo Visual checklist:
echo   - red larger points = physical hospital campuses; teal smaller points = clinics
echo   - click Heping + Fuyou: BOTH Heping (Zhonghua Rd.) and Fuyou (Fuzhou St. 12) must exist
echo   - Taipei City Hospital is reconciled into 9 distinct physical sites
echo   - hospital points appear earlier when zooming in; clinic points appear at neighborhood zoom
echo   - labels avoid obvious overlap; clinic labels appear only closer in
echo   - click a hospital/clinic: popup shows type, name, district/address
echo   - top-right red + toggles the entire healthcare layer
echo   - Banqiao: Taipei healthcare points disappear; base map / transit remain normal
echo   - no provider failure may black-screen the map
echo.
echo Keep this window open. Press Ctrl+C to stop the local server.
echo.
"%NODE_CMD%" tools\dev\serve_single_engine_core.mjs 5173 "/healthcare-layer-smoke.html"
exit /b %errorlevel%

:fail
echo.
echo [ERROR] Healthcare smoke preparation/validation failed.
pause
exit /b 1
