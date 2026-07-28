function Get-DevelopmentEnvironmentReadiness {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string]$ProjectRoot,
    [int[]]$Ports = @(9360, 9335, 9350),
    [int]$MinimumNodeMajor = 22
  )

  $root = [System.IO.Path]::GetFullPath($ProjectRoot)
  $identitySids = Get-CurrentIdentitySids
  $pnpmStore = Get-PnpmStorePath -ProjectRoot $root
  $pnpmHome = $env:PNPM_HOME
  $codexHome = $env:CODEX_HOME
  if ([string]::IsNullOrWhiteSpace($codexHome) -and -not [string]::IsNullOrWhiteSpace($env:USERPROFILE)) {
    $codexHome = Join-Path $env:USERPROFILE ".codex"
  }

  $checks = New-Object System.Collections.Generic.List[object]
  $pathCandidates = New-Object System.Collections.Generic.List[object]
  foreach ($candidate in @(
    [pscustomobject]@{ Id = "path.project"; Subject = "Project root"; Path = $root },
    [pscustomobject]@{ Id = "path.git"; Subject = "Git metadata"; Path = (Join-Path $root ".git") },
    [pscustomobject]@{ Id = "path.dependencies"; Subject = "Project dependencies"; Path = (Join-Path $root "web-ui\node_modules") },
    [pscustomobject]@{ Id = "path.local-app-data"; Subject = "LOCALAPPDATA"; Path = $env:LOCALAPPDATA },
    [pscustomobject]@{ Id = "path.temp"; Subject = "TEMP"; Path = $env:TEMP },
    [pscustomobject]@{ Id = "path.codex-home"; Subject = "Codex home"; Path = $codexHome },
    [pscustomobject]@{ Id = "path.pnpm-store"; Subject = "pnpm store"; Path = $pnpmStore }
    )) {
    $pathCandidates.Add($candidate) | Out-Null
  }
  if (-not [string]::IsNullOrWhiteSpace($pnpmHome)) {
    $pathCandidates.Add(
      [pscustomobject]@{ Id = "path.pnpm-home"; Subject = "PNPM_HOME"; Path = $pnpmHome }
    ) | Out-Null
  }

  $seenPaths = New-Object System.Collections.Generic.HashSet[string]([StringComparer]::OrdinalIgnoreCase)
  foreach ($candidate in $pathCandidates) {
    $pathText = [string]$candidate.Path
    if (-not [string]::IsNullOrWhiteSpace($pathText)) {
      try {
        $pathKey = [System.IO.Path]::GetFullPath($pathText)
      }
      catch {
        $pathKey = $pathText
      }
      if (-not $seenPaths.Add($pathKey)) {
        continue
      }
    }
    $checks.Add((Get-PathReadinessCheck -Id $candidate.Id -Subject $candidate.Subject `
      -Path $pathText -IdentitySids $identitySids)) | Out-Null
  }

  foreach ($check in @(Get-ToolReadinessChecks -ProjectRoot $root -MinimumNodeMajor $MinimumNodeMajor)) {
    $checks.Add($check) | Out-Null
  }
  foreach ($check in @(Get-PortReadinessChecks -Ports $Ports)) {
    $checks.Add($check) | Out-Null
  }
  foreach ($check in @(Get-AdministrativeRiskChecks -ProjectRoot $root -PnpmHome $pnpmHome -PnpmStore $pnpmStore)) {
    $checks.Add($check) | Out-Null
  }

  $blockedCount = @($checks | Where-Object { $_.status -eq "BLOCKED" }).Count
  $warningCount = @($checks | Where-Object { $_.status -eq "WARN" }).Count
  $overall = "READY"
  if ($blockedCount -gt 0) {
    $overall = "BLOCKED"
  }
  elseif ($warningCount -gt 0) {
    $overall = "ATTENTION"
  }

  [pscustomobject][ordered]@{
    schemaVersion = 1
    generatedAt = [DateTimeOffset]::Now.ToString("o")
    projectRoot = $root
    overallStatus = $overall
    summary = [pscustomobject][ordered]@{
      passed = @($checks | Where-Object { $_.status -eq "PASS" }).Count
      warnings = $warningCount
      blocked = $blockedCount
      informational = @($checks | Where-Object { $_.status -eq "INFO" }).Count
    }
    readOnlyContract = @(
      "No files or directories are created, changed, or deleted.",
      "No package-manager, Node.js, or Git command is executed.",
      "No process or Windows service is started, stopped, or restarted.",
      "No port is bound and no Windows setting is changed.",
      "Writable-path results are ACL-based estimates, not write probes."
    )
    checks = $checks.ToArray()
  }
}

function Format-DevelopmentEnvironmentReadiness {
  [CmdletBinding()]
  param([Parameter(Mandatory = $true)][object]$Report)

  $lines = New-Object System.Collections.Generic.List[string]
  $lines.Add("Windows development environment readiness (read-only)") | Out-Null
  $lines.Add("Project: $($Report.projectRoot)") | Out-Null
  $lines.Add("Overall: $($Report.overallStatus)") | Out-Null
  $lines.Add("No files/configuration/processes/services were changed.") | Out-Null

  foreach ($category in @("paths", "tools", "ports", "uac-risks")) {
    $categoryChecks = @($Report.checks | Where-Object { $_.category -eq $category })
    if ($categoryChecks.Count -eq 0) {
      continue
    }
    $lines.Add("") | Out-Null
    $lines.Add("[$category]") | Out-Null
    foreach ($check in $categoryChecks) {
      $lines.Add(("{0,-9} {1}: {2}" -f $check.status, $check.subject, $check.summary)) | Out-Null
      if (-not [string]::IsNullOrWhiteSpace([string]$check.detail)) {
        $lines.Add("          $($check.detail)") | Out-Null
      }
      if (-not [string]::IsNullOrWhiteSpace([string]$check.recommendation)) {
        $lines.Add("          Next: $($check.recommendation)") | Out-Null
      }
    }
  }

  $lines.Add("") | Out-Null
  $lines.Add(("Summary: {0} pass, {1} warning, {2} blocked, {3} info." -f `
      $Report.summary.passed, $Report.summary.warnings, $Report.summary.blocked, $Report.summary.informational)) | Out-Null
  $lines.ToArray()
}
