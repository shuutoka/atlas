@echo off
cd /d "%~dp0manager"
python\python.exe server.py
if errorlevel 1 pause
