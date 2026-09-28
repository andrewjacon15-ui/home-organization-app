@echo off
rem Double-click to set up the tablet. Run "setup-tablet.cmd -Restore" to undo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-tablet.ps1" %*
pause
