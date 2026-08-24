@echo off
setlocal
cd /d "%~dp0"

echo ==========================================================
echo   Taipei-Maps - 115 citywide school-district smoke test
echo ==========================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found.
  pause
  exit /b 1
)

echo [1/2] Validating canonical bootstrap + all 12 district shards...
node tools\data\validate_taipei_school_districts.mjs
if errorlevel 1 (
  echo.
  echo [ERROR] School-district data validation FAILED.
  echo Do not browser-test or merge this branch. Copy this console output back to the chat.
  pause
  exit /b 1
)

echo.
echo [2/2] Opening the mobile MapLibre preview...
echo.
echo Smoke checklist:
echo   1. Daan / Xinyi: old pilot still matches the approved behavior.
echo   2. Pan north to Shilin / Beitou: elementary polygons render; switch to junior and verify again.
echo   3. Pan south/east to Wenshan / Neihu / Nangang: polygons continue across Taipei.
echo   4. Pan outside Taipei to Banqiao or Tokyo: global map remains normal; no black screen.
echo   5. Click a catchment and confirm district / village / neighbor / school popup is sensible.
echo.
echo Keep this window open while testing. Press Ctrl+C to stop the local server.
echo.
node tools\dev\serve_single_engine_core.mjs 5173 /mobile-preview.html

if errorlevel 1 (
  echo.
  echo [ERROR] Local smoke-test server stopped with an error.
  pause
  exit /b 1
)

endlocal
