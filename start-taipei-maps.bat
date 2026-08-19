@echo off
setlocal
cd /d "%~dp0"

echo ========================================
echo   Taipei-Maps v0.1 baseline launcher
echo ========================================
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
  echo First launch detected. Installing dependencies...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

echo Starting Taipei-Maps baseline...
echo Your browser will open automatically.
echo Close this window when you want to stop the local server.
echo.

call npm run dev -- --open

if errorlevel 1 (
  echo.
  echo [ERROR] Taipei-Maps failed to start.
  pause
)

endlocal
