@echo off
setlocal
cd /d "%~dp0"

set "NODE_CMD="
for /f "delims=" %%I in ('where node 2^>nul') do if not defined NODE_CMD set "NODE_CMD=%%I"
if not defined NODE_CMD if exist .cache\node22\node-path.txt set /p NODE_CMD=<.cache\node22\node-path.txt

if not defined NODE_CMD (
  echo [ERROR] Node.js runtime was not found.
  pause
  exit /b 1
)

echo ==========================================================
echo   Buju / Taipei-Maps - Canonical POI v0.2
echo   Issue #56 - validated branch typo / area-prefix evidence
echo ==========================================================
echo.
echo v0.2 keeps the conservative canonical POI layer and promotes only validated patterns:
echo   - same-address / same-branch / exact raw name rules stay unchanged
 echo   - 5m same-brand and generic+specific nearby rules stay unchanged
 echo   - district-prefix-equivalent branches can merge within 25m
 echo     example: Zhongzheng Tongan ~= Tongan
 echo   - near branch names with only one character edit can merge within 20m
 echo     example: Wanhua Juguang ~= Wanhua Jianguang typo case
 echo   - clearly different nearby branch names still remain unresolved
 echo   - raw Overture records can still be toggled on for comparison
 echo   - this is loaded-tile scope, not a Taipei citywide final count
 echo.
echo Smoke checklist:
echo   1. Wait for READY.
echo   2. Re-check the PX Mart Juguang/Jianguang pair shown in the last smoke.
echo      With Raw records OFF it should now collapse to one orange canonical point.
echo   3. Turn Raw records ON and confirm the underlying two gray raw records remain visible.
echo   4. Click the canonical point: source rows should be 2 and merge evidence should
 echo      include near-branch-typo or branch-area-prefix-equivalent where applicable.
echo   5. Spot-check a few unrelated nearby same-brand stores; do not expect all pairs to merge.
echo.
echo Keep this window open. Press Ctrl+C to stop the local server.
echo.
"%NODE_CMD%" tools\dev\serve_single_engine_core.mjs 5173 "/daily-life-poi-canonical-v02.html"
exit /b %errorlevel%
