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
echo   Buju / Taipei-Maps - Canonical POI v0.1
echo   Issue #56 - Overture raw records to Buju physical stores
echo ==========================================================
echo.
echo This round stops manual edge-case hunting and starts the canonical POI layer:
echo   - target chains only: 7-ELEVEN / FamilyMart / Hi-Life / OK / PX Mart / Carrefour / Simple Mart
echo   - high-confidence duplicate evidence is auto-merged conservatively
 echo   - unresolved nearby same-brand pairs remain separate instead of being guessed
 echo   - canonical coordinates use the strongest real source record, never a midpoint
 echo   - provenance, source names, source ids and merge reasons are retained
 echo   - raw Overture records can be toggled on for visual comparison
 echo   - this is still loaded-tile scope; NOT a Taipei citywide final count
 echo   - structured OSM hole-filler has not started yet
echo.
echo Smoke checklist:
echo   1. Wait for READY.
echo   2. Canonical points should render blue/orange and remain clickable.
echo   3. Turn Raw records ON: obvious close duplicates should sometimes collapse to
 echo      one canonical point while unresolved cases remain separate.
echo   4. Click a merged canonical point and confirm source rows ^> 1 plus merge evidence.
echo   5. Switch Daan / Xinyi / Songshan / Zhongshan / Zhongzheng and confirm pan remains usable.
echo.
echo Keep this window open. Press Ctrl+C to stop the local server.
echo.
"%NODE_CMD%" tools\dev\serve_single_engine_core.mjs 5173 "/daily-life-poi-canonical-v01.html"
exit /b %errorlevel%
