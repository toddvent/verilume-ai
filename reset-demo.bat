@echo off
REM Verilume -- reset the demo back to its clean seeded baseline (Windows).
REM Restores backend\cxmedia.db from the frozen snapshot taken right after
REM the demo account was first seeded (backend\cxmedia.baseline.db).
cd /d %~dp0

if not exist "backend\cxmedia.baseline.db" (
  echo No baseline snapshot found at backend\cxmedia.baseline.db -- nothing to reset to.
  pause
  exit /b 1
)

echo Stopping the demo backend if it's running...
taskkill /F /FI "WINDOWTITLE eq Verilume demo backend*" >nul 2>nul

copy /Y "backend\cxmedia.baseline.db" "backend\cxmedia.db" >nul
echo Done -- backend\cxmedia.db has been reset to the clean seeded baseline.
echo Run start-demo.bat again to relaunch the demo.
pause
