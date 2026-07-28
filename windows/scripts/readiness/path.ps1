function Get-PathReadinessCheck {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string]$Id,
    [Parameter(Mandatory = $true)][string]$Subject,
    [AllowNull()][string]$Path,
    [Parameter(Mandatory = $true)][string[]]$IdentitySids
  )

  if ([string]::IsNullOrWhiteSpace($Path)) {
    return New-ReadinessCheck -Id $Id -Category "paths" -Status "WARN" -Subject $Subject `
      -Summary "Path is not configured." `
      -Recommendation "Configure a user-scoped path before relying on remote development."
  }

  try {
    $target = [System.IO.Path]::GetFullPath($Path)
  }
  catch {
    return New-ReadinessCheck -Id $Id -Category "paths" -Status "BLOCKED" -Subject $Subject `
      -Summary "Path is invalid." -Detail $Path
  }

  $exists = Test-Path -LiteralPath $target -PathType Container
  $aclPath = Get-NearestExistingDirectory -Path $target
  if (-not $aclPath) {
    return New-ReadinessCheck -Id $Id -Category "paths" -Status "BLOCKED" -Subject $Subject `
      -Summary "No existing parent directory could be inspected." -Detail $target
  }

  try {
    $acl = Get-Acl -LiteralPath $aclPath
    $rules = @(
      $acl.GetAccessRules(
        $true,
        $true,
        [System.Security.Principal.SecurityIdentifier]
      ) | ForEach-Object {
        [pscustomobject]@{
          Identity = $_.IdentityReference.Value
          AccessControlType = $_.AccessControlType.ToString()
          RightsValue = [int64]$_.FileSystemRights
        }
      }
    )
    $decision = Resolve-WriteAccessFromRules -Rules $rules -IdentitySids $IdentitySids
  }
  catch {
    return New-ReadinessCheck -Id $Id -Category "paths" -Status "WARN" -Subject $Subject `
      -Summary "ACL could not be inspected without changing the path." `
      -Detail "$target | $($_.Exception.Message)" `
      -Recommendation "Verify this path interactively on the original development computer."
  }

  $detail = "Target: $target. ACL source: $aclPath. No probe file was created."
  if ($decision.outcome -eq "LikelyWritable") {
    $summary = "ACL indicates the current user can write here."
    if (-not $exists) {
      $summary = "Target is missing, but the nearest existing parent ACL permits creation."
    }
    return New-ReadinessCheck -Id $Id -Category "paths" -Status "PASS" -Subject $Subject `
      -Summary $summary -Detail $detail
  }

  if ($decision.outcome -eq "NotWritable") {
    return New-ReadinessCheck -Id $Id -Category "paths" -Status "BLOCKED" -Subject $Subject `
      -Summary "ACL does not grant effective write rights to the current user or its groups." `
      -Detail $detail `
      -Recommendation "Use a project or cache directory under the current user profile; do not elevate the normal workflow."
  }

  New-ReadinessCheck -Id $Id -Category "paths" -Status "WARN" -Subject $Subject `
    -Summary "Effective write access could not be inferred from matching ACL entries." `
    -Detail $detail `
    -Recommendation "Confirm this path on the original computer before unattended use."
}

function Get-PnpmStorePath {
  [CmdletBinding()]
  param([Parameter(Mandatory = $true)][string]$ProjectRoot)

  if (-not [string]::IsNullOrWhiteSpace($env:PNPM_CONFIG_STORE_DIR)) {
    return $env:PNPM_CONFIG_STORE_DIR
  }
  if (-not [string]::IsNullOrWhiteSpace($env:PNPM_STORE_DIR)) {
    return $env:PNPM_STORE_DIR
  }

  $modulesFile = Join-Path $ProjectRoot "web-ui\node_modules\.modules.yaml"
  if (Test-Path -LiteralPath $modulesFile -PathType Leaf) {
    try {
      $storeLine = Select-String -LiteralPath $modulesFile -Pattern '^storeDir:\s*(.+)$' |
        Select-Object -First 1
      if ($storeLine) {
        return $storeLine.Matches[0].Groups[1].Value.Trim()
      }
    }
    catch {
      # Fall back to the standard user-scoped location without changing anything.
    }
  }

  if (-not [string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
    return Join-Path $env:LOCALAPPDATA "pnpm\store"
  }
  $null
}
