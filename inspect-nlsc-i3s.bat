@echo off
setlocal
cd /d "%~dp0"

echo =============================================
echo   Taipei-Maps NLSC I3S probe
echo =============================================
echo.
echo The old Node fetch probe is deprecated because Node could not establish
echo the NLSC HTTPS connection even for layer 0, which the browser loads fine.
echo.
echo Please run:
echo   start-nlsc-browser-probe.bat
echo.
pause
endlocal
