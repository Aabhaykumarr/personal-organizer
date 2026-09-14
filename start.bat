@echo off
chcp 65001 > nul
setlocal

echo.
echo ========================================
echo    Personal Organizer - Local Start
echo ========================================
echo.

set ROOT=%~dp0

:: ── Backend ────────────────────────────────────────────────────────────
echo [1/2] Starting FastAPI backend on http://localhost:8000
cd /d "%ROOT%backend"

if not exist ".venv" (
    echo   Creating Python virtual environment...
    python -m venv .venv
    call .venv\Scripts\activate.bat
    echo   Installing Python dependencies...
    pip install -r requirements.txt -q
) else (
    call .venv\Scripts\activate.bat
)

if not exist ".env" (
    if exist ".env.example" (
        echo   Copying .env.example to .env...
        copy .env.example .env > nul
    )
)

start "Personal Organizer - Backend" cmd /k "call .venv\Scripts\activate.bat && uvicorn main:app --host 127.0.0.1 --port 8000 --reload"

:: ── Frontend ───────────────────────────────────────────────────────────
echo [2/2] Starting React frontend on http://localhost:3000
cd /d "%ROOT%frontend"

if not exist "node_modules" (
    echo   Installing npm packages (first run, may take a minute)...
    call npm install
)

start "Personal Organizer - Frontend" cmd /k "npm start"

echo.
echo ========================================
echo    Both servers are starting!
echo.
echo    Backend   : http://localhost:8000
echo    Frontend  : http://localhost:3000
echo    API Docs  : http://localhost:8000/docs
echo ========================================
echo.
echo Leave this window or close it - the server windows will stay open.
pause
