@echo off
:: Fallback: kill AaaliceTavern processes if start.bat window was closed without Ctrl+C
wmic process where "CommandLine like '%%tavernGame%%backend%%main.py%%'" call terminate >nul 2>&1
wmic process where "CommandLine like '%%tavernGame%%frontend%%'" call terminate >nul 2>&1
echo Stopped.
