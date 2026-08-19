@echo off
setlocal
cd /d "%~dp0"

echo ======================================================
echo   Taipei-Maps - Overture global building view
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

echo Starting Overture + MapLibre global building view...
echo Taipei / Tokyo / New York presets are included.
echo Close this window when you want to stop the local server.
echo.

call npm run dev -- --open /overture-global-spike.html

if errorlevel 1 (
  echo.
  echo [ERROR] Overture global view failed to start.
  pause
)

endlocal
