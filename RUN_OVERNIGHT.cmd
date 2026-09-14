@echo off
setlocal
pushd "%~dp0"
echo FlyTris - six-hour falling-rules training budget with automatic checkpoints.
echo Close other demanding applications if you want comparable timings.
echo Ctrl+C pauses the run. Launch this file again to resume.
".venv\Scripts\python.exe" -m flytris falling-overnight --hours 6 --workers 4 --out runs/falling_overnight --resume
set "flytris_exit=%ERRORLEVEL%"
echo.
echo Results: runs\falling_overnight\MORNING_REPORT.md
echo Exit code: %flytris_exit%
pause
popd
exit /b %flytris_exit%
