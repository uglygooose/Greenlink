param(
  [Parameter(Mandatory=$true)]
  [string]$SourceDir,

  [Parameter(Mandatory=$true)]
  [string]$DestDir,

  [Parameter(Mandatory=$true)]
  [string]$BaseName
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $DestDir)) {
  New-Item -ItemType Directory -Path $DestDir -Force | Out-Null
}

$files = @(
  "$BaseName.csv",
  "$BaseName.audit.json",
  "$BaseName.job.json"
)

foreach ($f in $files) {
  $src = Join-Path $SourceDir $f
  if (Test-Path -LiteralPath $src) {
    Move-Item -LiteralPath $src -Destination (Join-Path $DestDir $f) -Force
  }
}

