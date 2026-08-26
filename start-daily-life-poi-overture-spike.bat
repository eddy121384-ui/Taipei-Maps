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
echo   Buju / Taipei-Maps - Overture Places audit spike v0.2
echo   Issue #56 - normalization + duplicate audit
echo ==========================================================
echo.
echo This spike intentionally uses:
echo   - OSM raster only as visual basemap
echo   - Overture Places as structured / clickable POI source
echo   - Taiwan-chain brand normalization for audit labels
echo   - conservative duplicate-candidate detection only
echo   - no Google Places ingestion
echo   - no OSM structured merge yet
echo.
echo Visual audit checklist:
echo   1. Test Daan / Xinyi / Songshan / Zhongshan / Zhongzheng buttons.
echo   2. Blue = convenience store; orange = supermarket / grocery.
echo   3. Major-chain map labels should show BRAND, not branch name.
echo      Example: PX Mart branches should label as 全聯 on-map.
echo   4. Click a POI: branch/source name should remain available in popup.
echo   5. Red rings = conservative suspected duplicate groups. Click to inspect.
echo   6. Compare raw classified total vs audit dedup estimate.
echo   7. Compare structured points with familiar OSM raster labels nearby.
echo   8. Record present / missing / wrong category / duplicate / stale / misplaced.
echo   9. Pan and zoom normally; watch move-to-idle timing and obvious stutter.
echo.
echo IMPORTANT:
echo   - red rings are audit candidates, NOT automatic deletion
echo   - audit dedup estimate is NOT production Place Metrics yet
echo   - this remains an Overture-only source-quality spike
echo.
echo Keep this window open. Press Ctrl+C to stop the local server.
echo.
"%NODE_CMD%" tools\dev\serve_single_engine_core.mjs 5173 "/daily-life-poi-overture-spike.html"
exit /b %errorlevel%
