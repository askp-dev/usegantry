# Preflight installer — Windows PowerShell
# Usage: irm https://preflight.dev/install.ps1 | iex
param(
	[string]$Version = "latest"
)

$ErrorActionPreference = "Stop"

$Repo = if ($env:PREFLIGHT_REPO) { $env:PREFLIGHT_REPO } else { "preflight-ai/preflight" }
$InstallDir = if ($env:PREFLIGHT_INSTALL_DIR) {
	$env:PREFLIGHT_INSTALL_DIR
} else {
	Join-Path $env:LOCALAPPDATA "Preflight\bin"
}
$BinaryName = "preflight-windows-x64.exe"
$BinaryPath = Join-Path $InstallDir "preflight.exe"

if ($Version -eq "latest") {
	$BaseUrl = "https://github.com/$Repo/releases/latest/download"
} else {
	$BaseUrl = "https://github.com/$Repo/releases/download/$Version"
}

Write-Host ""
Write-Host "  ⚡  PREFLIGHT" -ForegroundColor Green
Write-Host "  ─────────────────────────────────────────"
Write-Host "  target   windows-x64"
Write-Host "  version  $Version"
Write-Host "  install  $InstallDir"
Write-Host ""

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

Write-Host "→ Downloading $BinaryName…"
$ProgressPreference = "SilentlyContinue"
Invoke-WebRequest -Uri "$BaseUrl/$BinaryName" -OutFile $BinaryPath -UseBasicParsing

# Best-effort checksum verification.
try {
	$SumsPath = Join-Path $env:TEMP "preflight-SHA256SUMS.txt"
	Invoke-WebRequest -Uri "$BaseUrl/SHA256SUMS.txt" -OutFile $SumsPath -UseBasicParsing
	$Line = Get-Content $SumsPath | Where-Object { $_ -match [regex]::Escape($BinaryName) } | Select-Object -First 1
	if ($Line) {
		$Expected = ($Line -split "\s+")[0].ToLower()
		$Actual = (Get-FileHash -Algorithm SHA256 -Path $BinaryPath).Hash.ToLower()
		if ($Expected -ne $Actual) {
			Remove-Item -Force $BinaryPath
			throw "SHA-256 mismatch — aborting installation."
		}
		Write-Host "✓ SHA-256 verified" -ForegroundColor Green
	}
	Remove-Item -Force $SumsPath -ErrorAction SilentlyContinue
} catch [System.Net.WebException] {
	# No checksum file published — continue.
} catch {
	if ($_.Exception.Message -like "*SHA-256 mismatch*") { throw }
}

# Add to the user PATH once.
$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
if (($UserPath -split ";") -notcontains $InstallDir) {
	$NewPath = if ([string]::IsNullOrWhiteSpace($UserPath)) { $InstallDir } else { "$UserPath;$InstallDir" }
	[Environment]::SetEnvironmentVariable("Path", $NewPath, "User")
	Write-Host "✓ Added $InstallDir to your user PATH" -ForegroundColor Green
}
$env:Path = "$InstallDir;$env:Path"

Write-Host ""
Write-Host "✅ Installed to $BinaryPath" -ForegroundColor Green
Write-Host ""
Write-Host "👉 Open a new terminal, then run 'preflight scan' inside any repository."
Write-Host "   Docs: https://preflight.dev/#download"
Write-Host ""
