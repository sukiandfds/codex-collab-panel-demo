[CmdletBinding()]
param(
  [int]$Port = 9335,
  [int]$ObserverPort = 9350
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$node = "C:\Users\Hans\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$profile = Join-Path $env:LOCALAPPDATA "CodexDreamSkin\collab-profile"
$logRoot = Join-Path $env:TEMP "negus"

if (-not (Test-Path -LiteralPath $node)) {
  throw "Bundled Node.js 24 was not found at $node"
}

. (Join-Path $PSScriptRoot "common-windows.ps1")
$codex = Get-DreamSkinCodexInstall
$existing = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -eq "ChatGPT.exe" -and $_.CommandLine -like "*$profile*" }
if ($existing) {
  Write-Host "Codex collaboration window is already running."
  exit 0
}

while (-not (Test-DreamSkinPortAvailable -Port $Port)) { $Port += 1 }
while (-not (Test-DreamSkinPortAvailable -Port $ObserverPort)) { $ObserverPort += 1 }
New-Item -ItemType Directory -Force -Path $profile,$logRoot | Out-Null

$arguments = @(
  "--remote-debugging-address=127.0.0.1",
  "--remote-debugging-port=$Port",
  "--user-data-dir=$profile"
)
$null = Start-DreamSkinCodex -Codex $codex -Arguments $arguments

$deadline = (Get-Date).AddSeconds(45)
$identity = $null
while ($null -eq $identity -and (Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 400
  $identity = Get-DreamSkinVerifiedCdpIdentity -Port $Port -Codex $codex
}
if ($null -eq $identity) { throw "Codex did not expose CDP on port $Port" }

$injectorLog = Join-Path $logRoot "injector-$Port.log"
$injectorError = Join-Path $logRoot "injector-$Port.error.log"
$observerLog = Join-Path $logRoot "observer-$ObserverPort.log"
$observerError = Join-Path $logRoot "observer-$ObserverPort.error.log"
$bridgeLog = Join-Path $logRoot "bridge-$Port.log"
$bridgeError = Join-Path $logRoot "bridge-$Port.error.log"

Start-Process -FilePath $node -ArgumentList @(
  (Join-Path $PSScriptRoot "injector.mjs"), "--watch", "--port", "$Port",
  "--browser-id", $identity.BrowserId, "--theme-dir", (Join-Path $root "assets")
) -WindowStyle Hidden -RedirectStandardOutput $injectorLog -RedirectStandardError $injectorError | Out-Null

Start-Process -FilePath $node -ArgumentList @(
  (Join-Path $PSScriptRoot "summary-observer.mjs"), "--port", "$ObserverPort",
  "--model", "gpt-5.6-luna"
) -WindowStyle Hidden -RedirectStandardOutput $observerLog -RedirectStandardError $observerError | Out-Null

Start-Process -FilePath $node -ArgumentList @(
  (Join-Path $PSScriptRoot "summary-bridge.mjs"), "--port", "$Port",
  "--observer-port", "$ObserverPort"
) -WindowStyle Hidden -RedirectStandardOutput $bridgeLog -RedirectStandardError $bridgeError | Out-Null

Write-Host "Codex collaboration window started. CDP=$Port Observer=$ObserverPort"
