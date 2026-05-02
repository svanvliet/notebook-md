#
# release-desktop.ps1 — Build and publish a Windows desktop release to GitHub
#
# Usage:
#   .\scripts\release-desktop.ps1 -Version 0.3.0
#
# This script:
#   1. Bumps version in tauri.conf.json, package.json, Cargo.toml
#   2. Commits the version bump
#   3. Runs build-desktop.ps1 (with signing)
#   4. Generates latest.json from build artifacts
#   5. Tags, pushes, and creates a GitHub Release with all artifacts
#
# Prerequisites:
#   - gh CLI authenticated
#   - Tauri updater signing key at ~/certs/tauri/notebook-md.key
#   - All build prerequisites (Rust, Node.js, VS Build Tools)
#

param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^\d+\.\d+\.\d+$')]
    [string]$Version
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RootDir = Split-Path -Parent $ScriptDir

$Tag = "desktop-v$Version"
$BundleDir = Join-Path $RootDir "apps\desktop\src-tauri\target\release\bundle"

Write-Host ""
Write-Host "Releasing Notebook.md Desktop v$Version" -ForegroundColor Cyan
Write-Host ""

# ── 1. Bump version ──────────────────────────────────────────────────

Write-Host "Bumping version to $Version..." -ForegroundColor Yellow

Set-Location $RootDir

# tauri.conf.json
$tauriConf = Join-Path $RootDir "apps\desktop\src-tauri\tauri.conf.json"
(Get-Content $tauriConf -Raw) -replace '"version":\s*"[0-9.]+"', "`"version`": `"$Version`"" |
    Set-Content $tauriConf -NoNewline

# package.json
$pkgJson = Join-Path $RootDir "apps\desktop\package.json"
(Get-Content $pkgJson -Raw) -replace '"version":\s*"[0-9.]+"', "`"version`": `"$Version`"" |
    Set-Content $pkgJson -NoNewline

# Cargo.toml
$cargoToml = Join-Path $RootDir "apps\desktop\src-tauri\Cargo.toml"
(Get-Content $cargoToml -Raw) -replace '(?m)^version\s*=\s*"[0-9.]+"', "version = `"$Version`"" |
    Set-Content $cargoToml -NoNewline

git add -A
git commit -m "Bump desktop version to $Version`n`nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"

# ── 2. Build ─────────────────────────────────────────────────────────

Write-Host ""
& "$ScriptDir\build-desktop.ps1" -Sign
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed. Aborting release." -ForegroundColor Red
    exit 1
}

# ── 3. Generate latest.json ──────────────────────────────────────────

Write-Host "Generating latest.json..." -ForegroundColor Yellow

# Find the NSIS update artifact and signature
$nsisZip = Get-ChildItem "$BundleDir\nsis\*.nsis.zip" -ErrorAction SilentlyContinue | Select-Object -First 1
$nsisZipSig = Get-ChildItem "$BundleDir\nsis\*.nsis.zip.sig" -ErrorAction SilentlyContinue | Select-Object -First 1
$msiZip = Get-ChildItem "$BundleDir\msi\*.msi.zip" -ErrorAction SilentlyContinue | Select-Object -First 1
$msiZipSig = Get-ChildItem "$BundleDir\msi\*.msi.zip.sig" -ErrorAction SilentlyContinue | Select-Object -First 1

# Prefer NSIS artifacts, fall back to MSI
$updateFile = if ($nsisZip) { $nsisZip } else { $msiZip }
$sigFile = if ($nsisZipSig) { $nsisZipSig } else { $msiZipSig }

if (-not $updateFile -or -not $sigFile) {
    Write-Host "Update artifacts not found. Is TAURI_SIGNING_PRIVATE_KEY set?" -ForegroundColor Red
    Write-Host "  Bundle dir: $BundleDir" -ForegroundColor Red
    exit 1
}

$Signature = Get-Content $sigFile.FullName -Raw
$PubDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$UpdateFileName = $updateFile.Name

$latestJson = @{
    version  = $Version
    notes    = "Notebook.md Desktop v$Version"
    pub_date = $PubDate
    platforms = @{
        "windows-x86_64" = @{
            signature = $Signature.Trim()
            url       = "https://github.com/svanvliet/notebook-md/releases/download/$Tag/$UpdateFileName"
        }
    }
} | ConvertTo-Json -Depth 4

$latestJsonPath = Join-Path $BundleDir "latest.json"
$latestJson | Set-Content $latestJsonPath -Encoding UTF8

Write-Host "Generated latest.json" -ForegroundColor Green

# ── 4. Tag and push ──────────────────────────────────────────────────

Write-Host "Pushing to origin..." -ForegroundColor Yellow
git push origin main

git tag $Tag -m "Desktop v$Version"
git push origin $Tag

# ── 5. Create GitHub Release ─────────────────────────────────────────

Write-Host "Creating GitHub Release..." -ForegroundColor Yellow

# Collect all release artifacts
$artifacts = @($latestJsonPath)

$msi = Get-ChildItem "$BundleDir\msi\*.msi" -ErrorAction SilentlyContinue | Select-Object -First 1
$nsis = Get-ChildItem "$BundleDir\nsis\*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1

if ($msi) { $artifacts += $msi.FullName }
if ($nsis) { $artifacts += $nsis.FullName }
if ($updateFile) { $artifacts += $updateFile.FullName }
if ($sigFile) { $artifacts += $sigFile.FullName }

$ghArgs = @("release", "create", $Tag) + $artifacts + @(
    "--title", "Notebook.md Desktop v$Version",
    "--generate-notes",
    "--latest"
)

gh @ghArgs

Write-Host ""
Write-Host "Released Notebook.md Desktop v$Version" -ForegroundColor Green
Write-Host "   https://github.com/svanvliet/notebook-md/releases/tag/$Tag"
Write-Host ""
