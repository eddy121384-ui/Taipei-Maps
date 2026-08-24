@echo off
setlocal
cd /d "%~dp0"

echo ==========================================================
echo   Taipei-Maps - Provider probe V2
echo   LISTING-SPECIFIC / LOW FREQUENCY
echo ==========================================================
echo.

set "NODE_CMD="
for /f "delims=" %%I in ('where node 2^>nul') do if not defined NODE_CMD set "NODE_CMD=%%I"
if not defined NODE_CMD if exist .cache\node22\node-path.txt set /p NODE_CMD=<.cache\node22\node-path.txt

if not defined NODE_CMD (
  echo [ERROR] Node.js runtime was not found.
  pause
  exit /b 1
)
if not exist "%NODE_CMD%" (
  echo [ERROR] Node.js executable is missing: %NODE_CMD%
  pause
  exit /b 1
)
if not exist tools\dev\probe_listing_provider_coordinates_v2.mjs (
  echo [ERROR] V2 probe script is missing. Pull the branch first.
  pause
  exit /b 1
)

set "DISTRICT=%~1"
if "%DISTRICT%"=="" set "DISTRICT=daan"
echo Probe district alias: %DISTRICT%
echo.

"%NODE_CMD%" tools\dev\probe_listing_provider_coordinates_v2.mjs "%DISTRICT%"

echo.
echo ==========================================================
echo Copy both JSON blocks back to Sophira.
echo ==========================================================
echo.
pause
endlocal
