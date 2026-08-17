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
set "URL=https://data.taipei/api/frontstage/tpeod/dataset/resource.download?rid=ccdfe8df-ef54-4c13-a93d-ba42968ced3b"

where python >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Python was not found.
  pause
  exit /b 1
)

python -c "import shapefile" >nul 2>nul
if errorlevel 1 (
  echo Installing lightweight pyshp dependency...
  python -m pip install -r requirements-data.txt
  if errorlevel 1 (
    echo [ERROR] Could not install pyshp.
    pause
    exit /b 1
  )
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

echo Extracting SHP...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '%ZIP%' -DestinationPath '%OUTDIR%' -Force"
if errorlevel 1 (
  echo [ERROR] Could not extract building overlay ZIP.
  pause
  exit /b 1
)

set "SHP="
for /r "%OUTDIR%" %%F in (*.shp) do if not defined SHP set "SHP=%%F"

if not defined SHP (
  echo [ERROR] No .shp file found after extraction.
  pause
  exit /b 1
)

echo Inspecting:
echo   %SHP%
python -X utf8 tools\data\inspect_building_overlay.py "%SHP%" > "data\derived\building_overlay_schema.txt"
if errorlevel 1 (
  echo [ERROR] Building overlay inspection failed.
  pause
  exit /b 1
)

echo.
echo Done.
echo Report:
echo   data\derived\building_overlay_schema.txt
echo.
echo Send that small TXT file back to ChatGPT.
echo.
pause
endlocal
