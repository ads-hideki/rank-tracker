@echo off
REM ========================================================
REM 検索順位スクレイパー 起動スクリプト
REM Windows Task Scheduler の「プログラム」欄に登録する
REM ========================================================

cd /d "%~dp0"

REM Python仮想環境を使う場合は venv\Scripts\python.exe に変更
python main.py

exit /b %ERRORLEVEL%
