function Get-PortReadinessChecks {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][int[]]$Ports,
    [AllowNull()][object[]]$Listeners = $null
  )

  if ($null -eq $Listeners) {
    try {
      $Listeners = @(
        [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() |
          ForEach-Object {
            [pscustomobject]@{
              Port = $_.Port
              Address = $_.Address.ToString()
            }
          }
      )
    }
    catch {
      return ,(New-ReadinessCheck -Id "ports.enumeration" -Category "ports" -Status "WARN" -Subject "TCP listeners" `
        -Summary "Active TCP listeners could not be enumerated." -Detail $_.Exception.Message `
        -Recommendation "Check the project ports interactively on the original computer.")
    }
  }

  $checks = New-Object System.Collections.Generic.List[object]
  foreach ($port in @($Ports | Sort-Object -Unique)) {
    if ($port -lt 1 -or $port -gt 65535) {
      $checks.Add((New-ReadinessCheck -Id "port.$port" -Category "ports" -Status "BLOCKED" -Subject "TCP $port" `
        -Summary "Port number is outside the valid range 1-65535.")) | Out-Null
      continue
    }

    $matches = @($Listeners | Where-Object { [int]$_.Port -eq $port })
    if ($matches.Count -gt 0) {
      $addresses = @($matches | ForEach-Object { [string]$_.Address } | Sort-Object -Unique) -join ", "
      $checks.Add((New-ReadinessCheck -Id "port.$port" -Category "ports" -Status "WARN" -Subject "TCP $port" `
        -Summary "A process is already listening on this port." -Detail "Listener addresses: $addresses" `
        -Recommendation "Confirm it is the expected project process before starting another instance; this check does not stop it.")) | Out-Null
    }
    else {
      $checks.Add((New-ReadinessCheck -Id "port.$port" -Category "ports" -Status "PASS" -Subject "TCP $port" `
        -Summary "No active TCP listener was observed." `
        -Detail "This is a read-only snapshot; another process can claim the port later.")) | Out-Null
    }
  }
  $checks.ToArray()
}

function Get-AdministrativeRiskChecks {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string]$ProjectRoot,
    [AllowNull()][string]$PnpmHome,
    [AllowNull()][string]$PnpmStore,
    [AllowNull()][object]$IsElevated = $null
  )

  $checks = New-Object System.Collections.Generic.List[object]
  if ($null -eq $IsElevated) {
    $principal = New-Object System.Security.Principal.WindowsPrincipal(
      [System.Security.Principal.WindowsIdentity]::GetCurrent()
    )
    $IsElevated = $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
  }

  if ([bool]$IsElevated) {
    $checks.Add((New-ReadinessCheck -Id "risk.elevated" -Category "uac-risks" -Status "WARN" -Subject "Current process token" `
      -Summary "The checker is running elevated, so it does not prove the normal-user workflow is writable." `
      -Recommendation "Run the same checker once from a normal, non-administrator shell on the original computer.")) | Out-Null
  }
  else {
    $checks.Add((New-ReadinessCheck -Id "risk.elevated" -Category "uac-risks" -Status "PASS" -Subject "Current process token" `
      -Summary "The checker completed under a normal non-elevated token.")) | Out-Null
  }

  if (Test-IsProtectedWindowsPath -Path $ProjectRoot) {
    $checks.Add((New-ReadinessCheck -Id "risk.project-protected" -Category "uac-risks" -Status "BLOCKED" -Subject "Project location" `
      -Summary "The repository is under a Windows protected directory." -Detail $ProjectRoot `
      -Recommendation "Keep the repository under the current user's development directory instead of elevating edits/builds.")) | Out-Null
  }
  else {
    $checks.Add((New-ReadinessCheck -Id "risk.project-protected" -Category "uac-risks" -Status "PASS" -Subject "Project location" `
      -Summary "The repository is outside the standard Windows protected directories." -Detail $ProjectRoot)) | Out-Null
  }

  foreach ($entry in @(
      [pscustomobject]@{ Id = "risk.pnpm-home"; Subject = "PNPM_HOME"; Path = $PnpmHome },
      [pscustomobject]@{ Id = "risk.pnpm-store"; Subject = "pnpm store"; Path = $PnpmStore }
    )) {
    if ([string]::IsNullOrWhiteSpace([string]$entry.Path)) {
      continue
    }
    if (Test-IsProtectedWindowsPath -Path ([string]$entry.Path)) {
      $checks.Add((New-ReadinessCheck -Id $entry.Id -Category "uac-risks" -Status "WARN" -Subject $entry.Subject `
        -Summary "This package-manager path is under a protected Windows directory." -Detail ([string]$entry.Path) `
        -Recommendation "Use a current-user package home/store to avoid administrator writes.")) | Out-Null
    }
  }

  try {
    $effectivePolicy = Get-ExecutionPolicy
    $policyStatus = "PASS"
    $policySummary = "Effective execution policy is $effectivePolicy."
    if ($effectivePolicy -in @("Restricted", "AllSigned")) {
      $policyStatus = "WARN"
      $policySummary = "Effective execution policy $effectivePolicy may block project scripts."
    }
    $checks.Add((New-ReadinessCheck -Id "risk.execution-policy" -Category "uac-risks" -Status $policyStatus `
      -Subject "PowerShell execution policy" -Summary $policySummary `
      -Recommendation $(if ($policyStatus -eq "WARN") { "Prefer a process-scoped, approved policy for project scripts; do not change LocalMachine policy just for this project." } else { "" }))) | Out-Null
  }
  catch {
    $checks.Add((New-ReadinessCheck -Id "risk.execution-policy" -Category "uac-risks" -Status "INFO" `
      -Subject "PowerShell execution policy" -Summary "Execution policy could not be read." -Detail $_.Exception.Message)) | Out-Null
  }

  if ($ExecutionContext.SessionState.LanguageMode -ne "FullLanguage") {
    $checks.Add((New-ReadinessCheck -Id "risk.language-mode" -Category "uac-risks" -Status "WARN" `
      -Subject "PowerShell language mode" `
      -Summary "PowerShell is running in $($ExecutionContext.SessionState.LanguageMode) mode; project scripts may be blocked.")) | Out-Null
  }

  try {
    $developerMode = Get-ItemPropertyValue `
      -LiteralPath "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock" `
      -Name "AllowDevelopmentWithoutDevLicense" -ErrorAction Stop
    if ([int]$developerMode -eq 1) {
      $checks.Add((New-ReadinessCheck -Id "risk.symlinks" -Category "uac-risks" -Status "PASS" -Subject "Developer Mode" `
        -Summary "Windows Developer Mode is enabled, reducing elevation risk for user-created symbolic links.")) | Out-Null
    }
    else {
      $checks.Add((New-ReadinessCheck -Id "risk.symlinks" -Category "uac-risks" -Status "INFO" -Subject "Developer Mode" `
        -Summary "Windows Developer Mode is not enabled; creating symbolic links can still require elevation." `
        -Recommendation "Only treat this as a maintenance item if the project actually needs symbolic links.")) | Out-Null
    }
  }
  catch {
    $checks.Add((New-ReadinessCheck -Id "risk.symlinks" -Category "uac-risks" -Status "INFO" -Subject "Developer Mode" `
      -Summary "Developer Mode state was unavailable; symbolic-link elevation risk is unknown.")) | Out-Null
  }

  $checks.Add((New-ReadinessCheck -Id "risk.system-actions" -Category "uac-risks" -Status "INFO" `
    -Subject "System-level actions" `
    -Summary "Drivers, Windows services, machine-wide firewall rules, HKLM writes, and protected-directory changes remain local maintenance tasks." `
    -Detail "The checker does not attempt or simulate any of these operations.")) | Out-Null

  $checks.ToArray()
}
