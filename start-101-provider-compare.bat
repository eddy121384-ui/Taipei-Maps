@echo off
setlocal
cd /d "%~dp0"

echo ======================================================
echo   Taipei-Maps - Taipei 101 provider comparison
echo ======================================================
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found.
  echo Please install Node.js first, then run this file again.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo First launch detected. Installing existing project dependencies...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

echo Starting side-by-side Taipei 101 comparison...
echo Left  = Overture + MapLibre parts-aware extrusion
echo Right = Taipei DUD official LOD1_2024 I3S
echo.
echo Close this window when you want to stop the local server.
echo.

call npm run dev -- --open /taipei-101-provider-compare.html

if errorlevel 1 (
  echo.
  echo [ERROR] Provider comparison failed to start.
  pause
)

endlocal
