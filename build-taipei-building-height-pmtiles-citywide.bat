@echo off
setlocal
cd /d "%~dp0"

echo Taipei-Maps Issue #31 - build CITYWIDE Taipei official building-height PMTiles
echo Preservation mode: z16, no small-footprint cutoff, no geometry simplification.
echo.

set "NODE_CMD="
for /f "delims=" %%I in ('where node 2^>nul') do if not defined NODE_CMD set "NODE_CMD=%%I"

if not defined NODE_CMD (
  echo [0/4] Node.js was not found. Preparing a private portable Node.js runtime...
  echo This does NOT install Node.js system-wide or modify Windows PATH.
  if not exist .cache mkdir .cache
  if not exist .cache\node22\node-path.txt (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $version='v22.14.0'; $zip='.cache\node22.zip'; $dir='.cache\node22'; $url='https://nodejs.org/dist/'+$version+'/node-'+$version+'-win-x64.zip'; if(Test-Path $zip){Remove-Item -Force $zip}; if(Test-Path $dir){Remove-Item -Recurse -Force $dir}; Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $zip; Expand-Archive -LiteralPath $zip -DestinationPath $dir -Force; $node=@(Get-ChildItem -Path $dir -Filter node.exe -Recurse)[0]; if(-not $node){throw 'node.exe not found after extracting portable Node.js'}; Set-Content -NoNewline -LiteralPath (Join-Path $dir 'node-path.txt') -Value $node.FullName; Remove-Item -Force $zip"
    if errorlevel 1 (
      echo.
      echo [ERROR] Portable Node.js download/extract failed.
      pause
      exit /b 1
    )
  ) else (
    echo Portable Node.js runtime already cached.
  )

  set /p NODE_CMD=<.cache\node22\node-path.txt
  if not defined NODE_CMD (
    echo [ERROR] Portable Node.js path cache is empty.
    pause
    exit /b 1
  )
)

if not exist "%NODE_CMD%" (
  echo [ERROR] Node.js executable is missing: %NODE_CMD%
  if exist .cache\node22\node-path.txt del /q .cache\node22\node-path.txt >nul 2>nul
  echo Run this BAT again to rebuild the portable Node.js cache.
  pause
  exit /b 1
)

echo Using Node.js runtime:
"%NODE_CMD%" -v
if errorlevel 1 (
  echo [ERROR] Node.js failed to start.
  pause
  exit /b 1
)

echo.
echo [1/4] Downloading ALL Taipei WFS building-height features with paging...
echo This is the full-city validation run and will take longer than the sample.
"%NODE_CMD%" tools\data\download_taipei_building_height_citywide.mjs
if errorlevel 1 (
  echo.
  echo [ERROR] Citywide WFS download failed.
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
echo [4/4] Building CITYWIDE PMTiles with Planetiler preservation settings...
"%JAVA_CMD%" -Xmx2g -jar .cache\planetiler\planetiler.jar generate-custom --schema=tools\data\taipei_building_height_citywide_pmtiles.yml --output=public\generated\taipei_building_height_citywide.pmtiles --maxzoom=16 --render_maxzoom=16 --min_feature_size=0 --min_feature_size_at_max_zoom=0 --simplify_tolerance=0 --simplify_tolerance_at_max_zoom=0 --force
if errorlevel 1 (
  echo.
  echo [ERROR] Planetiler citywide build failed.
  echo If the error is OutOfMemoryError, send the last lines back before changing anything.
  pause
  exit /b 1
)

echo.
echo Build complete.
echo  Preservation target: retain small Taipei building footprints through z16.
powershell -NoProfile -Command "$g=Get-Item 'public\generated\taipei_building_height_citywide.geojson'; $p=Get-Item 'public\generated\taipei_building_height_citywide.pmtiles'; Write-Host ('  Slim GeoJSON : {0:N1} MiB' -f ($g.Length/1MB)); Write-Host ('  PMTiles      : {0:N2} MiB' -f ($p.Length/1MB))"
echo.
echo Launching CITYWIDE PMTiles browser validation...
echo Keep this window open. Press Ctrl+C to stop the local server.
echo.
"%NODE_CMD%" tools\dev\serve_single_engine_core.mjs 5173 "/maplibre-pmtiles-provider-spike.html?mode=citywide"

if errorlevel 1 (
  echo.
  echo [ERROR] local server stopped with an error.
  pause
  exit /b 1
)

endlocal
