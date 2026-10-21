@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies...
  call npm install
)
echo Starting 象棋学堂 dev server on http://127.0.0.1:5288
start "" http://127.0.0.1:5288
call npm run dev
