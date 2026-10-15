@echo off
:: Check if custom portable NODE_PATH is defined
if defined NODE_PATH (
    if exist "%NODE_PATH%\node.exe" (
        set "PATH=%NODE_PATH%;%PATH%"
    )
)

title INSURE — Automated Test Runner

echo ================================================================
echo       INSURE — Running Automated Test Suites
echo ================================================================
echo.

cd /d "%~dp0backend"
call npm test

echo.
echo ================================================================
pause
