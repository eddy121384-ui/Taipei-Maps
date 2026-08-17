@echo off
setlocal
cd /d "%~dp0"

echo ========================================
echo   Taipei-Maps building-age data bootstrap
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
    pause
    exit /b 1
  )
)

echo.
where python >nul 2>nul
if errorlevel 1 (
  echo Download complete, but Python was not found.
  echo Raw file is ready at:
  echo   %OUT%
  echo.
  echo The XML inspector was not run.
  pause
  exit /b 0
)

echo Inspecting XML schema...
python tools\data\inspect_use_permits.py "%OUT%" > "data\derived\use_permit_schema.txt"
if errorlevel 1 (
  echo.
  echo [ERROR] XML inspection failed.
  pause
  exit /b 1
)

echo.
echo Done.
echo Schema report:
echo   data\derived\use_permit_schema.txt
echo.
pause
endlocal
