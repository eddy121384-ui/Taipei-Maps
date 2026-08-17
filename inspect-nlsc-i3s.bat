@echo off
setlocal
cd /d "%~dp0"

echo =============================================
echo   Taipei-Maps NLSC I3S layer metadata probe
echo =============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found.
  echo Install Node.js first, then run this file again.
  echo.
  pause
  exit /b 1
)

node tools\data\inspect_nlsc_i3s.mjs

echo.
echo Copy the output above and send it back to ChatGPT.
echo.
pause
endlocal
