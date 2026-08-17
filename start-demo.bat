@echo off
REM Verilume -- self-contained demo launcher (Windows)
REM Run reset-demo.bat any time to wipe out whatever you've added during a
REM demo and restore the clean seeded baseline.
cd /d %~dp0

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js isn't installed, or isn't on your PATH. This demo needs Node.js 22.5 or newer -- https://nodejs.org
  pause
  exit /b 1
)

set NEEDS_SEED_FALLBACK=0
if not exist "backend\cxmedia.db" (
  if exist "backend\cxmedia.baseline.db" (
    echo First run -- restoring the clean seeded baseline ^(Atlas Ocean Voyages, fully populated^)...
    copy /Y "backend\cxmedia.baseline.db" "backend\cxmedia.db" >nul
    echo.
  ) else (
    set NEEDS_SEED_FALLBACK=1
  )
)

echo Starting the local demo backend on http://localhost:8787 ...
start "Verilume demo backend - close this window to stop the demo" cmd /k node backend\server.js

echo Waiting for the backend to come up...
timeout /t 3 /nobreak >nul

if %NEEDS_SEED_FALLBACK%==1 (
  echo No baseline snapshot found -- seeding the Atlas Ocean Voyages demo account live instead...
  node backend\seed-atlas-demo.js
  node backend\seed-atlas-demo-extras.js
  echo.
)

echo Opening the demo in your browser...
start "" "frontend\index.html"

echo.
echo ============================================================
echo  Verilume demo is running.
echo.
echo  Full funnel (marketing site -^> assessment -^> onboarding):
echo    already open, starting at index.html
echo.
echo  Jump straight into the fully-populated demo account:
echo    frontend\portal.html?accountId=CXM-NAT-2026-700
echo    Access code: ATLAS-DEMO1
echo.
echo  See README-DEMO.md for the full script and talking points.
echo.
echo  Anything you click through or add is real and persists between
echo  launches. Run reset-demo.bat any time to wipe it back to this
echo  clean seeded starting point.
echo.
echo  The backend is running in the other window that just opened --
echo  leave it open for the whole demo, close it when you're done.
echo ============================================================
pause
