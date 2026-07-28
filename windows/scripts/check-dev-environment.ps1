[CmdletBinding()]
param(
  [string]$ProjectRoot,
  [int[]]$Port = @(9360, 9335, 9350),
  [int]$MinimumNodeMajor = 22,
  [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
  $ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
}

$modulePath = Join-Path $PSScriptRoot "dev-environment-readiness.psm1"
Import-Module $modulePath -Force

$report = Get-DevelopmentEnvironmentReadiness `
  -ProjectRoot $ProjectRoot `
  -Ports $Port `
  -MinimumNodeMajor $MinimumNodeMajor

if ($Json) {
  $report | ConvertTo-Json -Depth 8
}
else {
  Format-DevelopmentEnvironmentReadiness -Report $report
}
