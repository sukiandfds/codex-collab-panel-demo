[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$webRoot = Join-Path $projectRoot "web-ui"
$modulesFile = Join-Path $webRoot "node_modules\.modules.yaml"
$pnpm = Get-Command "pnpm.cmd" -ErrorAction SilentlyContinue
if (-not $pnpm) {
  $pnpm = Get-Command "pnpm" -ErrorAction SilentlyContinue
}
if (-not $pnpm) {
  throw "pnpm was not found on PATH."
}

$oldCi = $env:CI
$oldStore = $env:PNPM_CONFIG_STORE_DIR

try {
  $env:CI = "1"

  if (Test-Path -LiteralPath $modulesFile) {
    $storeLine = Select-String -LiteralPath $modulesFile -Pattern '^storeDir:\s*(.+)$' |
      Select-Object -First 1
    if ($storeLine) {
      $storeDir = $storeLine.Matches[0].Groups[1].Value.Trim()
      $storeBase = $storeDir -replace '[\\/]v\d+$', ''
      if ($storeBase) {
        $env:PNPM_CONFIG_STORE_DIR = $storeBase
        Write-Output "[INFO] Reusing pnpm store: $storeBase"
      }
    }
  }

  & $pnpm.Source --dir $webRoot build
  if ($LASTEXITCODE -ne 0) {
    throw "pnpm build failed with exit code $LASTEXITCODE."
  }

  Write-Output "[OK] UI build completed."
}
finally {
  $env:CI = $oldCi
  $env:PNPM_CONFIG_STORE_DIR = $oldStore
}
