@echo off
title AaaliceTavern
cd /d %~dp0
if exist backend\venv\Scripts\python.exe (
    backend\venv\Scripts\python.exe start.py
) else (
    python start.py
)
