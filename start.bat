@echo off
title Client Radar v3.0 - Desktop Tool
color 0A
cls
echo ==================================================
echo    Starting Client Radar Secure Desktop Tool...
echo ==================================================
start /b node server.js
timeout /t 2 >nul
start http://localhost:3000
exit