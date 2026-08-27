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
echo   Buju / Taipei-Maps - Overture Places audit spike v0.7
echo   Issue #56 - ranked false-positive review queue
echo ==========================================================
echo.
echo This spike intentionally uses:
echo   - OSM raster only as visual basemap
echo   - Overture Places as structured / clickable POI source
echo   - v0.5 canonical brand/category normalization
echo   - red rings for high-confidence duplicate candidates
echo   - amber rings for nearby same-brand pairs needing human review
echo   - Top 20 ranked review queue to avoid manual map hunting
echo   - no automatic merge/delete
echo   - no Google Places ingestion
echo   - no OSM structured merge yet
echo.
echo Visual audit checklist:
echo   1. classification overlaps should remain 0.
echo   2. Click ^"產生最可疑 Top 20^" after the target district finishes loading.
echo   3. Queue should fly to each candidate automatically.
echo   4. Priority should favor longer-distance / conflicting-name pairs.
echo   5. Mark each as same store / different store / unsure.
echo   6. Use ^"複製判讀結果^" and paste the summary back into the chat.
echo   7. Any review result remains audit-only and must not feed Place Metrics yet.
echo.
echo Keep this window open. Press Ctrl+C to stop the local server.
echo.
"%NODE_CMD%" tools\dev\serve_single_engine_core.mjs 5173 "/daily-life-poi-overture-spike-v07.html"
exit /b %errorlevel%
