@echo off
setlocal
cd /d "%~dp0"

echo.
echo ============================================
echo   Google Flow MCP - Easy Windows Setup
echo ============================================
echo.
echo This does NOT change your Windows PATH.
echo It will:
echo  1. Check for existing Node.js and Chrome
echo  2. Create the local Flow config
echo  3. Install this project's dependencies locally
echo  4. Open a dedicated Chrome profile for Google Flow
echo.
pause

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Setup-Flow-MCP.ps1"
if errorlevel 1 (
  echo.
  echo Setup stopped. Take a screenshot of this window and send it to ChatGPT.
  pause
  exit /b 1
)

echo.
echo Setup finished. Now we will test the Google Flow connection.
echo A separate Chrome window may open.
echo If Google asks you to sign in, sign in normally once.
echo.
pause

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Test-Flow-Connection.ps1"
if errorlevel 1 (
  echo.
  echo Connection test failed. Take a screenshot of this window and send it to ChatGPT.
  pause
  exit /b 1
)

echo.
echo SUCCESS: the persistent Google Flow browser profile is ready.
echo Send ChatGPT a screenshot of this window.
echo.
pause
