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
echo   Buju / Taipei-Maps - Overture Places audit spike v0.10
echo   Issue #56 - guarded identity-safe duplicate review queue
echo ==========================================================
echo.
echo This launcher uses a guarded v0.10 loader that:
echo   - patches the known v0.9 labelSearch bracket bug before execution
echo   - fixes the mixed-identity guard condition
echo   - syntax-checks the patched inline JavaScript before rendering
echo   - shows an explicit bootstrap error instead of a silent grey screen
echo   - keeps canonical category + brand identity buckets
echo   - keeps clickable candidate and raw POI source details
echo   - keeps all duplicate judgments audit-only
echo.
echo Visual audit checklist:
echo   1. Wait for READY before building the queue.
echo   2. Click ^"產生最可疑 Top 15^".
echo   3. Every A/B/C label in one family should show the same canonical brand.
echo   4. Click an amber candidate point and confirm raw/source details appear.
echo   5. Click a normal blue/orange POI and confirm source details appear.
echo   6. If bootstrap fails, the page must show the actual error instead of staying grey.
echo.
echo Keep this window open. Press Ctrl+C to stop the local server.
echo.
"%NODE_CMD%" tools\dev\serve_single_engine_core.mjs 5173 "/daily-life-poi-overture-spike-v10.html"
exit /b %errorlevel%
