@echo off
title AI Tavern Game

:: Read ports from config.json
for /f "tokens=2 delims=:, " %%a in ('findstr "backendPort" config.json') do set BACKEND_PORT=%%a
for /f "tokens=2 delims=:, " %%a in ('findstr "frontendPort" config.json') do set FRONTEND_PORT=%%a
if not defined BACKEND_PORT set BACKEND_PORT=18000
if not defined FRONTEND_PORT set FRONTEND_PORT=15173

echo ============================================
echo   AI Tavern Game
echo   http://localhost:%FRONTEND_PORT%
echo   Close this window to stop
echo ============================================
echo.

:: Activate venv and start backend in background
cd /d %~dp0backend
call venv\Scripts\activate.bat > nul 2>&1
start /b python main.py
cd /d %~dp0

:: Wait for backend
timeout /t 3 /nobreak > nul

:: Open browser
start "" "http://localhost:%FRONTEND_PORT%"

:: Run frontend in foreground (keeps window alive, Ctrl+C stops everything)
cd /d %~dp0frontend
npx.cmd vite
