@echo off
title Roja Opticals - Local Application Launcher
color 0A

echo =====================================================================
echo                 ROJA OPTICALS - SHOP MANAGEMENT SYSTEM
echo =====================================================================
echo.
echo Starting Roja Opticals application for local laptop use...
echo.
set LOCAL_MODE=true

:: 1. Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not found in system PATH.
    echo Please install Node.js from https://nodejs.org/ and run this script again.
    pause
    exit /b 1
)

:: 2. Check if server dependencies exist; if not, install them
if not exist "%~dp0server\node_modules" (
    echo [INFO] First-run setup: Installing server dependencies...
    cd /d "%~dp0server"
    call npm install --omit=dev
    if %errorlevel% neq 0 (
        echo [ERROR] Server installation failed.
        pause
        exit /b 1
    )
)

:: 3. Check if frontend build exists in app/dist; if not, build it
if not exist "%~dp0app\dist\index.html" (
    if not exist "%~dp0app\node_modules" (
        echo [INFO] First-run setup: Installing frontend dependencies...
        cd /d "%~dp0app"
        call npm install
    )
    echo [INFO] Bundling frontend application...
    cd /d "%~dp0app"
    call npm run build
    if %errorlevel% neq 0 (
        echo [ERROR] Frontend build failed. Check console output above.
        pause
        exit /b 1
    )
)

:: 4. Launch the local web browser after a brief pause
echo [INFO] Opening Roja Opticals at http://127.0.0.1:5000 in your browser...
start "" http://127.0.0.1:5000

:: 5. Start the backend server
echo [INFO] Starting application server bound to 127.0.0.1:5000...
echo Keep this window open while using the application.
echo.
cd /d "%~dp0server"
node index.js

pause
