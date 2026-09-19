@echo off
rem Refresh the data that only works from a Korean IP, then push it: city hall, districts, universities.
rem Why: busan.go.kr and district sites time out from GitHub servers (overseas IPs), tested 2026-09-19.
rem Usage:  tools\refresh_local.cmd          collect, check, commit, push
rem         tools\refresh_local.cmd nopush   collect and check only (nothing is committed)
rem Universities: run the run.ps1 of the busan-bid-pilot project first so its output is fresh.
rem (Keep this file ASCII only: the Windows console misreads UTF-8 Korean text in batch files.)
setlocal
cd /d "%~dp0.."

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
echo === universities from the pilot project
node tools\build_univ.js

echo === check data ^(bad files are reverted^)
node tools\check_data.js --revert

if /i "%~1"=="nopush" (
  echo nopush: nothing committed.
  exit /b 0
)

git add data_busan.js data_gu.js data_univ.js
git diff --cached --quiet
if not errorlevel 1 (
  echo No data changes. Nothing to commit.
  exit /b 0
)
git commit -m "chore: local data refresh (city, districts, universities)"
git push origin HEAD:main
echo Done. Vercel redeploys automatically in a minute or two.
endlocal
