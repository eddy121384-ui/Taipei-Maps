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
echo   Buju / Taipei-Maps - Overture Places audit spike v0.14
echo   Issue #56 - adversarial false-positive hunt
echo ==========================================================
echo.
echo This round deliberately hunts counterexamples instead of easy duplicates:
echo   - quarantine now keeps only high-explainability geo/name conflicts
echo   - generic name / missing brand is NOT treated as ghost evidence by itself
echo   - duplicate ranking favors pairs most likely to be two real stores:
echo       * branch names both present and different
echo       * addresses both present and different
echo       * both records are specific / strong
echo       * distance near the category review ceiling
echo   - same raw record appears at most once in the Top-15 round
echo   - all verdicts remain audit-only; no automatic merge/delete
echo.
echo Visual audit checklist:
echo   1. Wait for READY.
echo   2. Anomaly queue should now mainly contain explicit geo/name conflicts.
echo   3. Click ^"找反例 Top 15^".
echo   4. Prefer checking pairs labelled branch/address different.
echo   5. We WANT to find real ^"different store^" counterexamples in this round.
echo   6. Click A/B points to inspect raw brand, branch, address, source, strength.
echo   7. Copy results back after roughly 10-15 judgments.
echo.
echo Keep this window open. Press Ctrl+C to stop the local server.
echo.
"%NODE_CMD%" tools\dev\serve_single_engine_core.mjs 5173 "/daily-life-poi-overture-spike-v14.html"
exit /b %errorlevel%
