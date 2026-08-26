@echo off
cd /d "%~dp0"
title Stark Museo

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is not installed.
  echo   Install it from https://nodejs.org and run this again.
  echo.
  pause
  exit /b 1
)

node serve.mjs
pause
