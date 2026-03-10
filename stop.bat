@echo off
:: Kill AI Tavern processes by matching command line, not by port
:: This is safe and won't kill other software
wmic process where "CommandLine like '%%tavernGame%%backend%%main.py%%'" call terminate >nul 2>&1
wmic process where "CommandLine like '%%tavernGame%%frontend%%'" call terminate >nul 2>&1
echo Stopped.
