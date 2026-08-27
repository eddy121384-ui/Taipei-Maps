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
echo   Buju / Taipei-Maps - Overture Places audit spike v0.17
echo   Issue #56 - stable exact-boundary + adversarial review
echo ==========================================================
echo.
echo v0.17 fixes the v0.16 bootstrap regression:
echo   - patches the known-good v0.13 page directly (no loader-inside-loader)
echo   - Taipei membership uses the 12 district polygons via point-in-polygon
 echo   - Yonghe / Xindian New Taipei POIs must NOT be treated as Taipei conflicts
 echo   - Jinmen St in Zhongzheng remains valid Taipei data
 echo   - hard anomaly quarantine requires a coordinate actually inside Taipei City
 echo     plus an explicit outside-city structured address
 echo   - duplicate review continues the adversarial false-positive hunt
echo.
echo Visual audit checklist:
echo   1. Wait for READY.
echo   2. Re-check the Yonghe FamilyMart shown in the previous smoke: it must NOT
 echo      appear as an admin-coordinate anomaly.
echo   3. Confirm Zhongzheng Jinmen Simple Mart remains non-anomalous.
echo   4. Then continue ^"找反例 Top 15^".
echo   5. All judgments remain audit-only; nothing is automatically deleted or merged.
echo.
echo Keep this window open. Press Ctrl+C to stop the local server.
echo.
"%NODE_CMD%" tools\dev\serve_single_engine_core.mjs 5173 "/daily-life-poi-overture-spike-v17.html"
exit /b %errorlevel%
