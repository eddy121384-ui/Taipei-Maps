@echo off
setlocal
cd /d "%~dp0"

echo ==============================================
echo   Taipei-Maps building overlay join inspector
echo ==============================================
echo.

if not exist "data\raw\building_overlay" mkdir "data\raw\building_overlay"
if not exist "data\derived" mkdir "data\derived"

set "ZIP=data\raw\taipei_building_overlay.zip"
set "OUTDIR=data\raw\building_overlay"
set "USECSV=data\derived\use_permits.csv"
set "URL=https://data.taipei/api/frontstage/tpeod/dataset/resource.download?rid=ccdfe8df-ef54-4c13-a93d-ba42968ced3b"

where python >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Python was not found.
  pause
  exit /b 1
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
    pause
    exit /b 1
  )
)

echo Extracting SHP package...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '%ZIP%' -DestinationPath '%OUTDIR%' -Force"
if errorlevel 1 (
  echo [ERROR] Could not extract building overlay ZIP.
  pause
  exit /b 1
)

set "DBF="
for /r "%OUTDIR%" %%F in (*.dbf) do if not defined DBF set "DBF=%%F"

if not defined DBF (
  echo [ERROR] No .dbf attribute file found after extraction.
  pause
  exit /b 1
)

echo Inspecting attribute table:
echo   %DBF%
echo.
echo No pip packages are required for this step.
python -X utf8 tools\data\inspect_building_overlay.py "%DBF%" > "data\derived\building_overlay_schema.txt"
if errorlevel 1 (
  echo [ERROR] Building overlay inspection failed.
  pause
  exit /b 1
)

echo.
if exist "%USECSV%" (
  echo Comparing BUDATT_NO with normalized use-permit records...
  python -X utf8 tools\data\compare_overlay_use_permits.py "%DBF%" "%USECSV%" --out-csv "data\derived\building_overlay_age_join_preview.csv" > "data\derived\building_overlay_join_report.txt"
  if errorlevel 1 (
    echo [ERROR] Permit-key join diagnostics failed.
    pause
    exit /b 1
  )
) else (
  echo [WARN] %USECSV% was not found.
  echo Run download-building-age-data.bat first if you want the exact permit-key join test.
)

echo.
echo Done.
echo Generated reports:
echo   data\derived\building_overlay_schema.txt
if exist "data\derived\building_overlay_join_report.txt" echo   data\derived\building_overlay_join_report.txt
if exist "data\derived\building_overlay_age_join_preview.csv" echo   data\derived\building_overlay_age_join_preview.csv
echo.
echo Send building_overlay_join_report.txt back to ChatGPT if it was generated.
echo.
pause
endlocal
