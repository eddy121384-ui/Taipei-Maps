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
echo   Buju / Taipei-Maps - Overture Places audit spike v0.13
echo   Issue #56 - quarantine-first POI review
echo ==========================================================
echo.
echo This spike separates two data-quality problems:
echo   1. anomaly quarantine first - ghost / stale / misplaced records
echo   2. duplicate review second - only records outside provisional quarantine
echo.
echo Audit behavior:
echo   - strict known-chain recognition remains from v0.12
echo   - obvious outside-Taipei text conflicts enter anomaly queue
echo   - weak generic chain records can enter anomaly queue when a much stronger
echo     same-brand record is nearby
echo   - example signal: generic Family Mart + no raw brand + Foursquare near a
echo     branch-specific AllThePlaces FamilyMart record
echo   - anomaly candidates are provisionally excluded from duplicate review
echo   - no automatic delete / merge; all verdicts remain audit-only
echo.
echo Visual audit checklist:
echo   1. Wait for READY.
echo   2. Click ^"先審異常 Top 10^".
echo   3. Re-check the ghost FamilyMart near Anhe Rd: the weak generic record
echo      should appear as Q with the stronger real store as R reference.
echo   4. Re-check the PX Mart record with 桃園 text in Taipei: it should be a
echo      geo anomaly candidate.
echo   5. Mark anomaly candidates ghost/stale, misplaced, trusted, or unsure.
echo   6. Then click ^"再審重複 Top 15^" for the separate duplicate queue.
echo   7. Use ^"複製全部判讀^" to return both audit streams.
echo.
echo Keep this window open. Press Ctrl+C to stop the local server.
echo.
"%NODE_CMD%" tools\dev\serve_single_engine_core.mjs 5173 "/daily-life-poi-overture-spike-v13.html"
exit /b %errorlevel%
