@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ==========================================================
echo   Taipei-Maps - Official New Development Pipeline v0.1
echo   MOI presale filings + Taipei construction permits
echo ==========================================================
echo.

set "NODE_CMD="
for /f "delims=" %%I in ('where node 2^>nul') do if not defined NODE_CMD set "NODE_CMD=%%I"
if not defined NODE_CMD if exist .cache\node22\node-path.txt set /p NODE_CMD=<.cache\node22\node-path.txt
if not defined NODE_CMD (
  echo [ERROR] Node.js runtime was not found.
  pause
  exit /b 1
)

set "CACHE_DIR=.cache\new-development"
set "MOI_ZIP=%CACHE_DIR%\lvr_buildcasecsv.zip"
set "MOI_DIR=%CACHE_DIR%\moi"
set "HIST_XML=%CACHE_DIR%\taipei-permits-historical.xml"
set "CURR_XML=%CACHE_DIR%\taipei-permits-current.xml"
set "REFRESH=0"
if /I "%~1"=="refresh" set "REFRESH=1"

if not exist "%CACHE_DIR%" mkdir "%CACHE_DIR%"

if "%REFRESH%"=="1" (
  echo [refresh] Removing cached official downloads...
  if exist "%MOI_ZIP%" del /q "%MOI_ZIP%"
  if exist "%MOI_DIR%" rmdir /s /q "%MOI_DIR%"
  if exist "%HIST_XML%" del /q "%HIST_XML%"
  if exist "%CURR_XML%" del /q "%CURR_XML%"
)

echo [1/5] Validating pipeline scripts...
"%NODE_CMD%" --check tools\data\build_official_new_development_pipeline.mjs || goto :fail
"%NODE_CMD%" tools\data\validate_official_new_development_pipeline.mjs || goto :fail

if not exist "%MOI_ZIP%" (
  echo [2/5] Downloading MOI presale project filing CSV ZIP...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $s=Get-Content -Raw 'tools/data/new-development-sources.json' ^| ConvertFrom-Json; Invoke-WebRequest -UseBasicParsing -Uri $s.sources.moi_presale_projects.download_url -OutFile '%MOI_ZIP%.part'; Move-Item -Force '%MOI_ZIP%.part' '%MOI_ZIP%'" || goto :fail
) else (
  echo [2/5] MOI ZIP cache found. Use: build-official-new-development-pipeline.bat refresh  to re-download.
)

if not exist "%MOI_DIR%" (
  echo [3/5] Extracting MOI CSV ZIP...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; Expand-Archive -LiteralPath '%MOI_ZIP%' -DestinationPath '%MOI_DIR%' -Force" || goto :fail
) else (
  echo [3/5] MOI extracted cache found.
)

if not exist "%HIST_XML%" (
  echo [4/5] Downloading Taipei historical construction permits - large XML...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $s=Get-Content -Raw 'tools/data/new-development-sources.json' ^| ConvertFrom-Json; Invoke-WebRequest -UseBasicParsing -Uri $s.sources.taipei_construction_permits_historical.download_url -OutFile '%HIST_XML%.part'; Move-Item -Force '%HIST_XML%.part' '%HIST_XML%'" || goto :fail
) else (
  echo [4/5] Historical Taipei permit cache found.
)

if not exist "%CURR_XML%" (
  echo [4/5] Downloading Taipei current-year construction permits...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $s=Get-Content -Raw 'tools/data/new-development-sources.json' ^| ConvertFrom-Json; Invoke-WebRequest -UseBasicParsing -Uri $s.sources.taipei_construction_permits_current.download_url -OutFile '%CURR_XML%.part'; Move-Item -Force '%CURR_XML%.part' '%CURR_XML%'" || goto :fail
) else (
  echo [4/5] Current Taipei permit cache found.
)

echo [5/5] Building canonical Taipei new-development dataset...
"%NODE_CMD%" tools\data\build_official_new_development_pipeline.mjs || goto :fail

echo.
echo ==========================================================
echo PASS - official new-development data channel completed.
echo.
echo Outputs:
echo   public\generated\taipei_new_developments_official.json
echo   public\generated\taipei_new_developments_official.audit.json
echo.
echo v0.1 intentionally emits NO geometry until the official
echo Taipei spatial permit overlay join is validated.
echo ==========================================================
echo.
pause
exit /b 0

:fail
echo.
echo ==========================================================
echo FAIL - pipeline stopped. No guessed/fallback data emitted.
echo Copy the error block back to Sophira.
echo ==========================================================
echo.
pause
exit /b 1
