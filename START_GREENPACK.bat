@echo off
title Greenpack Pro
cd /d "%~dp0"

:: Check if port 8000 is already in use
netstat -ano | findstr :8000 | findstr LISTENING > nul
if errorlevel 1 (
    echo Starting Greenpack Pro server...
    start /min python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
    timeout /t 4 /nobreak >nul
)

:: Open browser ONCE
start http://localhost:8000

echo.
echo ========================================
echo Greenpack Pro is running SAFELY
echo Close this window to stop the app
echo ========================================
echo.
echo NOTE: Only ONE tab will open
pause