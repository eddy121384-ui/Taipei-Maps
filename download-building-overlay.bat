@echo off
setlocal
cd /d "%~dp0"

set "NO_PAUSE="
if /I "%~1"=="--no-pause" set "NO_PAUSE=1"

echo ==============================================
echo   Taipei-Maps building-age overlay pipeline
echo ==============================================
echo.

if not exist "data\raw\building_overlay" mkdir "data\raw\building_overlay"
if not exist "data\derived" mkdir "data\derived"
if not exist "public\generated" mkdir "public\generated"

set "ZIP=data\raw\taipei_building_overlay.zip"
set "OUTDIR=data\raw\building_overlay"
set "USECSV=data\derived\use_permits.csv"
set "URL=https://data.taipei/api/frontstage/tpeod/dataset/resource.download?rid=ccdfe8df-ef54-4c13-a93d-ba42968ced3b"

where python >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Python was not found.
  if not defined NO_PAUSE pause
  exit /b 1
)

if not exist "%USECSV%" (
  echo Normalized use-permit table is missing.
  echo Running building-age data bootstrap automatically...
  echo.
  call download-building-age-data.bat --no-pause
  if errorlevel 1 (
    echo.
    echo [ERROR] Could not build %USECSV%.
    if not defined NO_PAUSE pause
    exit /b 1
  )

  if not exist "%USECSV%" (
    echo.
    echo [ERROR] Building-age bootstrap finished but %USECSV% still does not exist.
    if not defined NO_PAUSE pause
    exit /b 1
  )

  echo.
  echo Use-permit table is ready. Continuing...
  echo.
)

if exist "%ZIP%" (
  echo Building overlay ZIP already exists. Skipping download.
) else (
  echo Downloading official Taipei building-license overlay SHP...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri '%URL%' -OutFile '%ZIP%'"
  if errorlevel 1 (
    echo [ERROR] Building overlay download failed.
    echo Dataset page:
    echo https://data.taipei/dataset/detail?id=af067fb6-9e47-4f4c-a484-e72eba161319
    if not defined NO_PAUSE pause
    exit /b 1
  )
)

echo Extracting SHP package...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '%ZIP%' -DestinationPath '%OUTDIR%' -Force"
if errorlevel 1 (
  echo [ERROR] Could not extract building overlay ZIP.
  if not defined NO_PAUSE pause
  exit /b 1
)

set "DBF="
set "SHP="
for /r "%OUTDIR%" %%F in (*.dbf) do if not defined DBF set "DBF=%%F"
for /r "%OUTDIR%" %%F in (*.shp) do if not defined SHP set "SHP=%%F"

if not defined DBF (
  echo [ERROR] No .dbf attribute file found after extraction.
  if not defined NO_PAUSE pause
  exit /b 1
)
if not defined SHP (
  echo [ERROR] No .shp geometry file found after extraction.
  if not defined NO_PAUSE pause
  exit /b 1
)

echo [1/3] Inspecting attribute table...
echo   %DBF%
python -X utf8 tools\data\inspect_building_overlay.py "%DBF%" > "data\derived\building_overlay_schema.txt"
if errorlevel 1 (
  echo [ERROR] Building overlay inspection failed.
  if not defined NO_PAUSE pause
  exit /b 1
)

echo.
echo [2/3] Comparing BUDATT_NO with normalized use-permit records...
python -X utf8 tools\data\compare_overlay_use_permits.py "%DBF%" "%USECSV%" --out-csv "data\derived\building_overlay_age_join_preview.csv" > "data\derived\building_overlay_join_report.txt"
if errorlevel 1 (
  echo [ERROR] Permit-key join diagnostics failed.
  if not defined NO_PAUSE pause
  exit /b 1
)

echo.
echo [3/3] Building browser-ready 3D age GeoJSON...
python -X utf8 tools\data\build_age_overlay_geojson.py "%SHP%" "%DBF%" "%USECSV%" --out-geojson "public\generated\building_age_2001plus.geojson" --report "data\derived\building_age_geojson_report.txt"
if errorlevel 1 (
  echo [ERROR] GeoJSON age-overlay build failed.
  if not defined NO_PAUSE pause
  exit /b 1
)

echo.
echo Done.
echo Generated:
echo   data\derived\building_overlay_schema.txt
echo   data\derived\building_overlay_join_report.txt
echo   data\derived\building_overlay_age_join_preview.csv
echo   data\derived\building_age_geojson_report.txt
echo   public\generated\building_age_2001plus.geojson
echo.
echo The GeoJSON is the validated 2001+ permit-overlay subset, NOT full historical Taipei.
echo.
if not defined NO_PAUSE pause
endlocal
