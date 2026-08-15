param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("protect", "read")]
  [string]$Mode,

  [string]$CredentialFile = ""
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Security

if ($Mode -eq "protect") {
  $secret = [Console]::In.ReadToEnd()
  if ([string]::IsNullOrWhiteSpace($secret)) {
    throw "Credential is empty."
  }
  $plainBytes = [Text.Encoding]::UTF8.GetBytes($secret.Trim())
  try {
    $protectedBytes = [Security.Cryptography.ProtectedData]::Protect(
      $plainBytes,
      $null,
      [Security.Cryptography.DataProtectionScope]::CurrentUser
    )
    [Console]::Out.Write([Convert]::ToBase64String($protectedBytes))
  }
  finally {
    [Array]::Clear($plainBytes, 0, $plainBytes.Length)
  }
  exit 0
}

if ([string]::IsNullOrWhiteSpace($CredentialFile)) {
  throw "CredentialFile is required."
}
$resolvedFile = [IO.Path]::GetFullPath($CredentialFile)
if (-not [IO.File]::Exists($resolvedFile)) {
  throw "Credential file does not exist."
}
$encoded = [IO.File]::ReadAllText($resolvedFile).Trim()
if ([string]::IsNullOrWhiteSpace($encoded)) {
  throw "Credential file is empty."
}
$protectedBytes = [Convert]::FromBase64String($encoded)
$plainBytes = [Security.Cryptography.ProtectedData]::Unprotect(
  $protectedBytes,
  $null,
  [Security.Cryptography.DataProtectionScope]::CurrentUser
)
try {
  [Console]::Out.Write([Text.Encoding]::UTF8.GetString($plainBytes))
}
finally {
  [Array]::Clear($plainBytes, 0, $plainBytes.Length)
}
