@echo off
cd /d "C:\Users\natha\New folder"
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
"C:\Program Files\nodejs\node.exe" --unhandled-rejections=strict bbb.js
pause 