@echo off
setlocal
cd /d "%~dp0"

echo ==========================================================
echo   Buju - Cross-site Listing Collector v0.4 smoke
echo   BigFun + 591 + Yungching + Sinyi + Rakuya + 5168 + HouseFun
echo ==========================================================
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Git was not found in PATH.
  pause
  exit /b 1
)

for /f "delims=" %%I in ('git status --porcelain --untracked-files=normal ^| findstr /V /B "?? public/generated/"') do (
  echo [STOP] This repo has local uncommitted changes outside public/generated/.
  git status --short
  pause
  exit /b 1
)

echo [1/6] Fetching latest market inventory branch...
git fetch origin feat/market-inventory-ui-v02
if errorlevel 1 goto :fail

echo.
echo [2/6] Switching branch...
git switch feat/market-inventory-ui-v02 >nul 2>nul
if errorlevel 1 git switch -c feat/market-inventory-ui-v02 --track origin/feat/market-inventory-ui-v02
if errorlevel 1 goto :fail

echo.
echo [3/6] Fast-forwarding branch...
git pull --ff-only origin feat/market-inventory-ui-v02
if errorlevel 1 goto :fail

set "NODE_CMD="
for /f "delims=" %%I in ('where node 2^>nul') do if not defined NODE_CMD set "NODE_CMD=%%I"
if not defined NODE_CMD if exist .cache\node22\node-path.txt set /p NODE_CMD=<.cache\node22\node-path.txt
if not defined NODE_CMD (
  echo [ERROR] Node.js runtime was not found.
  pause
  exit /b 1
)

echo.
echo [4/6] Preparing Taipei City official doorplate index...
echo First run downloads about 119 MB of Taipei City open data; later runs reuse the local generated index.
"%NODE_CMD%" tools\data\build_taipei_doorplate_index_v01.mjs --if-missing
if errorlevel 1 goto :fail

echo.
echo [5/6] Running collector + property-cluster + doorplate regressions...
"%NODE_CMD%" tools\dev\test_bigfun_visible_import_v01.mjs
if errorlevel 1 goto :fail
"%NODE_CMD%" tools\dev\test_taipei_doorplate_locator_v01.mjs
if errorlevel 1 goto :fail
"%NODE_CMD%" tools\dev\test_inventory_spatial_v01.mjs
if errorlevel 1 goto :fail

echo.
echo [6/6] Starting desktop map...
echo.
echo Reload this unpacked extension folder in Edge/Chrome:
echo   %CD%\tools\browser\bigfun-visible-helper-v01
echo.
echo Supported sites in v0.4:
echo   BigFun / 591 / Yungching / Sinyi / Rakuya / 5168 / HouseFun
echo.
echo Test flow:
echo   1. Browse any supported property site normally.
echo   2. Open [Buju collection basket] and press [Collect current page].
echo   3. Switch pages or websites and keep collecting; the basket is shared locally across sites.
echo   4. Download the full JSON basket.
echo   5. In Buju desktop, use the current [BigFun JSON] importer button to choose that universal JSON file.
echo      The button name is transitional; the importer accepts the shared listing schema through the same normalizer.
echo   6. Same physical homes across different websites should collapse to one property card with N listings.
echo   7. Taipei addresses are re-located with the LOCAL official doorplate index; other areas remain research-only for now.
echo.
call start-desktop-full-stack-smoke.bat
exit /b %errorlevel%

:fail
echo.
echo [ERROR] Cross-site listing collector smoke preparation failed.
pause
exit /b 1
