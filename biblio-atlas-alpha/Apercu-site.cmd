@echo off
cd /d "%~dp0site"
..\manager\python\python.exe ..\manager\preview.py
if errorlevel 1 pause
