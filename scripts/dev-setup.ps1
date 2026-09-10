# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/dev-setup.ps1
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-DEVENV-001
# CAPS:        pending
# CK:          pending
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-10
# Depends:     docker-compose.yml, .env.example, scripts/dev-seed.mjs
# EnumType:    Workflow
# EnumEdges:   CONSUMES .env.example; TRIGGERS docker-compose.yml;
#              VERIFIED_BY http://localhost:8090/api/health
# Intent:      Give Windows contributors the same one-command local stack as
#              scripts/dev-setup.sh, with the same checks in the same order.
# ───────────────────────────────────────────────────────────────
#
# Usage:
#   .\scripts\dev-setup.ps1              start the stack and wait for health
#   .\scripts\dev-setup.ps1 -Seed        ... then create demo workspace data
#   .\scripts\dev-setup.ps1 -Rebuild     force an image rebuild first
#   .\scripts\dev-setup.ps1 -Down        stop the stack (data volume kept)
#
# If execution policy blocks it:
#   powershell -ExecutionPolicy Bypass -File .\scripts\dev-setup.ps1

[CmdletBinding()]
param(
    [switch] $Seed,
    [switch] $Rebuild,
    [switch] $Down,
    [int]    $HealthTimeout = 120
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Write-Step { param([string] $Message) Write-Host "`n==> $Message" }
function Write-Ok   { param([string] $Message) Write-Host "    ok   $Message" }
function Write-Warn { param([string] $Message) Write-Host "    warn $Message" -ForegroundColor Yellow }
function Stop-WithError {
    param([string] $Message)
    Write-Host "    FAIL $Message" -ForegroundColor Red
    exit 1
}

function Test-Command {
    param([string] $Name)
    return [bool] (Get-Command $Name -ErrorAction SilentlyContinue)
}

# ---------------------------------------------------------------- prerequisites
Write-Step 'Checking prerequisites'

if (-not (Test-Command 'docker')) {
    Stop-WithError 'docker is not installed - https://docs.docker.com/get-docker/'
}
docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Stop-WithError 'the Docker daemon is not reachable - start Docker Desktop'
}
Write-Ok 'docker is running'

docker compose version *> $null
if ($LASTEXITCODE -eq 0) {
    $compose = @('docker', 'compose')
} elseif (Test-Command 'docker-compose') {
    $compose = @('docker-compose')
    Write-Warn 'using legacy docker-compose; Compose v2 (docker compose) is recommended'
} else {
    Stop-WithError 'docker compose is not available - install Compose v2'
}
Write-Ok 'compose available'

function Invoke-Compose {
    param([Parameter(ValueFromRemainingArguments = $true)] [string[]] $ComposeArgs)
    # $compose is either @('docker','compose') or @('docker-compose'); slicing a
    # single-element array with 1..0 walks backwards, so branch on the length.
    $prefix = if ($compose.Count -gt 1) { $compose[1..($compose.Count - 1)] } else { @() }
    & $compose[0] @($prefix + $ComposeArgs)
}

# Node and npm run lint, build and the boundary gate on the host; the stack
# itself does not need them.
if (Test-Command 'node') {
    $nodeVersion = (node --version)
    $nodeMajor = [int](($nodeVersion.TrimStart('v') -split '\.')[0])
    if ($nodeMajor -ge 20) { Write-Ok "node $nodeVersion" }
    else { Write-Warn "node $nodeVersion is older than the toolchain needs (.nvmrc pins 22); containers are unaffected" }
} else {
    Write-Warn "node is not installed on the host - the stack still runs, but 'npm run lint' and 'npm run build' will not"
}

if (Test-Command 'npm') { Write-Ok "npm $(npm --version)" } else { Write-Warn 'npm is not installed on the host' }

# ------------------------------------------------------------------------- .env
Write-Step 'Preparing .env'

if (Test-Path '.env') {
    Write-Ok '.env already exists - left untouched'
} else {
    if (-not (Test-Path '.env.example')) { Stop-WithError '.env.example is missing from the repository root' }
    Copy-Item '.env.example' '.env'
    Write-Ok 'created .env from .env.example'
}

# ------------------------------------------------------------------- stop early
if ($Down) {
    Write-Step 'Stopping the stack'
    Invoke-Compose 'down'
    Write-Ok "stopped (the pocketbase_data volume was kept; 'docker compose down -v' drops it)"
    exit 0
}

# ------------------------------------------------------------------------- boot
if ($Rebuild) {
    Write-Step 'Rebuilding images'
    Invoke-Compose 'build' '--pull'
    if ($LASTEXITCODE -ne 0) { Stop-WithError 'image build failed' }
    Write-Ok 'images rebuilt'
}

Write-Step 'Starting the stack'
Invoke-Compose 'up' '-d'
if ($LASTEXITCODE -ne 0) { Stop-WithError 'docker compose up failed' }
Write-Ok 'containers requested'

# ----------------------------------------------------------------- health probe
Write-Step 'Waiting for PocketBase'

function Get-EnvValue {
    param([string] $Key, [string] $Default)
    if (-not (Test-Path '.env')) { return $Default }
    $line = Select-String -Path '.env' -Pattern "^$Key=" -ErrorAction SilentlyContinue | Select-Object -Last 1
    if ($null -eq $line) { return $Default }
    $value = ($line.Line -split '=', 2)[1].Trim()
    if ([string]::IsNullOrWhiteSpace($value)) { return $Default }
    return $value
}

$pbPort  = Get-EnvValue 'POCKETBASE_PORT' '8090'
$webPort = Get-EnvValue 'WEB_PORT' '3000'

function Test-Endpoint {
    param([string] $Url)
    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 400
    } catch {
        return $false
    }
}

$deadline = (Get-Date).AddSeconds($HealthTimeout)
while (-not (Test-Endpoint "http://localhost:$pbPort/api/health")) {
    if ((Get-Date) -gt $deadline) {
        Write-Host ''
        Invoke-Compose 'ps'
        Write-Host '--- last 40 lines: pocketbase-migrate ---'
        Invoke-Compose 'logs' '--tail' '40' 'pocketbase-migrate'
        Write-Host '--- last 40 lines: pocketbase ---'
        Invoke-Compose 'logs' '--tail' '40' 'pocketbase'
        Stop-WithError "PocketBase did not answer /api/health within ${HealthTimeout}s"
    }
    Write-Host '.' -NoNewline
    Start-Sleep -Seconds 2
}
Write-Host ''
Write-Ok "PocketBase is healthy on port $pbPort"

# Vite pre-bundles on first start; a slow web server is a warning, not a failure.
$deadline = (Get-Date).AddSeconds(60)
$webUp = $false
while (-not $webUp) {
    $webUp = Test-Endpoint "http://localhost:$webPort/"
    if ($webUp) { break }
    if ((Get-Date) -gt $deadline) {
        Write-Warn "the web dev server has not answered yet - check 'docker compose logs -f web'"
        break
    }
    Start-Sleep -Seconds 2
}
if ($webUp) { Write-Ok "web dev server is answering on port $webPort" }

# ------------------------------------------------------------------------- seed
if ($Seed) {
    Write-Step 'Seeding demo data'
    if (Test-Command 'node') {
        $env:PB_URL = "http://localhost:$pbPort"
        node scripts/dev-seed.mjs
    } else {
        # The container has no .env (excluded from the build context), so the
        # credentials are passed explicitly rather than defaulted.
        Invoke-Compose 'exec' '-T' `
            '-e' 'PB_URL=http://pocketbase:8090' `
            '-e' "PB_SUPERUSER_EMAIL=$(Get-EnvValue 'PB_SUPERUSER_EMAIL' 'admin@buildanddo.local')" `
            '-e' "PB_SUPERUSER_PASSWORD=$(Get-EnvValue 'PB_SUPERUSER_PASSWORD' 'localdev-change-me')" `
            '-e' "DEMO_USER_EMAIL=$(Get-EnvValue 'DEMO_USER_EMAIL' 'demo@buildanddo.local')" `
            '-e' "DEMO_USER_PASSWORD=$(Get-EnvValue 'DEMO_USER_PASSWORD' 'demo-localdev-1234')" `
            'web' 'node' '/workspace/scripts/dev-seed.mjs'
    }
    if ($LASTEXITCODE -ne 0) { Stop-WithError 'seeding failed - run it manually with: node scripts/dev-seed.mjs' }
}

# ------------------------------------------------------------------------ report
@"

BuildAndDo local stack is up.

  Web app            http://localhost:$webPort
  PocketBase API     http://localhost:$pbPort
  PocketBase admin   http://localhost:$pbPort/_/
  API reference      docs/api/README.md

Admin credentials come from .env (PB_SUPERUSER_EMAIL / PB_SUPERUSER_PASSWORD);
they are local development values and must never match a deployed environment.

  docker compose logs -f web          follow the frontend
  docker compose logs -f pocketbase   follow the backend
  docker compose down                 stop, keeping the database
  docker compose down -v              stop and delete the database volume
"@ | Write-Host
