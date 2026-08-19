@echo off
setlocal
cd /d "%~dp0"

echo ==========================================================
echo   Taipei-Maps - Xinyi OFFICIAL age-to-building strict join
echo ==========================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found.
  pause
  exit /b 1
)

echo Downloading the two public City Dashboard WFS layers for Xinyi...
echo This now uses Node URLSearchParams instead of embedding WFS query strings in CMD/PowerShell.
echo.
node tools\data\download_xinyi_official_join_inputs.mjs
if errorlevel 1 (
  echo.
  echo [ERROR] Official Xinyi WFS input download failed.
  echo Please send me this screen; the downloader now prints the HTTP status for each endpoint tried.
  pause
  exit /b 1
)

if not exist node_modules (
  echo.
  echo First launch detected. Installing existing project dependencies...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

echo.
echo Starting official strict join comparison...
echo Same bbox, same age points, same strict point-in-polygon rule.
echo The only thing changed from the Overture pilot is the building polygon provider.
echo.
call npm run dev -- --open /xinyi-official-age-building-join.html

if errorlevel 1 (
  echo [ERROR] official Xinyi join page failed to start.
  pause
)

endlocal
