@echo off
setlocal

title INSURE — Telematics Pricing Platform

echo ================================================================
echo       INSURE — Telematics Pricing Platform
echo       Single-Click Application Runner
echo ================================================================
echo.

:: 1. Locate Project Directory
set "PROJECT_DIR=%~dp0"
if not exist "%PROJECT_DIR%backend\package.json" (
    if exist "%~dp0Insure\backend\package.json" (
        set "PROJECT_DIR=%~dp0Insure\"
    ) else (
        goto :err_no_project
    )
)

:: 2. Locate Node.js and npm
where node >nul 2>nul
if %errorlevel% equ 0 goto :node_found

if exist "C:\Program Files\nodejs\node.exe" (
    set "PATH=C:\Program Files\nodejs;%PATH%"
    goto :node_found
)
if exist "C:\Program Files (x86)\nodejs\node.exe" (
    set "PATH=C:\Program Files (x86)\nodejs;%PATH%"
    goto :node_found
)
if defined NODE_PATH (
    if exist "%NODE_PATH%\node.exe" (
        set "PATH=%NODE_PATH%;%PATH%"
        goto :node_found
    )
)

:err_no_node
echo [ERROR] Node.js is not found on your system.
echo Please install Node.js v18 or newer from https://nodejs.org/
echo.
pause
exit /b 1

:node_found
for /f "tokens=*" %%v in ('node -v') do set "NODE_VER=%%v"
for /f "tokens=*" %%v in ('npm -v') do set "NPM_VER=%%v"

echo [OK] Node.js Version: %NODE_VER%
echo [OK] npm Version:     %NPM_VER%
echo [OK] Project Path:    %PROJECT_DIR%
echo.

:: 3. Backend Dependencies
if not exist "%PROJECT_DIR%backend\node_modules\" (
    echo [INFO] Installing backend dependencies...
    cd /d "%PROJECT_DIR%backend"
    call npm install
    if errorlevel 1 goto :err_backend_install
)

:: 4. Frontend Dependencies
if not exist "%PROJECT_DIR%frontend\node_modules\" (
    echo [INFO] Installing frontend dependencies...
    cd /d "%PROJECT_DIR%frontend"
    call npm install
    if errorlevel 1 goto :err_frontend_install
)

:: 5. Ensure backend .env exists
if not exist "%PROJECT_DIR%backend\.env" (
    if exist "%PROJECT_DIR%backend\.env.example" (
        echo [INFO] Copying backend .env from template...
        copy "%PROJECT_DIR%backend\.env.example" "%PROJECT_DIR%backend\.env" >nul
    )
)

:: 6. Database Migrations
echo [1/4] Applying database migrations to Supabase PostgreSQL...
cd /d "%PROJECT_DIR%backend"
call npm run migrate

:: 7. Seed Administrative Roles
echo [2/4] Provisioning Admin and Compliance Officer accounts...
call npm run seed:users

:: 8. Start Backend Server
echo [3/4] Starting INSURE Backend API on http://localhost:3001 ...
start "INSURE Backend [Port 3001]" cmd /k "cd /d "%PROJECT_DIR%backend" && npm start"

:: 9. Start Frontend Server
echo [4/4] Starting INSURE Frontend on http://localhost:5173 ...
start "INSURE Frontend [Port 5173]" cmd /k "cd /d "%PROJECT_DIR%frontend" && npm run dev"

:: 10. Wait for services to initialize
echo.
echo Waiting for servers to initialize...
ping 127.0.0.1 -n 5 >nul

echo.
echo ================================================================
echo   INSURE is now successfully running!
echo ================================================================
echo   Frontend App:      http://localhost:5173
echo   Backend API:       http://localhost:3001
echo   Health Probe:      http://localhost:3001/api/health
echo   SMTP Diagnostics:  http://localhost:3001/api/auth/smtp-health
echo.
echo   Role-Based Credentials for Testing:
echo   --------------------------------------------------------------
echo   1. Customer:           Register via /signup with Brevo OTP
echo   2. Insurance Admin:    admin@insure.test      / Admin@123456
echo   3. Compliance Officer: compliance@insure.test / Compliance@123456
echo ================================================================
echo.

start http://localhost:5173
exit /b 0

:err_no_project
echo [ERROR] Could not find the INSURE project files.
echo Expected to find '%PROJECT_DIR%backend\package.json'.
echo.
pause
exit /b 1

:err_backend_install
echo [ERROR] Failed to install backend dependencies.
echo.
pause
exit /b 1

:err_frontend_install
echo [ERROR] Failed to install frontend dependencies.
echo.
pause
exit /b 1
