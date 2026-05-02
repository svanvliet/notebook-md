#
# build-desktop.ps1 — Build a Notebook.md desktop app for Windows
#
# Usage:
#   .\scripts\build-desktop.ps1                Build unsigned desktop app
#   .\scripts\build-desktop.ps1 -Sign          Build with Tauri updater signing
#
# Prerequisites:
#   - Rust toolchain installed (rustup, MSVC target)
#   - Node.js 20+ and npm installed
#   - Visual Studio C++ Build Tools
#   - npm dependencies installed
#

param(
    [switch]$Sign
)

# Use Continue so native commands writing to stderr don't abort the script.
# We check $LASTEXITCODE explicitly after each step.
$ErrorActionPreference = "Continue"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RootDir = Split-Path -Parent $ScriptDir

# ── Validate prerequisites ──────────────────────────────────────────

function Assert-Command {
    param([string]$Command, [string]$InstallHint)
    if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) {
        Write-Host "Required command not found: $Command" -ForegroundColor Red
        if ($InstallHint) { Write-Host "  Install: $InstallHint" -ForegroundColor Yellow }
        exit 1
    }
}

Assert-Command "npm" "https://nodejs.org"
Assert-Command "rustc" "https://rustup.rs"
Assert-Command "cargo" "https://rustup.rs"

# ── Set signing environment variables ────────────────────────────────

if ($Sign) {
    $TauriKeyDir = Join-Path $env:USERPROFILE "certs\tauri"
    $KeyFile = Join-Path $TauriKeyDir "notebook-md.key"

    if (Test-Path $KeyFile) {
        $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content $KeyFile -Raw
        $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "notebookmd"
        Write-Host "Tauri updater signing key loaded." -ForegroundColor Green
    } else {
        Write-Host "Warning: Tauri updater signing key not found at $KeyFile" -ForegroundColor Yellow
        Write-Host "Update artifacts will not be signed." -ForegroundColor Yellow
    }
}

# ── Build ────────────────────────────────────────────────────────────

Set-Location $RootDir

# Restore production icons
Write-Host "Restoring production icons..." -ForegroundColor Cyan
git checkout -- apps/desktop/src-tauri/icons/

# Build web frontend
Write-Host "Building web frontend..." -ForegroundColor Cyan
$env:VITE_API_URL = "https://api.notebookmd.io"
Set-Location (Join-Path $RootDir "apps\web")
npx vite build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Web frontend build failed." -ForegroundColor Red
    exit 1
}

Set-Location $RootDir

# Build Tauri desktop app
Write-Host ""
Write-Host "Building Tauri desktop app..." -ForegroundColor Cyan
npm -w apps/desktop run build 2>&1 | Tee-Object -Variable tauriBuildOutput
$tauriBuildFailed = $LASTEXITCODE -ne 0

# The build succeeds in producing MSI/NSIS but exits non-zero when
# createUpdaterArtifacts is enabled and no signing key is set.
# Treat that specific error as a warning for unsigned builds.
if ($tauriBuildFailed -and -not $Sign) {
    $signingError = $tauriBuildOutput | Where-Object { $_ -match "TAURI_SIGNING_PRIVATE_KEY" }
    $bundlesCreated = $tauriBuildOutput | Where-Object { $_ -match "Finished.*bundles at" }
    if ($signingError -and $bundlesCreated) {
        Write-Host "Note: Updater signing skipped (no key set). Installers were built successfully." -ForegroundColor Yellow
    } else {
        Write-Host "Tauri build failed." -ForegroundColor Red
        exit 1
    }
} elseif ($tauriBuildFailed) {
    Write-Host "Tauri build failed." -ForegroundColor Red
    exit 1
}

# ── Output summary ───────────────────────────────────────────────────

$TauriConf = Get-Content (Join-Path $RootDir "apps\desktop\src-tauri\tauri.conf.json") -Raw | ConvertFrom-Json
$Version = $TauriConf.version
$BundleDir = Join-Path $RootDir "apps\desktop\src-tauri\target\release\bundle"

Write-Host ""
Write-Host "Build complete!" -ForegroundColor Green

$msi = Get-ChildItem "$BundleDir\msi\*.msi" -ErrorAction SilentlyContinue | Select-Object -First 1
$nsis = Get-ChildItem "$BundleDir\nsis\*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1

if ($msi) { Write-Host "  MSI:     $($msi.FullName)" }
if ($nsis) { Write-Host "  NSIS:    $($nsis.FullName)" }

$tarGz = Get-ChildItem "$BundleDir\nsis\*.nsis.zip" -ErrorAction SilentlyContinue | Select-Object -First 1
$sig = Get-ChildItem "$BundleDir\nsis\*.nsis.zip.sig" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($tarGz) { Write-Host "  Update:  $($tarGz.FullName)" }
if ($sig)   { Write-Host "  Sig:     $($sig.FullName)" }

Write-Host ""
