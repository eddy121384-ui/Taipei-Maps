@echo off
setlocal
cd /d "%~dp0"

set "NO_PAUSE="
if /I "%~1"=="--no-pause" set "NO_PAUSE=1"

echo ========================================
echo   Taipei-Maps building-age data pipeline
echo ========================================
echo.

if not exist "data\raw" mkdir "data\raw"
if not exist "data\derived" mkdir "data\derived"

set "OUT=data\raw\taipei_use_permits.xml"
set "URL=https://data.taipei/api/frontstage/tpeod/dataset/resource.download?rid=0f3f9675-8356-4f1a-9908-1ce8892012fa"

if exist "%OUT%" (
  echo Raw XML already exists:
  echo   %OUT%
  echo Skipping download.
) else (
  echo Downloading Taipei historical use-permit XML...
  echo This file is about 65 MB and may take a while.
  echo.
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri '%URL%' -OutFile '%OUT%'"
  if errorlevel 1 (
    echo.
    echo [ERROR] Download failed.
    echo Dataset page:
    echo https://data.taipei/dataset/detail?id=c876ff02-af2e-4eb8-bd33-d444f5052733
    if not defined NO_PAUSE pause
    exit /b 1
  )
)

echo.
where python >nul 2>nul
if errorlevel 1 (
  echo Download complete, but Python was not found.
  echo Raw file is ready at:
  echo   %OUT%
  if not defined NO_PAUSE pause
  exit /b 1
)

echo [1/2] Inspecting XML schema in UTF-8...
python -X utf8 tools\data\inspect_use_permits.py "%OUT%" > "data\derived\use_permit_schema.txt"
if errorlevel 1 (
  echo.
  echo [ERROR] XML inspection failed.
  if not defined NO_PAUSE pause
  exit /b 1
)

echo [2/2] Normalizing building-age tables...
python -X utf8 tools\data\normalize_use_permits.py "%OUT%" --out-dir "data\derived" > "data\derived\use_permit_normalization_report.txt"
if errorlevel 1 (
  echo.
  echo [ERROR] Normalization failed.
  if not defined NO_PAUSE pause
  exit /b 1
)

echo.
echo Done.
echo.
echo Generated files:
echo   data\derived\use_permit_schema.txt
echo   data\derived\use_permit_normalization_report.txt
echo   data\derived\use_permits.csv
echo   data\derived\use_permit_addresses.csv
echo.
if not defined NO_PAUSE pause
endlocal
