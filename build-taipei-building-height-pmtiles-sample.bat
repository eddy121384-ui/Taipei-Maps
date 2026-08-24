@echo off
setlocal
cd /d "%~dp0"

echo Taipei-Maps Issue #31 - build Taipei official building-height PMTiles sample
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found.
  pause
  exit /b 1
)

echo [1/4] Downloading paged WFS sample and slimming properties...
node tools\data\download_taipei_building_height_sample.mjs
if errorlevel 1 (
  echo.
  echo [ERROR] WFS sample download failed.
  pause
  exit /b 1
)

if not exist .cache mkdir .cache
if not exist .cache\temurin21\java-path.txt (
  echo.
  echo [2/4] Preparing private portable Java 21 runtime for Planetiler...
  echo This does NOT replace or modify the Java installed in Windows.
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $zip='.cache\temurin21-jre.zip'; $dir='.cache\temurin21'; $api='https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jre/hotspot/normal/eclipse'; if(Test-Path $zip){Remove-Item -Force $zip}; if(Test-Path $dir){Remove-Item -Recurse -Force $dir}; Invoke-WebRequest -UseBasicParsing -Uri $api -OutFile $zip; Expand-Archive -LiteralPath $zip -DestinationPath $dir -Force; $java=@(Get-ChildItem -Path $dir -Filter java.exe -Recurse)[0]; if(-not $java){throw 'java.exe not found after extracting Temurin 21 JRE'}; Set-Content -NoNewline -LiteralPath (Join-Path $dir 'java-path.txt') -Value $java.FullName; Remove-Item -Force $zip"
  if errorlevel 1 (
    echo.
    echo [ERROR] Portable Eclipse Temurin 21 download/extract failed.
    pause
    exit /b 1
  )
) else (
  echo.
  echo [2/4] Portable Java 21 runtime already cached.
)

set "JAVA_CMD="
set /p JAVA_CMD=<.cache\temurin21\java-path.txt
if not defined JAVA_CMD (
  echo [ERROR] Portable Java path cache is empty.
  pause
  exit /b 1
)
if not exist "%JAVA_CMD%" (
  echo [ERROR] Portable Java executable is missing: %JAVA_CMD%
  del /q .cache\temurin21\java-path.txt >nul 2>nul
  echo Run this BAT again to rebuild the portable runtime cache.
  pause
  exit /b 1
)

echo Using portable runtime:
"%JAVA_CMD%" -version
if errorlevel 1 (
  echo [ERROR] Portable Java 21 failed to start.
  pause
  exit /b 1
)

if not exist .cache\planetiler mkdir .cache\planetiler
if not exist .cache\planetiler\planetiler.jar (
  echo.
  echo [3/4] Downloading official Planetiler release jar...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/onthegomap/planetiler/releases/latest/download/planetiler.jar' -OutFile '.cache\planetiler\planetiler.jar'"
  if errorlevel 1 (
    echo.
    echo [ERROR] Planetiler download failed.
    pause
    exit /b 1
  )
) else (
  echo.
  echo [3/4] Planetiler jar already cached.
)

echo.
echo [4/4] Building PMTiles with Planetiler custom YAML schema...
"%JAVA_CMD%" -Xmx2g -jar .cache\planetiler\planetiler.jar generate-custom --schema=tools\data\taipei_building_height_pmtiles.yml --output=public\generated\taipei_building_height_sample.pmtiles --force
if errorlevel 1 (
  echo.
  echo [ERROR] Planetiler failed.
  pause
  exit /b 1
)

echo.
echo Build complete:
echo   public\generated\taipei_building_height_sample.pmtiles
echo.
echo Launching the PMTiles browser spike...
echo Keep this window open. Press Ctrl+C to stop the local server.
echo.
node tools\dev\serve_single_engine_core.mjs 5173 /maplibre-pmtiles-provider-spike.html

if errorlevel 1 (
  echo.
  echo [ERROR] local server stopped with an error.
  pause
  exit /b 1
)

endlocal
