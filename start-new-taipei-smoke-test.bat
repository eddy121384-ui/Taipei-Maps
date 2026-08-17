@echo off
setlocal
cd /d "%~dp0"

echo =================================================
echo   Taipei-Maps - NLSC layer 5 Banqiao smoke test
echo =================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found.
  echo Please install Node.js first.
  pause
  exit /b 1
)

echo Starting lightweight browser test...
echo Only NLSC layer 5 will be loaded. Taipei LOD1 is NOT loaded.
echo.
node tools\data\serve_nlsc_layer5_smoke.mjs

pause
endlocal
