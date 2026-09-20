# Registers the Windows Task Scheduler job that refreshes city hall / district / university data twice a week.
# (Kept ASCII-only on purpose: Windows PowerShell 5.1 misreads UTF-8 text without a BOM.)
#
# WHO RUNS THIS: the course participant, by hand. It changes a Windows setting (a scheduled task), so an AI assistant does not run it.
#
#   Preview only (changes nothing):   powershell -ExecutionPolicy Bypass -File tools\register_task.ps1 -DryRun
#   Register:                         powershell -ExecutionPolicy Bypass -File tools\register_task.ps1
#   Remove again:                     powershell -ExecutionPolicy Bypass -File tools\register_task.ps1 -Unregister
#
# Runs tools\refresh_local.cmd every Monday and Thursday at 08:00 (after the 07:00 GitHub refresh finishes), as the logged-on user,
# and starts it as soon as possible if the PC was off at that time. Output goes to refresh_local.log in the deploy folder.
param(
  [switch]$DryRun,
  [switch]$Unregister,
  [string]$At = '08:00',
  [string]$TaskName = 'Busan Bid Data Refresh (city-district-univ)'
)
$ErrorActionPreference = 'Stop'

$deploy = Split-Path -Parent $PSScriptRoot            # the deploy folder (parent of tools\)
$script = Join-Path $PSScriptRoot 'refresh_local.cmd'

if ($Unregister) {
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    if ($DryRun) { Write-Host "[DryRun] Would remove task: $TaskName"; exit 0 }
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Removed task: $TaskName"
  } else { Write-Host "No such task: $TaskName" }
  exit 0
}

# --- checks (read only) ---
$problems = @()
if (-not (Test-Path $script)) { $problems += "Missing file: $script" }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { $problems += 'node.exe was not found in PATH' }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { $problems += 'git.exe was not found in PATH' }
if (-not (Test-Path (Join-Path $deploy '.git'))) { $problems += "Not a git folder: $deploy" }
if ($At -notmatch '^\d{1,2}:\d{2}$') { $problems += "Bad time '$At' (use HH:MM)" }
if ($problems.Count -gt 0) { $problems | ForEach-Object { Write-Host "PROBLEM: $_" -ForegroundColor Red }; exit 1 }

# --- build the task in memory ---
$action    = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument '/c "tools\refresh_local.cmd >> refresh_local.log 2>&1"' -WorkingDirectory $deploy
$trigger   = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Thursday -At $At
$settings  = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 1)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Write-Host '--- Task plan ---'
Write-Host "Name        : $TaskName"
Write-Host "When        : every Monday and Thursday at $At (missed runs start as soon as possible)"
Write-Host "Runs        : cmd.exe /c `"tools\refresh_local.cmd >> refresh_local.log 2>&1`""
Write-Host "Start in    : $deploy"
Write-Host "As user     : $env:USERDOMAIN\$env:USERNAME (only while logged on; no admin rights)"
Write-Host "Time limit  : 1 hour"
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) { Write-Host "Note        : a task with this name already exists and will be replaced." }

if ($DryRun) { Write-Host '[DryRun] Nothing was changed.'; exit 0 }

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
  -Description 'Refresh city hall / district / university bid data and push to GitHub (Vercel redeploys).' -Force | Out-Null
$t = Get-ScheduledTask -TaskName $TaskName | Get-ScheduledTaskInfo
Write-Host "Registered. Next run: $($t.NextRunTime)"
Write-Host ("Test it now:  Start-ScheduledTask -TaskName '" + $TaskName + "'")
