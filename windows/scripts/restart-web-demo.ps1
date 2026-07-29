[CmdletBinding()]
param(
  [int]$Port = 9360,
  [string]$Token = "demo123",
  [string]$DeviceName = $env:COMPUTERNAME,
  [switch]$Worker
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$startScript = Join-Path $PSScriptRoot "start-web-demo.ps1"
$stateFile = Join-Path $projectRoot "runtime\execution-runs.json"

function Get-PortProcessId {
  param([int]$TargetPort)

  $lines = @(& netstat.exe -ano -p tcp)
  $pattern = ":$TargetPort\s+.*LISTENING\s+(\d+)\s*$"
  foreach ($line in $lines) {
    if ($line -match $pattern) {
      return [int]$Matches[1]
    }
  }
  return $null
}

function Test-ActiveRun {
  if (-not (Test-Path -LiteralPath $stateFile)) {
    return $false
  }
  try {
    $stored = Get-Content -LiteralPath $stateFile -Raw -Encoding UTF8 | ConvertFrom-Json
    return @($stored.statuses | Where-Object { $_.active }).Count -gt 0
  }
  catch {
    return $true
  }
}

if (-not $Worker) {
  $arguments = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $PSCommandPath,
    "-Port", [string]$Port,
    "-Token", $Token,
    "-DeviceName", $DeviceName,
    "-Worker"
  )
  $process = Start-Process -FilePath "powershell.exe" -ArgumentList $arguments -WindowStyle Hidden -PassThru
  if (-not $process) {
    throw "The detached restart worker did not start."
  }
  Write-Output "[OK] Safe restart scheduled."
  Write-Output "[INFO] Port $Port will restart after the active task finishes."
  exit 0
}

$deadline = (Get-Date).AddMinutes(5)
while ((Get-Date) -lt $deadline) {
  if (-not (Test-ActiveRun)) {
    break
  }
  Start-Sleep -Seconds 1
}
if (Test-ActiveRun) {
  exit 2
}

Start-Sleep -Seconds 1
$existingPid = Get-PortProcessId -TargetPort $Port
if ($existingPid) {
  Stop-Process -Id $existingPid -Force
  Start-Sleep -Milliseconds 750
}

& $startScript -Port $Port -Token $Token -DeviceName $DeviceName
