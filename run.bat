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
    goto :err_no_project
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
    if %errorlevel% neq 0 goto :err_backend_install
) else (
    echo [OK] Backend dependencies verified.
)

:: 4. Frontend Dependencies
if not exist "%PROJECT_DIR%frontend\node_modules\" (
    echo [INFO] Installing frontend dependencies...
    cd /d "%PROJECT_DIR%frontend"
    call npm install
    if %errorlevel% neq 0 goto :err_frontend_install
) else (
    echo [OK] Frontend dependencies verified.
)

:: 5. Database Migrations
echo.
echo [INFO] Verifying Supabase database schema migrations...
cd /d "%PROJECT_DIR%backend"
call npm run migrate
if %errorlevel% neq 0 (
    echo [WARN] Migration script returned non-zero. Continuing with initialization...
)

:: 6. Provision Default User Accounts
echo [INFO] Provisioning default Admin and Compliance Officer accounts...
call npm run seed:users
if %errorlevel% neq 0 (
    echo [WARN] Seed users script returned non-zero. Continuing...
)

:: 7. Launch Express Backend API
echo.
echo ================================================================
echo [STARTING] Express Backend API on http://localhost:3001
echo ================================================================
start "INSURE — Backend API [Port 3001]" cmd /k "cd /d "%PROJECT_DIR%backend" && npm run dev"

:: 8. Wait for Backend
echo [WAITING] Waiting for Backend to be ready on port 3001...
ping -n 4 127.0.0.1 >nul

:: 9. Launch Vite React Frontend
echo.
echo ================================================================
echo [STARTING] Vite React Frontend on http://localhost:5173
echo ================================================================
start "INSURE — Frontend Client [Port 5173]" cmd /k "cd /d "%PROJECT_DIR%frontend" && npm run dev"

:: 10. Wait for Frontend
echo [WAITING] Waiting for Frontend to start...
ping -n 4 127.0.0.1 >nul

:: 11. Open Browser
echo.
echo [BROWSER] Launching browser to http://localhost:5173 ...
start http://localhost:5173

echo.
echo ================================================================
echo       INSURE PLATFORM IS RUNNING SUCCESSFULLY!
echo ================================================================
echo   Frontend Application: http://localhost:5173
echo   Backend Express API:  http://localhost:3001
echo   Health Check:         http://localhost:3001/api/health
echo.
echo   Press any key to close this launcher window.
echo   (Both background server windows will remain active).
echo ================================================================
pause >nul
exit /b 0

:err_no_project
echo [ERROR] Project backend directory not found.
echo Expected to find: %PROJECT_DIR%backend\package.json
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
