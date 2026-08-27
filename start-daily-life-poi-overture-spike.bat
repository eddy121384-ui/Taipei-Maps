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
echo   Buju / Taipei-Maps - Overture Places audit spike v0.15
echo   Issue #56 - precision geo guard + adversarial duplicate review
echo ==========================================================
echo.
echo v0.15 tightens anomaly detection after a false positive on a real Taipei store:
echo   - bare place-name tokens in store names/branches are NOT enough for quarantine
echo   - example: Zhongzheng Jinmen store on Jinmen St is valid Taipei data
echo   - hard geo quarantine now requires structured address text to explicitly name
echo     an outside-Taipei city/county such as Taoyuan City or Kinmen County
echo   - generic/missing-brand records remain out of automatic ghost quarantine
echo   - duplicate review still hunts adversarial false positives first
echo.
echo Visual audit checklist:
echo   1. Wait for READY.
echo   2. Confirm the Zhongzheng Jinmen Simple Mart is NOT an anomaly candidate.
echo   3. Anomaly queue should now contain only explicit admin-address conflicts.
echo   4. Click ^"找反例 Top 15^" and look for real same-brand stores that should stay separate.
echo   5. All judgments remain audit-only; nothing is automatically deleted or merged.
echo.
echo Keep this window open. Press Ctrl+C to stop the local server.
echo.
"%NODE_CMD%" tools\dev\serve_single_engine_core.mjs 5173 "/daily-life-poi-overture-spike-v15.html"
exit /b %errorlevel%
