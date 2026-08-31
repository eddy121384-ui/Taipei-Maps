@echo off
setlocal
cd /d "%~dp0"

echo ==========================================================
echo   Buju - Map Radius Inventory v0.1 desktop smoke
echo   Issue #75 / PR #76
echo ==========================================================
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Git was not found in PATH.
  pause
  exit /b 1
)

for /f "delims=" %%I in ('git status --porcelain') do (
  echo [STOP] This repo has local uncommitted changes.
  echo Please commit or stash them before this launcher switches branches.
  echo.
  git status --short
  pause
  exit /b 1
)

echo [1/5] Fetching latest radius branch...
git fetch origin feat/map-radius-inventory-v01
if errorlevel 1 goto :fail

echo.
echo [2/5] Switching to feat/map-radius-inventory-v01...
git switch feat/map-radius-inventory-v01 >nul 2>nul
if errorlevel 1 git switch -c feat/map-radius-inventory-v01 --track origin/feat/map-radius-inventory-v01
if errorlevel 1 goto :fail

echo.
echo [3/5] Fast-forwarding branch...
git pull --ff-only origin feat/map-radius-inventory-v01
if errorlevel 1 goto :fail

set "NODE_CMD="
for /f "delims=" %%I in ('where node 2^>nul') do if not defined NODE_CMD set "NODE_CMD=%%I"
if not defined NODE_CMD if exist .cache\node22\node-path.txt set /p NODE_CMD=<.cache\node22\node-path.txt
if not defined NODE_CMD (
  echo [ERROR] Node.js runtime was not found.
  echo Run build-taipei-building-height-pmtiles-citywide.bat first.
  pause
  exit /b 1
)

echo.
echo [4/5] Running radius + inventory regressions...
"%NODE_CMD%" tools\dev\test_inventory_spatial_v01.mjs
if errorlevel 1 goto :fail
"%NODE_CMD%" tools\dev\test_map_radius_inventory_v01.mjs
if errorlevel 1 goto :fail
"%NODE_CMD%" tools\dev\test_personal_inventory_snapshot_v01.mjs
if errorlevel 1 goto :fail

echo.
echo [5/5] Starting desktop full-stack smoke...
echo.
echo Radius checklist:
echo   - Click [PIN] Nearby / 附近.
echo   - Click any map point; a 1km circle and center marker should appear.
echo   - Switch 300m / 500m / 1km / 2km; circle and list should update.
echo   - Click another map point; search center should move.
echo   - Price / area / age / building-form / bedrooms filters still apply.
echo   - UI must disclose located coverage; current research snapshot is only 3/37 located.
echo   - Unlocated candidates must never receive fake pins.
echo   - Switch back to school inventory and confirm catchment flow still works.
echo   - Location Summary and Inventory remain mutually exclusive.
echo.
call start-desktop-full-stack-smoke.bat
exit /b %errorlevel%

:fail
echo.
echo [ERROR] Radius desktop smoke preparation failed.
pause
exit /b 1
