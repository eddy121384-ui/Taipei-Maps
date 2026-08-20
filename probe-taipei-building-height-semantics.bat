@echo off
setlocal
cd /d "%~dp0"

echo Taipei-Maps Issue #31 - raw WFS building-height semantics probe
echo Targets: Taipei 101, Daan residential control, Yangmingshan hillside residential
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found.
  pause
  exit /b 1
)

node tools\data\probe_taipei_building_height_semantics.mjs
if errorlevel 1 (
  echo.
  echo [ERROR] Height semantics probe failed.
  pause
  exit /b 1
)

echo.
echo Probe complete. Copy the console output back to the chat.
pause
endlocal
