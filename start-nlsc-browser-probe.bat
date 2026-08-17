@echo off
setlocal
cd /d "%~dp0"

echo ==============================================
echo   Taipei-Maps browser NLSC I3S metadata probe
echo ==============================================
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found.
  echo Please install Node.js first.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

echo Starting browser-based NLSC scanner...
echo This uses ArcGIS SceneLayer.load() in the browser instead of Node fetch.
echo.
call npm run dev -- --open "/?nlscProbe=1"

if errorlevel 1 (
  echo.
  echo [ERROR] Probe app failed to start.
  pause
)

endlocal
