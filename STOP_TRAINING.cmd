@echo off
setlocal
if not exist "%~dp0runs\falling_overnight" exit /b 0
> "%~dp0runs\falling_overnight\STOP" echo Graceful pause requested
echo Pause requested. Completed games and optimizer state are saved.
echo Run RUN_OVERNIGHT.cmd to resume the remaining time budget.
