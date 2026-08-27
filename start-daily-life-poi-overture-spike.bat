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
echo   Buju / Taipei-Maps - Overture Places audit spike v0.16
echo   Issue #56 - exact Taipei boundary guard + adversarial review
echo ==========================================================
echo.
echo v0.16 fixes the New Taipei false-positive class:
echo   - the old broad Taipei bbox also covered Yonghe / parts of New Taipei
echo   - city membership now uses Taipei's 12 district polygons via point-in-polygon
echo   - an outside-city structured address is anomalous only when the coordinate
 echo     is actually inside the Taipei City boundary
echo   - Jinmen St remains valid; Yonghe / Xindian points should remain New Taipei
 echo   - duplicate review still hunts adversarial false positives first
echo.
echo Visual audit checklist:
echo   1. Wait for READY.
echo   2. Re-check the Yonghe FamilyMart / other New Taipei examples: they must NOT
 echo      appear as Taipei admin-coordinate conflicts.
echo   3. The Zhongzheng Jinmen Simple Mart must remain non-anomalous.
echo   4. Then continue ^"找反例 Top 15^" for real same-brand separate-store cases.
echo   5. All judgments remain audit-only; nothing is automatically deleted or merged.
echo.
echo Keep this window open. Press Ctrl+C to stop the local server.
echo.
"%NODE_CMD%" tools\dev\serve_single_engine_core.mjs 5173 "/daily-life-poi-overture-spike-v16.html"
exit /b %errorlevel%
