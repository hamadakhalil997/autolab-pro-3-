@echo off
set folder=%~dp0
IF EXIST "%PROGRAMFILES(X86)%" (GOTO 64BIT) ELSE (GOTO 32BIT)

:64BIT
"%folder%\dpinst_64bit.exe" /s
exit /B %errorlevel%

:32BIT
"%folder%\dpinst_32bit.exe" /s
exit /B %errorlevel%
