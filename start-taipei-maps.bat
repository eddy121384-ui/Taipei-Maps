@echo off
setlocal
cd /d "%~dp0"

echo ========================================
echo   Taipei-Maps launcher
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

echo Starting Taipei-Maps...
start "" cmd /c "ping 127.0.0.1 -n 4 >nul && start http://localhost:5173/"
call npm run dev

if errorlevel 1 (
  echo.
  echo [ERROR] Taipei-Maps failed to start.
  pause
)

endlocal
