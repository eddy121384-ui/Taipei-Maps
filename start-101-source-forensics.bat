@echo off
setlocal
cd /d "%~dp0"

echo ======================================================
echo   Taipei-Maps - Taipei 101 source forensics
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

echo Starting Taipei 101 Overture building-part forensics...
echo.
echo This does NOT replace the normal app. It inspects the actual building/building_part fragments around Taipei 101.
echo Close this window when you want to stop the local server.
echo.

call npm run dev -- --open /taipei-101-source-forensics.html

if errorlevel 1 (
  echo.
  echo [ERROR] 101 source forensics failed to start.
  pause
)

endlocal
