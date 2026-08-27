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
echo   Buju / Taipei-Maps - Overture Places audit spike v0.9
echo   Issue #56 - identity-safe duplicate review queue
echo ==========================================================
echo.
echo This spike intentionally uses:
echo   - OSM raster only as visual basemap
echo   - Overture Places as structured / clickable POI source
echo   - canonical category + brand identity buckets before candidate grouping
echo   - no cross-brand candidate families
echo   - amber candidate labels include canonical brand, e.g. A-FamilyMart
echo   - candidate and raw POI points are clickable for source details
echo   - red rings remain audit-only high-confidence duplicate candidates
echo   - no automatic merge/delete
echo   - no Google Places ingestion
echo   - no OSM structured merge yet
echo.
echo Visual audit checklist:
echo   1. Wait for READY before building the queue.
echo   2. Click ^"產生最可疑 Top 15^".
echo   3. Every A/B/C label in one family should show the same canonical brand.
echo   4. Click an amber candidate point and confirm raw name / branch / source / Overture id appear.
echo   5. Click a normal blue/orange POI and confirm source details also appear.
echo   6. If the OSM basemap label differs from the candidate brand, inspect the Overture raw record before judging.
echo   7. Any review result remains audit-only and must not feed Place Metrics yet.
echo.
echo Keep this window open. Press Ctrl+C to stop the local server.
echo.
"%NODE_CMD%" tools\dev\serve_single_engine_core.mjs 5173 "/daily-life-poi-overture-spike-v09.html"
exit /b %errorlevel%
