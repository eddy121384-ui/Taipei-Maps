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
echo   Buju / Taipei-Maps - Location Summary Card v0.1
echo   Daily life + MRT + healthcare + exact Taipei school
echo ==========================================================
echo.
echo [1/7] Preparing official Taipei MRT station cache...
"%NODE_CMD%" tools\data\build_taipei_mrt_stations_official.mjs --if-missing
if errorlevel 1 goto :fail

echo.
echo [2/7] Preparing Taipei healthcare cache...
"%NODE_CMD%" tools\data\build_taipei_healthcare.mjs --if-missing
if errorlevel 1 goto :fail

echo.
echo [3/7] Running Location Summary synthetic regression...
"%NODE_CMD%" tools\dev\test_buju_location_summary_v01.mjs
if errorlevel 1 goto :fail

echo.
echo [4/7] Running school point-resolver regression...
"%NODE_CMD%" tools\dev\test_buju_school_district_resolver_v01.mjs
if errorlevel 1 goto :fail

echo.
echo [5/7] Validating accepted Place Metrics / POI baseline...
"%NODE_CMD%" tools\data\validate_place_metrics_v01.mjs
if errorlevel 1 goto :fail

echo.
echo [6/7] Validating local Location Summary source caches...
"%NODE_CMD%" tools\data\validate_location_summary_sources_v01.mjs
if errorlevel 1 goto :fail

echo.
echo [7/7] Opening Location Summary smoke page...
echo.
echo Visual checklist:
echo   - click several Taipei locations; card updates without page reload
echo   - daily-life values match Place Metrics semantics
echo   - nearest MRT / hospital / clinic look geographically sensible
echo   - query point plus MRT / hospital / clinic context markers appear
echo   - elementary + junior school district resolve from official 115 neighbor geometry
echo   - shared school districts remain shared; do not collapse to one school
echo   - school source failure / boundary ambiguity shows unavailable or unresolved, never a guessed school
echo   - all displayed distances are geographic distance, not walking distance/time
echo.
echo Keep this window open. Press Ctrl+C to stop the local server.
echo.
"%NODE_CMD%" tools\dev\serve_single_engine_core.mjs 5173 "/location-summary-v01.html"
exit /b %errorlevel%

:fail
echo.
echo [ERROR] Location Summary preparation/validation failed.
pause
exit /b 1
