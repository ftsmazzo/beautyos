@echo off
cd /d "%~dp0\..\.."
set HOST=127.0.0.1
set PORT=8787
set TOKEN=beleza-nfce-2026
node tools\nfce-proxy\server.mjs
