function Find-ReadinessCommand {
  [CmdletBinding()]
  param([Parameter(Mandatory = $true)][string[]]$Names)

  foreach ($name in $Names) {
    $command = Get-Command -Name $name -CommandType Application, ExternalScript -ErrorAction SilentlyContinue |
      Select-Object -First 1
    if ($command) {
      return $command
    }
  }
  $null
}

function Get-FileProductVersion {
  [CmdletBinding()]
  param([AllowNull()][string]$Path)

  if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    return $null
  }

  try {
    $item = Get-Item -LiteralPath $Path
    foreach ($candidate in @($item.VersionInfo.ProductVersion, $item.VersionInfo.FileVersion)) {
      if (-not [string]::IsNullOrWhiteSpace($candidate) -and $candidate -notmatch '^0(?:\.0)+$') {
        return [string]$candidate
      }
    }
  }
  catch {
    return $null
  }
  $null
}

function Get-PnpmPackageVersionFromWrapper {
  [CmdletBinding()]
  param([AllowNull()][string]$CommandPath)

  if ([string]::IsNullOrWhiteSpace($CommandPath)) {
    return $null
  }

  $commandDirectory = Split-Path -Parent $CommandPath
  $candidates = @(
    (Join-Path $commandDirectory "node_modules\pnpm\package.json"),
    (Join-Path (Split-Path -Parent $commandDirectory) "node_modules\pnpm\package.json")
  )
  foreach ($candidate in $candidates) {
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
      continue
    }
    try {
      $package = Get-Content -LiteralPath $candidate -Raw -Encoding UTF8 | ConvertFrom-Json
      if ($package.version) {
        return [string]$package.version
      }
    }
    catch {
      continue
    }
  }
  $null
}

function Get-ExpectedPnpmVersion {
  [CmdletBinding()]
  param([Parameter(Mandatory = $true)][string]$ProjectRoot)

  $packagePath = Join-Path $ProjectRoot "package.json"
  if (-not (Test-Path -LiteralPath $packagePath -PathType Leaf)) {
    return $null
  }
  try {
    $package = Get-Content -LiteralPath $packagePath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ([string]$package.packageManager -match '^pnpm@(.+)$') {
      return $matches[1]
    }
  }
  catch {
    return $null
  }
  $null
}

function Get-ToolReadinessChecks {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string]$ProjectRoot,
    [int]$MinimumNodeMajor = 22
  )

  $checks = New-Object System.Collections.Generic.List[object]

  $node = Find-ReadinessCommand -Names @("node.exe", "node")
  if (-not $node) {
    $checks.Add((New-ReadinessCheck -Id "tool.node" -Category "tools" -Status "BLOCKED" -Subject "Node.js" `
      -Summary "Node.js was not found on PATH." `
      -Recommendation "Install Node.js for the current user or use the existing project runtime; do not require a machine-wide update.")) | Out-Null
  }
  else {
    $nodePath = [string]$node.Source
    $nodeVersion = Get-FileProductVersion -Path $nodePath
    $nodeMajor = Get-SemanticMajorVersion -Version $nodeVersion
    $nodeStatus = "PASS"
    $nodeSummary = "Node.js is available."
    $nodeRecommendation = ""
    if ($null -eq $nodeMajor) {
      $nodeStatus = "WARN"
      $nodeSummary = "Node.js is available, but its version could not be read from file metadata."
      $nodeRecommendation = "Run node --version later if the original computer needs an exact compatibility check."
    }
    elseif ($nodeMajor -lt $MinimumNodeMajor) {
      $nodeStatus = "BLOCKED"
      $nodeSummary = "Node.js $nodeVersion is older than the required major version $MinimumNodeMajor."
      $nodeRecommendation = "Use a user-scoped Node.js $MinimumNodeMajor+ runtime."
    }
    else {
      $nodeSummary = "Node.js $nodeVersion meets the major version requirement ($MinimumNodeMajor+)."
    }
    $checks.Add((New-ReadinessCheck -Id "tool.node" -Category "tools" -Status $nodeStatus -Subject "Node.js" `
      -Summary $nodeSummary -Detail $nodePath -Recommendation $nodeRecommendation)) | Out-Null
  }

  $pnpm = Find-ReadinessCommand -Names @("pnpm.cmd", "pnpm.exe", "pnpm.ps1", "pnpm")
  $expectedPnpm = Get-ExpectedPnpmVersion -ProjectRoot $ProjectRoot
  if (-not $pnpm) {
    $detail = ""
    if ($expectedPnpm) {
      $detail = "Repository packageManager: pnpm@$expectedPnpm"
    }
    $checks.Add((New-ReadinessCheck -Id "tool.pnpm" -Category "tools" -Status "BLOCKED" -Subject "pnpm" `
      -Summary "pnpm was not found on PATH." -Detail $detail `
      -Recommendation "Provide pnpm in the current user's toolchain; avoid a machine-wide administrator install.")) | Out-Null
  }
  else {
    $pnpmPath = [string]$pnpm.Source
    $pnpmVersion = Get-PnpmPackageVersionFromWrapper -CommandPath $pnpmPath
    $pnpmStatus = "PASS"
    $pnpmSummary = "pnpm is available."
    if ($pnpmVersion -and $expectedPnpm -and $pnpmVersion -ne $expectedPnpm) {
      $pnpmStatus = "WARN"
      $pnpmSummary = "pnpm $pnpmVersion is available; the repository requests $expectedPnpm."
    }
    elseif ($pnpmVersion) {
      $pnpmSummary = "pnpm $pnpmVersion is available."
    }
    elseif ($expectedPnpm) {
      $pnpmSummary = "pnpm is available; exact version was not executed. The repository requests $expectedPnpm."
    }
    $checks.Add((New-ReadinessCheck -Id "tool.pnpm" -Category "tools" -Status $pnpmStatus -Subject "pnpm" `
      -Summary $pnpmSummary -Detail $pnpmPath)) | Out-Null
  }

  $git = Find-ReadinessCommand -Names @("git.exe", "git")
  if (-not $git) {
    $checks.Add((New-ReadinessCheck -Id "tool.git" -Category "tools" -Status "BLOCKED" -Subject "Git" `
      -Summary "Git was not found on PATH." `
      -Recommendation "Install or expose Git in the current user's PATH before remote development.")) | Out-Null
  }
  else {
    $gitPath = [string]$git.Source
    $gitVersion = Get-FileProductVersion -Path $gitPath
    $gitSummary = "Git is available."
    if ($gitVersion) {
      $gitSummary = "Git $gitVersion is available."
    }
    $checks.Add((New-ReadinessCheck -Id "tool.git" -Category "tools" -Status "PASS" -Subject "Git" `
      -Summary $gitSummary -Detail $gitPath)) | Out-Null
  }

  $shellPath = Join-Path $PSHOME "powershell.exe"
  if ($PSVersionTable.PSEdition -eq "Core") {
    $shellPath = Join-Path $PSHOME "pwsh.exe"
  }
  $checks.Add((New-ReadinessCheck -Id "tool.powershell" -Category "tools" -Status "PASS" -Subject "PowerShell" `
    -Summary "PowerShell $($PSVersionTable.PSVersion) ($($PSVersionTable.PSEdition)) is running." `
    -Detail $shellPath)) | Out-Null

  $checks.ToArray()
}
