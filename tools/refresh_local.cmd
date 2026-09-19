@echo off
rem Refresh the data that only works from a Korean IP, then push it: city hall, districts, universities.
rem Why: busan.go.kr and district sites time out from GitHub servers (overseas IPs), tested 2026-09-19.
rem Usage:  tools\refresh_local.cmd          collect, check, commit, push
rem         tools\refresh_local.cmd nopush   collect and check only (nothing is committed)
rem Scheduled use (Task Scheduler): Program = cmd.exe   Arguments = /c "tools\refresh_local.cmd >> refresh_local.log 2>&1"   Start in = the deploy folder
rem (Keep this file ASCII only: the Windows console misreads UTF-8 Korean text in batch files.)
setlocal
cd /d "%~dp0.."
echo ===== start %date% %time% =====

rem Right after the PC boots the network may not be up yet: wait for the education office site, at most 10 minutes.
set /a tries=0
:waitnet
curl.exe -s -k -o NUL --max-time 15 https://www.pen.go.kr/
if not errorlevel 1 goto netok
set /a tries+=1
if %tries% GEQ 20 goto netok
echo waiting for network... %tries%/20
ping -n 31 127.0.0.1 >nul
goto waitnet
:netok

if /i not "%~1"=="nopush" (
  git pull --rebase origin main
  if errorlevel 1 (
    echo git pull failed. Stopping.
    exit /b 1
  )
)

echo === city hall notices
node tools\collect_busan.js
echo === district boards
node tools\collect_gu.js

rem Universities: collect with the pilot project first (only universities, about 2 minutes), then convert.
if exist "C:\Users\user\Downloads\busan-bid-pilot\run.ps1" (
  echo === universities: collect with the pilot project
  powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\user\Downloads\busan-bid-pilot\run.ps1" -Days 30 -Only univ
)
echo === universities: convert for the app
node tools\build_univ.js

echo === check data ^(bad files are reverted^)
node tools\check_data.js --revert

if /i "%~1"=="nopush" (
  echo nopush: nothing committed.
  echo ===== end %date% %time% =====
  exit /b 0
)

git add data_busan.js data_gu.js data_univ.js
git diff --cached --quiet
if not errorlevel 1 (
  echo No data changes. Nothing to commit.
  echo ===== end %date% %time% =====
  exit /b 0
)
git commit -m "chore: local data refresh (city, districts, universities)"
git push origin HEAD:main
echo Done. Vercel redeploys automatically in a minute or two.
echo ===== end %date% %time% =====
endlocal
