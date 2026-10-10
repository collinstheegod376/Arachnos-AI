@echo off
title Arachnos Personal — Local Brain Server
color 0A

echo ========================================================
echo   🕷️  ARACHNOS PERSONAL — LOCAL KNOWLEDGE BRAIN SERVER
echo ========================================================
echo.

:: Move to script root directory
cd /d "%~dp0"

:: Verify Node.js is available
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    color 0C
    echo [ERROR] Node.js is not installed or not found in system PATH!
    echo Please install Node.js from https://nodejs.org
    echo.
    pause
    exit /b 1
)

:: Check if server dependencies exist
if not exist "server\node_modules\" (
    echo [INFO] First-time setup: Installing server dependencies...
    call npm --prefix server install
    if %ERRORLEVEL% neq 0 (
        color 0C
        echo [ERROR] Failed to install server dependencies.
        pause
        exit /b 1
    )
    echo [SUCCESS] Dependencies installed!
    echo.
)

:: Ensure local data directories exist
if not exist "data\" mkdir "data"
if not exist "server\data\" mkdir "server\data"

echo [INFO] Starting Arachnos Brain Server on http://localhost:3001...
echo [INFO] WebSocket bus: ws://localhost:3001
echo [INFO] Press Ctrl+C at any time to stop the server.
echo.

:: Start server
call npm start

if %ERRORLEVEL% neq 0 (
    color 0C
    echo.
    echo [ERROR] Server terminated with error code %ERRORLEVEL%.
    pause
)
