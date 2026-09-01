@echo off
setlocal
cd /d "%~dp0"

echo ==========================================================
echo   Buju - BigFun Search Results Collector v0.2 smoke
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

echo [1/5] Fetching latest BigFun collector branch...
git fetch origin feat/bigfun-visible-results-import-v01
if errorlevel 1 goto :fail

echo.
echo [2/5] Switching branch...
git switch feat/bigfun-visible-results-import-v01 >nul 2>nul
if errorlevel 1 git switch -c feat/bigfun-visible-results-import-v01 --track origin/feat/bigfun-visible-results-import-v01
if errorlevel 1 goto :fail

echo.
echo [3/5] Fast-forwarding branch...
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
echo [4/5] Running collector regressions...
"%NODE_CMD%" tools\dev\test_bigfun_visible_import_v01.mjs
if errorlevel 1 goto :fail
"%NODE_CMD%" tools\dev\test_inventory_spatial_v01.mjs
if errorlevel 1 goto :fail

echo.
echo [5/5] Starting desktop map...
echo.
echo BigFun helper folder to load/reload in Edge:
echo   %CD%\tools\browser\bigfun-visible-helper-v01
echo.
echo Edge setup:
echo   edge://extensions
echo   - enable Developer mode
echo   - first install: Load unpacked and choose the folder above
echo   - after each update: press Reload on the extension card
echo.
echo Test flow:
echo   1. Browse BigFun normally and open a map/list result page.
echo   2. Click [Buju Basket] / 卜居收集籃.
echo   3. Confirm current-page detected rows, then click [+ Collect Page].
echo   4. Turn to the next BigFun page normally and collect again.
echo   5. Confirm basket count accumulates without duplicates.
echo   6. Download the full JSON basket.
echo   7. In Buju desktop click [BigFun JSON] and choose that file.
echo.
call start-desktop-full-stack-smoke.bat
exit /b %errorlevel%

:fail
echo.
echo [ERROR] BigFun collector smoke preparation failed.
pause
exit /b 1
