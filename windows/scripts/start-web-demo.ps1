[CmdletBinding()]
param(
  [int]$Port = 9360,
  [string]$Token = "demo123",
  [switch]$Build
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$webRoot = Join-Path $projectRoot "web-ui\dist"
$serverScript = Join-Path $PSScriptRoot "remote-room-demo.mjs"
$buildScript = Join-Path $PSScriptRoot "build-web-ui.ps1"
$bundledNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$node = $null

if (Test-Path -LiteralPath $bundledNode) {
  $node = $bundledNode
}
else {
  $nodeCommand = Get-Command "node.exe" -ErrorAction SilentlyContinue
  if ($nodeCommand) {
    $node = $nodeCommand.Source
  }
}
if (-not $node) {
  throw "Node.js was not found."
}
if (-not (Test-Path -LiteralPath $serverScript)) {
  throw "Web demo server was not found: $serverScript"
}
if (-not $Token) {
  throw "Token cannot be empty."
}

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

function Test-DemoReady {
  param(
    [int]$TargetPort,
    [string]$AccessToken
  )

  $ready = $false
  $uri = "http://127.0.0.1:$TargetPort/api/project?token=$([Uri]::EscapeDataString($AccessToken))"
  try {
    $response = Invoke-WebRequest -Uri $uri -UseBasicParsing -TimeoutSec 2
    $contentType = [string]$response.Headers["Content-Type"]
    if (($response.StatusCode -eq 200) -and $contentType.StartsWith("application/json")) {
      $project = $response.Content | ConvertFrom-Json
      $ready = $project.name -eq "codex-collab-panel-demo"
    }
  }
  catch {}
  return $ready
}

function ConvertTo-CommandLineArgument {
  param([string]$Value)

  $escaped = $Value.Replace('"', '\"')
  return '"' + $escaped + '"'
}

if ($Build) {
  & $buildScript
}
if (-not (Test-Path -LiteralPath $webRoot)) {
  throw "UI build output was not found. Run pnpm build:ui first."
}

$url = "http://127.0.0.1:$Port/?token=$([Uri]::EscapeDataString($Token))"
if (Test-DemoReady -TargetPort $Port -AccessToken $Token) {
  $legacyPid = Get-PortProcessId -TargetPort 4173
  if ($legacyPid) {
    Write-Output "[WARN] Legacy preview port 4173 is listening on PID $legacyPid. Do not use it."
  }
  Write-Output "[OK] Web demo is already running."
  Write-Output "[URL] $url"
  exit 0
}

$existingPid = Get-PortProcessId -TargetPort $Port
if ($existingPid) {
  throw "Port $Port is occupied by PID $existingPid, but it is not this web demo with the requested token."
}

$arguments = @(
  $serverScript,
  "--port", [string]$Port,
  "--observer-port", "9350",
  "--project", "codex-collab-panel-demo",
  "--project-root", $projectRoot,
  "--web-root", $webRoot,
  "--token", $Token
)
$quotedArguments = @()
foreach ($argument in $arguments) {
  $quotedArguments += ConvertTo-CommandLineArgument -Value $argument
}

$startInfo = New-Object System.Diagnostics.ProcessStartInfo
$startInfo.FileName = $node
$startInfo.Arguments = $quotedArguments -join " "
$startInfo.WorkingDirectory = $projectRoot
$startInfo.UseShellExecute = $false
$startInfo.CreateNoWindow = $true
$process = [System.Diagnostics.Process]::Start($startInfo)
if (-not $process) {
  throw "Node.js did not start."
}

$deadline = (Get-Date).AddSeconds(12)
$ready = $false
while ((Get-Date) -lt $deadline) {
  if ($process.HasExited) {
    break
  }
  if (Test-DemoReady -TargetPort $Port -AccessToken $Token) {
    $ready = $true
    break
  }
  Start-Sleep -Milliseconds 250
}

if (-not $ready) {
  $exitText = "still running"
  if ($process.HasExited) {
    $exitText = "exit code $($process.ExitCode)"
  }
  throw "Web demo did not become ready within 12 seconds ($exitText)."
}

$logRoot = Join-Path $env:TEMP "codex-collab-panel"
New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
$pidFile = Join-Path $logRoot "web-demo-$Port.pid"
[string]$process.Id | Set-Content -LiteralPath $pidFile -Encoding ASCII

$legacyPid = Get-PortProcessId -TargetPort 4173
if ($legacyPid) {
  Write-Output "[WARN] Legacy preview port 4173 is listening on PID $legacyPid. Do not use it."
}
Write-Output "[OK] Web demo started on PID $($process.Id)."
Write-Output "[URL] $url"
Write-Output "[INFO] PID file: $pidFile"
