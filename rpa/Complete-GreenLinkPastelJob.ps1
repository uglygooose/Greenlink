param(
  [Parameter(Mandatory=$true)]
  [string]$SourceDir,

  [Parameter(Mandatory=$true)]
  [string]$DestDir,

  [Parameter(Mandatory=$true)]
  [string]$BaseName,

  [Parameter(Mandatory=$true)]
  [ValidateSet("imported","failed","pending","unknown")]
  [string]$Status,

  [Parameter(Mandatory=$false)]
  [string]$Message = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $DestDir)) {
  New-Item -ItemType Directory -Path $DestDir -Force | Out-Null
}

function Get-RunIdFromBaseName([string]$bn) {
  $parts = $bn -split "_"
  return ($parts[-1] ?? "").Trim()
}

function Get-YyyymmddFromBaseName([string]$bn) {
  # Expected: PASTEL_JOURNAL_GREENLINK_YYYYMMDD_<runId>
  $parts = $bn -split "_"
  $ymd = ($parts | Where-Object { $_ -match "^[0-9]{8}$" } | Select-Object -First 1)
  return ($ymd ?? "").Trim()
}

$runId = Get-RunIdFromBaseName $BaseName
$yyyymmdd = Get-YyyymmddFromBaseName $BaseName

$dateIso = ""
$batchRef = ""
if ($yyyymmdd -match "^[0-9]{8}$") {
  $dateIso = "{0}-{1}-{2}" -f $yyyymmdd.Substring(0,4), $yyyymmdd.Substring(4,2), $yyyymmdd.Substring(6,2)
  $batchRef = "GREENLINK_{0}" -f $yyyymmdd
}

$resultPath = Join-Path $DestDir ("{0}.result.json" -f $BaseName)

$obj = @{
  status   = $Status
  runId    = $runId
  date     = $dateIso
  batchRef = $batchRef
  message  = $Message
}

$json = ($obj | ConvertTo-Json -Depth 5)
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($resultPath, $json, $utf8NoBom)

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

Write-Output $resultPath

