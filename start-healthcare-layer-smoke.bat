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
echo   Taipei hospital campuses + clinics + transit regression
echo ==========================================================
echo.
echo [1/8] Preparing Taipei healthcare local cache...
"%NODE_CMD%" tools\data\build_taipei_healthcare.mjs --if-missing
if errorlevel 1 goto :fail

echo.
echo [2/8] Preparing Taipei official MRT line cache...
"%NODE_CMD%" tools\data\build_taipei_mrt_official.mjs --if-missing
if errorlevel 1 goto :fail

echo.
echo [3/8] Preparing Taipei official MRT station cache...
"%NODE_CMD%" tools\data\build_taipei_mrt_stations_official.mjs --if-missing
if errorlevel 1 goto :fail

echo.
echo [4/8] Preparing North Taiwan urban rail cache...
"%NODE_CMD%" tools\data\build_north_taiwan_urban_rail.mjs --if-missing
if errorlevel 1 goto :fail

echo.
echo [5/8] Preparing Taiwan intercity rail cache...
"%NODE_CMD%" tools\data\build_taiwan_intercity_rail.mjs --if-missing
if errorlevel 1 goto :fail

echo.
echo [6/8] Validating healthcare data + physical-campus contract...
"%NODE_CMD%" tools\data\validate_healthcare_layer.mjs
if errorlevel 1 goto :fail

echo.
echo [7/8] Validating transit data + rendering contract...
"%NODE_CMD%" tools\data\validate_transit_layer.mjs
if errorlevel 1 goto :fail

echo.
echo [8/8] Opening healthcare smoke page...
echo.
echo Visual checklist:
echo   - red larger points = physical hospital campuses; teal smaller points = clinics
echo   - Heping + Fuyou: BOTH Heping (Zhonghua Rd.) and Fuyou (Fuzhou St. 12) must exist
echo   - Taipei City Hospital is reconciled into 9 distinct physical sites
echo   - Tri-Service: BOTH Neihu (Chenggong Rd. Sec. 2 No. 325) and Tingzhou (Tingzhou Rd. Sec. 3 No. 40) must exist
echo   - use the dedicated TSGH Tingzhou / Neihu buttons for quick visual verification
echo   - hospital points appear earlier when zooming in; clinic points appear at neighborhood zoom
echo   - labels avoid obvious overlap; clinic labels appear only closer in
echo   - click a hospital/clinic: popup shows type, name, district/address
echo   - top-right red + toggles the entire healthcare layer
echo   - transit regression: Taipei MRT keeps official colors + station names
echo   - transit regression: V/K/LB/A keep route colors + station names; TRA/THSR retain blue/orange semantics
echo   - Banqiao: Taipei healthcare points disappear; base map / transit remain normal
echo   - no provider failure may black-screen the map
echo.
echo Keep this window open. Press Ctrl+C to stop the local server.
echo.
"%NODE_CMD%" tools\dev\serve_single_engine_core.mjs 5173 "/healthcare-layer-smoke.html"
exit /b %errorlevel%

:fail
echo.
echo [ERROR] Healthcare/transit smoke preparation or validation failed.
pause
exit /b 1
