#
# desktop.ps1 — Start Notebook.md desktop development (Windows)
#
# Usage:
#   .\desktop.ps1              Start Docker + API + Web, then launch Tauri desktop app
#   .\desktop.ps1 stop         Stop Docker + API + Web started by this script
#   .\desktop.ps1 status       Show service status
#   .\desktop.ps1 logs         Tail API/Web logs
#

param(
    [ValidateSet("start", "stop", "status", "logs")]
    [string]$Action = "start"
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ScriptDir

$LogDir = Join-Path $ScriptDir ".desktop-dev-logs"
$ApiPidFile = Join-Path $LogDir "api.pid"
$WebPidFile = Join-Path $LogDir "web.pid"

# ── Helpers ──────────────────────────────────────────────────────────

function Write-Header {
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Blue
    Write-Host "  🖥️  Notebook.md — Desktop Development (Windows)" -ForegroundColor Blue
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Blue
}

function Test-ServiceRunning {
    param([string]$PidFile)
    if (Test-Path $PidFile) {
        $pid = [int](Get-Content $PidFile -Raw).Trim()
        $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
        return $null -ne $proc
    }
    return $false
}

function Wait-ForService {
    param(
        [string]$Name,
        [string]$Url,
        [int]$MaxWait = 30
    )
    Write-Host "  Waiting for $Name... " -NoNewline
    $elapsed = 0
    while ($elapsed -lt $MaxWait) {
        try {
            $null = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
            Write-Host "ready" -ForegroundColor Green
            return
        } catch {
            Start-Sleep -Seconds 1
            $elapsed++
        }
    }
    Write-Host "TIMEOUT" -ForegroundColor Red
    throw "Service $Name did not become ready within $MaxWait seconds."
}

function Assert-Command {
    param([string]$Command)
    if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) {
        Write-Host "Required command not found: $Command" -ForegroundColor Red
        exit 1
    }
}

# ── Actions ──────────────────────────────────────────────────────────

function Stop-DesktopDev {
    Write-Host "Stopping desktop dev services..." -ForegroundColor Yellow

    if (Test-ServiceRunning $WebPidFile) {
        $pid = [int](Get-Content $WebPidFile -Raw).Trim()
        Write-Host "  Stopping web dev server (PID $pid)"
        Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
        Remove-Item $WebPidFile -Force -ErrorAction SilentlyContinue
    }

    if (Test-ServiceRunning $ApiPidFile) {
        $pid = [int](Get-Content $ApiPidFile -Raw).Trim()
        Write-Host "  Stopping API server (PID $pid)"
        Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
        Remove-Item $ApiPidFile -Force -ErrorAction SilentlyContinue
    }

    Write-Host "  Stopping Docker services..."
    docker compose down 2>$null

    Write-Host "Desktop dev services stopped." -ForegroundColor Green
}

function Show-Status {
    Write-Host ""
    Write-Host "Desktop Dev Status:" -NoNewline
    Write-Host ""

    foreach ($svc in @("db", "cache", "mailpit")) {
        $state = docker compose ps --format '{{.State}}' $svc 2>$null
        if (-not $state) { $state = "stopped" }
        if ($state -eq "running") {
            Write-Host "  ● $svc ($state)" -ForegroundColor Green
        } else {
            Write-Host "  ● $svc ($state)" -ForegroundColor Red
        }
    }

    if (Test-ServiceRunning $ApiPidFile) {
        $pid = (Get-Content $ApiPidFile -Raw).Trim()
        Write-Host "  ● api (PID $pid)" -ForegroundColor Green
    } else {
        Write-Host "  ● api (stopped)" -ForegroundColor Red
    }

    if (Test-ServiceRunning $WebPidFile) {
        $pid = (Get-Content $WebPidFile -Raw).Trim()
        Write-Host "  ● web (PID $pid)" -ForegroundColor Green
    } else {
        Write-Host "  ● web (stopped)" -ForegroundColor Red
    }

    Write-Host ""
    Write-Host "  URLs:"
    Write-Host "    Web       http://localhost:5173"
    Write-Host "    API       http://localhost:3001"
    Write-Host "    Health    http://localhost:3001/api/health"
    Write-Host "    Mailpit   http://localhost:8025"
    Write-Host ""
}

function Show-Logs {
    if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
    $apiLog = Join-Path $LogDir "api.log"
    $webLog = Join-Path $LogDir "web.log"
    if (-not (Test-Path $apiLog)) { New-Item -ItemType File -Path $apiLog -Force | Out-Null }
    if (-not (Test-Path $webLog)) { New-Item -ItemType File -Path $webLog -Force | Out-Null }

    Write-Host "Tailing desktop dev logs (Ctrl+C to stop)..."
    Get-Content $apiLog, $webLog -Wait -Tail 50
}

function Start-DesktopDev {
    Write-Header

    Assert-Command "npm"
    Assert-Command "docker"

    if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

    if (-not (Test-Path (Join-Path $ScriptDir "node_modules"))) {
        Write-Host "Dependencies not installed. Run 'npm install' first." -ForegroundColor Red
        exit 1
    }

    # Swap to dev icons
    Write-Host "Swapping to dev icons..." -ForegroundColor Yellow
    $iconsDevDir = Join-Path $ScriptDir "apps\desktop\src-tauri\icons-dev"
    $iconsDir = Join-Path $ScriptDir "apps\desktop\src-tauri\icons"
    if (Test-Path $iconsDevDir) {
        Copy-Item "$iconsDevDir\*" -Destination $iconsDir -Force
        Write-Host "  Dev icons active." -ForegroundColor Green
    }

    Write-Host "Starting Docker services..." -ForegroundColor Yellow
    docker compose up -d db cache mailpit | Out-Null

    if (-not (Test-ServiceRunning $ApiPidFile)) {
        Write-Host "Starting API dev server..." -ForegroundColor Yellow
        $apiLog = Join-Path $LogDir "api.log"
        $apiProc = Start-Process -FilePath "npm" -ArgumentList "run", "dev:api" `
            -WorkingDirectory $ScriptDir -RedirectStandardOutput $apiLog -RedirectStandardError "$apiLog.err" `
            -WindowStyle Hidden -PassThru
        $apiProc.Id | Out-File -FilePath $ApiPidFile -NoNewline
    } else {
        Write-Host "API dev server already running." -ForegroundColor Green
    }

    if (-not (Test-ServiceRunning $WebPidFile)) {
        Write-Host "Starting web dev server..." -ForegroundColor Yellow
        $webLog = Join-Path $LogDir "web.log"
        $webProc = Start-Process -FilePath "npm" -ArgumentList "run", "dev:web" `
            -WorkingDirectory $ScriptDir -RedirectStandardOutput $webLog -RedirectStandardError "$webLog.err" `
            -WindowStyle Hidden -PassThru
        $webProc.Id | Out-File -FilePath $WebPidFile -NoNewline
    } else {
        Write-Host "Web dev server already running." -ForegroundColor Green
    }

    Wait-ForService -Name "API" -Url "http://localhost:3001/api/health" -MaxWait 45
    Wait-ForService -Name "Web" -Url "http://localhost:5173" -MaxWait 45

    Write-Host ""
    Write-Host "Desktop prerequisites are ready." -ForegroundColor Green
    Write-Host "  API log: $(Join-Path $LogDir 'api.log')"
    Write-Host "  Web log: $(Join-Path $LogDir 'web.log')"
    Write-Host ""
    Write-Host "Launching Tauri desktop app..." -ForegroundColor Yellow
    Write-Host "  Close the Tauri window or press Ctrl+C here when you're done."
    Write-Host ""

    npm run dev:desktop
}

# ── Main ─────────────────────────────────────────────────────────────

switch ($Action) {
    "start"  { Start-DesktopDev }
    "stop"   { Stop-DesktopDev }
    "status" { Show-Status }
    "logs"   { Show-Logs }
}
