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
echo   Buju / Taipei-Maps - Overture Places audit spike
echo   Issue #56 - convenience stores + supermarkets
echo ==========================================================
echo.
echo This spike intentionally uses:
echo   - OSM raster only as visual basemap
echo   - Overture Places as structured / clickable POI source
echo   - no Google Places ingestion
echo   - no OSM structured merge yet
echo.
echo Visual audit checklist:
echo   1. Test Daan / Xinyi / Songshan / Zhongshan / Zhongzheng buttons.
echo   2. Blue = convenience store; orange = supermarket / grocery.
echo   3. Compare structured points with familiar OSM raster labels nearby.
echo   4. Click points and inspect name / category / brand / status / confidence / provenance.
echo   5. Look for major chains: 7-ELEVEN, FamilyMart, Hi-Life, OK Mart,
echo      PX Mart, Carrefour, Simple Mart.
echo   6. Record present / missing / wrong category / duplicate / stale / misplaced.
echo   7. Pan and zoom normally; watch move-to-idle timing and obvious stutter.
echo.
echo IMPORTANT: This is a source-quality spike, not final UI.
echo Keep this window open. Press Ctrl+C to stop the local server.
echo.
"%NODE_CMD%" tools\dev\serve_single_engine_core.mjs 5173 "/daily-life-poi-overture-spike.html"
exit /b %errorlevel%
