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
echo   Buju / Taipei-Maps - Overture Places audit spike v0.4
echo   Issue #56 - mutually exclusive daily-life categories
echo ==========================================================
echo.
echo This spike intentionally uses:
echo   - OSM raster only as visual basemap
echo   - Overture Places as structured / clickable POI source
echo   - basic_category as authoritative category when present
echo   - taxonomy/categories only when basic_category is missing
echo   - no Google Places ingestion
echo   - no OSM structured merge yet
echo.
echo Visual audit checklist:
echo   1. Blue must always mean convenience store.
echo   2. Orange must always mean supermarket / grocery.
echo   3. classification overlaps should remain 0.
echo   4. Test the previously orange FamilyMart point near Xinglong Rd.
echo   5. Check duplicate pairs that formerly appeared as one blue + one orange.
echo   6. Red rings remain audit candidates only; no data is auto-deleted.
echo   7. Test Daan / Xinyi / Songshan / Zhongshan / Zhongzheng.
echo.
echo Keep this window open. Press Ctrl+C to stop the local server.
echo.
"%NODE_CMD%" tools\dev\serve_single_engine_core.mjs 5173 "/daily-life-poi-overture-spike-v04.html"
exit /b %errorlevel%
