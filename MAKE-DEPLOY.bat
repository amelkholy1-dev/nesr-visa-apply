@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo تجهيز ملفات الرفع...
call npm install --no-audit --no-fund
if errorlevel 1 (echo فشل تسطيب المكتبات. اتأكد إن Node.js متسطّب والإنترنت شغّال. & pause & exit /b 1)
node tools\make-deploy.js
echo.
echo خلص. الملفات في فولدر deploy
pause
