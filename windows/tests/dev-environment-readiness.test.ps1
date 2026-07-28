[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$modulePath = Join-Path (Split-Path -Parent $PSScriptRoot) "scripts\dev-environment-readiness.psm1"
Import-Module $modulePath -Force

function Assert-Equal {
  param(
    [Parameter(Mandatory = $true)][AllowNull()]$Actual,
    [Parameter(Mandatory = $true)][AllowNull()]$Expected,
    [Parameter(Mandatory = $true)][string]$Message
  )
  if ($Actual -ne $Expected) {
    throw "$Message Expected '$Expected', got '$Actual'."
  }
}

function Assert-True {
  param(
    [Parameter(Mandatory = $true)][bool]$Condition,
    [Parameter(Mandatory = $true)][string]$Message
  )
  if (-not $Condition) {
    throw $Message
  }
}

$protectedRoots = @("C:\Windows", "C:\Program Files", "C:\ProgramData")
Assert-True `
  -Condition (Test-IsProtectedWindowsPath -Path "C:\Program Files\Example" -ProtectedRoots $protectedRoots) `
  -Message "Protected path classification failed."
Assert-True `
  -Condition (-not (Test-IsProtectedWindowsPath -Path "D:\work\example" -ProtectedRoots $protectedRoots)) `
  -Message "User project path was incorrectly classified as protected."

$testSid = "S-1-5-21-test-user"
$allowRule = [pscustomobject]@{
  Identity = $testSid
  AccessControlType = "Allow"
  RightsValue = [int64][System.Security.AccessControl.FileSystemRights]::Modify
}
$denyWriteRule = [pscustomobject]@{
  Identity = $testSid
  AccessControlType = "Deny"
  RightsValue = [int64][System.Security.AccessControl.FileSystemRights]::Write
}

$allowed = Resolve-WriteAccessFromRules -Rules @($allowRule) -IdentitySids @($testSid)
Assert-Equal -Actual $allowed.outcome -Expected "LikelyWritable" -Message "Allow ACL evaluation failed."

$denied = Resolve-WriteAccessFromRules -Rules @($allowRule, $denyWriteRule) -IdentitySids @($testSid)
Assert-Equal -Actual $denied.outcome -Expected "NotWritable" -Message "Deny ACL evaluation failed."

$unknown = Resolve-WriteAccessFromRules -Rules @($allowRule) -IdentitySids @("S-1-5-21-other")
Assert-Equal -Actual $unknown.outcome -Expected "Unknown" -Message "Unmatched ACL evaluation failed."

Assert-Equal -Actual (Get-SemanticMajorVersion -Version "v24.7.0") -Expected 24 `
  -Message "Semantic major version parsing failed."
Assert-Equal -Actual (Get-SemanticMajorVersion -Version "git version unknown") -Expected $null `
  -Message "Invalid version parsing failed."

$listeners = @(
  [pscustomobject]@{ Port = 9360; Address = "127.0.0.1" },
  [pscustomobject]@{ Port = 9360; Address = "::1" }
)
$portChecks = @(Get-PortReadinessChecks -Ports @(9360, 9350) -Listeners $listeners)
$occupied = $portChecks | Where-Object { $_.id -eq "port.9360" }
$free = $portChecks | Where-Object { $_.id -eq "port.9350" }
Assert-Equal -Actual $occupied.status -Expected "WARN" -Message "Occupied port classification failed."
Assert-Equal -Actual $free.status -Expected "PASS" -Message "Free port classification failed."

$riskChecks = @(Get-AdministrativeRiskChecks `
    -ProjectRoot "D:\work\example" `
    -PnpmHome "C:\Program Files\pnpm" `
    -PnpmStore "D:\cache\pnpm" `
    -IsElevated $false)
$projectRisk = $riskChecks | Where-Object { $_.id -eq "risk.project-protected" }
$pnpmRisk = $riskChecks | Where-Object { $_.id -eq "risk.pnpm-home" }
Assert-Equal -Actual $projectRisk.status -Expected "PASS" -Message "Project path risk classification failed."
Assert-Equal -Actual $pnpmRisk.status -Expected "WARN" -Message "PNPM_HOME risk classification failed."

Write-Output "[PASS] dev-environment-readiness tests"
