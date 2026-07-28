function New-ReadinessCheck {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string]$Id,
    [Parameter(Mandatory = $true)][string]$Category,
    [Parameter(Mandatory = $true)][ValidateSet("PASS", "WARN", "BLOCKED", "INFO")][string]$Status,
    [Parameter(Mandatory = $true)][string]$Subject,
    [Parameter(Mandatory = $true)][string]$Summary,
    [string]$Detail = "",
    [string]$Recommendation = ""
  )

  [pscustomobject][ordered]@{
    id = $Id
    category = $Category
    status = $Status
    subject = $Subject
    summary = $Summary
    detail = $Detail
    recommendation = $Recommendation
  }
}

function Get-SemanticMajorVersion {
  [CmdletBinding()]
  param([AllowNull()][string]$Version)

  if ([string]::IsNullOrWhiteSpace($Version)) {
    return $null
  }

  $match = [regex]::Match($Version, '(?<!\d)(\d+)(?:\.\d+){1,3}')
  if (-not $match.Success) {
    return $null
  }

  [int]$match.Groups[1].Value
}

function Test-IsProtectedWindowsPath {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [string[]]$ProtectedRoots
  )

  if (-not $ProtectedRoots) {
    $ProtectedRoots = @(
      [Environment]::GetFolderPath([Environment+SpecialFolder]::Windows),
      [Environment]::GetFolderPath([Environment+SpecialFolder]::ProgramFiles),
      [Environment]::GetFolderPath([Environment+SpecialFolder]::ProgramFilesX86),
      [Environment]::GetFolderPath([Environment+SpecialFolder]::CommonApplicationData)
    )
  }

  try {
    $candidate = [System.IO.Path]::GetFullPath($Path).TrimEnd('\', '/')
  }
  catch {
    return $false
  }

  foreach ($root in $ProtectedRoots) {
    if ([string]::IsNullOrWhiteSpace($root)) {
      continue
    }

    try {
      $normalizedRoot = [System.IO.Path]::GetFullPath($root).TrimEnd('\', '/')
    }
    catch {
      continue
    }

    if ($candidate.Equals($normalizedRoot, [StringComparison]::OrdinalIgnoreCase) -or
      $candidate.StartsWith("$normalizedRoot\", [StringComparison]::OrdinalIgnoreCase)) {
      return $true
    }
  }

  $false
}

function Resolve-WriteAccessFromRules {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][object[]]$Rules,
    [Parameter(Mandatory = $true)][string[]]$IdentitySids
  )

  # FileSystemRights.Write contains only the atomic directory/file write bits.
  # Composite values such as Modify and FullControl also contain read/delete bits,
  # which would create a false positive after an explicit write deny is applied.
  $writeMask = [int64][System.Security.AccessControl.FileSystemRights]::Write
  $allowMask = [int64]0
  $denyMask = [int64]0
  $matchedRuleCount = 0

  foreach ($rule in $Rules) {
    if ($IdentitySids -notcontains [string]$rule.Identity) {
      continue
    }

    $matchedRuleCount += 1
    $rights = [int64]$rule.RightsValue
    if ([string]$rule.AccessControlType -eq "Deny") {
      $denyMask = $denyMask -bor $rights
    }
    elseif ([string]$rule.AccessControlType -eq "Allow") {
      $allowMask = $allowMask -bor $rights
    }
  }

  if ($matchedRuleCount -eq 0) {
    return [pscustomobject]@{
      outcome = "Unknown"
      matchedRuleCount = 0
      allowMask = $allowMask
      denyMask = $denyMask
    }
  }

  $effectiveWriteMask = ($allowMask -band (-bnot $denyMask)) -band $writeMask
  $outcome = "NotWritable"
  if ($effectiveWriteMask -ne 0) {
    $outcome = "LikelyWritable"
  }

  [pscustomobject]@{
    outcome = $outcome
    matchedRuleCount = $matchedRuleCount
    allowMask = $allowMask
    denyMask = $denyMask
  }
}

function Get-CurrentIdentitySids {
  [CmdletBinding()]
  param()

  $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
  $sids = New-Object System.Collections.Generic.List[string]
  if ($identity.User) {
    $sids.Add($identity.User.Value) | Out-Null
  }
  foreach ($group in @($identity.Groups)) {
    if ($group) {
      $sids.Add($group.Value) | Out-Null
    }
  }
  $sids.ToArray()
}

function Get-NearestExistingDirectory {
  [CmdletBinding()]
  param([Parameter(Mandatory = $true)][string]$Path)

  try {
    $current = [System.IO.Path]::GetFullPath($Path)
  }
  catch {
    return $null
  }

  while (-not (Test-Path -LiteralPath $current -PathType Container)) {
    $parent = [System.IO.Directory]::GetParent($current)
    if (-not $parent) {
      return $null
    }
    $current = $parent.FullName
  }

  $current
}
