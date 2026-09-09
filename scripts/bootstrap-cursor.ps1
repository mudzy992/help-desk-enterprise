$ErrorActionPreference = 'Stop'

$bootstrapPath = Join-Path (Get-Location).Path '.cursor/hooks/bootstrap.ps1'

if (-not (Test-Path -LiteralPath $bootstrapPath)) {
  throw "Missing bootstrap script: $bootstrapPath"
}

powershell -NoProfile -ExecutionPolicy Bypass -File $bootstrapPath

