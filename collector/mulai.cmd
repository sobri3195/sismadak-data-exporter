@echo off
setlocal
cd /d "%~dp0"
if exist ".venv\Scripts\python.exe" goto install
py -3 --version >nul 2>&1
if errorlevel 1 goto pythonfallback
py -3 -m venv .venv
if errorlevel 1 goto failed
goto install
:pythonfallback
python --version >nul 2>&1
if errorlevel 1 goto missingpython
python -m venv .venv
if errorlevel 1 goto failed
:install
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 goto failed
".venv\Scripts\python.exe" -m playwright install chromium
if errorlevel 1 goto failed
echo Login SISMADAK dilakukan sendiri di browser. Jangan bagikan password.
".venv\Scripts\python.exe" collect.py --resume
if errorlevel 1 goto failed
echo Selesai. Impor collector-output\project.json ke aplikasi untuk membuat PDF.
pause
exit /b 0
:missingpython
echo Pasang Python 3.10 atau lebih baru dari python.org, lalu jalankan ulang.
pause
exit /b 1
:failed
echo Proses gagal. Baca pesan di atas. Progres yang sudah tersimpan tetap tersedia.
pause
exit /b 1
