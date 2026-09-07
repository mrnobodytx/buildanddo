# Wrapper for the ForgeLocalServer-style scheduled task pattern - logs each run,
# never lets one failed cycle silently vanish.
$ErrorActionPreference = "Continue"
$logFile = "D:\HOSTINGER_COMP\sites\buildanddo\state\sprint\cycle.log"
New-Item -ItemType Directory -Path "D:\HOSTINGER_COMP\sites\buildanddo\state\sprint" -Force | Out-Null

$ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Add-Content -Path $logFile -Value "[$ts] sprint_cycle starting"
Push-Location "D:\HOSTINGER_COMP\sites\buildanddo"
& py -3.13 scripts\ci\sprint_cycle.py *>> $logFile
$code = $LASTEXITCODE
Pop-Location
$ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Add-Content -Path $logFile -Value "[$ts] sprint_cycle exited (code $code)"
