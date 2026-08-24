@echo off
setlocal
cd /d "%~dp0"

echo ==========================================================
echo   Taipei-Maps - Sinyi / Yungching provider probe
echo   LOW FREQUENCY research only
echo ==========================================================
echo.

set "NODE_CMD="
for /f "delims=" %%I in ('where node 2^>nul') do if not defined NODE_CMD set "NODE_CMD=%%I"
if not defined NODE_CMD if exist .cache\node22\node-path.txt set /p NODE_CMD=<.cache\node22\node-path.txt

if not defined NODE_CMD (
  echo [ERROR] Node.js runtime was not found.
  echo Run build-taipei-building-height-pmtiles-citywide.bat once, or install Node.js.
  echo.
  pause
  exit /b 1
)
if not exist "%NODE_CMD%" (
  echo [ERROR] Node.js executable is missing: %NODE_CMD%
  pause
  exit /b 1
)

if not exist tools\dev\probe_listing_provider_coordinates.mjs (
  echo [ERROR] Provider probe script is missing.
  echo Pull the latest feat/nearby-listing-links-experiment branch first.
  echo.
  pause
  exit /b 1
)

set "DISTRICT=%~1"
if "%DISTRICT%"=="" set "DISTRICT=大安"

echo Probe district: %DISTRICT%
echo.
echo This makes at most one list GET and one detail GET per provider.
echo It does NOT log in, bypass CAPTCHA/Cloudflare, or persist inventory.
echo.

"%NODE_CMD%" tools\dev\probe_listing_provider_coordinates.mjs "%DISTRICT%"

echo.
echo ==========================================================
echo Copy the Sinyi / Yungching result blocks back to Sophira.
echo If you see coordinate candidate(s) found, we can wire that
echo provider into the same-map inventory experiment next.
echo ==========================================================
echo.
pause
endlocal
