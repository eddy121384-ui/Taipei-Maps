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
echo   Buju / Taipei-Maps - Overture Places audit spike v0.6
echo   Issue #56 - hard duplicate + nearby review candidates
echo ==========================================================
echo.
echo This spike intentionally uses:
echo   - OSM raster only as visual basemap
echo   - Overture Places as structured / clickable POI source
echo   - v0.5 canonical brand/category normalization
echo   - red rings for high-confidence duplicate candidates
echo   - amber rings for nearby same-brand pairs needing human review
echo   - no automatic merge/delete
echo   - no Google Places ingestion
echo   - no OSM structured merge yet
echo.
echo Visual audit checklist:
echo   1. classification overlaps should remain 0.
echo   2. Red rings should preserve known high-confidence duplicates.
echo   3. Amber rings should catch close same-brand pairs missed by v0.5.
echo   4. Recheck the two FamilyMart misses reported around Renai/Hangzhou areas.
echo   5. Click amber rings and inspect distance, raw names, branches, sources, and Overture IDs.
echo   6. Mark amber examples as same physical store vs truly separate nearby stores.
echo   7. hard-only dedup estimate is audit-only and must not feed Place Metrics yet.
echo.
echo Keep this window open. Press Ctrl+C to stop the local server.
echo.
"%NODE_CMD%" tools\dev\serve_single_engine_core.mjs 5173 "/daily-life-poi-overture-spike-v06.html"
exit /b %errorlevel%
