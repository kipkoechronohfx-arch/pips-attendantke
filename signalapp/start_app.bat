@echo off
title Forex Signal Pro — Launch Terminal
echo ========================================================
echo  Launching Forex Signal Pro V2 — Institutional Terminal
echo ========================================================

echo Starting FastAPI Backend on http://127.0.0.1:8000...
start cmd /k "set PYTHONPATH=backend && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

timeout /t 3 /nobreak >nul

echo Starting React + TypeScript Frontend on http://localhost:5173...
cd frontend
start cmd /k "npm run dev"

echo.
echo ========================================================
echo  Services Started!
echo  Frontend: http://localhost:5173
echo  Backend:  http://127.0.0.1:8000
echo  API Docs: http://127.0.0.1:8000/docs
echo ========================================================
pause
