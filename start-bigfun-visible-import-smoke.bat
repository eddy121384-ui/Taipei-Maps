@echo off
setlocal
cd /d "%~dp0"

echo ==========================================================
echo   Buju - BigFun Search Results Collector v0.4 smoke
echo   Issue #77
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

echo [1/6] Fetching latest BigFun collector branch...
git fetch origin feat/bigfun-visible-results-import-v01
if errorlevel 1 goto :fail

echo.
echo [2/6] Switching branch...
git switch feat/bigfun-visible-results-import-v01 >nul 2>nul
if errorlevel 1 git switch -c feat/bigfun-visible-results-import-v01 --track origin/feat/bigfun-visible-results-import-v01
if errorlevel 1 goto :fail

echo.
echo [3/6] Fast-forwarding branch...
git pull --ff-only origin feat/bigfun-visible-results-import-v01
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
echo [5/6] Running collector + doorplate regressions...
"%NODE_CMD%" tools\dev\test_bigfun_visible_import_v01.mjs
if errorlevel 1 goto :fail
"%NODE_CMD%" tools\dev\test_taipei_doorplate_locator_v01.mjs
if errorlevel 1 goto :fail
"%NODE_CMD%" tools\dev\test_inventory_spatial_v01.mjs
if errorlevel 1 goto :fail

echo.
echo [6/6] Starting desktop map...
echo.
echo BigFun helper folder in Edge:
echo   %CD%\tools\browser\bigfun-visible-helper-v01
echo.
echo Test flow:
echo   1. Browse BigFun normally and collect one or more result pages.
echo   2. Download the full JSON basket.
echo   3. In Buju desktop click [BigFun JSON] and choose that file.
echo   4. Confirm BigFun related addresses remain visible.
echo   5. Buju now queries the LOCAL Taipei official doorplate index, not Nominatim.
echo   6. Matching homes should become purple price pins with [Taipei official doorplate] status.
echo   7. School truth remains separate and must still be officially verified.
echo.
call start-desktop-full-stack-smoke.bat
exit /b %errorlevel%

:fail
echo.
echo [ERROR] BigFun collector smoke preparation failed.
pause
exit /b 1
