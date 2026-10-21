# Preflight AI Windows PowerShell Installer
$ErrorActionPreference = 'Stop'

$Repo = "your-org/preflight"
$InstallDir = "$env:LOCALAPPDATA\preflight\bin"

Write-Host "⚡ Detecting system architecture..." -ForegroundColor Cyan
$Arch = [System.Environment]::GetEnvironmentVariable("PROCESSOR_ARCHITECTURE")
if ($Arch -ne "AMD64") {
    Write-Warning "Non-x64 architecture detected ($Arch). Attempting x64 binary execution."
}

$BinaryName = "preflight-windows-x64.exe"
$DownloadUrl = "https://github.com/$Repo/releases/latest/download/$BinaryName"

Write-Host "⚡ Downloading Preflight AI for Windows..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
$TargetPath = Join-Path $InstallDir "preflight.exe"

Invoke-WebRequest -Uri $DownloadUrl -OutFile $TargetPath -UseBasicParsing

$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($UserPath -notlike "*$InstallDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$UserPath;$InstallDir", "User")
    Write-Host " Added $InstallDir to user PATH." -ForegroundColor Green
}

Write-Host "✅ Preflight installed to $TargetPath" -ForegroundColor Green
Write-Host "👉 Open a new terminal and run 'preflight scan' inside your project." -ForegroundColor Yellow
