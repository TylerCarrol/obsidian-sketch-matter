@echo off
setlocal

REM Resolve this script's directory as the repo root.
set "REPO_DIR=%~dp0"
if "%REPO_DIR:~-1%"=="\" set "REPO_DIR=%REPO_DIR:~0,-1%"

REM Prefer the VS Code CLI if it is available on PATH.
where code >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    start "" code -r "%REPO_DIR%"
    exit /b 0
)

REM Fallback to common Windows install locations.
for %%I in (
    "%LocalAppData%\Programs\Microsoft VS Code\Code.exe"
    "%ProgramFiles%\Microsoft VS Code\Code.exe"
    "%ProgramFiles(x86)%\Microsoft VS Code\Code.exe"
) do (
    if exist %%~I (
        start "" "%%~I" -r "%REPO_DIR%"
        exit /b 0
    )
)

echo Could not find VS Code. Install it or add the ^"code^" command to PATH.
echo In VS Code: press Ctrl+Shift+P and run ^"Shell Command: Install 'code' command in PATH^".
exit /b 1
