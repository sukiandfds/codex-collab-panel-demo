Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$readinessRoot = Join-Path $PSScriptRoot "readiness"
. (Join-Path $readinessRoot "common.ps1")
. (Join-Path $readinessRoot "path.ps1")
. (Join-Path $readinessRoot "tool.ps1")
. (Join-Path $readinessRoot "host.ps1")
. (Join-Path $readinessRoot "report.ps1")

Export-ModuleMember -Function @(
  "Format-DevelopmentEnvironmentReadiness",
  "Get-AdministrativeRiskChecks",
  "Get-DevelopmentEnvironmentReadiness",
  "Get-PortReadinessChecks",
  "Get-SemanticMajorVersion",
  "Resolve-WriteAccessFromRules",
  "Test-IsProtectedWindowsPath"
)
